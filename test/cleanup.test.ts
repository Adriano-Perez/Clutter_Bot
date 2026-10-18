import { describe, expect, it } from "vitest";
import { cleanDetections, iou, type ZoneBox } from "../src/vision/cleanup.js";
import type { Box } from "../src/vision/overlay.js";

// Earlier 1024 px run of tray-messy.
const BOOK: Box = [298, 278, 543, 542];
const CABLE_HEADPHONES: Box = [734, 222, 944, 349];

// Latest 768 px run: out/tray-messy.a-vocab-none.json and out/tray-messy.zones.json.
const W = 768;
const PEN_IN_CUP: Box = [12, 0, 115, 112];
const PEN_CUP_ZONE: ZoneBox = { label: "pen cup", box: [45, 43, 137, 114] };
const EARBUD_L: Box = [587, 168, 622, 192];
const EARBUD_R: Box = [551, 199, 585, 220];
const EARBUD_CORD: Box = [571, 185, 709, 263];
const KEYS_A: Box = [615, 310, 682, 391];
const KEYS_B: Box = [673, 347, 701, 379];
const CHARGER: Box = [156, 124, 201, 196];
const USB_CABLE: Box = [174, 57, 342, 268];

const REAL_DETECTIONS: { label: string; box: Box }[] = [
  { label: "notebook", box: [223, 208, 407, 406] },
  { label: "cable", box: USB_CABLE },
  { label: "cable", box: EARBUD_CORD },
  { label: "power adapter", box: CHARGER },
  { label: "earbuds", box: EARBUD_L },
  { label: "earbuds", box: EARBUD_R },
  { label: "mug", box: [484, 80, 564, 177] },
  { label: "keys", box: KEYS_A },
  { label: "keys", box: KEYS_B },
  { label: "paper", box: [637, 176, 734, 285] },
  { label: "paper", box: [507, 257, 607, 387] },
  { label: "pen", box: PEN_IN_CUP },
  { label: "pen", box: [350, 101, 422, 183] },
  { label: "pen", box: [366, 155, 456, 207] },
  { label: "pen", box: [406, 195, 463, 293] },
  { label: "pen", box: [402, 263, 479, 344] },
];

