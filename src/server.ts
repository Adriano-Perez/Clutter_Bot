import "dotenv/config";
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { startPhoton } from "./photon/client.js";

const app = new Hono();

app.get("/health", (c) => c.json({ ok: true }));

const port = Number(process.env.PORT ?? 3000);
serve({ fetch: app.fetch, port }, () => console.log(`listening on :${port}`));

startPhoton().catch((err) => {
  console.error("photon: stopped", err);
  process.exit(1);
});
