import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DetectPhotoResult } from "../src/pipeline/detectPhoto.js";
import type { InboundMessage, Reply } from "../src/router.js";
import type { Session } from "../src/types.js";

const detectPhoto = vi.fn<(input: Buffer | Uint8Array) => Promise<DetectPhotoResult>>();
vi.mock("../src/pipeline/detectPhoto.js", () => ({ detectPhoto }));

// savePhoto writes into a temp dir instead of data/media; mask stays real.
let mediaDir: string;
const JPEG_BYTES = Buffer.from("converted-jpeg-bytes");
vi.mock("../src/photon/media.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/photon/media.js")>();
  return {
    ...actual,
    savePhoto: vi.fn(async () => {
      const file = path.join(mediaDir, "1700000000000.jpg");
      await writeFile(file, JPEG_BYTES); // what HEIC conversion would have produced
      return file;
    }),
  };
});

const { awaitingPhoto } = await import("../src/handlers/awaitingPhoto.js");

function newSession(): Session {
  return {
    id: "abc12345",
    userHandle: "+12065550142",
    phase: "awaiting_photo",
    afterPhotos: [],
    items: [],
    zones: [],
    interview: [],
    steps: [],
    createdAt: "2026-10-17T00:00:00.000Z",
    updatedAt: "2026-10-17T00:00:00.000Z",
  };
}

function photoMessage(): InboundMessage {
  return {
    eventId: "evt-1",
    sender: "+12065550142",
    content: { type: "attachment", mimeType: "image/heic", read: async () => new Uint8Array([1, 2, 3]) },
    send: async (_r: Reply) => {},
  };
}

function detection(overrides: Partial<DetectPhotoResult> = {}): DetectPhotoResult {
  return {
    overlayPng: Buffer.from("png-bytes"),
    items: [
      { id: 1, label: "charger", box: [0, 0, 10, 10], evidence: [{ state: "seen", source: "photo", at: "now" }] },
      { id: 2, label: "pen", box: [20, 0, 30, 10], evidence: [{ state: "seen", source: "photo", at: "now" }] },
    ],
    zones: [{ id: "A", label: "storage bin", polygon: [[0, 0], [50, 0], [50, 50], [0, 50]], box: [0, 0, 50, 50] }],
    legend: "I see 2 things: 1 charger, 2 pen\nStorage spots: A storage bin",
    ms: 100,
    debug: {} as DetectPhotoResult["debug"],
    ...overrides,
  };
}

describe("awaitingPhoto", () => {
  beforeEach(async () => {
    mediaDir = await mkdtemp(path.join(tmpdir(), "clutterbot-media-"));
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(async () => {
    detectPhoto.mockReset();
    vi.restoreAllMocks();
    await rm(mediaDir, { recursive: true, force: true });
  });

  it("sends the overlay, legend and usage question and moves to interview", async () => {
    const result = detection();
    detectPhoto.mockResolvedValue(result);
    const session = newSession();

    const replies = await awaitingPhoto(session, photoMessage());

    const overlayPath = path.join(mediaDir, "1700000000000.overlay.png");
    expect(replies).toEqual([
      { type: "image", path: overlayPath },
      { type: "text", text: result.legend },
      { type: "text", text: "Which of these do you use every day? Reply with numbers, e.g. 2 5" },
    ]);
    expect(await readFile(overlayPath)).toEqual(result.overlayPng);
    expect(detectPhoto).toHaveBeenCalledWith(JPEG_BYTES, { dropInsideZones: true });

    expect(session.phase).toBe("interview");
    expect(session.items).toBe(result.items);
    expect(session.zones).toBe(result.zones);
    expect(session.beforePhoto).toBe(path.join(mediaDir, "1700000000000.jpg"));
  });

  it("asks for a retake and stays in awaiting_photo when no items are found", async () => {
    const legend = "I couldn't make out any items. Try again with more light, from directly above.";
    detectPhoto.mockResolvedValue(detection({ items: [], zones: [], legend }));
    const session = newSession();

    const replies = await awaitingPhoto(session, photoMessage());

    expect(replies).toEqual([{ type: "text", text: legend }]);
    expect(session.phase).toBe("awaiting_photo");
    expect(session.items).toEqual([]);
  });

  it("apologizes, logs a masked sender and stays in awaiting_photo when detection throws", async () => {
    detectPhoto.mockRejectedValue(new Error("Perceptron detect timed out after 20s"));
    const session = newSession();

    const replies = await awaitingPhoto(session, photoMessage());

    expect(replies).toEqual([{ type: "text", text: "Sorry, I couldn't read that photo. Try sending it again." }]);
    expect(session.phase).toBe("awaiting_photo");
    expect(session.items).toEqual([]);
    await expect(stat(path.join(mediaDir, "1700000000000.overlay.png"))).rejects.toThrow();

    const logged = vi.mocked(console.log).mock.calls.flat().join("\n");
    expect(logged).toContain("***0142");
    expect(logged).not.toContain("2065550142");
  });
});
