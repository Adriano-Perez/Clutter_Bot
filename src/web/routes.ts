import { Hono } from "hono";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { SessionStore } from "../store/sessionStore.js";
import type { Session } from "../types.js";
import { notFoundPage, planPage } from "./page.js";

const MEDIA_DIR = path.resolve("data/media");
const SESSION_ID = /^[0-9a-f]{8}$/;

/** The annotated image for each side of the run, or undefined when there isn't one yet. */
export function overlayPath(session: Session, which: "before" | "after"): string | undefined {
  const source = which === "before" ? session.beforePhoto : session.afterPhotos.at(-1);
  if (!source) return undefined;
  const { dir, name } = path.parse(source);
  return path.join(dir, `${name}.${which === "before" ? "overlay" : "verify"}.png`);
}

/** True only for a path that really sits inside data/media, after symlinks and ".." are resolved. */
export function insideMediaDir(file: string): boolean {
  const resolved = path.resolve(file);
  return resolved === MEDIA_DIR || resolved.startsWith(MEDIA_DIR + path.sep);
}

/**
 * The /s/:id plan page (FR-PLAN-03).
 *
 * Photos are served by session, never by filesystem path, and every resolved path is checked
 * against data/media before it is read, so no URL can walk out of the media directory.
 */
export function planRoutes(store: SessionStore): Hono {
  const app = new Hono();

  app.get("/s/:id", (c) => {
    const id = c.req.param("id");
    if (!SESSION_ID.test(id)) return c.html(notFoundPage(), 404);

    const session = store.getById(id);
    if (!session) return c.html(notFoundPage(), 404);
    return c.html(planPage(session, `/s/${id}`));
  });

  app.get("/s/:id/photo/:which", async (c) => {
    const id = c.req.param("id");
    const which = c.req.param("which");
    if (!SESSION_ID.test(id) || (which !== "before" && which !== "after")) return c.notFound();

    const session = store.getById(id);
    const file = session && overlayPath(session, which);
    if (!file || !insideMediaDir(file)) return c.notFound();

    try {
      const bytes = await readFile(file);
      return c.body(bytes, 200, { "Content-Type": "image/png", "Cache-Control": "private, max-age=60" });
    } catch {
      return c.notFound();
    }
  });

  return app;
}
