import { expect, test } from "vitest";
import { maskedDump, messageParts } from "./client.js";
import { mask } from "./media.js";

test("mask keeps only last 4 digits", () => {
  expect(mask("+1 (206) 555-0142")).toBe("***0142");
  expect(mask(undefined)).toBe("unknown");
});

test("maskedDump masks phones and emails, survives cycles", () => {
  const msg: Record<string, unknown> = {
    sender: { id: "+12065550142" },
    alt: "me@icloud.com",
    text: "ping 42",
    id: "spc-att-12345678-9012",
    timestamp: "2026-10-17T22:12:04.123+00:00",
  };
  msg.self = msg;
  const out = maskedDump(msg);
  expect(out).not.toContain("2065550142");
  expect(out).toContain("***0142");
  expect(out).toContain("***@***");
  expect(out).toContain("ping 42");
  expect(out).toContain("[Circular]");
  expect(out).toContain("spc-att-12345678-9012");
  expect(out).toContain("2026-10-17T22:12:04.123+00:00");
});


test("unwraps quoted commands and ignores read receipts", () => {
  expect(messageParts({ type: "reply", content: { type: "text", text: "start over" } }, "m1"))
    .toEqual([{ id: "m1", content: { type: "text", text: "start over" } }]);
  expect(messageParts({ type: "read" }, "receipt")).toEqual([]);
  expect(messageParts({ type: "reaction", emoji: "👍" }, "reaction")).toEqual([]);
});

test("preserves child IDs for multipart photos so polling and streaming deduplicate identically", () => {
  const parts = messageParts({ type: "group", items: [
    { id: "p:0/parent", content: { type: "attachment", id: "photo", mimeType: "image/heic" } },
    { id: "p:1/parent", content: { type: "text", text: "my desk" } },
  ] }, "parent");
  expect(parts.map((part) => part.id)).toEqual(["p:0/parent", "p:1/parent"]);
  expect(parts[0]?.content).toMatchObject({ type: "attachment", id: "photo" });
  expect(messageParts({ type: "text", text: "\uFFFC" }, "placeholder")).toEqual([]);
});
