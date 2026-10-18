import type { Reply } from "./router.js";
import type { Item, Session, Step } from "./types.js";
import {
  NEXT_STEP,
  buildSteps,
  fallbackPlan,
  groupPlan,
  instructionFor,
  planMessage,
  replanAwayFrom,
  zoneName,
} from "./plan.js";
import { resetSession } from "./session.js";
import { CANONICAL_LABELS } from "./vision/labels.js";

const text = (t: string): Reply[] => [{ type: "text", text: t }];

const PING = new Set(["ping"]);
const HELP_WORDS = new Set(["help", "?", "commands", "what can you do", "how does this work"]);
const STATUS_WORDS = new Set(["status", "where am i", "what now", "what next"]);
const START_OVER = new Set(["start over", "reset", "restart"]);

/** The limit judges ask about, in one sentence. Worth repeating rather than hiding. */
export const HONESTY = "I only count what I can see, so nothing inside a closed bin or drawer.";

export const HELP = `I'm ClutterBot. I tell you where everything lying out goes, then check that you put it there.

1. Text me a photo of your room.
2. I send it back with every item numbered and every storage spot lettered.
3. Tell me which numbers you use every day — like "2 5" — or say skip.
4. I tell you where each thing goes.
5. Put it all away, send another photo, and I'll check your work.

Any time: status · where does the pen go? · 3 is a mug · start over
Once you have a plan: next · done · A is full
I know about ${CANONICAL_LABELS.length} kinds of desk item. ${HONESTY}`;

export function statusText(session: Session): string {
  const { phase, items } = session;
  const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

  switch (phase) {
    case "awaiting_photo":
      return "Nothing on the go. Send me a photo of your room and I'll number everything lying out.";
    case "interview":
      return `I found ${count(items.length, "thing", "things")} in your photo. Tell me which numbers you use every day — like "2 5" — or say skip.`;
    case "planned": {
      const toMove = items.filter((i) => i.destinationZoneId && i.destinationZoneId !== "desk").length;
      const claimed = session.steps.filter((s) => s.done).length;
      const progress = claimed > 0 ? ` You've told me ${claimed} of ${session.steps.length} are done.` : "";
      return (
        `Your plan is ready: ${count(toMove, "thing", "things")} to move.${progress}` +
        ` Say "next" for one step at a time, or put it all away and send me another photo. ${HONESTY}`
      );
    }
    case "complete":
      return "Your desk was clear last time I looked. Send a new photo to go again.";
    default:
      return "Still working on your desk. Send me a photo if you want to start fresh.";
  }
}

// What the rules say about an item when there's no photo yet. Mirrors the RULES in handlers/interview.ts.
const GENERAL_RULE: Record<string, string> = {
  pen: "Pens go in a pen cup, upright and together.",
  paper: "Loose paper gets tossed.",
  trash: "Trash gets tossed.",
  cable: "Cables go wherever the charger goes, so you never hunt for both.",
  charger: "A charger you use every day stays on the desk; otherwise it goes in a bin.",
  backpack: "Backpacks go out of the way — they don't fit in a bin.",
  clothes: "Clothes go in the closet, the dresser or the laundry basket.",
  shoes: "Shoes live with the clothes, not on the floor.",
  book: "Books go on a shelf if there's one in the photo.",
  mug: "Mugs go to the kitchen — they need washing up.",
  plate: "Plates go to the kitchen, not into a bin.",
  bowl: "Bowls go to the kitchen, not into a bin.",
  pillow: "Pillows belong on the bed.",
  blanket: "Blankets belong on the bed.",
  "sticky note": "Sticky notes stay on the desk — they're there to be read.",
  glasses: "Glasses stay on the desk, where you'll find them.",
  "power bank": "A power bank goes in a bin with the charger, unless you use it every day.",
};

function generalRule(label: string): string {
  return GENERAL_RULE[label] ?? `A ${label} goes in a storage bin, unless you use it every day.`;
}

// Longest label first, so "water bottle" wins over nothing and a plural still matches.
const LABEL_PATTERNS = [...CANONICAL_LABELS]
  .sort((a, b) => b.length - a.length)
  .map((label) => ({ label, re: new RegExp(String.raw`\b${label}s?\b`, "i") }));

/** The canonical item label named in the text, if any. */
export function findLabel(raw: string): string | undefined {
  return LABEL_PATTERNS.find(({ re }) => re.test(raw))?.label;
}

