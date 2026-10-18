import type { Item, Zone } from "./types.js";

export type ZoneRef = Pick<Zone, "id" | "label">;

// Pseudo-zones every plan can use alongside the zones detected in the photo.
export const DESK: ZoneRef = { id: "desk", label: "desk" };
export const TOSS: ZoneRef = { id: "toss", label: "toss" };
export const OFF_DESK: ZoneRef = { id: "off-desk", label: "off the desk" };
export const PSEUDO_ZONES: readonly ZoneRef[] = [DESK, TOSS, OFF_DESK];

// How each destination reads in a message. Detected zones keep their letter, so "B pen cup"
// matches the letter drawn on the overlay.
const PSEUDO_HEADINGS: Record<string, string> = {
  [DESK.id]: "Stays on your desk",
  [TOSS.id]: "Toss",
  [OFF_DESK.id]: "Off the desk",
};

/** "B pen cup" for a detected zone, "Toss" for a pseudo-zone, the raw id if neither is known. */
export function zoneName(zones: readonly ZoneRef[], id: string): string {
  const zone = zones.find((z) => z.id === id);
  if (zone) return `${zone.id} ${zone.label}`;
  return PSEUDO_HEADINGS[id] ?? id;
}

/** What to do once the plan has been sent. Shared, so the plan and a nudge never disagree. */
export const NEXT_STEP = "Put it all away, then send me another photo and I'll check.";

const MAX_ITEMS_PER_GROUP = 6;

export interface PlanGroup {
  zoneId: string;
  name: string;
  items: Item[];
  /** The reason most of the group's items share, if they share one. */
  reason?: string;
}

function commonReason(items: readonly Item[]): string | undefined {
  const tally = new Map<string, number>();
  for (const { reason } of items) if (reason) tally.set(reason, (tally.get(reason) ?? 0) + 1);
  let best: string | undefined;
  let bestCount = 0;
  for (const [reason, count] of tally) if (count > bestCount) [best, bestCount] = [reason, count];
  return best;
}

/**
 * One group per destination, in the order they should be dealt with: the storage spots found in
 * the photo (A, B, C…), then Toss, then Off the desk, and last the things that simply stay put.
 * An unplanned item is left out; a placement into an unrecognised zone keeps its own group at the
 * end rather than vanishing.
 */
export function groupPlan(items: readonly Item[], zones: readonly ZoneRef[]): PlanGroup[] {
  const byZone = new Map<string, Item[]>();
  for (const item of items) {
    if (!item.destinationZoneId) continue;
    const group = byZone.get(item.destinationZoneId);
    if (group) group.push(item);
    else byZone.set(item.destinationZoneId, [item]);
  }

  const order = [...zones.map((z) => z.id), TOSS.id, OFF_DESK.id, DESK.id];
  const ids = [
    ...order.filter((id) => byZone.has(id)),
    ...[...byZone.keys()].filter((id) => !order.includes(id)),
  ];

  return ids.map((zoneId) => {
    const group = byZone.get(zoneId)!;
    const reason = commonReason(group);
    return { zoneId, name: zoneName(zones, zoneId), items: group, ...(reason ? { reason } : {}) };
  });
}

/** "A storage bin — 1 charger, 2 cable (stored out of the way)" */
export function groupLine({ name, items, reason }: PlanGroup): string {
  const shown = items.slice(0, MAX_ITEMS_PER_GROUP).map((i) => `${i.id} ${i.label}`);
  const hidden = items.length - shown.length;
  if (hidden > 0) shown.push(`and ${hidden} more`);
  return `${name} — ${shown.join(", ")}${reason ? ` (${reason})` : ""}`;
}

/**
 * The plan as the user reads it in iMessage: grouped by where things go, not one line per item,
 * so a 12-item desk is four lines instead of twelve.
 */
export function planMessage(groups: readonly PlanGroup[]): string {
  if (groups.length === 0) return "I couldn't work out a plan for this one. Try 'start over' and send a fresh photo.";
  return ["Here's where everything goes:", "", ...groups.map(groupLine)].join("\n");
}

/** Always sent with the preview, so nobody mistakes it for a photo of their actual desk. */
export const PREVIEW_CAPTION = "Illustration, not a photo — roughly how your desk could look.";

// "the charger, cable and pen"
function listLabels(items: readonly Item[]): string {
  const labels = [...new Set(items.map((i) => i.label))];
  const last = labels.at(-1)!;
  return labels.length === 1 ? `the ${last}` : `the ${labels.slice(0, -1).join(", ")} and ${last}`;
}

/** One plain sentence per destination, for the image model. */
export function previewInstructions(groups: readonly PlanGroup[], zones: readonly ZoneRef[]): string[] {
  return groups.flatMap((group) => {
    const things = listLabels(group.items);
    switch (group.zoneId) {
      case TOSS.id:
      case OFF_DESK.id:
        return [`Remove ${things} from the desk completely.`];
      case DESK.id:
        return [`Leave ${things} where it is on the desk.`];
      default: {
        const zone = zones.find((z) => z.id === group.zoneId);
        return zone ? [`Put ${things} inside the ${zone.label}.`] : [];
      }
    }
  });
}

/**
 * The image-edit prompt. Built only from our own label vocabulary and the detected zone labels —
 * no user text reaches the image model, so there's no injection path into it.
 */
export function previewPrompt(groups: readonly PlanGroup[], zones: readonly ZoneRef[]): string {
  return [
    "Edit this photo of a desk to show the same desk after it has been tidied.",
    ...previewInstructions(groups, zones),
    "Keep the same camera angle, the same desk and the same lighting.",
    "Do not add any object that is not already in the photo.",
    "Do not add text, labels, numbers, arrows or captions.",
  ].join(" ");
}
