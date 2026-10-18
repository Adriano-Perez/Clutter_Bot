import { describe, expect, it } from "vitest";
import { completePlan, fallbackPlan, parseDaily } from "../src/handlers/interview.js";
import type { Item } from "../src/types.js";

const item = (id: number, label: string, usage?: Item["usage"]): Item => ({ id, label, usage, box: [0, 0, 1, 1], evidence: [] });

const items = [item(1, "charger"), item(2, "cable"), item(3, "pen"), item(4, "paper"), item(5, "mug"), item(6, "notebook")];
const zones = [{ id: "A", label: "storage bin" }, { id: "B", label: "pen cup" }];

describe("parseDaily", () => {
  it("picks valid item numbers once", () => {
    expect(parseDaily("1 and 4, also 4 and 99", items)).toEqual([1, 4]);
  });

  it("returns none for skip or no numbers", () => {
    expect(parseDaily("Skip", items)).toEqual([]);
    expect(parseDaily("none of them", items)).toEqual([]);
  });
});

describe("fallbackPlan", () => {
  it("follows the rules", () => {
    const withDaily = items.map((i) => (i.id === 6 ? { ...i, usage: "daily" as const } : i));
    const zoneOf = Object.fromEntries(fallbackPlan(withDaily, zones).map((p) => [p.itemId, p.zoneId]));
    expect(zoneOf).toEqual({ 1: "A", 2: "A", 3: "B", 4: "toss", 5: "A", 6: "desk" });
  });

  it("keeps cables with a daily charger and uses the desk when there are no zones", () => {
    const daily = items.map((i) => (i.id === 1 ? { ...i, usage: "daily" as const } : i));
    const plan = fallbackPlan(daily, []);
    expect(plan.find((p) => p.itemId === 2)?.zoneId).toBe("desk");
    expect(plan.find((p) => p.itemId === 3)?.zoneId).toBe("desk");
    for (const p of plan) expect(p.reason.split(" ").length).toBeLessThanOrEqual(10);
  });
});

describe("fallbackPlan: trash, backpack, clothes", () => {
  it("tosses trash and moves backpacks and clothes off the desk", () => {
    const extra = [item(1, "trash"), item(2, "backpack"), item(3, "clothes"), item(4, "mug")];
    const zoneOf = Object.fromEntries(fallbackPlan(extra, zones).map((p) => [p.itemId, p.zoneId]));
    expect(zoneOf).toEqual({ 1: "toss", 2: "off-desk", 3: "off-desk", 4: "A" });
  });

  it("completePlan accepts the off-desk zone", () => {
    const plan = completePlan([{ itemId: 2, zoneId: "off-desk", reason: "r" }], [item(2, "backpack")], zones);
    expect(plan).toEqual([{ itemId: 2, zoneId: "off-desk", reason: "r" }]);
  });
});

describe("completePlan", () => {
  it("drops unknown items and zones, adds missing items to the desk", () => {
    const plan = completePlan(
      [
        { itemId: 1, zoneId: "A", reason: "r" },
        { itemId: 42, zoneId: "A", reason: "r" },
        { itemId: 3, zoneId: "Z", reason: "r" },
      ],
      items.slice(0, 3),
      zones,
    );
    expect(plan.map((p) => [p.itemId, p.zoneId])).toEqual([[1, "A"], [2, "desk"], [3, "desk"]]);
  });
});
