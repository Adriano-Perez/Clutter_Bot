import { describe, expect, it } from "vitest";
import { handleCommand, statusText } from "../src/commands.js";
import { buildSteps, instructionFor, replanAwayFrom } from "../src/plan.js";
import { newSession } from "../src/session.js";
import type { Item, Session, Zone } from "../src/types.js";

const item = (id: number, label: string, zone?: string, reason?: string): Item => ({
  id,
  label,
  box: [0, 0, 10, 10],
  evidence: [],
  ...(zone ? { destinationZoneId: zone } : {}),
  ...(reason ? { reason } : {}),
});

const zone = (id: string, label: string): Zone => ({ id, label, polygon: [], box: [0, 0, 10, 10] });

const zones = [
  { id: "A", label: "storage bin" },
  { id: "B", label: "pen cup" },
];

function planned(over: Partial<Session> = {}): Session {
  return {
    ...newSession("+12065550142"),
    phase: "planned",
    zones: [zone("A", "storage bin"), zone("B", "pen cup")],
    items: [
      item(1, "charger", "A", "stored out of the way"),
      item(2, "cable", "A", "stays with the charger"),
      item(3, "pen", "B", "keeps pens together"),
      item(4, "paper", "toss", "loose paper is clutter"),
      item(5, "phone", "desk", "you use it every day"),
      item(6, "backpack", "off-desk", "too big for the desk bins"),
    ],
    ...over,
  };
}

const say = (s: Session, t: string) => (handleCommand(s, t)?.[0] as { text: string } | undefined)?.text;

describe("instructionFor", () => {
  it("says what to physically do", () => {
    expect(instructionFor(item(1, "charger", "A"), zones)).toBe("Put the charger (1) in A storage bin.");
    expect(instructionFor(item(4, "paper", "toss"), zones)).toBe("Throw away the paper (4).");
    expect(instructionFor(item(6, "backpack", "off-desk"), zones)).toBe("Put the backpack (6) away where it belongs.");
    expect(instructionFor(item(7, "mug", "kitchen"), zones)).toBe("Take the mug (7) to the kitchen.");
    expect(instructionFor(item(5, "phone", "desk"), zones)).toBe("Leave the phone (5) where it is.");
  });
});

describe("buildSteps", () => {
  it("skips anything that stays on the desk, since that isn't a task", () => {
    const steps = buildSteps(planned().items, zones);
    expect(steps.map((s) => s.itemId)).toEqual([1, 2, 3, 4, 6]);
    expect(steps.map((s) => s.n)).toEqual([1, 2, 3, 4, 5]);
  });

  it("groups by destination so you deal with one bin at a time", () => {
    const scattered = [
      item(1, "charger", "A"),
      item(2, "pen", "B"),
      item(3, "cable", "A"),
      item(4, "pen", "B"),
    ];
    expect(buildSteps(scattered, zones).map((s) => s.itemId)).toEqual([1, 3, 2, 4]);
  });
});

describe("next and done", () => {
  it("walks through the steps one at a time", () => {
    const s = planned();
    expect(say(s, "next")).toBe("Step 1 of 5: Put the charger (1) in A storage bin.");
    expect(say(s, "next")).toBe("Step 1 of 5: Put the charger (1) in A storage bin.");

    expect(say(s, "done")).toBe("Nice — 1 of 5 done.\nStep 2 of 5: Put the cable (2) in A storage bin.");
    expect(say(s, "next")).toBe("Step 2 of 5: Put the cable (2) in A storage bin.");
  });

  it("records the claim as a claim, not as something it has seen", () => {
    const s = planned();
    say(s, "done");

    const evidence = s.items.find((i) => i.id === 1)!.evidence;
    expect(evidence.at(-1)).toMatchObject({ state: "claimed", source: "user_text" });
    expect(evidence.map((e) => e.state)).not.toContain("verified");
  });

  it("asks for the photo once every step is claimed", () => {
    const s = planned();
    for (let i = 0; i < 5; i++) say(s, "done");

    expect(say(s, "done")).toBe("That's everything. Send me a photo and I'll check your work.");
    expect(say(s, "next")).toBe("That's everything. Send me a photo and I'll check your work.");
  });

  it("counts progress in status", () => {
    const s = planned();
    say(s, "done");
    say(s, "done");
    expect(statusText(s)).toContain("You've told me 2 of 5 are done.");
  });

  it("leaves next and done alone outside the planned phase", () => {
    expect(handleCommand(planned({ phase: "interview" }), "done")).toBeUndefined();
    expect(handleCommand(planned({ phase: "awaiting_photo" }), "next")).toBeUndefined();
  });
});

