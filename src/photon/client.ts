import { imessage } from "@spectrum-ts/imessage";
import { Spectrum, attachment } from "spectrum-ts";
import { mask } from "./media.js";
import { MessageRouter } from "../router.js";
import { SqliteSessionStore } from "../store/sessionStore.js";
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

let dumpedRaw = false;

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

// Adapt a Spectrum message to the router's shape; all logic lives in MessageRouter.
export async function handleMessage([space, message]: Inbound, app: App, router: MessageRouter) {
  // Temporary: show the inbound shape once so we can design the photo pipeline.
  if (!dumpedRaw) {
    dumpedRaw = true;
    console.log("photon: raw inbound message", maskedDump(message));
  }
  const { content } = message;
  await router.route({
    eventId: message.id,
    sender: message.sender?.id ?? "unknown",
    content:
      content.type === "text"
        ? { type: "text", text: content.text }
        : content.type === "attachment"
          ? { type: "attachment", mimeType: content.mimeType, read: () => downloadAttachment(app, content.id) }
          : { type: "other" },
    send: async (r) => {
      await space.send(r.type === "text" ? r.text : attachment(r.path));
    },
  });
}

export async function startPhoton() {
  const { PROJECT_ID, PROJECT_SECRET } = process.env;
  if (!PROJECT_ID || !PROJECT_SECRET) throw new Error("PROJECT_ID and PROJECT_SECRET must be set");

  const app = await Spectrum({
    projectId: PROJECT_ID,
    projectSecret: PROJECT_SECRET,
    providers: [imessage.config()],
  });
  console.log("photon: iMessage connected");

  const router = new MessageRouter(new SqliteSessionStore(), {
    awaiting_photo: awaitingPhoto,
    interview,
    planned,
    complete,
    // TODO: guiding, verifying handlers (features 02–06).
  });

  for await (const msg of app.messages) {
    // One bad message must not kill the loop.
    await handleMessage(msg, app, router).catch((err) => console.error("photon: handleMessage failed", err));
  }
}
