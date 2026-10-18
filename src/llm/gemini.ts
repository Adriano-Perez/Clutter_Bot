import { GoogleGenAI } from "@google/genai";
import { z } from "zod";

const DEFAULT_MODEL = "gemini-3.8-flash";
const DEFAULT_TIMEOUT_MS = 10_000;

let client: GoogleGenAI | undefined;

function getClient(): GoogleGenAI {
  if (!client) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY is not set; add it to .env");
    client = new GoogleGenAI({ apiKey });
  }
  return client;
}

export async function json<T>(
  prompt: string,
  jsonSchema: object, // passed to responseJsonSchema
  validator: z.ZodType<T>, // zod check on the result
  opts?: { timeoutMs?: number }, // default 10_000
): Promise<{ value: T; ms: number }> {
  const timeoutMs = opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const ai = getClient();
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  // Race as well as abort, so the timeout holds even if the SDK ignores the signal.
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error(`gemini.json timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  const start = performance.now();
  let text: string | undefined;
  let ms = 0;
  try {
    const res = await Promise.race([
      ai.models.generateContent({
        model: process.env.GEMINI_TEXT_MODEL || DEFAULT_MODEL,
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseJsonSchema: jsonSchema,
          abortSignal: controller.signal,
        },
      }),
      timeout,
    ]);
    text = res.text;
  } finally {
    clearTimeout(timer);
    ms = Math.round(performance.now() - start);
    console.log(`[latency] gemini.json ${ms}ms`);
  }

  let raw: unknown;
  try {
    raw = JSON.parse(text ?? "");
  } catch {
    throw new Error(`gemini.json returned non-JSON text: ${(text ?? "<empty>").slice(0, 200)}`);
  }
  const parsed = validator.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`gemini.json response failed validation: ${JSON.stringify(parsed.error.issues)}`);
  }
  return { value: parsed.data, ms };
}
