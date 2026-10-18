import path from "node:path";
import type { PhaseHandler } from "../router.js";
import { savePhoto } from "../photon/media.js";

export const awaitingPhoto: PhaseHandler = async (session, msg) => {
  const { content } = msg;
  if (content.type !== "attachment" || !content.mimeType.startsWith("image/"))
    return [{ type: "text", text: "Send me a photo of your desk to get started." }];

  const file = await savePhoto(await content.read(), content.mimeType, msg.sender);
  console.log(`handler: saved ${path.relative(process.cwd(), file)}`);
  session.beforePhoto = file;
  // TODO: hand off to Daniel's DetectionHandler here (phase -> "interview").
  return [{ type: "text", text: `Saved your photo ✓ (session ${session.id})` }];
};
