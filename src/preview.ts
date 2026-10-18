import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { editImage } from "./llm/image.js";
import { PREVIEW_CAPTION, previewPrompt, type PlanGroup, type ZoneRef } from "./plan.js";
import type { InboundMessage } from "./router.js";
import { normalizePhoto } from "./vision/normalize.js";

// Long enough for an image edit, short enough that it can't land after the user's next photo.
const TIMEOUT_MS = 25_000;
const PREVIEW_MAX_SIDE = 768;

/** PREVIEW=off turns the preview off; anything else leaves it on. */
export function previewEnabled(): boolean {
  return (process.env.PREVIEW ?? "on").toLowerCase() !== "off";
}

/**
 * Sends "roughly how your desk could look" as an illustration, after the plan.
 *
 * Deliberately best-effort: it runs after the plan has already been sent, and any failure (no
 * image quota on the key, a safety refusal, a timeout) is logged and dropped rather than shown.
 * The plan is the product; this is a bonus, and it must never be able to break the loop.
 */
export async function sendPreview(
  beforePhoto: string | undefined,
  groups: readonly PlanGroup[],
  zones: readonly ZoneRef[],
  send: InboundMessage["send"],
): Promise<boolean> {
  if (!previewEnabled() || !beforePhoto || groups.length === 0) return false;

  try {
    const photo = await normalizePhoto(await readFile(beforePhoto), { maxSide: PREVIEW_MAX_SIDE });
    const { png, ms } = await editImage(photo.buf, previewPrompt(groups, zones), { timeoutMs: TIMEOUT_MS });

    const { dir, name } = path.parse(beforePhoto);
    const file = path.join(dir, `${name}.preview.png`);
    await writeFile(file, png);
    console.log(`preview: wrote ${path.relative(process.cwd(), file)} in ${ms}ms`);

    await send({ type: "image", path: file });
    await send({ type: "text", text: PREVIEW_CAPTION });
    return true;
  } catch (err) {
    console.log(`preview: skipped (${(err as Error).message.slice(0, 160)})`);
    return false;
  }
}
