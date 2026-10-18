// Readiness checks. --live makes real model calls on the checked-in fixture; sends no messages.
import "dotenv/config";
import { readFile } from "node:fs/promises";
import { cloud } from "spectrum-ts";
import { z } from "zod";
import { json } from "../src/llm/gemini.js";
import { detectPhoto } from "../src/pipeline/detectPhoto.js";

let failed = false;
function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failed = true;
}
for (const key of ["PROJECT_ID", "PROJECT_SECRET", "PERCEPTRON_API_KEY", "GEMINI_API_KEY"]) {
  check(key, !!process.env[key]?.trim());
}
try {
  const port = process.env.PORT ?? "3000";
  const res = await fetch(`http://localhost:${port}/health`, { signal: AbortSignal.timeout(5000) });
  check("local server", res.ok, `HTTP ${res.status}`);
} catch {
  check("local server", false, "run npm start in another terminal");
}
if (process.env.PUBLIC_BASE_URL) {
  try {
    const res = await fetch(`${process.env.PUBLIC_BASE_URL.replace(/\/+$/, "")}/health`, { signal: AbortSignal.timeout(10000) });
    check("public plan-page server", res.ok, `HTTP ${res.status}`);
  } catch {
    check("public plan-page server", false, "tunnel unavailable; restart it and update PUBLIC_BASE_URL");
  }
} else {
  console.log("INFO PUBLIC_BASE_URL unset — no plan link will be sent");
}
if (process.argv.includes("--live")) {
  try {
    const project = await cloud.getProject(process.env.PROJECT_ID!, process.env.PROJECT_SECRET!);
    const routing = await cloud.issueImessageTokens(process.env.PROJECT_ID!, process.env.PROJECT_SECRET!);
    check("Photon credentials", true, `${project.name}; ${routing.type} routing`);
    if (routing.type === "shared") console.log("INFO Each tester must be enrolled and text their own assigned number (see DEMO.md).");
  } catch (error) {
    check("Photon credentials", false, (error as Error).message.slice(0, 120));
  }
  try {
    const result = await detectPhoto(await readFile("test/fixtures/tray-messy.jpg"), { dropInsideZones: true });
    check("Perceptron detection", result.items.length > 0, `${result.items.length} items, ${result.zones.length} zones, ${result.ms}ms`);
  } catch (error) {
    check("Perceptron detection", false, (error as Error).message.slice(0, 120));
  }
  try {
    const result = await json("Return JSON with ok set to true.", { type: "object", properties: { ok: { type: "boolean" } }, required: ["ok"] }, z.object({ ok: z.literal(true) }), { timeoutMs: 15000 });
    check("Gemini structured response", result.value.ok, `${result.ms}ms`);
  } catch (error) {
    check("Gemini structured response", false, (error as Error).message.slice(0, 120));
  }
}
console.log("INFO Final readiness requires a phone rehearsal: start over → photo → reply → after photo.");
process.exitCode = failed ? 1 : 0;
