// Phase 0 spike: compare Perceptron detect settings on one photo (TC-DET-01 latency).
// Usage: npx tsx scripts/spike-perceptron.ts <photo path> [--max-side 1024]
import "dotenv/config";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { cleanDetections, type LabeledBox } from "../src/vision/cleanup.js";
import { LABEL_VOCAB, ZONE_PROMPT } from "../src/vision/labels.js";
import { normalizePhoto } from "../src/vision/normalize.js";
import { numberItems, renderDetections, type Box, type OverlayZone } from "../src/vision/overlay.js";
import {
  annotate,
  detect,
  gridToPixels,
  PerceptronError,
  type AnnotateResult,
  type DetectOptions,
  type DetectResult,
} from "../src/vision/perceptron.js";

const OUT_DIR = "out";

interface Call {
  name: string;
  options: DetectOptions;
}

const itemsCall: Call = { name: "a-vocab-none", options: { categories: [...LABEL_VOCAB], reasoningEffort: "none" } };
const comparisonCalls: Call[] = [
  { name: "b-open-none", options: { reasoningEffort: "none" } },
  { name: "c-open-low", options: { reasoningEffort: "low", timeoutMs: 40_000 } },
];

type Zone = OverlayZone & { label: string };

// Polygons (and any boxes) on the 0-1000 grid → pixel polygons, lettered A, B, C… left to right.
function toZones(result: AnnotateResult, width: number, height: number): Zone[] {
  const shapes = result.annotations.flatMap(({ kind, mention, points }) => {
    const px = points.map((p) => gridToPixels(p, width, height));
    let polygon: [number, number][];
    if (kind === "polygon" && px.length >= 3) polygon = px.map(({ x, y }) => [x, y]);
    else if (kind === "point_box" && px.length === 2) {
      const [a, b] = px as [{ x: number; y: number }, { x: number; y: number }];
      polygon = [
        [a.x, a.y],
        [b.x, a.y],
        [b.x, b.y],
        [a.x, b.y],
      ];
    } else return [];
    const xs = polygon.map(([x]) => x);
    return [{ label: mention ?? "zone", polygon, centerX: (Math.min(...xs) + Math.max(...xs)) / 2 }];
  });
  return shapes
    .sort((a, b) => a.centerX - b.centerX)
    .map(({ label, polygon }, i) => ({ id: String.fromCharCode(65 + i), label, polygon }));
}

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

  async function runZones(): Promise<Zone[] | undefined> {
    const name = "zones";
    const outFile = path.join(OUT_DIR, `${photoName}.${name}.json`);
    const lines = [`\n--- ${name} (annotate, polygon) ---`];
    try {
      const result = await annotate(photo.dataUrl, ZONE_PROMPT, { format: "polygon", reasoningEffort: "none" });
      await writeFile(outFile, JSON.stringify(result, null, 2));
      const zones = toZones(result, photo.width, photo.height);
      lines.push(`zones: ${zones.length}`);
      for (const z of zones) lines.push(`  ${z.id}  ${z.label}  (${z.polygon.length} points)`);
      lines.push(`ms: ${result.ms}`);
      timings.push({ call: name, items: zones.length, ms: result.ms, finish: "-" });
      return zones;
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
  const [itemsResult, zones] = await Promise.all([runCall(itemsCall), runZones()]);
  const wallMs = Math.round(performance.now() - start);
  timings.push({ call: "items+zones wall", items: "-", ms: wallMs, finish: "-" });

  for (const call of comparisonCalls) await runCall(call);

  if (itemsResult) {
    if (!zones) console.log("\nzones call failed: container filter skipped");

    const before = toBoxes(itemsResult);
    const after = cleanDetections(before, zones ?? []);
    console.log(`\nbefore cleanup (${before.length}):\n${formatBoxes(before)}`);
    console.log(`after cleanup (${after.length}):\n${formatBoxes(after)}`);

    const numbered = numberItems(after);
    const overlayFile = path.join(OUT_DIR, `${photoName}.overlay.png`);
    await writeFile(overlayFile, await renderDetections(photo.buf, photo.width, photo.height, numbered, zones));
    console.log(`\nsaved ${overlayFile}: ${numbered.map((i) => `${i.id} ${i.label}`).join(", ") || "(no boxes)"}`);
  } else {
    console.log("\nno overlay: the items call failed");
  }

  console.log();
  console.table(timings);
}

await main();
