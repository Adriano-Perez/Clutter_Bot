import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

const generateContent = vi.fn();

vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    models = { generateContent };
  },
}));

const { json, textModels } = await import("../src/llm/gemini.js");

const schema = { type: "object", properties: { name: { type: "string" } }, required: ["name"] };
const validator = z.object({ name: z.string() });

describe("gemini.json", () => {
  beforeEach(() => {
    vi.stubEnv("GEMINI_API_KEY", "test-secret-key");
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    generateContent.mockReset();
  });

  it("returns the validated value and elapsed ms", async () => {
    generateContent.mockResolvedValue({ text: '{"name":"mug"}' });

    const result = await json("prompt", schema, validator);

    expect(result.value).toEqual({ name: "mug" });
    expect(typeof result.ms).toBe("number");
    const req = generateContent.mock.calls[0][0];
    expect(req.model).toBe("gemini-3.8-flash");
    expect(req.config.responseMimeType).toBe("application/json");
    expect(req.config.responseJsonSchema).toBe(schema);
    expect(console.log).toHaveBeenCalledWith(
      expect.stringMatching(/^\[latency\] gemini\.json \d+ms \(gemini-3\.8-flash\)$/),
    );
    expect(JSON.stringify(vi.mocked(console.log).mock.calls)).not.toContain("test-secret-key");
  });

  it("throws with zod issues when validation fails", async () => {
    generateContent.mockResolvedValue({ text: '{"name":42}' });

    await expect(json("prompt", schema, validator, { models: ["only-one"] })).rejects.toThrow(
      /failed validation.*name/,
    );
  });

  it("throws on timeout", async () => {
    generateContent.mockReturnValue(new Promise(() => {}));

    await expect(json("prompt", schema, validator, { timeoutMs: 20 })).rejects.toThrow(/timed out after 20ms/);
  });
});

describe("gemini.json model fallback", () => {
  beforeEach(() => {
    vi.stubEnv("GEMINI_API_KEY", "test-secret-key");
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    generateContent.mockReset();
  });

  const unavailable = () => Object.assign(new Error('{"error":{"code":503,"status":"UNAVAILABLE"}}'), { status: 503 });

  it("moves to the next model when one is overloaded", async () => {
    generateContent.mockRejectedValueOnce(unavailable()).mockResolvedValueOnce({ text: '{"name":"mug"}' });

    const result = await json("prompt", schema, validator, { models: ["flaky", "steady"] });

    expect(result.value).toEqual({ name: "mug" });
    expect(generateContent.mock.calls.map((c) => c[0].model)).toEqual(["flaky", "steady"]);
  });

  it("moves on when a model returns something that fails validation", async () => {
    generateContent.mockResolvedValueOnce({ text: "not json at all" }).mockResolvedValueOnce({ text: '{"name":"pen"}' });

    const result = await json("prompt", schema, validator, { models: ["chatty", "steady"] });

    expect(result.value).toEqual({ name: "pen" });
  });

  it("throws the last error once every model has failed", async () => {
    generateContent.mockRejectedValue(unavailable());

    await expect(json("prompt", schema, validator, { models: ["a", "b"] })).rejects.toThrow(/503/);
    expect(generateContent).toHaveBeenCalledTimes(2);
  });

  it("shares one time budget rather than one timeout per model", async () => {
    generateContent.mockReturnValue(new Promise(() => {}));

    // The first model burns the whole 30ms budget, so the second is never started.
    await expect(json("prompt", schema, validator, { models: ["a", "b"], timeoutMs: 30 })).rejects.toThrow(
      /timed out after 30ms/,
    );
    expect(generateContent).toHaveBeenCalledTimes(1);
  });

  it("puts the configured model first and keeps the fallbacks after it", () => {
    vi.stubEnv("GEMINI_TEXT_MODEL", "gemini-3.8-flash");
    vi.stubEnv("GEMINI_TEXT_FALLBACK_MODELS", "backup-one, backup-two ,");
    expect(textModels()).toEqual(["gemini-3.8-flash", "backup-one", "backup-two"]);
  });

  it("never lists the same model twice", () => {
    vi.stubEnv("GEMINI_TEXT_MODEL", "same");
    vi.stubEnv("GEMINI_TEXT_FALLBACK_MODELS", "same,other");
    expect(textModels()).toEqual(["same", "other"]);
  });
});
