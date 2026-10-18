import { expect, test } from "vitest";
import { maskedDump } from "./client.js";
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
