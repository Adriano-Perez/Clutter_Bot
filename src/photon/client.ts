import { Spectrum } from "spectrum-ts";
import { imessage } from "@spectrum-ts/imessage";

type App = Awaited<ReturnType<typeof Spectrum>>;
type Inbound = App["messages"] extends AsyncIterable<infer T> ? T : never;

// Phone numbers are PII: only ever log the last 4 digits.
export const mask = (id: string | undefined) => (id ? `***${id.replace(/\D/g, "").slice(-4)}` : "unknown");

// Single entry point so a MessageRouter can replace it later.
export async function handleMessage([space, message]: Inbound) {
  console.log(`photon: inbound ${message.content.type} from ${mask(message.sender?.id)}`);
  // TODO: download photo attachments (message.content.type === "attachment") for the vision pipeline.
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
    await handleMessage(msg).catch((err) => console.error("photon: handleMessage failed", err));
  }
}
