import sharp from "sharp";

export type Box = [number, number, number, number]; // x1, y1, x2, y2 in normalized-photo pixels

export interface BoxedItem {
  box: Box;
}

const ROW_HEIGHT = 80;
const BOX_COLOR = "#FFD400";
const BOX_STROKE = 4;
const BADGE_RADIUS = 16; // 32 px badge, above the 28 px minimum
const BADGE_FONT_SIZE = 18;

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

// FR-DET-05: yellow box per item with a numbered badge at its top-left corner.
export async function renderDetections(
  photoBuf: Buffer,
  width: number,
  height: number,
  items: readonly (BoxedItem & { id: number })[],
): Promise<Buffer> {
  const rects = items.map(({ box: [x1, y1, x2, y2] }) => {
    return `<rect x="${x1}" y="${y1}" width="${x2 - x1}" height="${y2 - y1}" fill="none" stroke="${BOX_COLOR}" stroke-width="${BOX_STROKE}"/>`;
  });

  const badges = items.map(({ id, box: [x1, y1] }) => {
    const cx = clamp(x1, BADGE_RADIUS, width - BADGE_RADIUS);
    const cy = clamp(y1, BADGE_RADIUS, height - BADGE_RADIUS);
    return (
      `<circle cx="${cx}" cy="${cy}" r="${BADGE_RADIUS}" fill="${BOX_COLOR}" stroke="#000" stroke-width="2"/>` +
      `<text x="${cx}" y="${cy}" font-family="Helvetica, Arial, sans-serif" font-size="${BADGE_FONT_SIZE}" font-weight="bold" fill="#000" text-anchor="middle" dominant-baseline="central">${escapeXml(String(id))}</text>`
    );
  });

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${rects.join("")}${badges.join("")}</svg>`;

  return sharp(photoBuf)
    .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
    .png()
    .toBuffer();
}
