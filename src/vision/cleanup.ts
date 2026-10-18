import type { Box } from "./overlay.js";

export interface LabeledBox {
  label: string;
  box: Box;
}

export interface ZoneBox {
  label: string;
  box: Box;
}

const DUPLICATE_IOU = 0.85;
const CONTAINER_COVERAGE = 0.7; // share of the item's own area inside a cup zone
const CORD_IOU = 0.2;

// Only cup-like zones get detected as items themselves (a pen cup labeled "pen").
const CONTAINER_ZONES = new Set(["pen cup", "cup"]);

// Rule c: synonyms the vocabulary asks for, mapped back to one canonical label.
const SYNONYMS: Record<string, string> = {
  "power adapter": "charger",
  "phone charger": "charger",
  earbuds: "headphones",
  book: "notebook",
  receipt: "paper",
};

// Rule a: when two labels land on the same box, the winner's label is kept.
const PREFERRED_OVER: Record<string, readonly string[]> = {
  notebook: ["book"],
  headphones: ["cable"],
  charger: ["cable"],
};

export function iou(a: Box, b: Box): number {
  const ix = Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0]));
  const iy = Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]));
  const inter = ix * iy;
  const area = (r: Box) => Math.max(0, r[2] - r[0]) * Math.max(0, r[3] - r[1]);
  const union = area(a) + area(b) - inter;
  return union > 0 ? inter / union : 0;
}

// Intersection over the item's own area: 1 when the item sits fully inside the zone.
function coverage(item: Box, zone: Box): number {
  const ix = Math.max(0, Math.min(item[2], zone[2]) - Math.max(item[0], zone[0]));
  const iy = Math.max(0, Math.min(item[3], zone[3]) - Math.max(item[1], zone[1]));
  const itemArea = Math.max(0, item[2] - item[0]) * Math.max(0, item[3] - item[1]);
  return itemArea > 0 ? (ix * iy) / itemArea : 0;
}

function containsPoint([x1, y1, x2, y2]: Box, { x, y }: { x: number; y: number }): boolean {
  return x >= x1 && x <= x2 && y >= y1 && y <= y2;
}

function centerOf([x1, y1, x2, y2]: Box): { x: number; y: number } {
  return { x: (x1 + x2) / 2, y: (y1 + y2) / 2 };
}

function prefers(label: string, over: string): boolean {
  return PREFERRED_OVER[label]?.includes(over) ?? false;
}

// Post-processing for raw detections, before numbering (FR-DET-04).
export function cleanDetections<T extends LabeledBox>(detections: readonly T[], zones: readonly ZoneBox[]): T[] {
  const canonical = detections.map((d) => ({ ...d, label: SYNONYMS[d.label] ?? d.label }));

  const deduped: T[] = [];
  for (const d of canonical) {
    const i = deduped.findIndex((kept) => iou(kept.box, d.box) >= DUPLICATE_IOU);
    if (i === -1) deduped.push(d);
    else if (prefers(d.label, deduped[i]!.label)) deduped[i] = d;
  }

  // An earbud cord is part of the headphones, not a separate cable.
  const headphones = deduped.filter((d) => d.label === "headphones").map((d) => d.box);
  const withoutCords = deduped.filter(
    (d) =>
      d.label !== "cable" ||
      !headphones.some((h) => iou(d.box, h) >= CORD_IOU || containsPoint(d.box, centerOf(h))),
  );

  // Items near a bin are kept; only items sitting inside a cup zone are the cup itself.
  // A mug is always an item, even inside a "cup" zone.
  const cupBoxes = zones.filter((z) => CONTAINER_ZONES.has(z.label)).map((z) => z.box);
  return withoutCords.filter(
    (d) => d.label === "mug" || !cupBoxes.some((zb) => coverage(d.box, zb) >= CONTAINER_COVERAGE),
  );
}
