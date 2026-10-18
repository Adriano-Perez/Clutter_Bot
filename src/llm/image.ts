import { getClient } from "./gemini.js";

// Nano Banana 2.1. Overridable with GEMINI_IMAGE_MODEL.
const DEFAULT_MODEL = "gemini-nano-banana-2.1";
const DEFAULT_TIMEOUT_MS = 60_000;

export class ImageEditError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImageEditError";
  }
}

export interface EditedImage {
  png: Buffer;
  ms: number;
}

/**
 * One image-to-image edit: the photo plus an instruction, back as image bytes.
 *
 * The prompt is built from our own label vocabulary, never from the user's text, so there is no
 * path from an inbound message into this model (see sanitizeReply for the text model's equivalent).
 */
export async function editImage(
  photo: Buffer,
  prompt: string,
  { timeoutMs = DEFAULT_TIMEOUT_MS, mimeType = "image/jpeg" }: { timeoutMs?: number; mimeType?: string } = {},
): Promise<EditedImage> {
  const ai = getClient();
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  // Race as well as abort, so the timeout holds even if the SDK ignores the signal.
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new ImageEditError(`gemini.editImage timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  const start = performance.now();
  let ms = 0;
  let parts: { inlineData?: { data?: string } | undefined; text?: string | undefined }[] = [];
  try {
    const res = await Promise.race([
      ai.models.generateContent({
        model: process.env.GEMINI_IMAGE_MODEL || DEFAULT_MODEL,
        contents: [
          {
            role: "user",
            parts: [{ inlineData: { mimeType, data: photo.toString("base64") } }, { text: prompt }],
          },
        ],
        config: { abortSignal: controller.signal },
      }),
      timeout,
    ]);
    parts = res.candidates?.[0]?.content?.parts ?? [];
  } finally {
    clearTimeout(timer);
    ms = Math.round(performance.now() - start);
    console.log(`[latency] gemini.editImage ${ms}ms`);
  }

  const data = parts.find((p) => p.inlineData?.data)?.inlineData?.data;
  if (!data) {
    // A refusal or safety block comes back as text instead of an image.
    const said = parts.map((p) => p.text).filter(Boolean).join(" ").slice(0, 200);
    throw new ImageEditError(`gemini.editImage returned no image${said ? `: ${said}` : ""}`);
  }
  return { png: Buffer.from(data, "base64"), ms };
}
