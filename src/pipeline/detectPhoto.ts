import type { Item, Zone } from "../types.js";
import { cleanDetections, fractionInside, type LabeledBox } from "../vision/cleanup.js";
import { LABEL_VOCAB } from "../vision/labels.js";
import { normalizePhoto } from "../vision/normalize.js";
import { numberItems, renderDetections, type Box } from "../vision/overlay.js";
import { detect, type DetectResult } from "../vision/perceptron.js";
import { detectZones, withoutMugZones, type Zone as BoxZone } from "../vision/zones.js";

export const DETECT_MAX_SIDE = 768;
const INSIDE_ZONE = 0.7; // share of an item's box inside a zone box

export const NO_ITEMS_LEGEND =
  "I couldn't make out any items. Try again with more light, from directly above.";

export interface DetectPhotoResult {
  overlayPng: Buffer;
  items: Item[];
  zones: Zone[];
  legend: string;
  ms: number;
  preStored: LabeledBox[]; // items dropped by dropInsideZones (already in a bin); [] without the flag
  // Intermediate results for the spike script and debugging; not part of the Session.
  debug: {
    width: number;
    height: number;
    itemsResult: DetectResult;
    rawItems: LabeledBox[];
    rawZones?: BoxZone[]; // undefined when the zones call failed
    zonesMs: number;
    zonesError?: unknown;
  };
}

function toBoxes(result: DetectResult): LabeledBox[] {
  return result.detections.flatMap(({ mention, point_box: pb }) => {
    if (!pb) return [];
    const box: Box = [pb.top_left.x, pb.top_left.y, pb.bottom_right.x, pb.bottom_right.y];
    return [{ label: mention, box }];
  });
}

function toSessionZone({ id, label, box }: BoxZone): Zone {
  const [x1, y1, x2, y2] = box;
  return {
    id,
    label,
    polygon: [
      [x1, y1],
      [x2, y1],
      [x2, y2],
      [x1, y2],
    ],
    box: [x1, y1, x2, y2],
  };
}

export function buildLegend(
  items: readonly Pick<Item, "id" | "label">[],
  zones: readonly Pick<Zone, "id" | "label">[],
): string {
  if (items.length === 0) return NO_ITEMS_LEGEND;
  const noun = items.length === 1 ? "thing" : "things";
  const lines = [`I see ${items.length} ${noun}: ${items.map((i) => `${i.id} ${i.label}`).join(", ")}`];
  if (zones.length > 0) lines.push(`Storage spots: ${zones.map((z) => `${z.id} ${z.label}`).join(", ")}`);
  return lines.join("\n");
}

// FR-DET-01…05: photo → normalized image → items + zones (in parallel) → cleanup → numbered overlay.
// Throws if the items call fails; a failed zones call only skips the container rule.
export async function detectPhoto(
  input: Buffer | Uint8Array,
  {
    maxSide = DETECT_MAX_SIDE,
    dropInsideZones = false,
  }: {
    maxSide?: number;
    // Before photo only: items already inside a bin (e.g. labels taped inside) aren't clutter.
    dropInsideZones?: boolean;
  } = {},
): Promise<DetectPhotoResult> {
  const start = performance.now();
  const photo = await normalizePhoto(Buffer.isBuffer(input) ? input : Buffer.from(input), { maxSide });

  const zonesStart = performance.now();
  const zonesCall = detectZones(photo).then(
    (zones) => ({ zones, ms: Math.round(performance.now() - zonesStart) }),
    (error: unknown) => {
      console.log(`detectPhoto: zones call failed, container filter skipped: ${(error as Error).message}`);
      return { zones: undefined, ms: Math.round(performance.now() - zonesStart), error };
    },
  );
  const [itemsResult, zonesOutcome] = await Promise.all([
    detect(photo.dataUrl, { categories: [...LABEL_VOCAB], reasoningEffort: "none" }),
    zonesCall,
  ]);

  const rawItems = toBoxes(itemsResult);
  const boxZones = withoutMugZones(zonesOutcome.zones ?? [], rawItems);
  const cleaned = cleanDetections(rawItems, boxZones, photo.width);
  const isStored = (d: LabeledBox) => boxZones.some((z) => fractionInside(d.box, z.box) >= INSIDE_ZONE);
  const loose = dropInsideZones ? cleaned.filter((d) => !isStored(d)) : cleaned;
  const preStored = dropInsideZones ? cleaned.filter(isStored).map(({ label, box }) => ({ label, box })) : [];
  const numbered = numberItems(loose);

  const at = new Date().toISOString();
  const items: Item[] = numbered.map(({ id, label, box }) => ({
    id,
    label,
    box,
    evidence: [{ state: "seen", source: "photo", at }],
  }));
  const zones = boxZones.map(toSessionZone);

  const overlayPng = await renderDetections(photo.buf, photo.width, photo.height, numbered, boxZones);

  return {
    overlayPng,
    items,
    zones,
    legend: buildLegend(items, zones),
    ms: Math.round(performance.now() - start),
    preStored,
    debug: {
      width: photo.width,
      height: photo.height,
      itemsResult,
      rawItems,
      ...(zonesOutcome.zones ? { rawZones: zonesOutcome.zones } : {}),
      zonesMs: zonesOutcome.ms,
      ...("error" in zonesOutcome ? { zonesError: zonesOutcome.error } : {}),
    },
  };
}
