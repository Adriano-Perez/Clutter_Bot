import type { Item, Step, Zone } from "./types.js";

export type ZoneRef = Pick<Zone, "id" | "label"> & Pick<Partial<Zone>, "full">;
export type Placement = { itemId: number; zoneId: string; reason: string };

// Pseudo-zones every plan can use alongside the zones detected in the photo.
export const DESK: ZoneRef = { id: "desk", label: "desk" };
export const TOSS: ZoneRef = { id: "toss", label: "toss" };
export const OFF_DESK: ZoneRef = { id: "off-desk", label: "out of the way" };
/** Dirty crockery doesn't belong in a bedroom bin, however tidy that would look. */
export const KITCHEN: ZoneRef = { id: "kitchen", label: "the kitchen" };
export const PSEUDO_ZONES: readonly ZoneRef[] = [DESK, TOSS, OFF_DESK, KITCHEN];

// How each destination reads in a message. Detected zones keep their letter, so "B pen cup"
// matches the letter drawn on the overlay.
const PSEUDO_HEADINGS: Record<string, string> = {
  [DESK.id]: "Stays where it is",
  [TOSS.id]: "Toss",
  [OFF_DESK.id]: "Out of the way",
  [KITCHEN.id]: "Take to the kitchen",
};

/** "B pen cup" for a detected zone, "Toss" for a pseudo-zone, the raw id if neither is known. */
export function zoneName(zones: readonly ZoneRef[], id: string): string {
  const zone = zones.find((z) => z.id === id);
  if (zone) return `${zone.id} ${zone.label}`;
  return PSEUDO_HEADINGS[id] ?? id;
}

/** What to do once the plan has been sent. Shared, so the plan and a nudge never disagree. */
export const NEXT_STEP = "Put it all away, then send me another photo and I'll check.";

/**
 * The placement rules in plain code. Used when Gemini is unavailable, and to re-place a single
 * item after the user corrects its label, where spending another model call isn't worth it.
 */
export function fallbackPlan(items: Item[], zones: ZoneRef[]): Placement[] {
  zones = zones.filter((z) => !z.full);
  /** The first zone actually found in the photo whose label is one of these, in order. */
  const prefer = (...labels: string[]): ZoneRef | undefined => {
    for (const label of labels) {
      const found = zones.find((z) => z.label === label);
      if (found) return found;
    }
    return undefined;
  };

  const penCup = prefer("pen cup");
  const wardrobe = prefer("closet", "dresser", "laundry basket");
  const shelf = prefer("bookshelf", "shelf");
  const bin = prefer("storage bin", "box", "drawer", "shelf", "bookshelf", "dresser", "closet", "tray", "nightstand") ?? DESK;

  const place = (i: Item): Placement => {
    if (i.usage === "daily") return { itemId: i.id, zoneId: DESK.id, reason: "you use it every day" };
    // shortcut: receipts count as paper, add labels here if the vocab grows
    if (i.label === "paper" || i.label === "receipt") return { itemId: i.id, zoneId: TOSS.id, reason: "loose paper is clutter" };
    if (i.label === "trash") return { itemId: i.id, zoneId: TOSS.id, reason: "it's trash" };

    // Crockery goes to the sink, not into a bedroom bin.
    if (i.label === "mug" || i.label === "plate" || i.label === "bowl")
      return { itemId: i.id, zoneId: KITCHEN.id, reason: "it needs washing up" };

    if (i.label === "clothes")
      return wardrobe
        ? { itemId: i.id, zoneId: wardrobe.id, reason: `clothes belong in the ${wardrobe.label}` }
        : { itemId: i.id, zoneId: OFF_DESK.id, reason: "nowhere here to hang it" };
    if (i.label === "shoes")
      return wardrobe
        ? { itemId: i.id, zoneId: wardrobe.id, reason: "shoes live with the clothes" }
        : { itemId: i.id, zoneId: OFF_DESK.id, reason: "shoes don't belong on the floor" };
    if (i.label === "book" && shelf) return { itemId: i.id, zoneId: shelf.id, reason: "books go on the shelf" };
    if (i.label === "pillow" || i.label === "blanket")
      return { itemId: i.id, zoneId: OFF_DESK.id, reason: "it belongs on the bed" };
    if (i.label === "backpack")
      return { itemId: i.id, zoneId: OFF_DESK.id, reason: "too big for a bin" };

    // Filing someone's notes or their glasses away is unhelpful, however tidy it looks.
    if (i.label === "sticky note") return { itemId: i.id, zoneId: DESK.id, reason: "it's there to be read" };
    if (i.label === "glasses") return { itemId: i.id, zoneId: DESK.id, reason: "so you can find them" };
    if (i.label === "pen" && penCup) return { itemId: i.id, zoneId: penCup.id, reason: "keeps pens together" };
    return { itemId: i.id, zoneId: bin.id, reason: "stored out of the way" };
  };
  const charger = items.find((i) => i.label === "charger");
  const chargerZone = charger && place(charger).zoneId;
  return items.map((i) =>
    (i.label === "cable" || i.label === "power bank") && chargerZone && i.usage !== "daily"
      ? { itemId: i.id, zoneId: chargerZone, reason: "stays with the charger" }
      : place(i),
  );
}

