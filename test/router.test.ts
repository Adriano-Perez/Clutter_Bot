import { expect, test, vi } from "vitest";
import { MessageRouter, type InboundMessage, type Reply } from "../src/router.js";
import { SqliteSessionStore } from "../src/store/sessionStore.js";

function setup() {
  const store = new SqliteSessionStore(":memory:");
  const awaiting = vi.fn(async (): Promise<Reply[]> => [{ type: "text", text: "awaiting" }]);
  const guiding = vi.fn(async (): Promise<Reply[]> => [{ type: "text", text: "guiding" }]);
  const router = new MessageRouter(store, { awaiting_photo: awaiting, guiding });
  const sent: Reply[] = [];
  const msg = (eventId: string, text = "hi", sender = "+12065550142"): InboundMessage => ({
    eventId,
    sender,
    content: { type: "text", text },
    send: async (r) => void sent.push(r),
  });
  return { store, router, awaiting, guiding, sent, msg };
}

test("dedupe skips a repeated event", async () => {
  const { router, awaiting, sent, msg } = setup();
  await router.route(msg("e1"));
  await router.route(msg("e1"));
  expect(awaiting).toHaveBeenCalledTimes(1);
  expect(sent).toEqual([{ type: "text", text: "awaiting" }]);
});

test("new sender gets an awaiting_photo session", async () => {
  const { router, store, msg } = setup();
  expect(store.get("+12065550142")).toBeUndefined();
  await router.route(msg("e1"));
  const s = store.get("+12065550142")!;
  expect(s.phase).toBe("awaiting_photo");
  expect(s.id).toMatch(/^[0-9a-f]{32}$/);
});

test("dispatch picks the handler for the session phase", async () => {
  const { router, store, awaiting, guiding, sent, msg } = setup();
  await router.route(msg("e1"));
  store.save({ ...store.get("+12065550142")!, phase: "guiding" });
  await router.route(msg("e2"));
  expect(awaiting).toHaveBeenCalledTimes(1);
  expect(guiding).toHaveBeenCalledTimes(1);
  expect(sent.at(-1)).toEqual({ type: "text", text: "guiding" });
});

test("ping replies pong without dispatching", async () => {
  const { router, awaiting, sent, msg } = setup();
  await router.route(msg("e1", " Ping "));
  expect(awaiting).not.toHaveBeenCalled();
  expect(sent).toEqual([{ type: "text", text: "pong" }]);
});

test("global commands answer without dispatching, in any phase", async () => {
  const { router, store, guiding, sent, msg } = setup();
  await router.route(msg("e1"));
  store.save({ ...store.get("+12065550142")!, phase: "guiding" });

  await router.route(msg("e2", "help"));
  await router.route(msg("e3", "status"));
  await router.route(msg("e4", "where does the pen go?"));

  expect(guiding).not.toHaveBeenCalled();
  expect(sent.slice(1)).toHaveLength(3);
  expect(sent.at(-1)).toMatchObject({ text: expect.stringMatching(/pen cup/i) });
});

test("start over replaces the session with a fresh one", async () => {
  const { router, store, sent, msg } = setup();
  await router.route(msg("e1"));
  const before = store.get("+12065550142")!;
  store.save({ ...before, phase: "planned", afterPhotos: ["after.jpg"], beforePhoto: "before.jpg" });

  await router.route(msg("e2", "  Start Over "));

  const after = store.get("+12065550142")!;
  expect(after.phase).toBe("awaiting_photo");
  expect(after.id).not.toBe(before.id);
  expect(after.afterPhotos).toEqual([]);
  expect(after.beforePhoto).toBeUndefined();
  expect(sent.at(-1)).toEqual({ type: "text", text: "Fresh start. Send me a photo of your desk." });
});

test("reset and restart also start over", async () => {
  const { router, store, msg } = setup();
  await router.route(msg("e1"));
  for (const [i, word] of ["RESET", "restart"].entries()) {
    store.save({ ...store.get("+12065550142")!, phase: "complete" });
    await router.route(msg(`r${i}`, word));
    expect(store.get("+12065550142")!.phase).toBe("awaiting_photo");
  }
});


test("a slow sender does not block another sender, while same-sender events stay ordered", async () => {
  const store = new SqliteSessionStore(":memory:");
  let release!: () => void;
  const waiting = new Promise<void>((resolve) => { release = resolve; });
  const events: string[] = [];
  const router = new MessageRouter(store, {
    awaiting_photo: async (_session, msg) => {
      events.push(msg.eventId);
      if (msg.eventId === "slow") await waiting;
      return [];
    },
  });
  const msg = (eventId: string, sender: string): InboundMessage => ({
    eventId, sender, content: { type: "text", text: "hi" }, send: async () => {},
  });
  const first = router.route(msg("slow", "alice"));
  const second = router.route(msg("queued", "alice"));
  await router.route(msg("fast", "bob"));
  expect(events).toEqual(["slow", "fast"]);
  release();
  await Promise.all([first, second]);
  expect(events).toEqual(["slow", "fast", "queued"]);
});

test("a failed event does not poison a sender's queue", async () => {
  const store = new SqliteSessionStore(":memory:");
  const handler = vi.fn().mockRejectedValueOnce(new Error("broken image")).mockResolvedValueOnce([]);
  const router = new MessageRouter(store, { awaiting_photo: handler });
  const msg = (eventId: string): InboundMessage => ({ eventId, sender: "alice", content: { type: "other" }, send: async () => {} });
  await expect(router.route(msg("bad"))).rejects.toThrow("broken image");
  await router.route(msg("good"));
  expect(handler).toHaveBeenCalledTimes(2);
});
