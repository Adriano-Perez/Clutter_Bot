import { expect, it } from "vitest";
import { SYNONYMS } from "../src/vision/cleanup.js";
import { CANONICAL_LABELS, LABEL_VOCAB } from "../src/vision/labels.js";

// CANONICAL_LABELS is what "where does the charger go?" matches against, so it has to stay in step
// with the vocabulary and the synonym table rather than drifting as either one grows.
it("CANONICAL_LABELS is exactly what cleanDetections can produce", () => {
  const expected = new Set<string>([
    ...LABEL_VOCAB.filter((label) => !(label in SYNONYMS)),
    ...Object.values(SYNONYMS),
  ]);
  expect([...CANONICAL_LABELS].sort()).toEqual([...expected].sort());
});

it("every synonym maps to a canonical label, never to another synonym", () => {
  for (const [from, to] of Object.entries(SYNONYMS)) {
    expect(SYNONYMS[to], `${from} -> ${to} -> ${SYNONYMS[to]}`).toBeUndefined();
    expect(CANONICAL_LABELS as readonly string[]).toContain(to);
  }
});

it("asks Perceptron for comma-free categories", () => {
  // detect() rejects commas, since the API takes categories as one comma-joined string.
  for (const label of LABEL_VOCAB) expect(label).not.toContain(",");
});
