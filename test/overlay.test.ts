import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { numberItems, overlayScale, renderDetections, type Box } from "../src/vision/overlay.js";

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

describe("overlayScale", () => {
  it("grows the badge with the photo so a number stays readable on a phone", () => {
    // The real landscape shapes the pipeline produces: 768 px for detection, 1024 px normalized.
    const detect = overlayScale(768, 429);
    const normalized = overlayScale(1024, 572);
    expect(detect.badgeRadius).toBe(20);
    expect(normalized.badgeRadius).toBe(27);
    expect(normalized.stroke).toBeGreaterThan(detect.stroke);
  });

  it("scales on width, since a landscape photo is shown at the phone's width", () => {
    // Scaling on the short side would leave every real desk photo at the old fixed 16.
    expect(overlayScale(1024, 572).badgeRadius).toBeGreaterThan(16);
  });

  it("never goes below the old fixed size", () => {
    const tiny = overlayScale(120, 90);
    expect(tiny.badgeRadius).toBe(16);
    expect(tiny.stroke).toBe(4);
  });

  it("keeps the digit inside its badge", () => {
    for (const [w, h] of [[768, 429], [1024, 768], [1024, 1024], [400, 300]]) {
      const { badgeRadius, fontSize } = overlayScale(w!, h!);
      // A two-digit number at this font is roughly 1.2x the font size wide; it has to fit the circle.
      expect(fontSize * 1.2).toBeLessThanOrEqual(badgeRadius * 2);
    }
  });

  it("caps against the height, so a panorama can't get badges taller than the picture", () => {
    const panorama = overlayScale(4000, 400);
    expect(panorama.badgeRadius).toBeLessThanOrEqual(400 / 6);
    // Without the cap this would be 4000/38 ≈ 105, taller than half the image.
    expect(panorama.badgeRadius).toBeLessThan(105);
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
