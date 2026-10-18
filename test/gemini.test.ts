import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

const generateContent = vi.fn();

vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    models = { generateContent };
  },
}));

const { json } = await import("../src/llm/gemini.js");

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
    expect(console.log).toHaveBeenCalledWith(expect.stringMatching(/^\[latency\] gemini\.json \d+ms$/));
    expect(JSON.stringify(vi.mocked(console.log).mock.calls)).not.toContain("test-secret-key");
  });

  it("throws with zod issues when validation fails", async () => {
    generateContent.mockResolvedValue({ text: '{"name":42}' });

    await expect(json("prompt", schema, validator)).rejects.toThrow(/failed validation.*name/);
  });

  it("throws on timeout", async () => {
    generateContent.mockReturnValue(new Promise(() => {}));

    await expect(json("prompt", schema, validator, { timeoutMs: 20 })).rejects.toThrow(/timed out after 20ms/);
  });
});
