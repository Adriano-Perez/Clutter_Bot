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
  expect(s.id).toMatch(/^[0-9a-f]{8}$/);
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
