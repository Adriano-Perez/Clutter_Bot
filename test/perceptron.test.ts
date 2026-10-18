import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { detect, PerceptronError } from "../src/vision/perceptron.js";

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