describe("replanAwayFrom", () => {
  it("moves undone items to another bin and leaves done ones alone", () => {
    const items = [item(1, "charger", "A"), item(2, "cable", "A")];
    const threeZones = [...zones, { id: "C", label: "storage bin" }];

    const { moved, to } = replanAwayFrom(items, threeZones, "A", (id) => id === 1);

    expect(to.id).toBe("C");
    expect(moved.map((i) => i.id)).toEqual([2]);
    expect(items[0]!.destinationZoneId).toBe("A"); // already done, untouched
    expect(items[1]!.destinationZoneId).toBe("C");
  });

  it("falls back to the desk when there's nowhere else", () => {
    const items = [item(1, "charger", "A")];
    const { to } = replanAwayFrom(items, [{ id: "A", label: "storage bin" }], "A", () => false);

    expect(to.id).toBe("desk");
    expect(items[0]!.reason).toBe("nowhere else to put it");
  });
});

describe("A is full", () => {
  it("re-plans the undone items and gives the next step", () => {
    const s = planned({ zones: [zone("A", "storage bin"), zone("B", "pen cup"), zone("C", "storage bin")] });
    say(s, "done"); // charger (1) into A is finished

    const reply = say(s, "A is full")!;

    expect(reply).toContain("A storage bin is full — 2 cable moved to C storage bin.");
    expect(s.items.find((i) => i.id === 2)!.destinationZoneId).toBe("C");
    expect(s.items.find((i) => i.id === 1)!.destinationZoneId).toBe("A");
    expect(s.zones.find((z) => z.id === "A")!.full).toBe(true);
    expect(reply).toContain("Step 2 of 5: Put the cable (2) in C storage bin.");
  });

  it("keeps the steps already claimed", () => {
    const s = planned({ zones: [zone("A", "storage bin"), zone("B", "pen cup"), zone("C", "storage bin")] });
    say(s, "done");
    say(s, "A is full");

    expect(s.steps.filter((step) => step.done).map((step) => step.itemId)).toEqual([1]);
  });

  it("says so when the letter isn't in the photo, or nothing is left to move", () => {
    expect(say(planned(), "Z is full")).toBe("I don't have a Z in this photo.");

    const s = planned();
    for (let i = 0; i < 5; i++) say(s, "done");
    expect(say(s, "A is full")).toBe("Nothing left to move out of A storage bin.");
  });

  it("accepts the ways people phrase it", () => {
    for (const phrasing of ["A is full", "bin A is full", "the A is full", "a is full"]) {
      const s = planned({ zones: [zone("A", "storage bin"), zone("C", "storage bin")] });
      expect(say(s, phrasing), phrasing).toContain("is full");
    }
  });
});

describe("a label correction invalidates the steps", () => {
  it("rebuilds them from the new plan", () => {
    const s = planned();
    say(s, "next");
    expect(s.steps).toHaveLength(5);

    say(s, "4 is a mug"); // paper -> mug, so it stops being a toss item
    expect(s.steps).toHaveLength(0);

    expect(say(s, "next")).toBe("Step 1 of 5: Put the charger (1) in A storage bin.");
    expect(s.steps.find((step) => step.itemId === 4)!.instruction).toBe("Take the mug (4) to the kitchen.");
  });
});
