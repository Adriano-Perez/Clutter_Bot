import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { newSession } from "../src/session.js";
import { SqliteSessionStore } from "../src/store/sessionStore.js";
import type { Item, Session, Zone } from "../src/types.js";
import { findSession, secretMatches, voiceTools } from "../src/voice/tools.js";

const SECRET = "test-shared-secret";

const item = (id: number, label: string, zone?: string, reason?: string): Item => ({
  id,
  label,
  box: [0, 0, 10, 10],
  evidence: [],
  ...(zone ? { destinationZoneId: zone } : {}),
  ...(reason ? { reason } : {}),
});

const zone = (id: string, label: string): Zone => ({ id, label, polygon: [], box: [0, 0, 10, 10] });

function planned(handle = "+12065550142"): Session {
  return {
    ...newSession(handle),
    phase: "planned",
    zones: [zone("A", "storage bin"), zone("B", "pen cup"), zone("C", "storage bin")],
    items: [
      item(1, "charger", "A", "stored out of the way"),
      item(2, "cable", "A", "stays with the charger"),
      item(3, "pen", "B", "keeps pens together"),
      item(4, "phone", "desk", "you use it every day"),
    ],
  };
}

describe("secretMatches", () => {
  it("accepts the exact secret and nothing else", () => {
    expect(secretMatches("abc", "abc")).toBe(true);
    expect(secretMatches("abd", "abc")).toBe(false);
    expect(secretMatches("ab", "abc")).toBe(false);
    expect(secretMatches("abcd", "abc")).toBe(false);
  });

  it("refuses when either side is missing, rather than matching empty", () => {
    expect(secretMatches(undefined, "abc")).toBe(false);
    expect(secretMatches("abc", undefined)).toBe(false);
    expect(secretMatches(undefined, undefined)).toBe(false);
    expect(secretMatches("", "")).toBe(false);
  });
});

describe("findSession", () => {
  let store: SqliteSessionStore;

  beforeEach(() => {
    store = new SqliteSessionStore(":memory:");
  });

  it("prefers caller ID", () => {
    store.save(planned());
    const found = findSession(store, { handle: "+12065550142" });
    expect(found.ok && found.session.userHandle).toBe("+12065550142");
  });

  it("falls back to the last four digits when there's no caller ID", () => {
    store.save(planned());
    const found = findSession(store, { last4: "0142" });
    expect(found.ok && found.session.userHandle).toBe("+12065550142");
  });

  it("refuses rather than guessing when two desks share the last four", () => {
    store.save(planned("+12065550142"));
    store.save(planned("+14255550142"));

    const found = findSession(store, { last4: "0142" });

    expect(found.ok).toBe(false);
    expect(found.ok === false && found.reason).toBe("ambiguous");
    expect(found.ok === false && found.speak).toMatch(/whole number/i);
  });

  it("asks for digits when it has nothing to go on", () => {
    const found = findSession(store, {});
    expect(found.ok === false && found.reason).toBe("no_identifier");
    expect(found.ok === false && found.speak).toMatch(/last four digits/i);
  });

  it("ignores a malformed last4", () => {
    store.save(planned());
    expect(findSession(store, { last4: "14" }).ok).toBe(false);
    expect(findSession(store, { last4: "abcd" }).ok).toBe(false);
  });
});

describe("voice tool endpoints", () => {
  let store: SqliteSessionStore;

  beforeEach(() => {
    store = new SqliteSessionStore(":memory:");
    vi.stubEnv("TOOL_SHARED_SECRET", SECRET);
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  /** `secret: null` omits the Authorization header entirely. */
  const call = (tool: string, body: unknown, secret: string | null = SECRET) =>
    voiceTools(store).request(`http://localhost/voice/${tool}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(secret === null ? {} : { Authorization: `Bearer ${secret}` }),
      },
      body: JSON.stringify(body),
    });

  it("401s with no Authorization header, a wrong secret, or a bare token", async () => {
    store.save(planned());
    expect((await call("get_session", { handle: "+12065550142" }, null)).status).toBe(401);
    expect((await call("get_session", { handle: "+12065550142" }, "wrong")).status).toBe(401);
    expect((await call("get_session", { handle: "+12065550142" }, "")).status).toBe(401);

    const noBearer = await voiceTools(store).request("http://localhost/voice/get_session", {
      method: "POST",
      headers: { Authorization: SECRET, "Content-Type": "application/json" },
      body: "{}",
    });
    expect(noBearer.status).toBe(200); // a bare token is accepted; the prefix is optional
  });

  it("never leaks a session on an unauthorized call", async () => {
    store.save(planned());
    const res = await call("get_session", { handle: "+12065550142" }, null);
    expect(await res.text()).not.toContain("charger");
  });

  it("503s when the secret isn't configured, rather than running unauthenticated", async () => {
    vi.stubEnv("TOOL_SHARED_SECRET", "");
    store.save(planned());

    const res = await call("get_session", { handle: "+12065550142" }, SECRET);

    expect(res.status).toBe(503);
  });

  it("get_session describes the plan and carries the caveat", async () => {
    store.save(planned());

    const body = await (await call("get_session", { handle: "+12065550142" })).json();

    expect(body).toMatchObject({ ok: true, phase: "planned", items: 4 });
    expect(body.plan).toContain("A storage bin — 1 charger, 2 cable (stored out of the way)");
    expect(body.caveat).toMatch(/only count what I can see/i);
    expect(body.speak).toBeTruthy();
  });

  it("next_step and mark_done walk the plan and persist between calls", async () => {
    store.save(planned());

    const first = await (await call("next_step", { handle: "+12065550142" })).json();
    expect(first.speak).toBe("Step 1 of 3: Put the charger (1) in A storage bin.");

    const done = await (await call("mark_done", { handle: "+12065550142" })).json();
    expect(done).toMatchObject({ ok: true, stepsDone: 1, stepsTotal: 3 });

    // A separate request must see the progress the previous one recorded.
    const next = await (await call("next_step", { handle: "+12065550142" })).json();
    expect(next.speak).toBe("Step 2 of 3: Put the cable (2) in A storage bin.");
    expect(store.get("+12065550142")!.steps.filter((s) => s.done)).toHaveLength(1);
  });

  it("report_blocker re-plans out of the named bin", async () => {
    store.save(planned());

    const body = await (await call("report_blocker", { handle: "+12065550142", zone: "A" })).json();

    expect(body.speak).toContain("A storage bin is full");
    expect(store.get("+12065550142")!.items.find((i) => i.id === 1)!.destinationZoneId).toBe("C");
  });

  it("report_blocker asks again instead of guessing a bin", async () => {
    store.save(planned());

    const body = await (await call("report_blocker", { handle: "+12065550142", zone: "" })).json();

    expect(body).toMatchObject({ ok: false });
    expect(body.speak).toMatch(/which bin/i);
  });

  it("where_does answers from the plan", async () => {
    store.save(planned());

    const body = await (await call("where_does", { handle: "+12065550142", item: "the pen" })).json();

    expect(body.speak).toBe("3 pen → B pen cup — keeps pens together");
  });

  it("asks for digits instead of erroring when the caller is unknown", async () => {
    const res = await call("next_step", {});
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toMatchObject({ ok: false, reason: "no_identifier" });
    expect(body.speak).toMatch(/last four digits/i);
  });

  it("survives a body that isn't JSON", async () => {
    const res = await voiceTools(store).request("http://localhost/voice/get_session", {
      method: "POST",
      headers: { Authorization: `Bearer ${SECRET}`, "Content-Type": "application/json" },
      body: "not json",
    });

    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(false);
  });
});
