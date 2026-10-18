import { z } from "zod";

const DETECT_URL = "https://api.perceptron.inc/v1/detect";
const CHAT_URL = "https://api.perceptron.inc/v1/chat/completions";
const DEFAULT_MODEL = "perceptron-mk1.5";
const MAX_COMPLETION_TOKENS = 2048;
const GRID = 1000; // chat-completions annotations use a 0-1000 grid
// A whole room takes far longer than a desk: latency tracks the number of objects found, not the
// number of categories asked for. A busy room measured 24.5s with only 8 categories, so 20s was
// timing out on exactly the photo the demo is built around.
const DEFAULT_TIMEOUT_MS = 45_000;

const pointSchema = z.object({ x: z.number(), y: z.number() });

const detectionSchema = z.object({
  mention: z.string(),
  // The API omits whichever of these the requested output format doesn't produce.
  point: pointSchema.nullish(),
  point_box: z.object({ top_left: pointSchema, bottom_right: pointSchema }).nullish(),
});

const detectResponseSchema = z.object({
  detections: z.array(detectionSchema),
  finish_reason: z.enum(["complete", "max_tokens"]),
});

const chatResponseSchema = z.object({
  choices: z.array(z.object({ message: z.object({ content: z.string().nullish() }) })).min(1),
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
  timeoutMs?: number;
}

export interface DetectResult {
  detections: Detection[];
  finishReason: "complete" | "max_tokens";
  ms: number;
}

export type AnnotationFormat = "polygon" | "box" | "point";

export interface AnnotateOptions {
  format?: AnnotationFormat;
  reasoningEffort?: "none" | "low";
  timeoutMs?: number;
}

export interface GridPoint {
  x: number;
  y: number;
}

// Coordinates are on the 0-1000 grid; convert with gridToPixels.
export interface Annotation {
  kind: "polygon" | "point_box" | "point";
  mention?: string;
  points: GridPoint[];
}

export interface AnnotateResult {
  text: string;
  annotations: Annotation[];
  ms: number;
}

export class PerceptronError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly code?: string,
    readonly raw?: unknown, // response body, set when it failed validation
  ) {
    super(message);
    this.name = "PerceptronError";
  }
}

// Shared POST: auth, timeout, latency log and HTTP error handling. Returns the parsed JSON body.
async function post(
  op: string,
  url: string,
  body: unknown,
  timeoutMs: number,
): Promise<{ json: unknown; status: number; ms: number }> {
  const apiKey = process.env.PERCEPTRON_API_KEY;
  if (!apiKey) {
    throw new PerceptronError("PERCEPTRON_API_KEY is not set; add it to .env");
  }

  const start = performance.now();
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    const ms = Math.round(performance.now() - start);
    console.log(`[latency] perceptron.${op} ${ms}ms (failed)`);
    if (err instanceof DOMException && err.name === "TimeoutError") {
      throw new PerceptronError(`Perceptron ${op} timed out after ${timeoutMs / 1000}s`);
    }
    throw new PerceptronError(`Perceptron ${op} request failed: ${(err as Error).message}`);
  }

  const json: unknown = await res.json().catch(() => undefined);
  const ms = Math.round(performance.now() - start);
  console.log(`[latency] perceptron.${op} ${ms}ms`);

  if (!res.ok) {
    const parsed = errorResponseSchema.safeParse(json);
    const detail = parsed.success ? parsed.data.error.message : res.statusText;
    const code = parsed.success ? (parsed.data.error.code ?? undefined) : undefined;
    throw new PerceptronError(`Perceptron ${op} failed (${res.status}): ${detail}`, res.status, code);
  }

  return { json, status: res.status, ms };
}

export async function detect(imageDataUrl: string, options: DetectOptions = {}): Promise<DetectResult> {
  const { categories, reasoningEffort = "none", timeoutMs = DEFAULT_TIMEOUT_MS } = options;
  const badCategory = categories?.find((c) => c.includes(","));
  if (badCategory !== undefined) {
    throw new PerceptronError(`Perceptron categories cannot contain commas: "${badCategory}"`);
  }

  const body = {
    media: { type: "image", image_url: imageDataUrl },
    ...(categories && categories.length > 0 ? { categories } : {}),
    config: { output: "box", reasoning_effort: reasoningEffort },
  };

  const { json, status, ms } = await post("detect", DETECT_URL, body, timeoutMs);

  const parsed = detectResponseSchema.safeParse(json);
  if (!parsed.success) {
    throw new PerceptronError(
      `Perceptron detect returned an unexpected response: ${parsed.error.message}`,
      status,
      undefined,
      json,
    );
  }

  return { detections: parsed.data.detections, finishReason: parsed.data.finish_reason, ms };
}

// FR-DET-03: free-form prompt with grounded annotations (polygons for storage zones).
export async function annotate(
  imageDataUrl: string,
  prompt: string,
  options: AnnotateOptions = {},
): Promise<AnnotateResult> {
  const { format = "polygon", reasoningEffort = "none", timeoutMs = DEFAULT_TIMEOUT_MS } = options;

  const body = {
    model: process.env.PERCEPTRON_MODEL || DEFAULT_MODEL,
    messages: [
      {
        role: "user",
        content: [
          { type: "image_url", image_url: { url: imageDataUrl } },
          { type: "text", text: prompt },
        ],
      },
    ],
    vision_config: { annotation_format: format },
    reasoning_effort: reasoningEffort,
    max_completion_tokens: MAX_COMPLETION_TOKENS,
  };

  const { json, status, ms } = await post("annotate", CHAT_URL, body, timeoutMs);

  const parsed = chatResponseSchema.safeParse(json);
  if (!parsed.success) {
    throw new PerceptronError(
      `Perceptron annotate returned an unexpected response: ${parsed.error.message}`,
      status,
      undefined,
      json,
    );
  }

  const text = parsed.data.choices[0]?.message.content ?? "";
  return { text, annotations: parseAnnotations(text), ms };
}

const TAG_RE = /<(polygon|point_box|point)\b([^>]*)>([\s\S]*?)<\/\1>/g;
const MENTION_RE = /\bmention\s*=\s*"([^"]*)"/;
const COORD_RE = /\(\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\)/g;

// Pulls <polygon>, <point_box> and <point> tags out of model prose. Tags without coordinates are skipped.
export function parseAnnotations(text: string): Annotation[] {
  const annotations: Annotation[] = [];
  for (const [, kind, attrs, inner] of text.matchAll(TAG_RE)) {
    const points = [...inner!.matchAll(COORD_RE)].map(([, x, y]) => ({ x: Number(x), y: Number(y) }));
    if (points.length === 0) continue;
    const mention = MENTION_RE.exec(attrs!)?.[1];
    annotations.push({
      kind: kind as Annotation["kind"],
      ...(mention !== undefined ? { mention } : {}),
      points,
    });
  }
  return annotations;
}

export function gridToPixels(point: GridPoint, width: number, height: number): { x: number; y: number } {
  return { x: (point.x * width) / GRID, y: (point.y * height) / GRID };
}
