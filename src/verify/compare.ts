import type { Item, Zone } from "../types.js";
import { fractionInside, iou } from "../vision/cleanup.js";
import type { Box } from "../vision/overlay.js";

const INSIDE_ZONE = 0.7; // share of a box inside a zone box to count as stored
const PRE_STORED_IOU = 0.5; // same spot as something that was already in a bin before
const DESK = "desk"; // destinationZoneId the interview plan uses for keep-on-desk items
const TOSS = "toss"; // destinationZoneId the interview plan uses for things to throw away
const KITCHEN = "kitchen";
const OFF_DESK = "off-desk"; // destinationZoneId for things that leave the desk (backpack, clothes)

export type DetectionStatus = "putAway" | "keptOnDesk" | "stillOut" | "unmatched";

export interface AfterDetection {
  label: string;
  box: Box;
  inZone: boolean;
  zoneId?: string;
  status: DetectionStatus;
  itemId?: number; // the original item this detection was matched to
}

export interface Comparison {
  putAway: Item[];
  stillOut: Item[];
  keptOnDesk: Item[]; // still out, but the plan says they belong on the desk
  tossed: Item[]; // planned for "toss" and no longer seen
  movedOff: Item[]; // planned for "off-desk" and no longer seen
  cantSee: Item[];
  detections: AfterDetection[]; // after-photo boxes, each with the status of its matched item
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

export type VerificationZone = { id: string; box: Box };

/** Match storage spots geometrically, keeping the BEFORE letters even if a detection disappears. */
export function matchZones(before: readonly Zone[], after: readonly Zone[]): VerificationZone[] {
  const candidates = before.flatMap((a) => a.box ? after.flatMap((b) =>
    b.box && a.label === b.label && iou(a.box!, b.box) >= 0.3
      ? [{ id: a.id, box: b.box, score: iou(a.box!, b.box) }] : [],
  ) : []).sort((a, b) => b.score - a.score);
  const usedBefore = new Set<string>();
  const usedAfter = new Set<Box>();
  return candidates.filter((c) => {
    if (usedBefore.has(c.id) || usedAfter.has(c.box)) return false;
    usedBefore.add(c.id);
    usedAfter.add(c.box);
    return true;
  }).map(({ id, box }) => ({ id, box }));
}

/** True only when every planned item is accounted for, rather than merely undetected. */
export function isComplete(c: Comparison): boolean {
  return c.stillOut.length === 0 && c.cantSee.length === 0 &&
    c.putAway.length + c.keptOnDesk.length > 0;
}

/** Compare visible objects with their actual planned destinations. Missing objects stay uncertain. */
export function compareAfter(
  original: readonly Item[],
  detected: readonly { label: string; box: Box }[],
  zoneBoxes: readonly (Box | VerificationZone)[],
  { preStored = [] }: { preStored?: readonly { label: string; box: Box }[] } = {},
): Comparison {
  // Box-only callers are retained for the standalone spike/tests; the live path passes stable IDs.
  const zones = zoneBoxes.map((z, i) => Array.isArray(z) ? { id: String.fromCharCode(65 + i), box: z } : z);
  const detections: AfterDetection[] = detected.map((d) => {
    const zone = zones.filter((z) => fractionInside(d.box, z.box) >= INSIDE_ZONE)
      .sort((a, b) => (a.box[2] - a.box[0]) * (a.box[3] - a.box[1]) -
        (b.box[2] - b.box[0]) * (b.box[3] - b.box[1]))[0];
    return { label: d.label, box: d.box, inZone: !!zone, ...(zone ? { zoneId: zone.id } : {}), status: "unmatched" };
  });
  const isPreStored = (d: AfterDetection) =>
    d.inZone && preStored.some((p) => p.label === d.label && iou(p.box, d.box) >= PRE_STORED_IOU);
  const planned = hasPlan(original);
  const result: Comparison = { putAway: [], stillOut: [], keptOnDesk: [], tossed: [], movedOff: [], cantSee: [], detections };

  for (const label of new Set(original.map((i) => i.label))) {
    const pending = original.filter((i) => i.label === label);
    // Loose objects claim their nearest originals first, so a visible unfinished object cannot hide.
    const matches = detections.filter((d) => d.label === label && !isPreStored(d))
      .sort((a, b) => Number(a.inZone) - Number(b.inZone));
    for (const d of matches) {
      if (pending.length === 0) break;
      pending.sort((a, b) => {
        if (d.inZone && planned) {
          const correct = Number(b.destinationZoneId === d.zoneId) - Number(a.destinationZoneId === d.zoneId);
          if (correct) return correct;
        }
        return distance(a.box, d.box) - distance(b.box, d.box);
      });
      const item = pending.shift()!;
      if (planned && item.destinationZoneId === DESK && !d.inZone) {
        result.keptOnDesk.push(item);
        d.status = "keptOnDesk";
      } else if (d.inZone && (!planned || item.destinationZoneId === d.zoneId)) {
        result.putAway.push(item);
        d.status = "putAway";
      } else {
        result.stillOut.push(item);
        d.status = "stillOut";
      }
      d.itemId = item.id;
    }
    for (const item of pending) {
      if (item.destinationZoneId === TOSS) result.tossed.push(item);
      else if (item.destinationZoneId === OFF_DESK || item.destinationZoneId === KITCHEN) result.movedOff.push(item);
      else result.cantSee.push(item);
    }
  }
  for (const list of [result.putAway, result.stillOut, result.keptOnDesk, result.tossed, result.movedOff, result.cantSee]) {
    list.sort((a, b) => a.id - b.id);
  }
  return result;
}

function plural(label: string): string {
  if (label === "trash") return "pieces of trash";
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
  if (c.tossed.length > 0) parts.push(`No longer visible (planned to toss): ${countList(c.tossed)}.`);
  if (c.movedOff.length > 0) parts.push(`No longer visible (planned to take away): ${countList(c.movedOff)}.`);
  if (c.keptOnDesk.length > 0) parts.push(`On the desk as planned: ${countList(c.keptOnDesk)}.`);
  if (c.stillOut.length > 0) parts.push(`Still out: ${idList(c.stillOut)}.`);
  if (c.cantSee.length > 0) parts.push(`Can't see: ${idList(c.cantSee)}.`);
  if (isComplete(c)) parts.push("Visible items are where planned. Nice work.");
  else if (c.stillOut.length === 0) parts.push("I can't confirm everything yet. Send the same view with the storage spots visible.");
  parts.push("I can't see inside closed bins, so I'm only counting what's visible.");
  return parts.join(" ");
}
