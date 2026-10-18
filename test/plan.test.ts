import { describe, expect, it } from "vitest";
import { groupLine, groupPlan, planMessage, zoneName } from "../src/plan.js";
import type { Item } from "../src/types.js";

const item = (id: number, label: string, destinationZoneId?: string, reason?: string): Item => ({
  id,
  label,
  box: [0, 0, 10, 10],
  evidence: [],
  ...(destinationZoneId ? { destinationZoneId } : {}),
  ...(reason ? { reason } : {}),
});

const zones = [
  { id: "A", label: "storage bin" },
  { id: "B", label: "pen cup" },
];

describe("zoneName", () => {
  it("keeps the overlay letter for a detected zone and spells out the rest", () => {
    expect(zoneName(zones, "B")).toBe("B pen cup");
    expect(zoneName(zones, "desk")).toBe("Stays where it is");
    expect(zoneName(zones, "toss")).toBe("Toss");
    expect(zoneName(zones, "off-desk")).toBe("Out of the way");
    expect(zoneName(zones, "kitchen")).toBe("Take to the kitchen");
    expect(zoneName(zones, "mystery")).toBe("mystery");
  });
});

describe("groupPlan", () => {
  const items = [
    item(1, "charger", "A", "stored out of the way"),
    item(2, "phone", "desk", "you use it every day"),
    item(3, "pen", "B", "keeps pens together"),
    item(4, "paper", "toss", "loose paper is clutter"),
    item(5, "backpack", "off-desk", "too big for the desk bins"),
    item(6, "cable", "A", "stays with the charger"),
    item(7, "pen", "B", "keeps pens together"),
  ];

  it("orders the storage spots first and the things that stay put last", () => {
    expect(groupPlan(items, zones).map((g) => g.zoneId)).toEqual(["A", "B", "toss", "off-desk", "desk"]);
  });

  it("keeps each group's items in item order", () => {
    const groups = groupPlan(items, zones);
    expect(groups[0]!.items.map((i) => i.id)).toEqual([1, 6]);
    expect(groups[1]!.items.map((i) => i.id)).toEqual([3, 7]);
  });

  it("uses the reason the group's items share", () => {
    const groups = groupPlan(items, zones);
    expect(groups[1]!.reason).toBe("keeps pens together");
    // A holds one "stored out of the way" and one "stays with the charger": first wins the tie.
    expect(groups[0]!.reason).toBe("stored out of the way");
  });

  it("skips unplanned items", () => {
    expect(groupPlan([item(1, "mug"), item(2, "pen", "B")], zones).map((g) => g.zoneId)).toEqual(["B"]);
    expect(groupPlan([item(1, "mug")], zones)).toEqual([]);
  });

  it("keeps a placement into an unknown zone rather than dropping the item", () => {
    const groups = groupPlan([item(1, "pen", "B"), item(2, "mug", "Z")], zones);
    expect(groups.map((g) => g.zoneId)).toEqual(["B", "Z"]);
  });

  it("omits the reason when no item has one", () => {
    expect(groupPlan([item(1, "pen", "B")], zones)[0]!.reason).toBeUndefined();
  });
});

describe("groupLine", () => {
  it("reads as one destination and its items", () => {
    const groups = groupPlan([item(1, "charger", "A", "stored out of the way"), item(2, "cable", "A", "stored out of the way")], zones);
    expect(groupLine(groups[0]!)).toBe("A storage bin — 1 charger, 2 cable (stored out of the way)");
  });

  it("caps a long group at six items", () => {
    const many = Array.from({ length: 9 }, (_, n) => item(n + 1, "paper", "toss", "loose paper is clutter"));
    expect(groupLine(groupPlan(many, zones)[0]!)).toBe(
      "Toss — 1 paper, 2 paper, 3 paper, 4 paper, 5 paper, 6 paper, and 3 more (loose paper is clutter)",
    );
  });
});

describe("planMessage", () => {
  it("is one line per destination, not one per item", () => {
    const items = [
      item(1, "charger", "A", "stored out of the way"),
      item(2, "cable", "A", "stored out of the way"),
      item(3, "pen", "B", "keeps pens together"),
      item(4, "paper", "toss", "loose paper is clutter"),
      item(5, "phone", "desk", "you use it every day"),
    ];
    expect(planMessage(groupPlan(items, zones))).toBe(
      [
        "Here's where everything goes:",
        "",
        "A storage bin — 1 charger, 2 cable (stored out of the way)",
        "B pen cup — 3 pen (keeps pens together)",
        "Toss — 4 paper (loose paper is clutter)",
        "Stays where it is — 5 phone (you use it every day)",
      ].join("\n"),
    );
  });

  it("says something useful when there is nothing to show", () => {
    expect(planMessage([])).toMatch(/start over/i);
  });
});
