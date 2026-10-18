import { beforeAll, describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import sharp from "sharp";
import { RETAKE, assessQuality } from "../src/vision/quality.js";

const FIXTURES = ["tray-messy", "tray-half", "tray-done"] as const;

/** The same normalization the pipeline applies, so the measurements mean the same thing. */
async function normalized(name: string): Promise<Buffer> {
  return sharp(await readFile(`test/fixtures/${name}.jpg`))
    .rotate()
    .resize({ width: 1024, height: 1024, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toBuffer();
}

describe("assessQuality", () => {
  const good = new Map<string, Buffer>();

  beforeAll(async () => {
    for (const name of FIXTURES) good.set(name, await normalized(name));
  });

  it("accepts every real fixture, messy and tidy alike", async () => {
    for (const name of FIXTURES) {
      const quality = await assessQuality(good.get(name)!);
      expect(quality.problem, `${name} was rejected`).toBeUndefined();
      expect(quality.brightness).toBeGreaterThan(0.5);
      expect(quality.sharpness).toBeGreaterThan(100);
    }
  });

  it("rejects a blurred photo", async () => {
    for (const name of FIXTURES) {
      const blurred = await sharp(good.get(name)!).blur(4).jpeg().toBuffer();
      expect((await assessQuality(blurred)).problem, `blurred ${name} got through`).toBe("blurry");
    }
  });

  it("rejects an underexposed photo", async () => {
    for (const name of FIXTURES) {
      const dark = await sharp(good.get(name)!).linear(0.1, 0).jpeg().toBuffer();
      expect((await assessQuality(dark)).problem, `dark ${name} got through`).toBe("dark");
    }
  });

  it("calls an underexposed photo dark, not blurry, since that's the useful instruction", async () => {
    // A dark photo scores low on both measures; brightness is checked first on purpose.
    const dark = await sharp(good.get("tray-messy")!).linear(0.08, 0).jpeg().toBuffer();
    const quality = await assessQuality(dark);
    expect(quality.sharpness).toBeLessThan(25);
    expect(quality.problem).toBe("dark");
  });

  it("leaves room on both sides of each threshold", async () => {
    // Worst real fixture vs. the mildest degradation that should still be caught.
    const worstGood = Math.min(...(await Promise.all(FIXTURES.map(async (n) => (await assessQuality(good.get(n)!)).sharpness))));
    const mildestBlur = Math.max(
      ...(await Promise.all(
        FIXTURES.map(async (n) => (await assessQuality(await sharp(good.get(n)!).blur(2).jpeg().toBuffer())).sharpness),
      )),
    );
    expect(worstGood).toBeGreaterThan(25 * 3); // threshold is far below any real photo
    expect(mildestBlur).toBeLessThan(25); // and still above anything blurred
  });

  it("survives a one-pixel image without dividing by zero", async () => {
    const tiny = await sharp({ create: { width: 1, height: 1, channels: 3, background: "#808080" } }).jpeg().toBuffer();
    const quality = await assessQuality(tiny);
    expect(quality.sharpness).toBe(0);
    expect(Number.isFinite(quality.brightness)).toBe(true);
  });

  it("tells the user what to change, not what went wrong internally", () => {
    expect(RETAKE.dark).toMatch(/more light/i);
    expect(RETAKE.blurry).toMatch(/hold the phone still/i);
  });
});