/** Items the question refers to: an item number wins, otherwise every item with the named label. */
function findItems(session: Session, raw: string): Item[] {
  for (const n of (raw.match(/\d+/g) ?? []).map(Number)) {
    const byId = session.items.find((i) => i.id === n);
    if (byId) return [byId];
  }
  const label = findLabel(raw);
  return label ? session.items.filter((i) => i.label === label) : [];
}

export function whereDoesText(session: Session, raw: string): string {
  const matched = findItems(session, raw);
  const planned = matched.filter((i) => i.destinationZoneId);

  if (planned.length > 0) {
    return planned
      .map((i) => `${i.id} ${i.label} → ${zoneName(session.zones, i.destinationZoneId!)}${i.reason ? ` — ${i.reason}` : ""}`)
      .join("\n");
  }
  if (matched.length > 0) {
    const ids = matched.map((i) => i.id).join(", ");
    return `${matched[0]!.label} (${ids}) is in your photo, but I haven't planned it yet. Tell me which numbers you use every day, or say skip.`;
  }

  const label = findLabel(raw);
  if (label) return `${generalRule(label)} Send me a photo of your desk and I'll point at yours.`;
  return 'Tell me which one — a number from the photo, like "where does 3 go?", or a thing, like "where does the pen go?".';
}

const NEXT_WORDS = new Set(["next", "what next", "next step", "go"]);
const DONE_WORDS = new Set(["done", "ok done", "did it", "next done"]);
// "A is full", "bin B is full"
const FULL_RE = /^(?:the\s+)?(?:bin\s+|zone\s+)?([a-z])\s+is\s+full$/i;

const ALL_DONE = "That's everything. Send me a photo and I'll check your work.";

function stepLine(step: Step, total: number): string {
  return `Step ${step.n} of ${total}: ${step.instruction}`;
}

/** Makes sure the session has steps, building them from the plan the first time they're asked for. */
function steps(session: Session): Step[] {
  if (session.steps.length === 0 && session.items.some((i) => i.destinationZoneId)) {
    session.steps = buildSteps(session.items, session.zones);
  }
  return session.steps;
}

/** The next thing to do, as a sentence. Shared by the text command and the voice tool. */
export function nextStepText(session: Session): string {
  const all = steps(session);
  const step = all.find((s) => !s.done);
  return step ? stepLine(step, all.length) : ALL_DONE;
}

/** Claims the current step and hands over the next one. */
export function markDoneText(session: Session): string {
  const all = steps(session);
  const step = all.find((s) => !s.done);
  if (!step) return ALL_DONE;

  step.done = true;
  const item = session.items.find((i) => i.id === step.itemId);
  // FR-VER-02: the user says they did it. That's a claim, not something I've seen.
  item?.evidence.push({ state: "claimed", source: "user_text", at: new Date().toISOString() });

  const finished = all.filter((s) => s.done).length;
  const remaining = all.find((s) => !s.done);
  const progress = `Nice — ${finished} of ${all.length} done.`;
  return remaining ? `${progress}\n${stepLine(remaining, all.length)}` : `${progress}\n${ALL_DONE}`;
}

/** FR-PLAN-07, as a sentence: re-plan out of a full bin and say what moved. */
export function zoneFullText(session: Session, letter: string): string {
  const zoneId = letter.toUpperCase();
  const zone = session.zones.find((z) => z.id === zoneId);
  if (!zone) return `I don't have a ${zoneId} in this photo.`;

  const all = steps(session);
  const doneItems = new Set(all.filter((s) => s.done).map((s) => s.itemId));
  const zones = session.zones.map(({ id, label }) => ({ id, label }));
  const { moved, to } = replanAwayFrom(session.items, zones, zoneId, (id) => doneItems.has(id));

  zone.full = true;
  if (moved.length === 0) return `Nothing left to move out of ${zoneId} ${zone.label}.`;

  // Rebuild only the steps that aren't done, so finished work keeps its place in the list.
  const movedIds = new Set(moved.map((i) => i.id));
  for (const step of all) {
    if (step.done || !movedIds.has(step.itemId)) continue;
    const item = session.items.find((i) => i.id === step.itemId)!;
    step.instruction = instructionFor(item, zones);
  }

  const what = moved.map((i) => `${i.id} ${i.label}`).join(", ");
  const where = to.id === "desk" ? "left on the desk" : `moved to ${zoneName(zones, to.id)}`;
  return [`${zoneId} ${zone.label} is full — ${what} ${where}.`, "", nextStepText(session)].join("\n");
}

