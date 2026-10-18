import sharp from "sharp";

// Same geometry as normalizePhoto, so the numbers below mean the same thing the detector sees.
const MAX_SIDE = 1024;

/**
 * Thresholds calibrated on the three tray fixtures and degraded copies of them
 * (see specs/features/02-item-detection/validation.md). Both sit several times away from the
 * nearest real measurement in each direction, because a wrongly rejected photo costs a demo and a
 * marginal photo that gets through only costs one detection pass.
 */
const MIN_BRIGHTNESS = 0.12; // good photos measured 0.65-0.78; a 1/8-exposure copy measured 0.076
const MIN_SHARPNESS = 25; // good photos measured 144-786; a barely-blurred copy measured 3.9-13.6

export type QualityProblem = "dark" | "blurry";

export interface Quality {
  /** Mean luminance, 0 (black) to 1 (white). */
  brightness: number;
  /** Variance of the Laplacian: high on a crisp photo, near zero on a blurred or featureless one. */
  sharpness: number;
  problem?: QualityProblem;
}

export const RETAKE: Record<QualityProblem, string> = {
  dark: "That photo's too dark for me to make anything out. Try again with more light on the desk.",
  blurry: "That one came out blurry. Hold the phone still and shoot straight down over the desk.",
};

/**
 * Variance of the Laplacian over the greyscale image.
 *
 * Computed on raw pixels in floating point on purpose: sharp's own convolve() clamps to uint8,
 * which throws away most of the signal — measured there, a heavily blurred photo still scored 80%
 * of a crisp one, and the two were not separable. In float the same pair differ by about 50x.
 */
function laplacianVariance(data: Buffer, width: number, height: number): number {
  let sum = 0;
  let sumSquares = 0;
  let n = 0;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      const v = 4 * data[i]! - data[i - 1]! - data[i + 1]! - data[i - width]! - data[i + width]!;
      sum += v;
      sumSquares += v * v;
      n++;
    }
  }
  if (n === 0) return 0;
  const mean = sum / n;
  return sumSquares / n - mean * mean;
}

/**
 * FR-DET-07: is this photo worth sending to the detector?
 *
 * Darkness is checked first, because an underexposed photo also reads as blurry and "add light"
 * is the more useful instruction. Only ever applied to the *before* photo: a tidied desk is
 * legitimately low in detail — an empty patch of desk measures about 1.0 — so the same test on an
 * "after" photo would reject the very result we're hoping to see.
 */
export async function assessQuality(input: Buffer): Promise<Quality> {
  const { data, info } = await sharp(input)
    .rotate()
    .resize({ width: MAX_SIDE, height: MAX_SIDE, fit: "inside", withoutEnlargement: true })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  let total = 0;
  for (const value of data) total += value;
  const brightness = data.length > 0 ? total / data.length / 255 : 0;
  const sharpness = laplacianVariance(data, info.width, info.height);

  const problem: QualityProblem | undefined =
    brightness < MIN_BRIGHTNESS ? "dark" : sharpness < MIN_SHARPNESS ? "blurry" : undefined;

  return { brightness, sharpness, ...(problem ? { problem } : {}) };
}
