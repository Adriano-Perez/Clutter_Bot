import { readFile } from "node:fs/promises";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { detectPhoto, NO_ITEMS_LEGEND } from "../src/pipeline/detectPhoto.js";
import type { Box } from "../src/vision/overlay.js";

// Boxes from out/tray-messy.a-vocab-none.json and out/tray-messy.zones.json (768 px run).
const ITEM_DETECTIONS: [string, Box][] = [
  ["notebook", [223, 208, 407, 406]],
  ["cable", [174, 57, 342, 268]],
  ["cable", [571, 185, 709, 263]],
  ["power adapter", [156, 124, 201, 196]],
  ["earbuds", [587, 168, 622, 192]],
  ["earbuds", [551, 199, 585, 220]],
  ["mug", [484, 80, 564, 177]],
  ["keys", [615, 310, 682, 391]],
  ["keys", [673, 347, 701, 379]],
  ["paper", [637, 176, 734, 285]],
  ["paper", [507, 257, 607, 387]],
  ["pen", [12, 0, 115, 112]],
  ["pen", [350, 101, 422, 183]],
  ["pen", [366, 155, 456, 207]],
  ["pen", [406, 195, 463, 293]],
  ["pen", [402, 263, 479, 344]],
];

const ZONE_DETECTIONS: [string, Box][] = [
  ["storage bin", [0, 287, 154, 429]],
  ["pen cup", [45, 43, 137, 114]],
  ["cup", [485, 80, 564, 177]],
  ["storage bin", [609, 0, 768, 142]],
];

function detectBody(detections: [string, Box][]): string {
  return JSON.stringify({
    detections: detections.map(([mention, [x1, y1, x2, y2]]) => ({
      mention,
      point_box: { top_left: { x: x1, y: y1 }, bottom_right: { x: x2, y: y2 } },
    })),
    finish_reason: "complete",
  });
}

// Answers the items call and the zones call (told apart by their categories).
function mockDetect(items: [string, Box][], zones: [string, Box][]) {
  return vi.fn(async (_url: string, init: RequestInit) => {
    const { categories } = JSON.parse(init.body as string) as { categories: string[] };
    const body = categories.includes("storage bin") ? detectBody(zones) : detectBody(items);
    return new Response(body, { status: 200, headers: { "Content-Type": "application/json" } });
  });
}

describe("detectPhoto", () => {
  let photo: Buffer;

  beforeEach(async () => {
    photo = await readFile(new URL("./fixtures/tray-messy.jpg", import.meta.url));
    vi.stubEnv("PERCEPTRON_API_KEY", "test-key");
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("turns the tray-messy detections into 12 numbered items, 3 zones and a legend", async () => {
    vi.stubGlobal("fetch", mockDetect(ITEM_DETECTIONS, ZONE_DETECTIONS));

    const result = await detectPhoto(photo);

    expect(result.items).toHaveLength(12);
    expect(result.items.map((i) => i.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(result.items[0]?.evidence).toEqual([{ state: "seen", source: "photo", at: expect.any(String) }]);

    expect(result.zones.map((z) => `${z.id} ${z.label}`)).toEqual(["A storage bin", "B pen cup", "C storage bin"]);
    expect(result.zones[1]).toMatchObject({
      box: [45, 43, 137, 114],
      polygon: [
        [45, 43],
        [137, 43],
        [137, 114],
        [45, 114],
      ],
    });

    const [itemsLine, zonesLine] = result.legend.split("\n");
    expect(itemsLine).toMatch(/^I see 12 things: 1 /);
    expect(zonesLine).toBe("Storage spots: A storage bin, B pen cup, C storage bin");

    const meta = await sharp(result.overlayPng).metadata();
    expect([meta.format, meta.width, meta.height]).toEqual(["png", 768, 429]);
  });

  it("returns no items and a retake legend when nothing is found", async () => {
    vi.stubGlobal("fetch", mockDetect([], ZONE_DETECTIONS));

    const result = await detectPhoto(photo);

    expect(result.items).toEqual([]);
    expect(result.legend).toBe(NO_ITEMS_LEGEND);
  });

  it("drops items inside a zone box only with dropInsideZones", async () => {
    const zones: [string, Box][] = [["storage bin", [0, 287, 154, 429]]];
    const items: [string, Box][] = [
      ["paper", [20, 300, 100, 400]], // label taped inside the bin
      ["mug", [484, 80, 564, 177]],
    ];

    vi.stubGlobal("fetch", mockDetect(items, zones));
    const filtered = await detectPhoto(photo, { dropInsideZones: true });
    vi.stubGlobal("fetch", mockDetect(items, zones));
    const unfiltered = await detectPhoto(photo);

    expect(filtered.items.map((i) => i.label)).toEqual(["mug"]);
    expect(unfiltered.items.map((i) => i.label).sort()).toEqual(["mug", "paper"]);
  });

  it("still drops a bin label now that it reads as a sticky note rather than paper", async () => {
    // Real boxes from a live run: with "sticky note" in the vocabulary, the masking-tape "B"
    // taped inside the right-hand bin comes back as a sticky note instead of paper. It's still
    // not desk clutter, and the filter is geometric, so the new label changes nothing.
    const zones: [string, Box][] = [["storage bin", [609, 0, 768, 142]]];
    const items: [string, Box][] = [
      ["sticky note", [652, 39, 707, 96]],
      ["mug", [484, 80, 564, 177]],
    ];

    vi.stubGlobal("fetch", mockDetect(items, zones));
    const result = await detectPhoto(photo, { dropInsideZones: true });

    expect(result.items.map((i) => i.label)).toEqual(["mug"]);
    expect(result.preStored.map((p) => p.label)).toEqual(["sticky note"]);
  });
});
