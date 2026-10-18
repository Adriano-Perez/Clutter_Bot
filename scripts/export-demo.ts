// Save a self-contained, offline snapshot of a real session. Contains photos: keep it private.
import "dotenv/config";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { SqliteSessionStore } from "../src/store/sessionStore.js";
import { planPage, escapeHtml } from "../src/web/page.js";
import { overlayPath } from "../src/web/routes.js";

const last4 = process.argv[2];
if (!last4 || !/^\d{4}$/.test(last4)) throw new Error("Usage: npm run demo:snapshot -- <last four digits>");
const sessions = new SqliteSessionStore().findByLast4(last4);
if (sessions.length !== 1) throw new Error(`Expected one session, found ${sessions.length}. Text the bot first.`);
const session = sessions[0]!;
let html = planPage(session, "");
for (const which of ["before", "after"] as const) {
  const file = overlayPath(session, which);
  if (!file) continue;
  const bytes = await readFile(file);
  html = html.replace(`/photo/${which}`, `data:image/png;base64,${bytes.toString("base64")}`);
}
const saved = new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", dateStyle: "medium", timeStyle: "short" }).format(new Date());
html = html.replace("<body>", `<body><p class="sub">Saved demo snapshot · ${escapeHtml(saved)} Pacific<br>This is a recorded session, not a live connection.</p>`);
await mkdir("out/demo", { recursive: true });
const file = path.resolve("out/demo/snapshot.html");
await writeFile(file, html);
console.log(`Offline demo saved: ${file}`);
