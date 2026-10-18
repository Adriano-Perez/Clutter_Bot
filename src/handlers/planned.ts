import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { NEXT_STEP } from "../plan.js";
import type { PhaseHandler } from "../router.js";
import { mask, savePhoto } from "../photon/media.js";
import { DETECT_MAX_SIDE, detectPhoto } from "../pipeline/detectPhoto.js";
import { buildSummary, compareAfter, type Comparison } from "../verify/compare.js";
import { normalizePhoto } from "../vision/normalize.js";
import { renderDetections, type Box, type OverlayZone } from "../vision/overlay.js";

const GREEN = "#1DB954";
const RED = "#E53935";
const DETECTION_FAILED = "Sorry, I couldn't read that photo. Try sending it again.";

// Overlay boxes that match the summary: green for put away / kept on desk, red for still out,
// numbered with the original item id. Unmatched detections aren't drawn.
export function overlayItems(c: Comparison): { id: number; box: Box; color: string }[] {
  return c.detections.flatMap((d) => {
    if (d.status === "unmatched" || d.itemId === undefined) return [];
    return [{ id: d.itemId, box: d.box, color: d.status === "stillOut" ? RED : GREEN }];
  });
}

// FR-VER-01 (minimal): a photo in phase "planned" is an after photo; check what got put away.
export const planned: PhaseHandler = async (session, msg) => {
  const { content } = msg;
  if (content.type !== "attachment" || !content.mimeType.startsWith("image/"))
    return [{ type: "text", text: NEXT_STEP }];

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
  const comparison = compareAfter(session.items, result.items, zones.map((z) => z.box), {
    preStored: session.preStored ?? [],
  });

  // Same normalization as detectPhoto, so the after-photo boxes line up.
  const photo = await normalizePhoto(bytes, { maxSide: DETECT_MAX_SIDE });
  const colored = overlayItems(comparison);
  const { dir, name } = path.parse(file);
  const overlayPath = path.join(dir, `${name}.verify.png`);
  await writeFile(overlayPath, await renderDetections(photo.buf, photo.width, photo.height, colored, zones));

  if (comparison.stillOut.length === 0) session.phase = "complete";
  return [
    { type: "image", path: overlayPath },
    { type: "text", text: buildSummary(comparison) },
  ];
};
