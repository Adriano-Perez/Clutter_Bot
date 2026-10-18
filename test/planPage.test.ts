import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { planLink } from "../src/plan.js";
import { newSession } from "../src/session.js";
import { SqliteSessionStore } from "../src/store/sessionStore.js";
import type { Item, Session, Zone } from "../src/types.js";
import { escapeHtml, notFoundPage, planPage } from "../src/web/page.js";
import { insideMediaDir, overlayPath, planRoutes } from "../src/web/routes.js";

const item = (id: number, label: string, zone?: string, reason?: string): Item => ({
  id,
  label,
  box: [0, 0, 10, 10],
  evidence: [],
  ...(zone ? { destinationZoneId: zone } : {}),
  ...(reason ? { reason } : {}),
});

const zone = (id: string, label: string): Zone => ({ id, label, polygon: [], box: [0, 0, 10, 10] });

function planned(over: Partial<Session> = {}): Session {
  return {
    ...newSession("+12065550142"),
    id: "a1b2c3d4",
    phase: "planned",
    beforePhoto: "data/media/0142/1700000000000.jpg",
    zones: [zone("A", "storage bin"), zone("B", "pen cup")],
    items: [
      item(1, "charger", "A", "stored out of the way"),
      item(2, "cable", "A", "stored out of the way"),
      item(3, "pen", "B", "keeps pens together"),
      item(4, "paper", "toss", "loose paper is clutter"),
    ],
    ...over,
  };
}

describe("planPage", () => {
  it("renders the plan grouped by destination", () => {
    const html = planPage(planned(), "/s/a1b2c3d4");

    expect(html).toContain("A storage bin");
    expect(html).toContain("1 charger, 2 cable");
    expect(html).toContain("stored out of the way");
    expect(html).toContain("Toss");
    expect(html).toContain("4 things, 3 places for them to go.");
  });

  it("shows the before photo, and the after photo only once there is one", () => {
    expect(planPage(planned(), "/s/a1b2c3d4")).toContain('src="/s/a1b2c3d4/photo/before"');
    expect(planPage(planned(), "/s/a1b2c3d4")).not.toContain("photo/after");

    const done = planned({ afterPhotos: ["data/media/0142/1700000000001.jpg"] });
    expect(planPage(done, "/s/a1b2c3d4")).toContain('src="/s/a1b2c3d4/photo/after"');
  });

  it("states the visibility limit on the page too", () => {
    expect(planPage(planned(), "/s/a1b2c3d4")).toContain("I only count what I can see");
  });

  it("says so when there is no plan yet", () => {
    const fresh = planned({ phase: "interview", items: [item(1, "mug")] });
    expect(planPage(fresh, "/s/a1b2c3d4")).toContain("No plan yet");
  });

  it("escapes anything that could close a tag", () => {
    expect(escapeHtml(`<img src=x onerror="alert(1)">`)).toBe(
      "&lt;img src=x onerror=&quot;alert(1)&quot;&gt;",
    );
    const sneaky = planned({ zones: [{ ...zone("A", "<script>alert(1)</script>"), id: "A" }] });
    const html = planPage(sneaky, "/s/a1b2c3d4");
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("carries no scripts at all", () => {
    expect(planPage(planned(), "/s/a1b2c3d4")).not.toMatch(/<script/i);
    expect(notFoundPage()).not.toMatch(/<script/i);
  });
});

describe("overlayPath", () => {
  it("points at the annotated image for each side of the run", () => {
    const session = planned({ afterPhotos: ["data/media/0142/1700000000001.jpg"] });
    expect(overlayPath(session, "before")).toBe(path.join("data/media/0142", "1700000000000.overlay.png"));
    expect(overlayPath(session, "after")).toBe(path.join("data/media/0142", "1700000000001.verify.png"));
  });

  it("uses the most recent after photo", () => {
    const session = planned({ afterPhotos: ["data/media/0142/1.jpg", "data/media/0142/2.jpg"] });
    expect(overlayPath(session, "after")).toBe(path.join("data/media/0142", "2.verify.png"));
  });

  it("has nothing to point at before a photo arrives", () => {
    const fresh = { ...newSession("+1"), beforePhoto: undefined };
    expect(overlayPath(fresh, "before")).toBeUndefined();
    expect(overlayPath(fresh, "after")).toBeUndefined();
  });
});

describe("insideMediaDir", () => {
  it("accepts a real media path and rejects an escape attempt", () => {
    expect(insideMediaDir("data/media/0142/x.png")).toBe(true);
    expect(insideMediaDir("data/media/../../.env")).toBe(false);
    expect(insideMediaDir("/etc/passwd")).toBe(false);
    // A sibling directory whose name merely starts with the same characters.
    expect(insideMediaDir("data/media-secrets/x.png")).toBe(false);
  });
});

describe("plan routes", () => {
  let store: SqliteSessionStore;

  beforeEach(() => {
    store = new SqliteSessionStore(":memory:");
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  const get = (url: string) => planRoutes(store).request(`http://localhost${url}`);

  it("serves the page for a stored session", async () => {
    store.save(planned());

    const res = await get("/s/a1b2c3d4");

    expect(res.status).toBe(200);
    expect(await res.text()).toContain("A storage bin");
  });

  it("404s an unknown or malformed id without touching the store", async () => {
    expect((await get("/s/deadbeef")).status).toBe(404);
    expect((await get("/s/not-a-session-id")).status).toBe(404);
    expect((await get("/s/../../.env")).status).toBe(404);
  });

  it("serves the overlay image from inside data/media", async () => {
    const dir = path.resolve("data/media/__test__");
    const png = Buffer.from("89504e470d0a1a0a", "hex");
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, "1700000000000.overlay.png"), png);
    store.save(planned({ beforePhoto: path.join(dir, "1700000000000.jpg") }));

    try {
      const res = await get("/s/a1b2c3d4/photo/before");

      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toBe("image/png");
      expect(Buffer.from(await res.arrayBuffer())).toEqual(png);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("refuses a photo that resolves outside data/media", async () => {
    // A session whose stored path points elsewhere must not become a file-read primitive.
    const dir = await mkdtemp(path.join(tmpdir(), "clutterbot-elsewhere-"));
    await writeFile(path.join(dir, "1700000000000.overlay.png"), Buffer.from("89504e470d0a1a0a", "hex"));
    store.save(planned({ beforePhoto: path.join(dir, "1700000000000.jpg") }));

    expect((await get("/s/a1b2c3d4/photo/before")).status).toBe(404);
  });

  it("404s a photo that isn't on disk, rather than throwing", async () => {
    store.save(planned());
    expect((await get("/s/a1b2c3d4/photo/before")).status).toBe(404);
    expect((await get("/s/a1b2c3d4/photo/sideways")).status).toBe(404);
  });
});

describe("planLink", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("is built from PUBLIC_BASE_URL, with any trailing slash removed", () => {
    vi.stubEnv("PUBLIC_BASE_URL", "https://clutter.example.com/");
    expect(planLink("a1b2c3d4")).toBe("https://clutter.example.com/s/a1b2c3d4");
  });

  it("is absent when the server has no public address, so no broken link is sent", () => {
    vi.stubEnv("PUBLIC_BASE_URL", "");
    expect(planLink("a1b2c3d4")).toBeUndefined();
  });
});

describe("sessionStore.getById", () => {
  it("finds a session by its slug and misses cleanly", () => {
    const store = new SqliteSessionStore(":memory:");
    store.save(planned());
    expect(store.getById("a1b2c3d4")?.userHandle).toBe("+12065550142");
    expect(store.getById("deadbeef")).toBeUndefined();
  });
});
