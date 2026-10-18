import type { Item } from "../types.js";
import { fractionInside } from "../vision/cleanup.js";
import type { Box } from "../vision/overlay.js";

const INSIDE_ZONE = 0.7; // share of a box inside a zone box to count as stored
const DESK = "desk"; // destinationZoneId the interview plan uses for keep-on-desk items

export interface AfterDetection {
  label: string;
  box: Box;
  inZone: boolean;
}

export interface Comparison {
  putAway: Item[];
  stillOut: Item[];
  keptOnDesk: Item[]; // still out, but the plan says they belong on the desk
  cantSee: Item[];
  detections: AfterDetection[]; // after-photo boxes, for the green/red overlay
}

function center([x1, y1, x2, y2]: Box): [number, number] {
  return [(x1 + x2) / 2, (y1 + y2) / 2];
}

function distance(a: Box, b: Box): number {
  const [ax, ay] = center(a);
  const [bx, by] = center(b);
  return Math.hypot(ax - bx, ay - by);
}

// Only trust the plan when every item carries a string destination (the interview handler's shape).
function hasPlan(items: readonly Item[]): boolean {
  return items.length > 0 && items.every((i) => typeof i.destinationZoneId === "string");
}

/**
 * Compares the before items with what the after photo shows, per label:
 * still-out detections claim the nearest original items first, then in-zone detections count as
 * put away, and anything left over is "can't see". A missing item is never counted as put away.
 */
export function compareAfter(
  original: readonly Item[],
  detected: readonly { label: string; box: Box }[],
  zoneBoxes: readonly Box[],
): Comparison {
  const detections = detected.map((d) => ({
    ...d,
    inZone: zoneBoxes.some((z) => fractionInside(d.box, z) >= INSIDE_ZONE),
  }));
  const deskRule = hasPlan(original);

  const result: Comparison = { putAway: [], stillOut: [], keptOnDesk: [], cantSee: [], detections };
  const labels = [...new Set(original.map((i) => i.label))];

  for (const label of labels) {
    const pending = original.filter((i) => i.label === label);
    const out = detections.filter((d) => d.label === label && !d.inZone);
    let stored = detections.filter((d) => d.label === label && d.inZone).length;

    for (const d of out) {
      if (pending.length === 0) break;
      pending.sort((a, b) => distance(a.box, d.box) - distance(b.box, d.box));
      const item = pending.shift()!;
      if (deskRule && item.destinationZoneId === DESK) result.keptOnDesk.push(item);
      else result.stillOut.push(item);
    }
    pending.sort((a, b) => a.id - b.id);
    for (const item of pending) {
      if (stored > 0) {
        stored--;
        result.putAway.push(item);
      } else result.cantSee.push(item);
    }
  }

  for (const list of [result.putAway, result.stillOut, result.keptOnDesk, result.cantSee]) {
    list.sort((a, b) => a.id - b.id);
  }
  return result;
}

function plural(label: string): string {
  return label.endsWith("s") ? label : `${label}s`;
}

// "charger, cable, 2 pens"
function countList(items: readonly Item[]): string {
  const counts = new Map<string, number>();
  for (const { label } of items) counts.set(label, (counts.get(label) ?? 0) + 1);
  return [...counts].map(([label, n]) => (n === 1 ? label : `${n} ${plural(label)}`)).join(", ");
}

// "mug (2), paper (11)"
function idList(items: readonly Item[]): string {
  return items.map((i) => `${i.label} (${i.id})`).join(", ");
}

export function buildSummary(c: Comparison): string {
  const parts: string[] = [];
  if (c.putAway.length > 0) parts.push(`Put away: ${countList(c.putAway)}.`);
  if (c.keptOnDesk.length > 0) parts.push(`On the desk as planned: ${countList(c.keptOnDesk)}.`);
  if (c.stillOut.length > 0) parts.push(`Still out: ${idList(c.stillOut)}.`);
  if (c.cantSee.length > 0) parts.push(`Can't see: ${idList(c.cantSee)}.`);
  parts.push(
    c.stillOut.length === 0
      ? "Desk clear! Nice work."
      : "I can't see inside closed bins, so I'm only counting what's visible.",
  );
  return parts.join(" ");
}
