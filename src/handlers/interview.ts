import { z } from "zod";
import type { PhaseHandler } from "../router.js";
import type { Item, Zone } from "../types.js";
import { json } from "../llm/gemini.js";

type Placement = { itemId: number; zoneId: string; reason: string };
type ZoneRef = Pick<Zone, "id" | "label">;

// Pseudo-zones every plan can use alongside the detected ones.
const DESK: ZoneRef = { id: "desk", label: "desk" };
const TOSS: ZoneRef = { id: "toss", label: "toss" };
const OFF_DESK: ZoneRef = { id: "off-desk", label: "off the desk" };
const MAX_LINES = 12;

const RULES = `Rules:
- Place every item exactly once.
- Items with usage "daily" go to zoneId "desk".
- Paper and trash go to zoneId "toss".
- Backpacks and clothes go to zoneId "off-desk".
- Cables go to the same zone as the charger.
- Pens go to the pen cup zone if there is one.
- Everything else goes to a storage bin zone.
- reason is at most 10 words.`;

const planSchema = {
  type: "object",
  properties: {
    placements: {
      type: "array",
      items: {
        type: "object",
        properties: { itemId: { type: "integer" }, zoneId: { type: "string" }, reason: { type: "string" } },
        required: ["itemId", "zoneId", "reason"],
      },
    },
  },
  required: ["placements"],
};

const planValidator = z.object({
  placements: z.array(z.object({ itemId: z.number().int(), zoneId: z.string(), reason: z.string() })),
});

/** Item numbers the user named, limited to real items. "skip" or no numbers means none. */
export function parseDaily(text: string, items: Item[]): number[] {
  if (/\bskip\b/i.test(text)) return [];
  const ids = new Set(items.map((i) => i.id));
  return [...new Set((text.match(/\d+/g) ?? []).map(Number))].filter((n) => ids.has(n));
}

/** The same rules as RULES, in plain code, for when Gemini fails. */
export function fallbackPlan(items: Item[], zones: ZoneRef[]): Placement[] {
  const penCup = zones.find((z) => z.label === "pen cup");
  const bin = zones.find((z) => z.label === "storage bin") ?? zones[0] ?? DESK;
  const place = (i: Item): Placement => {
    if (i.usage === "daily") return { itemId: i.id, zoneId: DESK.id, reason: "you use it every day" };
    // shortcut: receipts count as paper, add labels here if the vocab grows
    if (i.label === "paper" || i.label === "receipt") return { itemId: i.id, zoneId: TOSS.id, reason: "loose paper is clutter" };
    if (i.label === "trash") return { itemId: i.id, zoneId: TOSS.id, reason: "it's trash" };
    if (i.label === "backpack" || i.label === "clothes")
      return { itemId: i.id, zoneId: OFF_DESK.id, reason: "too big for the desk bins" };
    if (i.label === "pen" && penCup) return { itemId: i.id, zoneId: penCup.id, reason: "keeps pens together" };
    return { itemId: i.id, zoneId: bin.id, reason: "stored out of the way" };
  };
  const charger = items.find((i) => i.label === "charger");
  const chargerZone = charger && place(charger).zoneId;
  return items.map((i) =>
    i.label === "cable" && chargerZone && i.usage !== "daily"
      ? { itemId: i.id, zoneId: chargerZone, reason: "stays with the charger" }
      : place(i),
  );
}

/** Drop placements for unknown items/zones or duplicates; any item left unplaced goes to the desk. */
export function completePlan(placements: Placement[], items: Item[], zones: ZoneRef[]): Placement[] {
  const zoneIds = new Set([...zones.map((z) => z.id), DESK.id, TOSS.id, OFF_DESK.id]);
  const byItem = new Map<number, Placement>();
  for (const p of placements)
    if (zoneIds.has(p.zoneId) && !byItem.has(p.itemId)) byItem.set(p.itemId, p);
  return items.map((i) => byItem.get(i.id) ?? { itemId: i.id, zoneId: DESK.id, reason: "keep it handy on the desk" });
}

async function plan(items: Item[], zones: ZoneRef[]): Promise<Placement[]> {
  const prompt = `Plan where each item on this desk goes.
Items: ${JSON.stringify(items.map(({ id, label, usage }) => ({ id, label, usage })))}
Zones: ${JSON.stringify([...zones, DESK, TOSS, OFF_DESK])}
${RULES}`;
  try {
    const { value } = await json(prompt, planSchema, planValidator, { timeoutMs: 25_000 });
    return completePlan(value.placements, items, zones);
  } catch (err) {
    console.error(`interview: gemini plan failed, using fallback: ${(err as Error).message}`);
    return fallbackPlan(items, zones);
  }
}

export const interview: PhaseHandler = async (session, msg) => {
  if (msg.content.type !== "text")
    return [{ type: "text", text: "Which of these do you use every day? Reply with numbers, or skip." }];

  const daily = new Set(parseDaily(msg.content.text, session.items));
  for (const item of session.items) if (daily.has(item.id)) item.usage = "daily";

  const zones = session.zones.map(({ id, label }) => ({ id, label }));
  const placements = await plan(session.items, zones);
  const zoneName = (id: string) => {
    const z = zones.find((z) => z.id === id);
    if (z) return `${z.id} ${z.label}`;
    return [DESK, TOSS, OFF_DESK].find((p) => p.id === id)?.label ?? id;
  };

  const lines: string[] = [];
  for (const p of placements) {
    const item = session.items.find((i) => i.id === p.itemId)!;
    item.destinationZoneId = p.zoneId;
    item.reason = p.reason;
    lines.push(`${item.id} ${item.label} -> ${zoneName(p.zoneId)} (${p.reason})`);
  }
  session.phase = "planned";

  const shown = lines.length > MAX_LINES ? [...lines.slice(0, MAX_LINES - 1), `…and ${lines.length - MAX_LINES + 1} more`] : lines;
  return [{ type: "text", text: [...shown, "Put things away, then send me another photo and I'll check."].join("\n") }];
};
