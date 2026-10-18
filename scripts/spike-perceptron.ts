// Phase 0 spike: compare Perceptron detect settings on one photo (TC-DET-01 latency).
// Usage: npx tsx scripts/spike-perceptron.ts <photo path> [--max-side 1024]
import "dotenv/config";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { cleanDetections, type LabeledBox, type ZonePolygon } from "../src/vision/cleanup.js";
import { LABEL_VOCAB } from "../src/vision/labels.js";
import { normalizePhoto } from "../src/vision/normalize.js";
import { numberItems, renderDetections, type Box } from "../src/vision/overlay.js";
import { detect, PerceptronError, type DetectOptions, type DetectResult } from "../src/vision/perceptron.js";

const OUT_DIR = "out";

// FR-DET-03 storage zones, plus "pen cup" so containers detected as items can be filtered out.
const ZONE_CATEGORIES = ["bin", "drawer", "shelf", "tray", "open desk area", "pen cup"];

interface Call {
  name: string;
  options: DetectOptions;
}

const itemsCall: Call = { name: "a-vocab-none", options: { categories: [...LABEL_VOCAB], reasoningEffort: "none" } };
const zonesCall: Call = { name: "zones-none", options: { categories: ZONE_CATEGORIES, reasoningEffort: "none" } };
const comparisonCalls: Call[] = [
  { name: "b-open-none", options: { reasoningEffort: "none" } },
  { name: "c-open-low", options: { reasoningEffort: "low", timeoutMs: 40_000 } },
];

type Timing = { call: string; items: number | string; ms: number | string; finish: string };

function toBoxes(result: DetectResult): LabeledBox[] {
  return result.detections.flatMap(({ mention, point_box: pb }) => {
    if (!pb) return [];
    const box: Box = [pb.top_left.x, pb.top_left.y, pb.bottom_right.x, pb.bottom_right.y];
    return [{ label: mention, box }];
  });
}

function formatBoxes(items: readonly LabeledBox[]): string {
  return items.map(({ label, box }) => `  ${label} [${box.join(", ")}]`).join("\n") || "  (none)";
}

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: { "max-side": { type: "string", default: "1024" } },
  });
  const photoPath = positionals[0];
  const maxSide = Number(values["max-side"]);
  if (!photoPath || !Number.isInteger(maxSide) || maxSide <= 0) {
    console.error("Usage: npx tsx scripts/spike-perceptron.ts <photo path> [--max-side 1024]");
    process.exit(1);
  }

  const photo = await normalizePhoto(await readFile(photoPath), { maxSide });
  console.log(`Normalized ${photoPath} to ${photo.width}x${photo.height}`);

  const photoName = path.parse(photoPath).name;
  await mkdir(OUT_DIR, { recursive: true });

  const timings: Timing[] = [];

  // Prints its block in one go so parallel calls don't interleave.
  async function runCall({ name, options }: Call): Promise<DetectResult | undefined> {
    const outFile = path.join(OUT_DIR, `${photoName}.${name}.json`);
    const lines = [`\n--- ${name} ---`];
    try {
      const result = await detect(photo.dataUrl, options);
      const mentions = [...new Set(result.detections.map((d) => d.mention))];
      lines.push(`items: ${result.detections.length}`);
      lines.push(`mentions: ${mentions.join(", ") || "(none)"}`);
      lines.push(`ms: ${result.ms}`);
      await writeFile(outFile, JSON.stringify(result, null, 2));
      timings.push({ call: name, items: result.detections.length, ms: result.ms, finish: result.finishReason });
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      lines.push(`failed: ${message}`);
      const raw = err instanceof PerceptronError ? err.raw : undefined;
      const saved = raw === undefined ? { error: message } : { error: message, raw };
      await writeFile(outFile, JSON.stringify(saved, null, 2));
      timings.push({ call: name, items: "-", ms: "-", finish: "error" });
      return undefined;
    } finally {
      lines.push(`saved ${outFile}`);
      console.log(lines.join("\n"));
    }
  }

  const start = performance.now();
  const [itemsResult, zonesResult] = await Promise.all([runCall(itemsCall), runCall(zonesCall)]);
  const wallMs = Math.round(performance.now() - start);
  timings.push({ call: "items+zones wall", items: "-", ms: wallMs, finish: "-" });

  for (const call of comparisonCalls) await runCall(call);

  if (itemsResult) {
    const zones: ZonePolygon[] = zonesResult
      ? toBoxes(zonesResult).map(({ box: [x1, y1, x2, y2] }) => ({
          polygon: [
            [x1, y1],
            [x2, y1],
            [x2, y2],
            [x1, y2],
          ],
        }))
      : [];
    if (!zonesResult) console.log("\nzones call failed: container filter skipped");

    const before = toBoxes(itemsResult);
    const after = cleanDetections(before, zones);
    console.log(`\nbefore cleanup (${before.length}):\n${formatBoxes(before)}`);
    console.log(`after cleanup (${after.length}):\n${formatBoxes(after)}`);

    const numbered = numberItems(after);
    const overlayFile = path.join(OUT_DIR, `${photoName}.overlay.png`);
    await writeFile(overlayFile, await renderDetections(photo.buf, photo.width, photo.height, numbered));
    console.log(`\nsaved ${overlayFile}: ${numbered.map((i) => `${i.id} ${i.label}`).join(", ") || "(no boxes)"}`);
  } else {
    console.log("\nno overlay: the items call failed");
  }

  console.log();
  console.table(timings);
}

await main();
