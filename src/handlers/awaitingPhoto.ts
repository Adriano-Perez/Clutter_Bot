import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { PhaseHandler } from "../router.js";
import { mask, savePhoto } from "../photon/media.js";
import { detectPhoto } from "../pipeline/detectPhoto.js";

const USAGE_QUESTION = "Which of these do you use every day? Reply with numbers, e.g. 2 5";
const DETECTION_FAILED = "Sorry, I couldn't read that photo. Try sending it again.";

export const awaitingPhoto: PhaseHandler = async (session, msg) => {
  const { content } = msg;
  if (content.type !== "attachment" || !content.mimeType.startsWith("image/"))
    return [{ type: "text", text: "Send me a photo of your desk to get started." }];

  const file = await savePhoto(await content.read(), content.mimeType, msg.sender);
  console.log(`handler: saved ${path.relative(process.cwd(), file)}`);
  session.beforePhoto = file;

  // Detect on the saved file: HEIC uploads have already been converted to JPEG there.
  let result;
  try {
    result = await detectPhoto(await readFile(file), { dropInsideZones: true });
  } catch (err) {
    console.log(`handler: detection failed for ${mask(msg.sender)}: ${(err as Error).message}`);
    return [{ type: "text", text: DETECTION_FAILED }];
  }

  const { dir, name } = path.parse(file);
  const overlayPath = path.join(dir, `${name}.overlay.png`);
  await writeFile(overlayPath, result.overlayPng);

  // FR-DET-07: nothing found → stay in awaiting_photo and ask for a retake.
  if (result.items.length === 0) return [{ type: "text", text: result.legend }];

  // FR-DET-05: numbered overlay + legend, then start the interview.
  session.items = result.items;
  session.zones = result.zones;
  session.phase = "interview";
  return [
    { type: "image", path: overlayPath },
    { type: "text", text: result.legend },
    { type: "text", text: USAGE_QUESTION },
  ];
};
