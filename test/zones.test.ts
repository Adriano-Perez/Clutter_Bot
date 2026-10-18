import { describe, expect, it } from "vitest";
import type { Box } from "../src/vision/overlay.js";
import { filterZones, withoutMugZones } from "../src/vision/zones.js";

const W = 768;
const H = 512; // 1% of the area is 3932 px²

describe("filterZones", () => {
  it("drops zones smaller than 1% of the image", () => {
    const zones = filterZones(
      [
        { label: "storage bin", box: [10, 10, 300, 250] },
        { label: "box", box: [400, 400, 450, 450] }, // 2500 px²
      ],
      W,
      H,
    );
    expect(zones).toEqual([{ id: "A", label: "storage bin", box: [10, 10, 300, 250] }]);
  });

  it("merges duplicates into one box, keeping the more specific label", () => {
    const zones = filterZones(
      [
        { label: "cup", box: [10, 0, 120, 130] },
        { label: "pen cup", box: [5, 0, 115, 125] },
      ],
      W,
      H,
    );
    expect(zones).toEqual([{ id: "A", label: "pen cup", box: [5, 0, 120, 130] }]);
  });

  it("letters zones left to right", () => {
    const zones = filterZones(
      [
        { label: "storage bin", box: [500, 100, 700, 300] },
        { label: "tray", box: [20, 300, 300, 480] },
        { label: "pen cup", box: [5, 0, 115, 125] },
      ],
      W,
      H,
    );
    expect(zones.map((z) => `${z.id} ${z.label}`)).toEqual(["A pen cup", "B tray", "C storage bin"]);
  });
});

describe("withoutMugZones", () => {
  it("removes a cup zone on top of a mug and re-letters the rest", () => {
    const zones = filterZones(
      [
        { label: "cup", box: [100, 100, 210, 230] },
        { label: "storage bin", box: [400, 100, 700, 400] },
      ],
      W,
      H,
    );
    const mug = { label: "mug", box: [105, 108, 212, 236] as Box };

    expect(withoutMugZones(zones, [mug])).toEqual([{ id: "A", label: "storage bin", box: [400, 100, 700, 400] }]);
  });
});
