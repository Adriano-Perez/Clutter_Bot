import { expect, it, vi } from "vitest";
import { recoverMessages } from "../src/photon/recovery.js";

const at = (seconds: number) => new Date(seconds * 1000);
const message = (guid: string, seconds: number, isFromMe = false) => ({ guid, dateCreated: at(seconds), isFromMe });

it("pages missed inbound messages and replays them oldest first, excluding outgoing messages", async () => {
  const list = vi.fn()
    .mockResolvedValueOnce({ messages: [message("new", 30), message("outbound", 25, true)], nextPageToken: "older" })
    .mockResolvedValueOnce({ messages: [message("old", 20), message("stale", 5)] });
  const receive = vi.fn(async (_message: ReturnType<typeof message>) => {});
  const cursor = await recoverMessages(list, at(10), receive);
  expect(receive.mock.calls.map(([m]) => m.guid)).toEqual(["old", "new"]);
  expect(list.mock.calls[1]![0].pageToken).toBe("older");
  expect(cursor).toEqual(at(29));
});

it("keeps the cursor on read or delivery failure, so the next poll can retry", async () => {
  await expect(recoverMessages(async () => { throw new Error("network"); }, at(10), async () => {})).rejects.toThrow("network");
  await expect(recoverMessages(async () => ({ messages: [message("new", 20)] }), at(10), async () => { throw new Error("delivery"); }))
    .rejects.toThrow("delivery");
  expect(await recoverMessages(async () => ({ messages: [] }), at(10), async () => {})).toEqual(at(10));
});
