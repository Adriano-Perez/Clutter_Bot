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
const CUP_OVERLAP = 0.6; // intersection over the smaller of item and cup zone
const PAIR_OVERLAP = 0.4; // intersection over the smaller box, for a cord on its headphones
const SAME_LABEL_GAP = 0.05; // of image width

// Labels that are one physical object on a desk, so nearby same-label boxes are pieces of it
// (two earbuds, a key ring split in two). Pens, paper and cables are genuinely multiple.
const SINGLE_OBJECT_LABELS = new Set([
  "headphones",
  "keys",
  "charger",
  "mug",
  "notebook",
  "laptop",
  "wallet",
  "water bottle",
  "backpack",
]);

// Paired-label merge: the first label absorbs the second when they overlap enough.
// Charger + cable is deliberately absent: a charger often overlaps its own separate USB cable.
const ABSORBS: Record<string, readonly string[]> = {
  headphones: ["cable"],
};

// Only cup-like zones get detected as items themselves (a pen cup labeled "pen").
const CONTAINER_ZONES = new Set(["pen cup", "cup"]);

// Rule c: synonyms the vocabulary asks for, mapped back to one canonical label.
const SYNONYMS: Record<string, string> = {
  "power adapter": "charger",
  "phone charger": "charger",
  earbuds: "headphones",
  book: "notebook",
  receipt: "paper",
  "food wrapper": "trash",
  "chip bag": "trash",
  "soda can": "trash",
  tissue: "trash",
  clothing: "clothes",
};

// Rule a: when two labels land on the same box, the winner's label is kept.
const PREFERRED_OVER: Record<string, readonly string[]> = {
  notebook: ["book"],
  headphones: ["cable"],
  charger: ["cable"],
  trash: ["snack", "paper"],
};

export function iou(a: Box, b: Box): number {
  const ix = Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0]));
  const iy = Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]));
  const inter = ix * iy;
  const area = (r: Box) => Math.max(0, r[2] - r[0]) * Math.max(0, r[3] - r[1]);
  const union = area(a) + area(b) - inter;
  return union > 0 ? inter / union : 0;
}

function area([x1, y1, x2, y2]: Box): number {
  return Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
}

// Share of the item's own area that lies inside the zone box: 1 when fully inside.
export function fractionInside(item: Box, zone: Box): number {
  const ix = Math.max(0, Math.min(item[2], zone[2]) - Math.max(item[0], zone[0]));
  const iy = Math.max(0, Math.min(item[3], zone[3]) - Math.max(item[1], zone[1]));
  const itemArea = area(item);
  return itemArea > 0 ? (ix * iy) / itemArea : 0;
}

// Intersection over the smaller box: 1 when one box sits fully inside the other.
function overlapOfSmaller(a: Box, b: Box): number {
  const ix = Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0]));
  const iy = Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]));
  const smaller = Math.min(area(a), area(b));
  return smaller > 0 ? (ix * iy) / smaller : 0;
}

// Largest axis gap between two boxes; 0 when they touch or overlap.
function gap(a: Box, b: Box): number {
  const gx = Math.max(0, Math.max(a[0], b[0]) - Math.min(a[2], b[2]));
  const gy = Math.max(0, Math.max(a[1], b[1]) - Math.min(a[3], b[3]));
  return Math.max(gx, gy);
}

function union(a: Box, b: Box): Box {
  return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])];
}

// Repeats until stable, since a union box can reach a box the original pieces didn't.
function mergeWhile<T extends LabeledBox>(items: readonly T[], merge: (a: T, b: T) => T | undefined): T[] {
  const out = [...items];
  for (let changed = true; changed; ) {
    changed = false;
    outer: for (let i = 0; i < out.length; i++) {
      for (let j = i + 1; j < out.length; j++) {
        const merged = merge(out[i]!, out[j]!);
        if (merged) {
          out[i] = merged;
          out.splice(j, 1);
          changed = true;
          break outer;
        }
      }
    }
  }
  return out;
}

function prefers(label: string, over: string): boolean {
  return PREFERRED_OVER[label]?.includes(over) ?? false;
}

// Post-processing for raw detections, before numbering (FR-DET-04).
export function cleanDetections<T extends LabeledBox>(
  detections: readonly T[],
  zones: readonly ZoneBox[],
  imageWidth: number,
): T[] {
  const canonical = detections.map((d) => ({ ...d, label: SYNONYMS[d.label] ?? d.label }));

  const maxGap = imageWidth * SAME_LABEL_GAP;
  const pieced = mergeWhile(canonical, (a, b) =>
    a.label === b.label && SINGLE_OBJECT_LABELS.has(a.label) && gap(a.box, b.box) < maxGap
      ? { ...a, box: union(a.box, b.box) }
      : undefined,
  );

  const deduped: T[] = [];
  for (const d of pieced) {
    const i = deduped.findIndex((kept) => iou(kept.box, d.box) >= DUPLICATE_IOU);
    if (i === -1) deduped.push(d);
    else if (prefers(d.label, deduped[i]!.label)) deduped[i] = d;
  }

  // An earbud cord is part of the headphones, not a separate cable.
  const paired = mergeWhile(deduped, (a, b) => {
    const [winner, loser] = ABSORBS[a.label]?.includes(b.label) ? [a, b] : [b, a];
    if (!ABSORBS[winner.label]?.includes(loser.label)) return undefined;
    return overlapOfSmaller(a.box, b.box) >= PAIR_OVERLAP ? { ...winner, box: union(a.box, b.box) } : undefined;
  });

  // Items near a bin are kept; only items sitting inside a cup zone are the cup itself.
  // A mug is always an item, even inside a "cup" zone.
  const cupBoxes = zones.filter((z) => CONTAINER_ZONES.has(z.label)).map((z) => z.box);
  return paired.filter((d) => d.label === "mug" || !cupBoxes.some((zb) => overlapOfSmaller(d.box, zb) >= CUP_OVERLAP));
}
