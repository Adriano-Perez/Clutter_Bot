import { describe, expect, it } from "vitest";
import { cleanDetections, iou, type ZonePolygon } from "../src/vision/cleanup.js";
import type { Box } from "../src/vision/overlay.js";

// Boxes copied from out/tray-messy.a-vocab-none.json.
const BOOK: Box = [298, 278, 543, 542];
const CABLE_HEADPHONES: Box = [734, 222, 944, 349];
const PEN_CUP: Box = [15, 0, 155, 148];

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

  it("drops a pen box that is really the pen cup zone", () => {
    const penCup: ZonePolygon = {
      polygon: [
        [10, 0],
        [160, 0],
        [160, 150],
        [10, 150],
      ],
    };
    const otherPen: Box = [466, 135, 564, 245];
    const out = cleanDetections(
      [
        { label: "pen", box: PEN_CUP },
        { label: "pen", box: otherPen },
      ],
      [penCup],
    );
    expect(out).toEqual([{ label: "pen", box: otherPen }]);
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
});
