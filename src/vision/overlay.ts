import sharp from "sharp";

export type Box = [number, number, number, number]; // x1, y1, x2, y2 in normalized-photo pixels

export interface BoxedItem {
  box: Box;
  color?: string; // box and badge color; yellow when omitted
  /**
   * Redundant cue for the verify overlay. Colour alone can't carry "put away" vs "still out":
   * red and green are the pair most commonly confused, so a judge with deuteranopia would see
   * two identical overlays. A square badge means "still out" whatever the colour looks like.
   */
  shape?: "circle" | "square";
}

export interface OverlayZone {
  id: string; // letter shown in the badge
  box: Box;
}

const ROW_HEIGHT = 80;
const BOX_COLOR = "#FFD400";
const ZONE_COLOR = "#1E6BFF";

/**
 * Badges and strokes scale with the photo's width, because the photo is displayed at the phone's
 * width whatever its pixel size: a 32 px badge on a 1024 px-wide image is half the apparent size
 * of the same badge on a 512 px one. Scaling on the short side instead would do nothing at all for
 * a landscape desk photo, which is every real photo.
 *
 * Floored at the previous fixed size, and capped against the height so an extreme panorama can't
 * produce badges taller than the picture.
 */
const BADGE_RADIUS_RATIO = 1 / 38;
const MIN_BADGE_RADIUS = 16;
const MAX_BADGE_HEIGHT_FRACTION = 1 / 6;
const STROKE_RATIO = 1 / 190;
const MIN_STROKE = 4;

export interface OverlayScale {
  badgeRadius: number;
  fontSize: number;
  stroke: number;
}

export function overlayScale(width: number, height: number): OverlayScale {
  // Rounded first, then clamped, so rounding can't push the result past the cap.
  const cap = Math.floor(height * MAX_BADGE_HEIGHT_FRACTION);
  const badgeRadius = Math.max(MIN_BADGE_RADIUS, Math.min(Math.round(width * BADGE_RADIUS_RATIO), cap));
  return {
    badgeRadius,
    fontSize: Math.round(badgeRadius * 1.15),
    stroke: Math.round(Math.max(MIN_STROKE, width * STROKE_RATIO)),
  };
}

function center([x1, y1, x2, y2]: Box): { x: number; y: number } {
  return { x: (x1 + x2) / 2, y: (y1 + y2) / 2 };
}

// FR-DET-04: rows of ~80 px by box center, top-to-bottom, then left-to-right within a row.
export function numberItems<T extends BoxedItem>(items: readonly T[]): (T & { id: number })[] {
  const byY = items
    .map((item, index) => ({ item, index, c: center(item.box) }))
    .sort((a, b) => a.c.y - b.c.y || a.index - b.index);

  const rows: (typeof byY)[] = [];
  for (const entry of byY) {
    const row = rows.at(-1);
    if (row && entry.c.y - row[0]!.c.y < ROW_HEIGHT) row.push(entry);
    else rows.push([entry]);
  }

  return rows
    .flatMap((row) => row.sort((a, b) => a.c.x - b.c.x || a.index - b.index))
    .map(({ item }, i) => ({ ...item, id: i + 1 }));
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

// FR-DET-05: yellow box per item with a numbered badge at its top-left corner,
// and a dashed blue rectangle per zone with a letter badge.
export async function renderDetections(
  photoBuf: Buffer,
  width: number,
  height: number,
  items: readonly (BoxedItem & { id: number })[],
  zones: readonly OverlayZone[] = [],
): Promise<Buffer> {
  const { badgeRadius, fontSize, stroke } = overlayScale(width, height);
  const font = `font-family="Helvetica, Arial, sans-serif" font-size="${fontSize}" font-weight="bold"`;

  const zoneShapes = zones.map(({ id, box: [x1, y1, x2, y2] }) => {
    const cx = clamp(x1, badgeRadius, width - badgeRadius);
    const cy = clamp(y1, badgeRadius, height - badgeRadius);
    return (
      `<rect x="${x1}" y="${y1}" width="${x2 - x1}" height="${y2 - y1}" fill="none" stroke="${ZONE_COLOR}" stroke-width="${stroke}" stroke-dasharray="${stroke * 3.5} ${stroke * 2}"/>` +
      `<circle cx="${cx}" cy="${cy}" r="${badgeRadius}" fill="${ZONE_COLOR}" stroke="#fff" stroke-width="${Math.max(2, stroke / 2)}"/>` +
      `<text x="${cx}" y="${cy}" ${font} fill="#fff" text-anchor="middle" dominant-baseline="central">${escapeXml(id)}</text>`
    );
  });

  // A dark hairline under every coloured box, so yellow still reads against a pale desk.
  const rects = items.flatMap(({ box: [x1, y1, x2, y2], color = BOX_COLOR }) => [
    `<rect x="${x1}" y="${y1}" width="${x2 - x1}" height="${y2 - y1}" fill="none" stroke="#00000055" stroke-width="${stroke + 3}"/>`,
    `<rect x="${x1}" y="${y1}" width="${x2 - x1}" height="${y2 - y1}" fill="none" stroke="${escapeXml(color)}" stroke-width="${stroke}"/>`,
  ]);

  const badges = items.map(({ id, box: [x1, y1], color = BOX_COLOR, shape = "circle" }) => {
    const textColor = color === BOX_COLOR ? "#000" : "#fff";
    const cx = clamp(x1, badgeRadius, width - badgeRadius);
    const cy = clamp(y1, badgeRadius, height - badgeRadius);
    const outline = Math.max(2, stroke / 2);
    const plate =
      shape === "square"
        ? `<rect x="${cx - badgeRadius}" y="${cy - badgeRadius}" width="${badgeRadius * 2}" height="${badgeRadius * 2}" rx="${Math.round(badgeRadius / 4)}" fill="${escapeXml(color)}" stroke="#000" stroke-width="${outline}"/>`
        : `<circle cx="${cx}" cy="${cy}" r="${badgeRadius}" fill="${escapeXml(color)}" stroke="#000" stroke-width="${outline}"/>`;
    return (
      plate +
      `<text x="${cx}" y="${cy}" ${font} fill="${textColor}" text-anchor="middle" dominant-baseline="central">${escapeXml(String(id))}</text>`
    );
  });

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${zoneShapes.join("")}${rects.join("")}${badges.join("")}</svg>`;

  return sharp(photoBuf)
    .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
    .png()
    .toBuffer();
}
