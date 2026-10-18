import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { normalizePhoto } from "../src/vision/normalize.js";

function solidImage(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: { r: 120, g: 80, b: 40 } },
  })
    .png()
    .toBuffer();
}

describe("normalizePhoto", () => {
  it("shrinks a 3000x2000 image so the longest side is 1024", async () => {
    const out = await normalizePhoto(await solidImage(3000, 2000));
    expect(out.width).toBe(1024);
    expect(out.height).toBe(683);

    const meta = await sharp(out.buf).metadata();
    expect(meta.format).toBe("jpeg");
    expect(meta.width).toBe(1024);
    expect(meta.height).toBe(683);
    expect(out.dataUrl.startsWith("data:image/jpeg;base64,")).toBe(true);
  });

  it("does not enlarge a 500x400 image", async () => {
    const out = await normalizePhoto(await solidImage(500, 400));
    expect(out.width).toBe(500);
    expect(out.height).toBe(400);
  });
});
