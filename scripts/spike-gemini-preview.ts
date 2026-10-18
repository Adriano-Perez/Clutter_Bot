// Times one Nano Banana edit on a fixture photo and writes the result to out/.
// Usage: npx tsx scripts/spike-gemini-preview.ts [photo.jpg]
import "dotenv/config";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { editImage } from "../src/llm/image.js";
import { groupPlan, previewPrompt } from "../src/plan.js";
import type { Item } from "../src/types.js";
import { normalizePhoto } from "../src/vision/normalize.js";

const item = (id: number, label: string, zone: string, reason: string): Item => ({
  id, label, box: [0, 0, 1, 1], evidence: [], destinationZoneId: zone, reason,
});

async function main() {
  const file = process.argv[2] ?? "test/fixtures/tray-messy.jpg";
  const zones = [{ id: "A", label: "storage bin" }, { id: "B", label: "pen cup" }];
  const items = [
    item(1, "charger", "A", "stored out of the way"),
    item(2, "cable", "A", "stays with the charger"),
    item(3, "pen", "B", "keeps pens together"),
    item(4, "paper", "toss", "loose paper is clutter"),
    item(5, "phone", "desk", "you use it every day"),
  ];
  const groups = groupPlan(items, zones);
  const prompt = previewPrompt(groups, zones);
  console.log("prompt:\n" + prompt + "\n");

  const photo = await normalizePhoto(await readFile(file));
  console.log(`photo: ${photo.width}x${photo.height}, ${(photo.buf.length / 1024).toFixed(0)} KB`);

  const { png, ms } = await editImage(photo.buf, prompt);
  await mkdir("out", { recursive: true });
  const out = path.join("out", `${path.parse(file).name}.preview.png`);
  await writeFile(out, png);
  console.log(`\nwrote ${out}  ${(png.length / 1024).toFixed(0)} KB in ${ms}ms`);
}

main().catch((e) => { console.error(String(e).slice(0, 600)); process.exit(1); });
