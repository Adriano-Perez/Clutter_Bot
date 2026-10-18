import { describe, expect, it } from "vitest";
import type { Item } from "../src/types.js";
import type { Box } from "../src/vision/overlay.js";
import { buildSummary, compareAfter } from "../src/verify/compare.js";

const BIN: Box = [0, 300, 200, 450];

function item(id: number, label: string, box: Box, destinationZoneId?: string): Item {
  return {
    id,
    label,
    box,
    ...(destinationZoneId !== undefined ? { destinationZoneId } : {}),
    evidence: [{ state: "seen", source: "photo", at: "2026-10-17T00:00:00.000Z" }],
  };
}

const charger = item(1, "charger", [300, 50, 360, 120]);
const mug = item(2, "mug", [480, 80, 560, 180]);
const keys = item(3, "keys", [600, 300, 680, 390]);

describe("compareAfter", () => {
  it("sorts items into put away, still out and can't see", () => {
    const after = [
      { label: "charger", box: [40, 330, 100, 400] as Box }, // moved into the bin
      { label: "mug", box: [485, 85, 565, 185] as Box }, // still on the desk
      // keys: not detected at all
    ];

    const c = compareAfter([charger, mug, keys], after, [BIN]);

    expect(c.putAway).toEqual([charger]);
    expect(c.stillOut).toEqual([mug]);
    expect(c.cantSee).toEqual([keys]);
    expect(c.keptOnDesk).toEqual([]);
    expect(c.detections.map((d) => d.inZone)).toEqual([true, false]);
    expect(buildSummary(c)).toBe(
      "Put away: charger. Still out: mug (2). Can't see: keys (3). " +
        "I can't see inside closed bins, so I'm only counting what's visible.",
    );
  });

  it("matches label counts: 3 pens before, 1 out and 1 in the bin after", () => {
    const pens = [item(4, "pen", [300, 200, 320, 260]), item(5, "pen", [400, 200, 420, 260]), item(6, "pen", [500, 200, 520, 260])];
    const after = [
      { label: "pen", box: [402, 202, 422, 262] as Box }, // pen 5 hasn't moved
      { label: "pen", box: [50, 320, 70, 380] as Box }, // one pen in the bin
    ];

    const c = compareAfter(pens, after, [BIN]);

    expect(c.stillOut.map((i) => i.id)).toEqual([5]);
    expect(c.putAway.map((i) => i.id)).toEqual([4]);
    expect(c.cantSee.map((i) => i.id)).toEqual([6]);
  });

  it("counts a planned desk item as done when it is still visible", () => {
    const planned = [item(1, "charger", charger.box, "A"), item(2, "mug", mug.box, "desk")];
    const c = compareAfter(planned, [{ label: "mug", box: mug.box }, { label: "charger", box: [40, 330, 100, 400] }], [BIN]);

    expect(c.keptOnDesk.map((i) => i.id)).toEqual([2]);
    expect(c.stillOut).toEqual([]);
    expect(buildSummary(c)).toBe("Put away: charger. On the desk as planned: mug. Desk clear! Nice work.");
  });

  it("skips the desk rule when there is no plan", () => {
    const c = compareAfter([charger, mug], [{ label: "mug", box: mug.box }, { label: "charger", box: charger.box }], [BIN]);
    expect(c.stillOut.map((i) => i.id)).toEqual([1, 2]);
    expect(c.keptOnDesk).toEqual([]);
  });

  it("says the desk is clear when nothing is still out", () => {
    const c = compareAfter([charger, keys], [{ label: "charger", box: [40, 330, 100, 400] }], [BIN]);
    expect(buildSummary(c)).toBe("Put away: charger. Can't see: keys (3). Desk clear! Nice work.");
  });
});