/** Validate model suggestions against the hard rules; omitted/invalid items use the code planner. */
export function completePlan(placements: Placement[], items: Item[], zones: ZoneRef[]): Placement[] {
  const available = zones.filter((z) => !z.full);
  const zoneIds = new Set([...available.map((z) => z.id), ...PSEUDO_ZONES.map((z) => z.id)]);
  const byItem = new Map<number, Placement>();
  for (const p of placements)
    if (zoneIds.has(p.zoneId) && !byItem.has(p.itemId)) byItem.set(p.itemId, p);
  const fallback = fallbackPlan(items, available);
  const fixed = new Set(["paper", "receipt", "trash", "mug", "plate", "bowl", "backpack", "pillow", "blanket", "sticky note", "glasses"]);
  const planned = items.map((item, index) => {
    const rule = fallback[index]!;
    const suggested = byItem.get(item.id);
    const specificStorage = ["clothes", "shoes", "book", "pen"].includes(item.label) && rule.zoneId !== "desk";
    if (!suggested || item.usage === "daily" || fixed.has(item.label) || specificStorage) return rule;
    // A generic item cannot be tossed or sent to the kitchen just because a model suggests it.
    if ([TOSS.id, KITCHEN.id, OFF_DESK.id].includes(suggested.zoneId)) return rule;
    return { ...suggested, reason: suggested.reason.trim().split(/\s+/).slice(0, 10).join(" ") };
  });
  const charger = items.find((i) => i.label === "charger");
  const chargerPlacement = charger && planned.find((p) => p.itemId === charger.id);
  for (const item of items) {
    if ((item.label === "cable" || item.label === "power bank") && item.usage !== "daily" && chargerPlacement) {
      const p = planned.find((p) => p.itemId === item.id)!;
      p.zoneId = chargerPlacement.zoneId;
      p.reason = "stays with the charger";
    }
  }
  return planned;
}

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

  const order = [...zones.map((z) => z.id), TOSS.id, KITCHEN.id, OFF_DESK.id, DESK.id];
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

/** What to physically do with one item, in words. */
export function instructionFor(item: Item, zones: readonly ZoneRef[]): string {
  const what = `the ${item.label} (${item.id})`;
  switch (item.destinationZoneId) {
    case TOSS.id:
      return `Throw away ${what}.`;
    case OFF_DESK.id:
      return `Put ${what} away where it belongs.`;
    case KITCHEN.id:
      return `Take ${what} to the kitchen.`;
    case DESK.id:
      return `Leave ${what} where it is.`;
    default:
      return `Put ${what} in ${zoneName(zones, item.destinationZoneId ?? "")}.`;
  }
}

/**
 * One step per item that actually has to move, in the order the plan reads (FR-PLAN-06).
 *
 * Items staying on the desk get no step: "leave it alone" isn't a task. Steps are grouped by
 * destination, so you deal with one bin at a time instead of walking back and forth.
 */
export function buildSteps(items: readonly Item[], zones: readonly ZoneRef[]): Step[] {
  return groupPlan(items, zones)
    .filter((group) => group.zoneId !== DESK.id)
    .flatMap((group) => group.items)
    .map((item, index) => ({ n: index + 1, itemId: item.id, instruction: instructionFor(item, zones), done: false }));
}

/**
 * FR-PLAN-07: "A is full". Moves every *undone* item out of that zone and leaves done ones alone,
 * so the work already finished is never undone by a re-plan. Returns the items that moved.
 */
export function replanAwayFrom(
  items: readonly Item[],
  zones: readonly ZoneRef[],
  blockedZoneId: string,
  isDone: (itemId: number) => boolean,
): { moved: Item[]; to: ZoneRef } {
  const alternatives = zones.filter((z) => z.id !== blockedZoneId && !z.full);
  const to = alternatives.find((z) => z.label === "storage bin") ??
    alternatives.find((z) => ["box", "drawer", "tray", "shelf", "bookshelf", "closet", "dresser", "nightstand"].includes(z.label)) ?? DESK;

  const moved = items.filter((i) => i.destinationZoneId === blockedZoneId && !isDone(i.id));
  for (const item of moved) {
    item.destinationZoneId = to.id;
    item.reason = to.id === DESK.id ? "nowhere else to put it" : `${blockedZoneId} was full`;
  }
  return { moved, to };
}

/**
 * The tappable /s/:id link, when the server has a public address. Returns undefined otherwise,
 * so a local run simply doesn't mention a link rather than texting a broken one.
 */
export function planLink(sessionId: string): string | undefined {
  const base = process.env.PUBLIC_BASE_URL?.trim().replace(/\/+$/, "");
  return base ? `${base}/s/${sessionId}` : undefined;
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
      case KITCHEN.id:
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
    "Edit this photo to show the same room after it has been tidied.",
    ...previewInstructions(groups, zones),
    "Keep the same camera angle, the same furniture and the same lighting.",
    "Do not add any object that is not already in the photo.",
    "Do not add text, labels, numbers, arrows or captions.",
  ].join(" ");
}
