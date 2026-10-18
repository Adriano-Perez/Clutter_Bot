import { randomUUID } from "node:crypto";
import convert from "heic-convert";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

// Phone numbers are PII: only ever log the last 4 digits.
export const mask = (id: string | undefined) => (id ? `***${id.replace(/\D/g, "").slice(-4)}` : "unknown");

const MEDIA_DIR = path.resolve("data/media");

export async function savePhoto(bytes: Uint8Array, mimeType: string, senderId: string | undefined) {
  const heic = /^image\/hei[cf]$/i.test(mimeType);
  const data = heic ? await convert({ buffer: bytes, format: "JPEG" }) : bytes;
  const ext = heic ? "jpg" : mimeType.split("/")[1].replace("jpeg", "jpg").replace(/\W/g, "");
  const dir = path.join(MEDIA_DIR, senderId?.replace(/\D/g, "").slice(-4) || "unknown");
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, `${Date.now()}-${randomUUID().slice(0, 8)}.${ext}`);
  await writeFile(file, data);
  return file;
}
