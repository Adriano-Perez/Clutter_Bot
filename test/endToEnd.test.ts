import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DetectPhotoResult } from "../src/pipeline/detectPhoto.js";
import type { InboundContent, InboundMessage, Reply } from "../src/router.js";
import type { Item } from "../src/types.js";
import type { Quality } from "../src/vision/quality.js";

// Every outside edge is stubbed: no Perceptron, no Gemini, no Photon, no network at all.
const detectPhoto = vi.fn<(input: Buffer | Uint8Array, opts?: unknown) => Promise<DetectPhotoResult>>();
vi.mock("../src/pipeline/detectPhoto.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/pipeline/detectPhoto.js")>()),
  detectPhoto,
}));

const json = vi.fn();
vi.mock("../src/llm/gemini.js", () => ({ json, getClient: vi.fn() }));

const sendPreview = vi.fn(async () => false);
vi.mock("../src/preview.js", () => ({ sendPreview, previewEnabled: () => false }));

const assessQuality = vi.fn<() => Promise<Quality>>();
vi.mock("../src/vision/quality.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/vision/quality.js")>()),
  assessQuality,
}));

let mediaDir: string;
// A real JPEG, because the planned handler re-normalizes the saved file with sharp to draw the
// verify overlay. Placeholder bytes would fail there rather than in the code under test.
const REAL_JPEG = await sharp({ create: { width: 160, height: 120, channels: 3, background: "#8a8f98" } })
  .jpeg()
  .toBuffer();

vi.mock("../src/photon/media.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/photon/media.js")>();
  let n = 0;
  return {
    ...actual,
    savePhoto: vi.fn(async () => {
      const file = path.join(mediaDir, `photo-${++n}.jpg`);
      await writeFile(file, REAL_JPEG);
      return file;
    }),
  };
});

const { MessageRouter } = await import("../src/router.js");
const { SqliteSessionStore } = await import("../src/store/sessionStore.js");
const { awaitingPhoto } = await import("../src/handlers/awaitingPhoto.js");
const { interview } = await import("../src/handlers/interview.js");
const { planned } = await import("../src/handlers/planned.js");
const { complete } = await import("../src/handlers/complete.js");

const SENDER = "+12065550142";

const item = (id: number, label: string, box: [number, number, number, number]): Item => ({
  id,
  label,
  box,
  evidence: [{ state: "seen", source: "photo", at: "2026-10-18T00:00:00.000Z" }],
});

const BIN: [number, number, number, number] = [0, 280, 160, 430];
const PEN_CUP: [number, number, number, number] = [40, 40, 140, 120];

const BEFORE_ITEMS = [
  item(1, "charger", [150, 120, 210, 200]),
  item(2, "cable", [170, 50, 340, 270]),
  item(3, "pen", [350, 100, 420, 185]),
  item(4, "paper", [500, 250, 610, 390]),
  item(5, "phone", [620, 300, 700, 400]),
];

function detection(items: Item[], over: Partial<DetectPhotoResult> = {}): DetectPhotoResult {
  return {
    overlayPng: Buffer.from("png"),
    items,
    zones: [
      { id: "A", label: "storage bin", polygon: [], box: BIN },
      { id: "B", label: "pen cup", polygon: [], box: PEN_CUP },
    ],
    legend: `I see ${items.length} things`,
    ms: 100,
    preStored: [],
    debug: {} as DetectPhotoResult["debug"],
    ...over,
  };
}

