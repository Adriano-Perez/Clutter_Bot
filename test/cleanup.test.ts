import { describe, expect, it } from "vitest";
import { cleanDetections, iou, type ZoneBox } from "../src/vision/cleanup.js";
import type { Box } from "../src/vision/overlay.js";

// Boxes copied from out/tray-messy.a-vocab-none.json.
const BOOK: Box = [298, 278, 543, 542];
const CABLE_HEADPHONES: Box = [734, 222, 944, 349];
const PEN_IN_CUP: Box = [12, 0, 115, 112]; // pen #1 from the 768 px run

describe("iou", () => {
  it("is 1 for identical boxes", () => {
    expect(iou([0, 0, 10, 10], [0, 0, 10, 10])).toBe(1);
  });

  it("is 0 for disjoint or touching boxes", () => {
    expect(iou([0, 0, 10, 10], [20, 20, 30, 30])).toBe(0);
    expect(iou([0, 0, 10, 10], [10, 0, 20, 10])).toBe(0);
  });

  it("is intersection over union for partial overlap", () => {
    expect(iou([0, 0, 10, 10], [5, 0, 15, 10])).toBeCloseTo(50 / 150);
  });

  it("is 0 for zero-area boxes", () => {
    expect(iou([5, 5, 5, 5], [5, 5, 5, 5])).toBe(0);
  });
});

describe("cleanDetections", () => {
  it("merges the book/notebook pair into one notebook", () => {
    const out = cleanDetections(
      [
        { label: "book", box: BOOK },
        { label: "notebook", box: BOOK },
      ],
      [],
    );
    expect(out).toEqual([{ label: "notebook", box: BOOK }]);
  });

  it("merges cable/headphones at the same box into one headphones", () => {
    const out = cleanDetections(
      [
        { label: "cable", box: CABLE_HEADPHONES },
        { label: "headphones", box: CABLE_HEADPHONES },
      ],
      [],
    );
    expect(out).toEqual([{ label: "headphones", box: CABLE_HEADPHONES }]);
  });

  it("drops a pen that sits inside a pen cup zone", () => {
    const penCup: ZoneBox = { label: "pen cup", box: [5, 0, 125, 130] };
    const otherPen: Box = [466, 135, 564, 245];
    const out = cleanDetections(
      [
        { label: "pen", box: PEN_IN_CUP },
        { label: "pen", box: otherPen },
      ],
      [penCup],
    );
    expect(out).toEqual([{ label: "pen", box: otherPen }]);
  });

  it("keeps items that are only near or partly over a bin", () => {
    const bin: ZoneBox = { label: "storage bin", box: [0, 0, 300, 300] };
    const cup: ZoneBox = { label: "cup", box: [400, 0, 500, 100] };
    const insideBin = { label: "keys", box: [50, 50, 120, 120] as Box };
    const overlapsCupEdge = { label: "pen", box: [460, 20, 560, 80] as Box }; // 40% inside the cup
    expect(cleanDetections([insideBin, overlapsCupEdge], [bin, cup])).toEqual([insideBin, overlapsCupEdge]);
  });

  it("never drops a mug, even inside a cup zone", () => {
    const mug = { label: "mug", box: [645, 108, 752, 236] as Box };
    const cup: ZoneBox = { label: "cup", box: [640, 100, 760, 240] };
    expect(cleanDetections([mug], [cup])).toEqual([mug]);
  });

  it("maps synonyms to canonical labels before deduping", () => {
    const out = cleanDetections(
      [
        { label: "cable", box: [0, 0, 100, 100] },
        { label: "power adapter", box: [0, 0, 100, 100] },
        { label: "earbuds", box: [200, 0, 260, 60] },
        { label: "receipt", box: [300, 0, 400, 50] },
      ],
      [],
    );
    expect(out.map((d) => d.label)).toEqual(["charger", "headphones", "paper"]);
  });

  it("maps a lone book to notebook", () => {
    expect(cleanDetections([{ label: "book", box: BOOK }], [])).toEqual([{ label: "notebook", box: BOOK }]);
  });

  it("drops a cable that is really the headphones' cord", () => {
    const headphones = { label: "headphones", box: [551, 168, 634, 220] as Box };
    const cord = { label: "cable", box: [571, 185, 709, 263] as Box };
    const looseCable = { label: "cable", box: [10, 500, 200, 600] as Box };

    const out = cleanDetections([cord, headphones, looseCable], []);

    expect(out).toEqual([headphones, looseCable]);
  });
});
