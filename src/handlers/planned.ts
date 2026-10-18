import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { PhaseHandler } from "../router.js";
import { mask, savePhoto } from "../photon/media.js";
import { DETECT_MAX_SIDE, detectPhoto } from "../pipeline/detectPhoto.js";
import { buildSummary, compareAfter } from "../verify/compare.js";
import { normalizePhoto } from "../vision/normalize.js";
import { renderDetections, type Box, type OverlayZone } from "../vision/overlay.js";

const GREEN = "#1DB954";
const RED = "#E53935";
const DETECTION_FAILED = "Sorry, I couldn't read that photo. Try sending it again.";

// FR-VER-01 (minimal): a photo in phase "planned" is an after photo; check what got put away.
export const planned: PhaseHandler = async (session, msg) => {
  const { content } = msg;
  if (content.type !== "attachment" || !content.mimeType.startsWith("image/"))
    return [{ type: "text", text: "Put things away, then send me another photo and I'll check." }];

  const file = await savePhoto(await content.read(), content.mimeType, msg.sender);
  console.log(`planned: saved after photo ${path.relative(process.cwd(), file)}`);
  session.afterPhotos = [...(session.afterPhotos ?? []), file];

  const bytes = await readFile(file);
  let result;
  try {
    result = await detectPhoto(bytes);
  } catch (err) {
    console.log(`planned: detection failed for ${mask(msg.sender)}: ${(err as Error).message}`);
    return [{ type: "text", text: DETECTION_FAILED }];
  }

  const zones: OverlayZone[] = result.zones.flatMap((z) => (z.box ? [{ id: z.id, box: z.box }] : []));
  const comparison = compareAfter(session.items, result.items, zones.map((z) => z.box));

  // Same normalization as detectPhoto, so the after-photo boxes line up.
  const photo = await normalizePhoto(bytes, { maxSide: DETECT_MAX_SIDE });
  const colored = comparison.detections.map((d, i) => ({
    id: i + 1,
    box: d.box as Box,
    color: d.inZone ? GREEN : RED,
  }));
  const { dir, name } = path.parse(file);
  const overlayPath = path.join(dir, `${name}.verify.png`);
  await writeFile(overlayPath, await renderDetections(photo.buf, photo.width, photo.height, colored, zones));

  if (comparison.stillOut.length === 0) session.phase = "complete";
  return [
    { type: "image", path: overlayPath },
    { type: "text", text: buildSummary(comparison) },
  ];
};
