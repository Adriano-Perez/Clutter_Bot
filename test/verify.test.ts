import { describe, expect, it } from "vitest";
import type { Item } from "../src/types.js";
import type { Box } from "../src/vision/overlay.js";
import { overlayItems } from "../src/handlers/planned.js";
import { buildSummary, compareAfter, isComplete, matchZones } from "../src/verify/compare.js";

const CAVEAT = " I can't see inside closed bins, so I'm only counting what's visible.";
const SUCCESS = "Visible items are where planned. Nice work.";
const INCONCLUSIVE = "I can't confirm everything yet. Send the same view with the storage spots visible.";
const GREEN = "#1DB954";
const RED = "#E53935";

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
    expect(buildSummary(c)).toBe("Put away: charger. On the desk as planned: mug. " + SUCCESS + CAVEAT);
  });

  it("skips the desk rule when there is no plan", () => {
    const c = compareAfter([charger, mug], [{ label: "mug", box: mug.box }, { label: "charger", box: charger.box }], [BIN]);
    expect(c.stillOut.map((i) => i.id)).toEqual([1, 2]);
    expect(c.keptOnDesk).toEqual([]);
  });

  it("keeps missing items inconclusive even when nothing is still out", () => {
    const c = compareAfter([charger, keys], [{ label: "charger", box: [40, 330, 100, 400] }], [BIN]);
    expect(buildSummary(c)).toBe("Put away: charger. Can't see: keys (3). " + INCONCLUSIVE + CAVEAT);
  });

  it("lists a missing toss item as tossed, not can't see, and still says desk clear", () => {
    const paper = item(10, "paper", [600, 50, 700, 150], "toss");
    const plannedCharger = item(1, "charger", charger.box, "A");

    const c = compareAfter([plannedCharger, paper], [{ label: "charger", box: [40, 330, 100, 400] }], [BIN]);

    expect(c.tossed).toEqual([paper]);
    expect(c.cantSee).toEqual([]);
    expect(buildSummary(c)).toBe("Put away: charger. No longer visible (planned to toss): paper. " + SUCCESS + CAVEAT);
  });

  it("ignores an in-zone detection that matches a pre-stored bin label", () => {
    const paper = item(10, "paper", [600, 50, 700, 150]);
    const binLabel: Box = [60, 340, 120, 380]; // the "A" label taped inside the bin

    const c = compareAfter([paper], [{ label: "paper", box: [62, 342, 121, 381] }], [BIN], {
      preStored: [{ label: "paper", box: binLabel }],
    });

    expect(c.putAway).toEqual([]);
    expect(c.cantSee).toEqual([paper]);
    expect(c.detections[0]?.status).toBe("unmatched");
  });

  it("gives every detection the status of the item it matched", () => {
    const planned = [item(1, "charger", charger.box, "A"), item(2, "mug", mug.box, "desk"), item(3, "keys", keys.box, "A")];
    const after = [
      { label: "mug", box: mug.box },
      { label: "charger", box: [40, 330, 100, 400] as Box },
      { label: "keys", box: keys.box },
      { label: "pen", box: [300, 300, 320, 360] as Box }, // not in the before photo
    ];

    const c = compareAfter(planned, after, [BIN]);

    expect(c.detections.map((d) => [d.label, d.status, d.itemId])).toEqual([
      ["mug", "keptOnDesk", 2],
      ["charger", "putAway", 1],
      ["keys", "stillOut", 3],
      ["pen", "unmatched", undefined],
    ]);
  });
});

