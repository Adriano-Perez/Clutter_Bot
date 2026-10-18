import "dotenv/config";
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { startPhoton } from "./photon/client.js";
import { SqliteSessionStore } from "./store/sessionStore.js";
import { voiceTools } from "./voice/tools.js";
import { planRoutes } from "./web/routes.js";

const app = new Hono();
const store = new SqliteSessionStore();

let connected = false;
app.get("/health", (c) => c.json({ ok: connected, photon: connected ? "connected" : "connecting" }, connected ? 200 : 503));
app.route("/", planRoutes(store));
app.route("/", voiceTools(store));

const port = Number(process.env.PORT ?? 3000);
serve({ fetch: app.fetch, port }, () => console.log(`listening on :${port}`));

// The listener shares the store, so the page always shows what the thread just said.
startPhoton(store, () => { connected = true; }).then(() => {
  throw new Error("Photon message stream ended");
}).catch((err) => {
  console.error("photon: stopped", err);
  process.exit(1);
});
