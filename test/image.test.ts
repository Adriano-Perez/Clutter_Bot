import { afterEach, expect, it, vi } from "vitest";
import sharp from "sharp";

const generateContent = vi.fn();
const json = vi.fn();
vi.mock("../src/llm/gemini.js", () => ({ getClient: () => ({ models: { generateContent } }), json }));
const { editImage } = await import("../src/llm/image.js");
const photo = await sharp({ create: { width: 10, height: 10, channels: 3, background: "#888888" } }).jpeg().toBuffer();
const image = await sharp(photo).png().toBuffer();
afterEach(() => { vi.resetAllMocks(); });

it("checks the original and edited images before returning a preview", async () => {
  generateContent.mockResolvedValue({ candidates: [{ content: { parts: [{ inlineData: { data: image.toString("base64") } }] } }] });
  json.mockResolvedValue({ value: { sameLayout: true, furniturePreserved: true } });
  const result = await editImage(photo, "tidy the loose objects");
  expect((await sharp(result.png).metadata()).format).toBe("png");
  expect((await sharp(result.png).metadata()).height).toBeGreaterThan(10);
  const opts = json.mock.calls[0]![3];
  expect(opts.images).toHaveLength(2);
  expect(opts.images[0].mimeType).toBe("image/jpeg");
  expect((await sharp(Buffer.from(opts.images[0].data, "base64")).metadata()).width).toBe(10);
});

it.each([
  { sameLayout: false, furniturePreserved: true },
  { sameLayout: true, furniturePreserved: false },
])("rejects an illustration that changes the room: %j", async (value) => {
  generateContent.mockResolvedValue({ candidates: [{ content: { parts: [{ inlineData: { data: image.toString("base64") } }] } }] });
  json.mockResolvedValue({ value });
  await expect(editImage(photo, "tidy")).rejects.toThrow(/changed the room/);
});

it("rejects a text-only refusal without trying to validate a nonexistent image", async () => {
  generateContent.mockResolvedValue({ candidates: [{ content: { parts: [{ text: "unable" }] } }] });
  await expect(editImage(photo, "tidy")).rejects.toThrow(/no image/);
  expect(json).not.toHaveBeenCalled();
});