describe("overlayItems", () => {
  it("draws kept-on-desk and put-away green, still-out red, and skips unmatched", () => {
    const planned = [item(1, "charger", charger.box, "A"), item(2, "mug", mug.box, "desk"), item(3, "keys", keys.box, "A")];
    const c = compareAfter(
      planned,
      [
        { label: "mug", box: mug.box },
        { label: "charger", box: [40, 330, 100, 400] },
        { label: "keys", box: keys.box },
        { label: "paper", box: [50, 320, 90, 360] }, // unmatched, inside the bin
      ],
      [BIN],
    );

    expect(overlayItems(c)).toEqual([
      { id: 2, box: mug.box, color: GREEN, shape: "circle" },
      { id: 1, box: [40, 330, 100, 400], color: GREEN, shape: "circle" },
      { id: 3, box: keys.box, color: RED, shape: "square" },
    ]);
  });

  it("carries the verdict in the badge shape as well as the colour", () => {
    // Red and green are the pair most often confused, so the overlay has to work without colour.
    const planned = [item(1, "charger", charger.box, "A"), item(3, "keys", keys.box, "A")];
    const c = compareAfter(
      planned,
      [
        { label: "charger", box: [40, 330, 100, 400] },
        { label: "keys", box: keys.box },
      ],
      [BIN],
    );

    const shapes = Object.fromEntries(overlayItems(c).map((o) => [o.id, o.shape]));
    expect(shapes).toEqual({ 1: "circle", 3: "square" });
    // Strip the colour entirely and the two verdicts are still distinguishable.
    expect(new Set(Object.values(shapes)).size).toBe(2);
  });

  it("counts a missing off-desk item as moved off, and says the desk is clear", () => {
    const backpack = item(5, "backpack", [600, 20, 760, 200], "off-desk");
    const trash = item(6, "trash", [250, 20, 290, 90], "toss");
    const c = compareAfter([backpack, trash, item(1, "charger", charger.box, "A")], [{ label: "charger", box: [40, 330, 100, 400] }], [BIN]);

    expect(c.movedOff).toEqual([backpack]);
    expect(c.tossed).toEqual([trash]);
    expect(buildSummary(c)).toBe("Put away: charger. No longer visible (planned to toss): trash. No longer visible (planned to take away): backpack. " + SUCCESS + CAVEAT);
  });

  it("pluralizes trash readably", () => {
    const t = [item(6, "trash", [250, 20, 290, 90], "toss"), item(7, "trash", [300, 20, 340, 90], "toss")];
    expect(buildSummary(compareAfter(t, [], [BIN]))).toBe("No longer visible (planned to toss): 2 pieces of trash. " + INCONCLUSIVE + CAVEAT);
  });
});


describe("verification safety", () => {
  it("never completes an empty or partially missing result", () => {
    const c = compareAfter([item(1, "charger", charger.box, "A")], [], [BIN]);
    expect(isComplete(c)).toBe(false);
    expect(buildSummary(c)).not.toContain(SUCCESS);
    expect(c.cantSee.map((i) => i.id)).toEqual([1]);
  });

  it.each(["kitchen", "toss", "off-desk", "B", "desk"])("rejects a visible item in bin A when planned for %s", (destination) => {
    const c = compareAfter([item(1, "mug", mug.box, destination)],
      [{ label: "mug", box: [40, 330, 100, 400] }], [{ id: "A", box: BIN }]);
    expect(c.putAway).toEqual([]);
    expect(c.stillOut.map((i) => i.id)).toEqual([1]);
    expect(c.detections[0]?.status).toBe("stillOut");
    expect(isComplete(c)).toBe(false);
  });

  it("reports missing kitchen items as no longer visible without claiming the destination", () => {
    const c = compareAfter([item(1, "mug", mug.box, "kitchen")], [], []);
    expect(c.movedOff).toHaveLength(1);
    expect(buildSummary(c)).toContain("No longer visible (planned to take away): mug.");
    expect(isComplete(c)).toBe(false);
  });

  it("preserves before letters when an earlier bin is missed in the after photo", () => {
    const before = [
      { id: "A", label: "storage bin", box: [0, 0, 100, 100] as Box, polygon: [] },
      { id: "B", label: "storage bin", box: [300, 0, 400, 100] as Box, polygon: [] },
    ];
    const after = [{ ...before[1]!, id: "A", box: [302, 2, 402, 102] as Box }];
    const matched = matchZones(before, after);
    expect(matched.map((z) => z.id)).toEqual(["B"]);
    const c = compareAfter([item(1, "charger", charger.box, "A")],
      [{ label: "charger", box: [320, 20, 360, 60] }], matched);
    expect(c.stillOut).toHaveLength(1);
  });

  it("does not reuse one zone for two original zones or match an unrelated location", () => {
    const zone = { id: "A", label: "box", box: [0, 0, 100, 100] as Box, polygon: [] };
    expect(matchZones([zone, { ...zone, id: "B" }], [zone])).toHaveLength(1);
    expect(matchZones([zone], [{ ...zone, box: [300, 300, 400, 400] }])).toEqual([]);
  });
});


it("matches a box that the next detection calls a storage bin", () => {
  const box: Box = [0, 0, 100, 100];
  expect(matchZones([{ id: "B", label: "box", box, polygon: [] }],
    [{ id: "A", label: "storage bin", box, polygon: [] }])).toEqual([{ id: "B", box }]);
});