// "3 is a power bank", "number 3 is actually my calculator", "3 = mug".
// Two digits at most, so a phone number can't look like a correction.
const CORRECTION_RE =
  /^(?:number\s+|item\s+|#\s*)?(\d{1,2})\s*(?:is|=|means)\s*(?:actually\s+)?(?:a|an|the|my)?\s*([a-z][a-z' -]{0,24})$/i;

export interface Correction {
  id: number;
  /** A canonical label; free text that doesn't name a known item never becomes one. */
  label: string;
}

/**
 * FR-DET-06: "3 is a power bank".
 *
 * Returns the item number and the raw thing the user called it. The label is matched against the
 * known vocabulary by the caller rather than taken at face value: an item label ends up in the
 * plan prompt, so accepting free text here would reopen the hole #48 closed.
 */
export function parseCorrection(raw: string): { id: number; said: string } | undefined {
  const match = CORRECTION_RE.exec(raw.trim().replace(/[.!?]+$/, ""));
  if (!match) return undefined;
  return { id: Number(match[1]), said: match[2]!.trim() };
}

function correctionReply(session: Session, { id, said }: { id: number; said: string }): Reply[] {
  const item = session.items.find((i) => i.id === id);
  if (!item) {
    const known = session.items.length > 0 ? ` I've got 1–${session.items.length}.` : "";
    return text(`There's no ${id} in this photo.${known}`);
  }

  const label = findLabel(said);
  if (!label) {
    return text(
      `I don't know "${said}". I can call it: ${CANONICAL_LABELS.join(", ")}.\n` +
        `Or say "${id} is trash" to throw it out.`,
    );
  }
  if (label === item.label) return text(`${id} is already a ${label}.`);

  const was = item.label;
  item.label = label;

  // Before the plan exists there's nothing to re-place; the interview will cover it.
  if (session.phase !== "planned") return text(`Got it — ${id} is a ${label}, not a ${was}.`);

  // Re-run the rules over the whole plan so context still applies (a cable follows its charger),
  // but only move the item that changed. Everything else keeps the placement it was given.
  const zones = session.zones.map(({ id: zoneId, label: zoneLabel }) => ({ id: zoneId, label: zoneLabel }));
  const replacement = fallbackPlan(session.items, zones).find((p) => p.itemId === id);
  if (replacement) {
    item.destinationZoneId = replacement.zoneId;
    item.reason = replacement.reason;
  }
  // The steps describe the old plan, so drop them; "next" rebuilds from the new one.
  session.steps = [];

  return text(
    [
      `Got it — ${id} is a ${label}, not a ${was}. Updated plan:`,
      "",
      planMessage(groupPlan(session.items, zones)),
      "",
      NEXT_STEP,
    ].join("\n"),
  );
}

/**
 * Commands that work in any phase, checked before the phase handler (FR-GW-07).
 * Returns undefined when the text isn't a command, so the phase handler sees it instead.
 * Mutates the session for "start over"; the router saves it either way.
 */
export function handleCommand(session: Session, raw: string): Reply[] | undefined {
  const t = raw.trim().toLowerCase().replace(/[?!.]+$/, "");

  if (PING.has(t)) return text("pong");
  if (HELP_WORDS.has(t)) return text(HELP);
  if (STATUS_WORDS.has(t)) return text(statusText(session));
  if (START_OVER.has(t)) {
    resetSession(session);
    return text("Fresh start. Send me a photo of your desk.");
  }
  // "where does the pen go?", "where do my keys go", "where does 3 go"
  if (/\bwhere\b/i.test(t)) return text(whereDoesText(session, raw));

  // Step-by-step guidance, only once a plan exists. "done" and "next" are ordinary words
  // everywhere else, so outside this phase they go to the handler untouched.
  if (session.phase === "planned") {
    if (NEXT_WORDS.has(t)) return text(nextStepText(session));
    if (DONE_WORDS.has(t)) return text(markDoneText(session));

    const full = FULL_RE.exec(t);
    if (full) return text(zoneFullText(session, full[1]!));
  }

  // "3 is a power bank" — only once there are numbered items to correct.
  const correction = session.items.length > 0 ? parseCorrection(raw) : undefined;
  if (correction) return correctionReply(session, correction);

  return undefined;
}