const REAL_ZONES: ZoneBox[] = [
  { label: "storage bin", box: [0, 287, 154, 429] },
  PEN_CUP_ZONE,
  { label: "cup", box: [485, 80, 564, 177] },
  { label: "storage bin", box: [609, 0, 768, 142] },
];

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
      1024,
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
      1024,
    );
    expect(out).toEqual([{ label: "headphones", box: CABLE_HEADPHONES }]);
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
      1024,
    );
    expect(out.map((d) => d.label)).toEqual(["charger", "headphones", "paper"]);
  });

  it("maps trash and clothing words to trash and clothes", () => {
    const out = cleanDetections(
      [
        { label: "chip bag", box: [0, 0, 80, 100] },
        { label: "soda can", box: [200, 0, 240, 70] },
        { label: "tissue", box: [300, 0, 360, 50] },
        { label: "food wrapper", box: [400, 0, 470, 40] },
        { label: "clothing", box: [500, 0, 700, 200] },
      ],
      [],
      1024,
    );
    expect(out.map((d) => d.label)).toEqual(["trash", "trash", "trash", "trash", "clothes"]);
  });

  it("prefers trash over snack on the same box", () => {
    const out = cleanDetections(
      [
        { label: "snack", box: [0, 0, 80, 100] },
        { label: "chip bag", box: [0, 0, 80, 100] },
      ],
      [],
      1024,
    );
    expect(out.map((d) => d.label)).toEqual(["trash"]);
  });

  it("maps a lone book to notebook", () => {
    expect(cleanDetections([{ label: "book", box: BOOK }], [], 1024)).toEqual([{ label: "notebook", box: BOOK }]);
  });

  describe("cup rule", () => {
    it("drops the pen that is really the pen cup", () => {
      const otherPen = { label: "pen", box: [350, 101, 422, 183] as Box };
      const out = cleanDetections([{ label: "pen", box: PEN_IN_CUP }, otherPen], [PEN_CUP_ZONE], W);
      expect(out).toEqual([otherPen]);
    });

    it("never drops items near or inside a storage bin", () => {
      const bin: ZoneBox = { label: "storage bin", box: [0, 0, 300, 300] };
      const insideBin = { label: "keys", box: [50, 50, 120, 120] as Box };
      expect(cleanDetections([insideBin], [bin], W)).toEqual([insideBin]);
    });

    it("keeps an item that only clips the edge of a cup", () => {
      const cup: ZoneBox = { label: "cup", box: [400, 0, 500, 100] };
      const pen = { label: "pen", box: [460, 20, 560, 80] as Box }; // 40% of the smaller box
      expect(cleanDetections([pen], [cup], W)).toEqual([pen]);
    });

    it("never drops a mug, even inside a cup zone", () => {
      const mug = { label: "mug", box: [484, 80, 564, 177] as Box };
      expect(cleanDetections([mug], [{ label: "cup", box: [485, 80, 564, 177] }], W)).toEqual([mug]);
    });
  });

  describe("same-label merge", () => {
    it("joins two nearby earbuds into one headphones box", () => {
      const out = cleanDetections(
        [
          { label: "earbuds", box: EARBUD_L },
          { label: "earbuds", box: EARBUD_R },
        ],
        [],
        W,
      );
      expect(out).toEqual([{ label: "headphones", box: [551, 168, 622, 220] }]);
    });

    it("joins overlapping keys into one keys box", () => {
      const out = cleanDetections(
        [
          { label: "keys", box: KEYS_A },
          { label: "keys", box: KEYS_B },
        ],
        [],
        W,
      );
      expect(out).toEqual([{ label: "keys", box: [615, 310, 701, 391] }]);
    });

    it("keeps same-label boxes apart when the gap is 5% of the width or more", () => {
      const a = { label: "keys", box: [0, 0, 50, 50] as Box };
      const b = { label: "keys", box: [90, 0, 140, 50] as Box }; // 40 px gap > 38.4
      expect(cleanDetections([a, b], [], W)).toEqual([a, b]);
    });

    it("never merges pens, paper or cables", () => {
      const items = [
        { label: "pen", box: [350, 101, 422, 183] as Box },
        { label: "pen", box: [366, 155, 456, 207] as Box },
        { label: "paper", box: [0, 300, 100, 400] as Box },
        { label: "paper", box: [90, 300, 200, 400] as Box },
        { label: "cable", box: [0, 0, 100, 50] as Box },
        { label: "cable", box: [100, 0, 200, 50] as Box },
      ];
      expect(cleanDetections(items, [], W)).toHaveLength(6);
    });
  });

  describe("paired-label merge", () => {
    it("absorbs the earbud cord into the merged headphones as a union box", () => {
      const out = cleanDetections(
        [
          { label: "earbuds", box: EARBUD_L },
          { label: "earbuds", box: EARBUD_R },
          { label: "cable", box: EARBUD_CORD },
        ],
        [],
        W,
      );
      expect(out).toEqual([{ label: "headphones", box: [551, 168, 709, 263] }]);
    });

    it("keeps the charger and its USB cable separate", () => {
      const out = cleanDetections(
        [
          { label: "power adapter", box: CHARGER },
          { label: "cable", box: USB_CABLE },
        ],
        [],
        W,
      );
      expect(out).toEqual([
        { label: "charger", box: CHARGER },
        { label: "cable", box: USB_CABLE },
      ]);
    });
  });

  it("cleans the real tray-messy run down to 12 items", () => {
    const out = cleanDetections(REAL_DETECTIONS, REAL_ZONES, W);

    const counts: Record<string, number> = {};
    for (const { label } of out) counts[label] = (counts[label] ?? 0) + 1;

    expect(out).toHaveLength(12);
    expect(counts).toEqual({ notebook: 1, cable: 1, charger: 1, headphones: 1, mug: 1, keys: 1, paper: 2, pen: 4 });
    expect(out.find((d) => d.label === "cable")?.box).toEqual(USB_CABLE);
    expect(out.some((d) => d.label === "pen" && d.box === PEN_IN_CUP)).toBe(false);
  });
});
