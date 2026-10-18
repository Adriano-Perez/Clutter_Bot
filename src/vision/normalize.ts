import sharp from "sharp";

const MAX_SIDE = 1024;
const JPEG_QUALITY = 85;

export interface NormalizedPhoto {
  buf: Buffer;
  width: number;
  height: number;
  dataUrl: string;
}

// FR-DET-01: one coordinate space for every model call and overlay.
export async function normalizePhoto(
  input: Buffer,
  { maxSide = MAX_SIDE }: { maxSide?: number } = {},
): Promise<NormalizedPhoto> {
  const { data, info } = await sharp(input)
    .rotate() // apply EXIF orientation, then drop the tag
    .resize({ width: maxSide, height: maxSide, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: JPEG_QUALITY })
    .toBuffer({ resolveWithObject: true });

  return {
    buf: data,
    width: info.width,
    height: info.height,
    dataUrl: `data:image/jpeg;base64,${data.toString("base64")}`,
  };
}
