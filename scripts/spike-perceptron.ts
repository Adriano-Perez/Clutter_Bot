// Phase 0 spike: compare Perceptron detect settings on one photo (TC-DET-01 latency).
// Usage: npx tsx scripts/spike-perceptron.ts <photo path>
import "dotenv/config";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { LABEL_VOCAB } from "../src/vision/labels.js";
import { normalizePhoto } from "../src/vision/normalize.js";
import { numberItems, renderDetections, type Box } from "../src/vision/overlay.js";
import { detect, PerceptronError, type DetectOptions, type DetectResult } from "../src/vision/perceptron.js";

const OUT_DIR = "out";

const calls: { name: string; options: DetectOptions }[] = [
  { name: "a-vocab-none", options: { categories: [...LABEL_VOCAB], reasoningEffort: "none" } },
  { name: "b-open-none", options: { reasoningEffort: "none" } },
  { name: "c-open-low", options: { reasoningEffort: "low", timeoutMs: 40_000 } },
];

async function main(): Promise<void> {
  const photoPath = process.argv[2];
  if (!photoPath) {
    console.error("Usage: npx tsx scripts/spike-perceptron.ts <photo path>");
    process.exit(1);
  }

  const photo = await normalizePhoto(await readFile(photoPath));
  console.log(`Normalized ${photoPath} to ${photo.width}x${photo.height}`);

  const photoName = path.parse(photoPath).name;
  await mkdir(OUT_DIR, { recursive: true });

  let categoriesResult: DetectResult | undefined;
  const timings: { call: string; items: number | string; ms: number | string; finish: string }[] = [];

  for (const { name, options } of calls) {
    const outFile = path.join(OUT_DIR, `${photoName}.${name}.json`);
    console.log(`\n--- ${name} ---`);
    try {
      const result = await detect(photo.dataUrl, options);
      const mentions = [...new Set(result.detections.map((d) => d.mention))];
      console.log(`items: ${result.detections.length}`);
      console.log(`mentions: ${mentions.join(", ") || "(none)"}`);
      console.log(`ms: ${result.ms}`);
      await writeFile(outFile, JSON.stringify(result, null, 2));
      if (options.categories) categoriesResult = result;
      timings.push({ call: name, items: result.detections.length, ms: result.ms, finish: result.finishReason });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`failed: ${message}`);
      const raw = err instanceof PerceptronError ? err.raw : undefined;
      const saved = raw === undefined ? { error: message } : { error: message, raw };
      await writeFile(outFile, JSON.stringify(saved, null, 2));
      timings.push({ call: name, items: "-", ms: "-", finish: "error" });
    }
    console.log(`saved ${outFile}`);
  }

  if (categoriesResult) {
    const boxed = categoriesResult.detections.flatMap(({ mention, point_box: pb }) => {
      if (!pb) return [];
      const box: Box = [pb.top_left.x, pb.top_left.y, pb.bottom_right.x, pb.bottom_right.y];
      return [{ label: mention, box }];
    });
    const numbered = numberItems(boxed);
    const overlayFile = path.join(OUT_DIR, `${photoName}.overlay.png`);
    await writeFile(overlayFile, await renderDetections(photo.buf, photo.width, photo.height, numbered));
    console.log(`\nsaved ${overlayFile}: ${numbered.map((i) => `${i.id} ${i.label}`).join(", ") || "(no boxes)"}`);
  } else {
    console.log("\nno overlay: the categories call failed");
  }

  console.log();
  console.table(timings);
}

await main();
