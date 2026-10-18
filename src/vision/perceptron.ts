import { z } from "zod";

const DETECT_URL = "https://api.perceptron.inc/v1/detect";
const TIMEOUT_MS = 20_000;

const pointSchema = z.object({ x: z.number(), y: z.number() });

const detectionSchema = z.object({
  mention: z.string(),
  point: pointSchema.nullable(),
  point_box: z.object({ top_left: pointSchema, bottom_right: pointSchema }).nullable(),
});

const detectResponseSchema = z.object({
  detections: z.array(detectionSchema),
  finish_reason: z.enum(["complete", "max_tokens"]),
});

const errorResponseSchema = z.object({
  error: z.object({
    message: z.string(),
    code: z.string().nullish(),
    type: z.string().nullish(),
    param: z.string().nullish(),
  }),
});

// Coordinates are pixels in the submitted (normalized) image.
export type Detection = z.infer<typeof detectionSchema>;

export interface DetectOptions {
  categories?: string[];
  reasoningEffort?: "none" | "low";
}

export interface DetectResult {
  detections: Detection[];
  finishReason: "complete" | "max_tokens";
  ms: number;
}

export class PerceptronError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = "PerceptronError";
  }
}

export async function detect(imageDataUrl: string, options: DetectOptions = {}): Promise<DetectResult> {
  const apiKey = process.env.PERCEPTRON_API_KEY;
  if (!apiKey) {
    throw new PerceptronError("PERCEPTRON_API_KEY is not set; add it to .env");
  }

  const { categories, reasoningEffort = "none" } = options;
  const badCategory = categories?.find((c) => c.includes(","));
  if (badCategory !== undefined) {
    throw new PerceptronError(`Perceptron categories cannot contain commas: "${badCategory}"`);
  }

  const body = {
    media: { type: "image", image_url: imageDataUrl },
    ...(categories && categories.length > 0 ? { categories } : {}),
    config: { output: "box", reasoning_effort: reasoningEffort },
  };

  const start = performance.now();
  let res: Response;
  try {
    res = await fetch(DETECT_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    const ms = Math.round(performance.now() - start);
    console.log(`[latency] perceptron.detect ${ms}ms (failed)`);
    if (err instanceof DOMException && err.name === "TimeoutError") {
      throw new PerceptronError(`Perceptron detect timed out after ${TIMEOUT_MS / 1000}s`);
    }
    throw new PerceptronError(`Perceptron detect request failed: ${(err as Error).message}`);
  }

  const json: unknown = await res.json().catch(() => undefined);
  const ms = Math.round(performance.now() - start);
  console.log(`[latency] perceptron.detect ${ms}ms`);

  if (!res.ok) {
    const parsed = errorResponseSchema.safeParse(json);
    const detail = parsed.success ? parsed.data.error.message : res.statusText;
    const code = parsed.success ? (parsed.data.error.code ?? undefined) : undefined;
    throw new PerceptronError(`Perceptron detect failed (${res.status}): ${detail}`, res.status, code);
  }

  const parsed = detectResponseSchema.safeParse(json);
  if (!parsed.success) {
    throw new PerceptronError(`Perceptron detect returned an unexpected response: ${parsed.error.message}`);
  }

  return { detections: parsed.data.detections, finishReason: parsed.data.finish_reason, ms };
}
