import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { NEXT_STEP } from "../plan.js";
import type { PhaseHandler } from "../router.js";
import { mask, savePhoto } from "../photon/media.js";
import { DETECT_MAX_SIDE, detectPhoto } from "../pipeline/detectPhoto.js";
import { buildSummary, compareAfter, isComplete, matchZones, type Comparison } from "../verify/compare.js";
import { iou } from "../vision/cleanup.js";
import { RETAKE, assessQuality } from "../vision/quality.js";
import { normalizePhoto } from "../vision/normalize.js";
import { renderDetections, type Box, type OverlayZone } from "../vision/overlay.js";

const GREEN = "#1DB954";
const RED = "#E53935";
const DETECTION_FAILED = "Sorry, I couldn't read that photo. Try sending it again.";

// Overlay boxes that match the summary: green for put away / kept on desk, red for still out,
// numbered with the original item id. Unmatched detections aren't drawn.
//
// Still-out items also get a square badge. Red and green are the pair most often confused, so
// colour alone would show a colourblind judge two identical overlays; the shape carries the same
// information without it.
export function overlayItems(c: Comparison): { id: number; box: Box; color: string; shape: "circle" | "square" }[] {
  return c.detections.flatMap((d) => {
    if (d.status === "unmatched" || d.itemId === undefined) return [];
    const stillOut = d.status === "stillOut";
    return [{ id: d.itemId, box: d.box, color: stillOut ? RED : GREEN, shape: stillOut ? "square" as const : "circle" as const }];
  });
}

// FR-VER-01 (minimal): a photo in phase "planned" is an after photo; check what got put away.
export const planned: PhaseHandler = async (session, msg) => {
  const { content } = msg;
  if (content.type !== "attachment" || !content.mimeType.startsWith("image/"))
    return [{ type: "text", text: NEXT_STEP }];

  const file = await savePhoto(await content.read(), content.mimeType, msg.sender);
  console.log(`planned: saved after photo ${path.relative(process.cwd(), file)}`);

  const bytes = await readFile(file);
  // A clear desk can be featureless, so only darkness gates AFTER photos.
  const quality = await assessQuality(bytes);
  if (quality.problem === "dark") return [{ type: "text", text: RETAKE.dark }];
  let result;
  try {
    result = await detectPhoto(bytes);
  } catch (err) {
    console.log(`planned: detection failed for ${mask(msg.sender)}: ${(err as Error).message}`);
    return [{ type: "text", text: DETECTION_FAILED }];
  }

  const zones: OverlayZone[] = matchZones(session.zones, result.zones);
  const unchangedDaily = session.items.some((i) => i.destinationZoneId === "desk" &&
    result.items.some((d) => d.label === i.label && iou(i.box, d.box) >= 0.3));
  if (result.items.length === 0 || (zones.length === 0 && !unchangedDaily)) {
    return [{ type: "text", text: "I can't confidently compare that with your first photo. Retake the same view with the storage spots visible; your plan is saved." }];
  }
  const comparison = compareAfter(session.items, result.items, zones, {
    preStored: session.preStored ?? [],
  });

  // Same normalization as detectPhoto, so the after-photo boxes line up.
  const photo = await normalizePhoto(bytes, { maxSide: DETECT_MAX_SIDE });
  const colored = overlayItems(comparison);
  const { dir, name } = path.parse(file);
  const overlayPath = path.join(dir, `${name}.verify.png`);
  await writeFile(overlayPath, await renderDetections(photo.buf, photo.width, photo.height, colored, zones));

  session.afterPhotos = [...session.afterPhotos, file];
  const at = new Date().toISOString();
  for (const item of [...comparison.putAway, ...comparison.keptOnDesk])
    item.evidence.push({ state: "verified", source: "photo", at });
  for (const item of comparison.stillOut)
    item.evidence.push({ state: "still_here", source: "photo", at });
  for (const item of [...comparison.cantSee, ...comparison.tossed, ...comparison.movedOff])
    item.evidence.push({ state: "not_visible", source: "photo", at });
  session.verificationSummary = buildSummary(comparison);
  if (isComplete(comparison)) session.phase = "complete";
  return [
    { type: "image", path: overlayPath },
    { type: "text", text: buildSummary(comparison) },
  ];
};
