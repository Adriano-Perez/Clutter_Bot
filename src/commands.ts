import type { Reply } from "./router.js";
import type { Item, Session } from "./types.js";
import { zoneName } from "./plan.js";
import { resetSession } from "./session.js";
import { CANONICAL_LABELS } from "./vision/labels.js";

const text = (t: string): Reply[] => [{ type: "text", text: t }];

const PING = new Set(["ping"]);
const HELP_WORDS = new Set(["help", "?", "commands", "what can you do", "how does this work"]);
const STATUS_WORDS = new Set(["status", "where am i", "what now", "what next"]);
const START_OVER = new Set(["start over", "reset", "restart"]);

/** The limit judges ask about, in one sentence. Worth repeating rather than hiding. */
export const HONESTY = "I only count what I can see, so nothing inside a closed bin or drawer.";

export const HELP = `I'm ClutterBot. I tell you where everything on your desk goes, then check that you put it there.

1. Text me a photo of your desk.
2. I send it back with every item numbered and every storage spot lettered.
3. Tell me which numbers you use every day — like "2 5" — or say skip.
4. I tell you where each thing goes.
5. Put it all away, send another photo, and I'll check your work.

Any time: status · where does the pen go? · start over
I know about ${CANONICAL_LABELS.length} kinds of desk item. ${HONESTY}`;

export function statusText(session: Session): string {
  const { phase, items } = session;
  const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

  switch (phase) {
    case "awaiting_photo":
      return "Nothing on the go. Send me a photo of your desk and I'll number everything on it.";
    case "interview":
      return `I found ${count(items.length, "thing", "things")} in your photo. Tell me which numbers you use every day — like "2 5" — or say skip.`;
    case "planned": {
      const toMove = items.filter((i) => i.destinationZoneId && i.destinationZoneId !== "desk").length;
      return `Your plan is ready: ${count(toMove, "thing", "things")} to move. Put them away, then send me another photo and I'll check. ${HONESTY}`;
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
  backpack: "Backpacks go off the desk entirely — they don't fit a desk bin.",
  clothes: "Clothes go off the desk entirely — they don't fit a desk bin.",
  "sticky note": "Sticky notes stay on the desk — they're there to be read.",
  glasses: "Glasses stay on the desk, where you'll find them.",
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
  return undefined;
}
