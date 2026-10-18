import { imessage } from "@spectrum-ts/imessage";
import { Spectrum, attachment } from "spectrum-ts";
import { startRecovery } from "./recovery.js";
import { mask } from "./media.js";
import { MessageRouter } from "../router.js";
import { SqliteSessionStore, type SessionStore } from "../store/sessionStore.js";
import { awaitingPhoto } from "../handlers/awaitingPhoto.js";
import { interview } from "../handlers/interview.js";
import { planned } from "../handlers/planned.js";
import { complete } from "../handlers/complete.js";

type App = Awaited<ReturnType<typeof Spectrum>>;
type Inbound = App["messages"] extends AsyncIterable<infer T> ? T : never;

// Dump any object as JSON with E.164 phone numbers/emails masked; handles cycles (message <-> space).
export function maskedDump(value: unknown) {
  const seen = new WeakSet();
  return JSON.stringify(
    value,
    (_k, v) => {
      if (typeof v === "bigint") return v.toString();
      if (typeof v === "string")
        return v.replace(/\+\d{7,15}/g, (m) => mask(m)).replace(/[^\s@"]+@[^\s@"]+\.\w+/g, "***@***");
      if (v && typeof v === "object") {
        if (seen.has(v)) return "[Circular]";
        seen.add(v);
      }
      return v;
    },
    2,
  );
}

const DOWNLOAD_ATTEMPTS = 3;

// Download via the SDK by guid, retrying since the transfer may still be settling.
async function downloadAttachment(app: App, guid: string) {
  for (let attempt = 1; ; attempt++) {
    console.log(`photon: download attempt ${attempt} ${guid}`);
    try {
      const att = await imessage(app).getAttachment(guid);
      if (!att) throw new Error(`getAttachment returned nothing for ${guid}`);
      const bytes = await att.read();
      console.log(`photon: download ok ${bytes.length}`);
      return bytes;
    } catch (err) {
      console.error(`photon: download attempt ${attempt} failed`, err);
      if (attempt >= DOWNLOAD_ATTEMPTS) throw err;
      await new Promise((r) => setTimeout(r, 1000 * attempt));
    }
  }
}

/** Unwrap quoted replies and photo+caption groups; ignore receipts/reactions as conversation input. */
export function messageParts(content: unknown, id: string): { id: string; content: { type: string; text?: string; mimeType?: string; id?: string } }[] {
  if (!content || typeof content !== "object") return [];
  const c = content as Record<string, unknown>;
  if (c.type === "reply") return messageParts(c.content, id);
  if (c.type === "group" && Array.isArray(c.items)) {
    return c.items.flatMap((part, index) => {
      if (part && typeof part === "object" && "content" in part)
        return messageParts(part.content, typeof part.id === "string" ? part.id : `p:${index}/${id}`);
      return messageParts(part, `p:${index}/${id}`);
    });
  }
  if (c.type === "text" && typeof c.text === "string" && c.text.replace(/\uFFFC/g, "").trim())
    return [{ id, content: { type: "text", text: c.text.replace(/\uFFFC/g, "").trim() } }];
  if (c.type === "attachment" && typeof c.mimeType === "string" && typeof c.id === "string")
    return [{ id, content: { type: "attachment", mimeType: c.mimeType, id: c.id } }];
  return [];
}

// Adapt a Spectrum message to the router's shape; all logic lives in MessageRouter.
export async function handleMessage([space, message]: Inbound, app: App, router: MessageRouter) {
  const sender = message.sender?.id;
  if (!sender || ("direction" in message && message.direction === "outbound")) return;
  const parts = messageParts(message.content, message.id);
  // A caption such as "my desk" is context for its photo, not an answer to the subsequent interview.
  const photos = parts.filter((part) => part.content.type === "attachment" && part.content.mimeType?.startsWith("image/"));
  for (const part of photos.length ? photos : parts) {
    const { content } = part;
    await router.route({
      eventId: part.id,
      sender,
      content: content.type === "text"
        ? { type: "text", text: content.text! }
        : { type: "attachment", mimeType: content.mimeType!, read: () => downloadAttachment(app, content.id!) },
      send: async (reply) => {
        await space.send(reply.type === "text" ? reply.text : attachment(reply.path));
      },
    });
  }
}

export async function startPhoton(store: SessionStore = new SqliteSessionStore(), onConnected: () => void = () => {}) {
  const { PROJECT_ID, PROJECT_SECRET } = process.env;
  if (!PROJECT_ID || !PROJECT_SECRET) throw new Error("PROJECT_ID and PROJECT_SECRET must be set");

  const app = await Spectrum({
    projectId: PROJECT_ID,
    projectSecret: PROJECT_SECRET,
    providers: [imessage.config()],
  });
  console.log("photon: iMessage connected");
  onConnected();

  const router = new MessageRouter(store, {
    awaiting_photo: awaitingPhoto,
    interview,
    planned,
    complete,
    // TODO: guiding, verifying handlers (features 02–06).
  });

  void startRecovery(PROJECT_ID, PROJECT_SECRET, async (chat, guid) => {
    const space = await imessage(app).space.get(chat);
    const message = await imessage(app).getMessage(space, guid);
    if (message) await handleMessage([space, message], app, router);
  }).catch((err) => console.error("photon: recovery stopped", (err as Error).message));

  for await (const msg of app.messages) {
    // One bad message must not kill the loop.
    void handleMessage(msg, app, router).catch((err) => console.error("photon: handleMessage failed", err));
  }
}
