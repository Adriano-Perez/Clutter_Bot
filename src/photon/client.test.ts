import { expect, test } from "vitest";
import { mask } from "./client.js";

test("mask keeps only last 4 digits", () => {
  expect(mask("+1 (206) 555-0142")).toBe("***0142");
  expect(mask(undefined)).toBe("unknown");
});
