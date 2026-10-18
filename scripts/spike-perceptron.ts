// Phase 0 spike: run the detection pipeline on one photo (TC-DET-01 latency) and save its outputs.
// Usage: npx tsx scripts/spike-perceptron.ts <photo path> [--max-side 768] [--compare]
import "dotenv/config";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { detectPhoto } from "../src/pipeline/detectPhoto.js";
import type { LabeledBox } from "../src/vision/cleanup.js";
import { normalizePhoto } from "../src/vision/normalize.js";
import { detect, PerceptronError, type DetectOptions } from "../src/vision/perceptron.js";

const OUT_DIR = "out";

interface Call {
  name: string;
  options: DetectOptions;
}

const comparisonCalls: Call[] = [
  { name: "b-open-none", options: { reasoningEffort: "none" } },
  { name: "c-open-low", options: { reasoningEffort: "low", timeoutMs: 40_000 } },
];

type Timing = { call: string; items: number | string; ms: number | string; finish: string };

function formatBoxes(items: readonly LabeledBox[]): string {
  return items.map(({ label, box }) => `  ${label} [${box.join(", ")}]`).join("\n") || "  (none)";
}

function errorJson(err: unknown): { error: string; raw?: unknown } {
  const message = err instanceof Error ? err.message : String(err);
  const raw = err instanceof PerceptronError ? err.raw : undefined;
  return raw === undefined ? { error: message } : { error: message, raw };
}

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      "max-side": { type: "string", default: "768" },
      compare: { type: "boolean", default: false }, // also run the slow open-detection calls
    },
  });
  const photoPath = positionals[0];
  const maxSide = Number(values["max-side"]);
  if (!photoPath || !Number.isInteger(maxSide) || maxSide <= 0) {
    console.error("Usage: npx tsx scripts/spike-perceptron.ts <photo path> [--max-side 768] [--compare]");
    process.exit(1);
  }

  const input = await readFile(photoPath);
  const photoName = path.parse(photoPath).name;
  const outPath = (suffix: string) => path.join(OUT_DIR, `${photoName}.${suffix}`);
  await mkdir(OUT_DIR, { recursive: true });

  const timings: Timing[] = [];

  console.log(`\n--- detectPhoto (items + zones) ---`);
  try {
    const result = await detectPhoto(input, { maxSide });
    const { debug } = result;
    console.log(`normalized ${photoPath} to ${debug.width}x${debug.height}`);

    await writeFile(outPath("a-vocab-none.json"), JSON.stringify(debug.itemsResult, null, 2));
    timings.push({
      call: "a-vocab-none",
      items: debug.itemsResult.detections.length,
      ms: debug.itemsResult.ms,
      finish: debug.itemsResult.finishReason,
    });

    if (debug.rawZones) {
      await writeFile(outPath("zones.json"), JSON.stringify({ zones: debug.rawZones, ms: debug.zonesMs }, null, 2));
      console.log(`zones (${debug.rawZones.length}):`);
      for (const z of debug.rawZones) console.log(`  ${z.id}  ${z.label}  [${z.box.join(", ")}]`);
      timings.push({ call: "zones", items: debug.rawZones.length, ms: debug.zonesMs, finish: "-" });
    } else {
      await writeFile(outPath("zones.json"), JSON.stringify(errorJson(debug.zonesError), null, 2));
      console.log(`zones call failed: ${errorJson(debug.zonesError).error}; container filter skipped`);
      timings.push({ call: "zones", items: "-", ms: "-", finish: "error" });
    }

    console.log(`\nbefore cleanup (${debug.rawItems.length}):\n${formatBoxes(debug.rawItems)}`);
    console.log(`after cleanup (${result.items.length}):\n${formatBoxes(result.items)}`);
    if (debug.rawZones && result.zones.length < debug.rawZones.length) {
      console.log(`\ndropped ${debug.rawZones.length - result.zones.length} "cup" zone(s) on a mug; zones now:`);
      for (const z of result.zones) console.log(`  ${z.id}  ${z.label}  [${z.box?.join(", ")}]`);
    }

    await writeFile(outPath("overlay.png"), result.overlayPng);
    console.log(`\nsaved ${outPath("overlay.png")}\n\n${result.legend}`);
    timings.push({ call: "detectPhoto total", items: result.items.length, ms: result.ms, finish: "-" });
  } catch (err) {
    const saved = errorJson(err);
    await writeFile(outPath("a-vocab-none.json"), JSON.stringify(saved, null, 2));
    console.error(`items call failed: ${saved.error}\nno overlay`);
    timings.push({ call: "detectPhoto", items: "-", ms: "-", finish: "error" });
  }

  if (values.compare) {
    const photo = await normalizePhoto(input, { maxSide });
    for (const { name, options } of comparisonCalls) {
      const outFile = outPath(`${name}.json`);
      console.log(`\n--- ${name} ---`);
      try {
        const result = await detect(photo.dataUrl, options);
        const mentions = [...new Set(result.detections.map((d) => d.mention))];
        console.log(`items: ${result.detections.length}`);
        console.log(`mentions: ${mentions.join(", ") || "(none)"}`);
        console.log(`ms: ${result.ms}`);
        await writeFile(outFile, JSON.stringify(result, null, 2));
        timings.push({ call: name, items: result.detections.length, ms: result.ms, finish: result.finishReason });
      } catch (err) {
        const saved = errorJson(err);
        console.error(`failed: ${saved.error}`);
        await writeFile(outFile, JSON.stringify(saved, null, 2));
        timings.push({ call: name, items: "-", ms: "-", finish: "error" });
      }
      console.log(`saved ${outFile}`);
    }
  }

  console.log();
  console.table(timings);
}

await main();
