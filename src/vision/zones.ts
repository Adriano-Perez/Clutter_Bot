import { iou } from "./cleanup.js";
import { ZONE_CATEGORIES } from "./labels.js";
import type { NormalizedPhoto } from "./normalize.js";
import type { Box } from "./overlay.js";
import { detect } from "./perceptron.js";

export interface Zone {
  id: string; // A, B, C… left to right
  label: string;
  box: Box;
}

const MIN_AREA_FRACTION = 0.01;
const MERGE_IOU = 0.5;
const MUG_IOU = 0.5;

function area([x1, y1, x2, y2]: Box): number {
  return Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
}

function union(a: Box, b: Box): Box {
  return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])];
}

// Earlier categories are more specific ("pen cup" before "cup"), so they win a merge.
function priority(label: string): number {
  const i = (ZONE_CATEGORIES as readonly string[]).indexOf(label);
  return i === -1 ? ZONE_CATEGORIES.length : i;
}

function letter(zones: readonly Omit<Zone, "id">[]): Zone[] {
  return [...zones]
    .sort((a, b) => a.box[0] + a.box[2] - (b.box[0] + b.box[2]))
    .map((z, i) => ({ id: String.fromCharCode(65 + i), label: z.label, box: z.box }));
}

// Drops tiny boxes, merges overlapping ones (IoU >= 0.5), then letters them left to right.
export function filterZones(raw: readonly { label: string; box: Box }[], width: number, height: number): Zone[] {
  const minArea = width * height * MIN_AREA_FRACTION;
  const merged: { label: string; box: Box }[] = [];
  for (const z of raw.filter((z) => area(z.box) >= minArea)) {
    const i = merged.findIndex((m) => iou(m.box, z.box) >= MERGE_IOU);
    if (i === -1) {
      merged.push({ ...z });
      continue;
    }
    const m = merged[i]!;
    merged[i] = { label: priority(z.label) < priority(m.label) ? z.label : m.label, box: union(m.box, z.box) };
  }
  return letter(merged);
}

// A detected mug is an item, so a "cup" zone on top of it is removed and the rest re-lettered.
export function withoutMugZones(zones: readonly Zone[], items: readonly { label: string; box: Box }[]): Zone[] {
  const mugs = items.filter((d) => d.label === "mug").map((d) => d.box);
  const kept = zones.filter((z) => z.label !== "cup" || !mugs.some((m) => iou(z.box, m) >= MUG_IOU));
  return kept.length === zones.length ? [...zones] : letter(kept);
}

// FR-DET-03: storage zones as pixel boxes from /v1/detect.
export async function detectZones(photo: NormalizedPhoto): Promise<Zone[]> {
  const result = await detect(photo.dataUrl, { categories: [...ZONE_CATEGORIES], reasoningEffort: "none" });
  const raw = result.detections.flatMap(({ mention, point_box: pb }) =>
    pb ? [{ label: mention, box: [pb.top_left.x, pb.top_left.y, pb.bottom_right.x, pb.bottom_right.y] as Box }] : [],
  );
  return filterZones(raw, photo.width, photo.height);
}
