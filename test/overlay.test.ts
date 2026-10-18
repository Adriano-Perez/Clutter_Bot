import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { numberItems, renderDetections, type Box } from "../src/vision/overlay.js";

describe("numberItems", () => {
  it("numbers top row left-to-right, then the next row", () => {
    const items: { label: string; box: Box }[] = [
      { label: "mug", box: [500, 10, 600, 110] }, // top row, right (center y 60)
      { label: "pen", box: [20, 40, 120, 140] }, // top row, left (center y 90, within 80 px)
      { label: "keys", box: [10, 300, 110, 400] }, // second row
    ];

    const numbered = numberItems(items);

    expect(numbered.map((i) => [i.id, i.label])).toEqual([
      [1, "pen"],
      [2, "mug"],
      [3, "keys"],
    ]);
  });
});

describe("renderDetections", () => {
  it("returns a PNG the same size as the input photo", async () => {
    const width = 640;
    const height = 480;
    const photo = await sharp({
      create: { width, height, channels: 3, background: { r: 200, g: 200, b: 200 } },
    })
      .jpeg()
      .toBuffer();

    const out = await renderDetections(photo, width, height, [
      { id: 1, box: [0, 0, 100, 100] }, // badge clamped at the corner
      { id: 2, box: [300, 200, 639, 479] },
    ]);

    const meta = await sharp(out).metadata();
    expect(meta.format).toBe("png");
    expect(meta.width).toBe(width);
    expect(meta.height).toBe(height);
  });
});
