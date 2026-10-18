import { Spectrum } from "spectrum-ts";
import { imessage } from "@spectrum-ts/imessage";
import convert from "heic-convert";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

type App = Awaited<ReturnType<typeof Spectrum>>;
type Inbound = App["messages"] extends AsyncIterable<infer T> ? T : never;

// Phone numbers are PII: only ever log the last 4 digits.
export const mask = (id: string | undefined) => (id ? `***${id.replace(/\D/g, "").slice(-4)}` : "unknown");

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

const MEDIA_DIR = path.resolve("data/media");
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

export async function savePhoto(bytes: Uint8Array, mimeType: string, senderId: string | undefined) {
  const heic = /^image\/hei[cf]$/i.test(mimeType);
  const data = heic ? await convert({ buffer: bytes, format: "JPEG" }) : bytes;
  const ext = heic ? "jpg" : mimeType.split("/")[1].replace("jpeg", "jpg").replace(/\W/g, "");
  const dir = path.join(MEDIA_DIR, senderId?.replace(/\D/g, "").slice(-4) || "unknown");
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, `${Date.now()}.${ext}`);
  await writeFile(file, data);
  return file;
}

// Single entry point so a MessageRouter can replace it later.
export async function handleMessage([space, message]: Inbound, app: App) {
  console.log(`photon: inbound ${message.content.type} from ${mask(message.sender?.id)}`);
  // Temporary: show the inbound shape once so we can design the photo pipeline.
  if (!dumpedRaw) {
    dumpedRaw = true;
    console.log("photon: raw inbound message", maskedDump(message));
  }
  const { content } = message;
  if (content.type === "attachment" && content.mimeType.startsWith("image/")) {
    console.log(`photon: attachment detected ${content.id} ${content.mimeType} ${content.size ?? "?"} bytes`);
    await space.send("Got it — looking at your photo…");
    const bytes = await downloadAttachment(app, content.id);
    const file = await savePhoto(bytes, content.mimeType, message.sender?.id);
    console.log(`photon: saved ${path.relative(process.cwd(), file)}`);
    await space.send("Saved your photo ✓");
    return;
  }
  if (message.content.type === "text" && message.content.text.trim().toLowerCase() === "ping") {
    await space.send("pong");
  }
  // TODO: send images (e.g. annotated photos) back via space.send.
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

  for await (const msg of app.messages) {
    // One bad message must not kill the loop.
    await handleMessage(msg, app).catch((err) => console.error("photon: handleMessage failed", err));
  }
}
