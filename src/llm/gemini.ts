import { GoogleGenAI } from "@google/genai";
import { z } from "zod";

const DEFAULT_MODEL = "gemini-3.8-flash";
// gemini-3.8-flash answers 503 UNAVAILABLE ("high demand") often enough to lose a live demo, so
// json() walks this list before giving up and letting the caller fall back to plain code.
const DEFAULT_FALLBACK_MODELS = "gemini-3-flash-preview,gemini-flash-latest";
const DEFAULT_TIMEOUT_MS = 10_000;
// Don't start another model with less time left than a healthy call needs (~2-5s observed).
const MIN_ATTEMPT_MS = 2_000;

let client: GoogleGenAI | undefined;

export function getClient(): GoogleGenAI {
  if (!client) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY is not set; add it to .env");
    client = new GoogleGenAI({ apiKey });
  }
  return client;
}

/** The configured model first, then the fallbacks, de-duplicated. */
export function textModels(): string[] {
  const primary = process.env.GEMINI_TEXT_MODEL || DEFAULT_MODEL;
  const fallbacks = (process.env.GEMINI_TEXT_FALLBACK_MODELS ?? DEFAULT_FALLBACK_MODELS)
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);
  return [...new Set([primary, ...fallbacks])];
}

export interface JsonOptions {
  /** Total budget across every model attempt, not per attempt. Default 10_000. */
  timeoutMs?: number;
  /** Overrides the configured model list. */
  models?: string[];
}

async function attempt<T>(
  model: string,
  prompt: string,
  jsonSchema: object,
  validator: z.ZodType<T>,
  timeoutMs: number,
): Promise<{ value: T; ms: number }> {
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
        model,
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
    console.log(`[latency] gemini.json ${ms}ms (${model})`);
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

/**
 * One schema-constrained JSON answer from Gemini, validated with zod.
 *
 * Tries each configured model in turn within a single time budget: an overloaded model, a missing
 * one, or a reply that fails validation all move on to the next. Throws the last error once the
 * list or the budget is exhausted, which is the caller's signal to use its own fallback.
 */
export async function json<T>(
  prompt: string,
  jsonSchema: object, // passed to responseJsonSchema
  validator: z.ZodType<T>, // zod check on the result
  opts: JsonOptions = {},
): Promise<{ value: T; ms: number }> {
  const models = opts.models ?? textModels();
  const deadline = performance.now() + (opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  let lastError: unknown;

  for (const [i, model] of models.entries()) {
    const remaining = Math.round(deadline - performance.now());
    // The first model always gets its go, however small the budget; later ones only if it's worth it.
    if (i > 0 && remaining < MIN_ATTEMPT_MS) {
      console.error(`gemini.json: ${remaining}ms left, not starting ${model}`);
      break;
    }

    try {
      return await attempt(model, prompt, jsonSchema, validator, remaining);
    } catch (err) {
      lastError = err;
      const next = models[i + 1];
      console.error(
        `gemini.json: ${model} failed (${(err as Error).message.slice(0, 120)})` +
          (next ? `; trying ${next}` : "; no models left"),
      );
    }
  }

  throw lastError instanceof Error ? lastError : new Error(`gemini.json failed: ${String(lastError)}`);
}