describe("the whole loop, end to end", () => {
  let store: InstanceType<typeof SqliteSessionStore>;
  let router: InstanceType<typeof MessageRouter>;
  let sent: Reply[];
  let eventId: number;

  beforeEach(async () => {
    mediaDir = await mkdtemp(path.join(tmpdir(), "clutterbot-e2e-"));
    store = new SqliteSessionStore(":memory:");
    router = new MessageRouter(store, { awaiting_photo: awaitingPhoto, interview, planned, complete });
    sent = [];
    eventId = 0;
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    assessQuality.mockResolvedValue({ brightness: 0.65, sharpness: 400 });
  });

  afterEach(async () => {
    detectPhoto.mockReset();
    json.mockReset();
    assessQuality.mockReset();
    sendPreview.mockClear();
    vi.restoreAllMocks();
    await rm(mediaDir, { recursive: true, force: true });
  });

  const send = async (content: InboundContent) => {
    const msg: InboundMessage = {
      eventId: `e${++eventId}`,
      sender: SENDER,
      content,
      send: async (r) => void sent.push(r),
    };
    await router.route(msg);
  };

  const text = (t: string) => send({ type: "text", text: t });
  const photo = () =>
    send({ type: "attachment", mimeType: "image/jpeg", read: async () => new Uint8Array([1, 2, 3]) });

  const texts = () => sent.filter((r): r is { type: "text"; text: string } => r.type === "text").map((r) => r.text);
  const session = () => store.get(SENDER)!;

  it("runs photo → question → plan → tidy → verdict, and ends complete", async () => {
    // 1. Before photo.
    detectPhoto.mockResolvedValueOnce(detection(BEFORE_ITEMS));
    await photo();

    expect(texts()[0]).toBe("Got it — looking at your photo…");
    expect(texts().at(-1)).toMatch(/which of these do you use every day/i);
    expect(sent.some((r) => r.type === "image")).toBe(true);
    expect(session().phase).toBe("interview");

    // 2. The one question. Gemini places everything; the phone is daily.
    json.mockResolvedValueOnce({
      value: {
        placements: [
          { itemId: 1, zoneId: "A", reason: "stored out of the way" },
          { itemId: 2, zoneId: "A", reason: "stays with the charger" },
          { itemId: 3, zoneId: "B", reason: "keeps pens together" },
          { itemId: 4, zoneId: "toss", reason: "loose paper is clutter" },
          { itemId: 5, zoneId: "desk", reason: "you use it every day" },
        ],
      },
      ms: 2600,
    });
    sent = [];
    await text("5");

    expect(texts()[0]).toBe("Working out where everything goes…");
    const plan = texts()[1]!;
    expect(plan).toContain("A storage bin — 1 charger, 2 cable (stored out of the way)");
    expect(plan).toContain("B pen cup — 3 pen (keeps pens together)");
    expect(plan).toContain("Toss — 4 paper (loose paper is clutter)");
    expect(plan).toContain("Stays where it is — 5 phone (you use it every day)");
    expect(session().phase).toBe("planned");

    // 3. Step-by-step guidance mid-run.
    sent = [];
    await text("next");
    expect(texts()[0]).toBe("Step 1 of 4: Put the charger (1) in A storage bin.");
    await text("done");
    expect(texts().at(-1)).toContain("Nice — 1 of 4 done.");

    // 4. After photo: charger and cable in the bin, pen in the cup, paper gone, phone left out.
    detectPhoto.mockResolvedValueOnce(
      detection([
        item(1, "charger", [20, 300, 80, 380]), // inside the bin
        item(2, "cable", [60, 310, 140, 400]), // inside the bin
        item(3, "pen", [60, 50, 110, 110]), // inside the pen cup
        item(5, "phone", [620, 300, 700, 400]), // still on the desk, as planned
      ]),
    );
    sent = [];
    await photo();

    const summary = texts().at(-1)!;
    expect(summary).toContain("Put away: charger, cable, pen.");
    expect(summary).toContain("Tossed: paper.");
    expect(summary).toContain("On the desk as planned: phone.");
    expect(summary).toContain("Desk clear! Nice work.");
    expect(sent.some((r) => r.type === "image")).toBe(true);
    expect(session().phase).toBe("complete");
  });

  it("reports what's still out and stays in planned until it isn't", async () => {
    detectPhoto.mockResolvedValueOnce(detection(BEFORE_ITEMS));
    await photo();

    json.mockRejectedValueOnce(new Error("503 UNAVAILABLE")); // falls back to the rules
    await text("skip");
    expect(session().phase).toBe("planned");

    // The mug-less tidy-up: charger still sitting on the desk.
    detectPhoto.mockResolvedValueOnce(detection([item(1, "charger", [150, 120, 210, 200])]));
    sent = [];
    await photo();

    const summary = texts().at(-1)!;
    expect(summary).toContain("Still out: charger (1).");
    expect(summary).toContain("I can't see inside closed bins");
    expect(session().phase).toBe("planned");
  });

  it("survives a judge poking at it mid-run without losing the session", async () => {
    detectPhoto.mockResolvedValueOnce(detection(BEFORE_ITEMS));
    await photo();
    json.mockResolvedValueOnce({ value: { placements: [] }, ms: 1 });
    await text("5");

    const before = session().id;
    sent = [];

    await text("help");
    await text("status");
    await text("where does the pen go?");
    await text("ping");

    expect(texts()).toHaveLength(4);
    expect(texts()[0]).toMatch(/I'm ClutterBot/);
    expect(texts()[3]).toBe("pong");
    expect(session().id).toBe(before);
    expect(session().phase).toBe("planned");
  });

  it("asks for a retake on a bad photo without spending a detection call", async () => {
    assessQuality.mockResolvedValue({ brightness: 0.04, sharpness: 3, problem: "dark" });

    await photo();

    expect(texts().at(-1)).toMatch(/too dark/i);
    expect(detectPhoto).not.toHaveBeenCalled();
    expect(session().phase).toBe("awaiting_photo");
  });

  it("never replies twice to a redelivered message", async () => {
    detectPhoto.mockResolvedValueOnce(detection(BEFORE_ITEMS));
    const duplicate: InboundMessage = {
      eventId: "same-event",
      sender: SENDER,
      content: { type: "text", text: "ping" },
      send: async (r) => void sent.push(r),
    };

    await router.route(duplicate);
    await router.route(duplicate);

    expect(sent).toEqual([{ type: "text", text: "pong" }]);
  });

  it("starts over cleanly and runs again", async () => {
    detectPhoto.mockResolvedValueOnce(detection(BEFORE_ITEMS));
    await photo();
    const first = session().id;

    await text("start over");
    expect(session().phase).toBe("awaiting_photo");
    expect(session().id).not.toBe(first);
    expect(session().items).toEqual([]);

    detectPhoto.mockResolvedValueOnce(detection(BEFORE_ITEMS));
    sent = [];
    await photo();
    expect(session().phase).toBe("interview");
    expect(session().items).toHaveLength(5);
  });
});
