import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { annotate, detect, gridToPixels, parseAnnotations, PerceptronError } from "../src/vision/perceptron.js";

const IMAGE = "data:image/jpeg;base64,AAAA";
const KEY = "test-secret-key";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("detect", () => {
  let log: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.stubEnv("PERCEPTRON_API_KEY", KEY);
    log = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("sends the request and returns validated detections", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse(200, {
        detections: [
          {
            mention: "mug",
            point: null,
            point_box: { top_left: { x: 10, y: 20 }, bottom_right: { x: 110, y: 140 } },
          },
        ],
        finish_reason: "complete",
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await detect(IMAGE, { categories: ["mug", "pen"] });

    expect(result.finishReason).toBe("complete");
    expect(result.detections).toHaveLength(1);
    expect(result.detections[0]?.point_box?.bottom_right).toEqual({ x: 110, y: 140 });
    expect(result.ms).toBeGreaterThanOrEqual(0);

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.perceptron.inc/v1/detect");
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${KEY}`);
    expect(JSON.parse(init.body as string)).toEqual({
      media: { type: "image", image_url: IMAGE },
      categories: ["mug", "pen"],
      config: { output: "box", reasoning_effort: "none" },
    });

    const logged = log.mock.calls.flat().join("\n");
    expect(logged).toMatch(/\[latency\] perceptron\.detect \d+ms/);
    expect(logged).not.toContain(KEY);
  });

  it("accepts detections that omit the point key", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse(200, {
          detections: [
            { mention: "pen", point_box: { top_left: { x: 5, y: 6 }, bottom_right: { x: 50, y: 60 } } },
          ],
          finish_reason: "complete",
        }),
      ),
    );

    const result = await detect(IMAGE);

    expect(result.detections).toHaveLength(1);
    expect(result.detections[0]?.point).toBeUndefined();
    expect(result.detections[0]?.point_box?.top_left).toEqual({ x: 5, y: 6 });
  });

  it("puts the raw body on the error when validation fails", async () => {
    const body = { detections: [{ mention: 42 }], finish_reason: "complete" };
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(200, body)));

    const err = await detect(IMAGE).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(PerceptronError);
    expect((err as PerceptronError).raw).toEqual(body);
  });

  it("throws a PerceptronError with status and code on 401", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse(401, {
          error: { message: "Invalid API key", code: "invalid_api_key", type: "auth_error", param: null },
        }),
      ),
    );

    const err = await detect(IMAGE).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(PerceptronError);
    expect(err).toMatchObject({ status: 401, code: "invalid_api_key" });
    expect((err as Error).message).toContain("Invalid API key");
    expect((err as Error).message).not.toContain(KEY);
  });
});

describe("annotate", () => {
  beforeEach(() => {
    vi.stubEnv("PERCEPTRON_API_KEY", KEY);
    vi.stubEnv("PERCEPTRON_MODEL", "perceptron-mk1.5");
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("sends a chat completion with polygon annotations and parses the answer", async () => {
    const content = 'Here: <polygon mention="left bin" asset_idx="0"> (20,40) (60,40) (60,80) (20,80) </polygon>';
    const fetchMock = vi.fn(async () => jsonResponse(200, { choices: [{ message: { role: "assistant", content } }] }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await annotate(IMAGE, "Outline the bins");

    expect(result.text).toBe(content);
    expect(result.annotations).toEqual([
      { kind: "polygon", mention: "left bin", points: [{ x: 20, y: 40 }, { x: 60, y: 40 }, { x: 60, y: 80 }, { x: 20, y: 80 }] },
    ]);

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.perceptron.inc/v1/chat/completions");
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${KEY}`);
    expect(JSON.parse(init.body as string)).toEqual({
      model: "perceptron-mk1.5",
      messages: [
        {
          role: "user",
          content: [
            { type: "image_url", image_url: { url: IMAGE } },
            { type: "text", text: "Outline the bins" },
          ],
        },
      ],
      vision_config: { annotation_format: "polygon" },
      reasoning_effort: "none",
      max_completion_tokens: 2048,
    });
  });
});

describe("parseAnnotations", () => {
  it("pulls polygon, point_box and point tags out of prose", () => {
    const text = [
      "I can see a few storage spots.",
      '<polygon mention="left bin" asset_idx="0"> (20,40) (60,40) (60,80) (20,80) </polygon>',
      'There is also <point_box mention="pen cup" asset_idx="0"> (100,120) (180,260) </point_box> on the right,',
      'and the desk <point mention="open desk area"> (500.5,700) </point>.',
    ].join("\n");

    expect(parseAnnotations(text)).toEqual([
      {
        kind: "polygon",
        mention: "left bin",
        points: [
          { x: 20, y: 40 },
          { x: 60, y: 40 },
          { x: 60, y: 80 },
          { x: 20, y: 80 },
        ],
      },
      {
        kind: "point_box",
        mention: "pen cup",
        points: [
          { x: 100, y: 120 },
          { x: 180, y: 260 },
        ],
      },
      { kind: "point", mention: "open desk area", points: [{ x: 500.5, y: 700 }] },
    ]);
  });

  it("skips tags without coordinates and returns [] for plain prose", () => {
    expect(parseAnnotations('<polygon mention="shelf"> </polygon>')).toEqual([]);
    expect(parseAnnotations("No storage visible.")).toEqual([]);
  });
});

describe("gridToPixels", () => {
  it("scales the 0-1000 grid to image pixels", () => {
    expect(gridToPixels({ x: 500, y: 500 }, 1024, 683)).toEqual({ x: 512, y: 341.5 });
    expect(gridToPixels({ x: 0, y: 1000 }, 1024, 683)).toEqual({ x: 0, y: 683 });
  });
});
