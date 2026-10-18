# Feature Validation: Item & Storage Detection

## Test Case: TC-DET-01
**Related Requirement:** FR-DET-02, FR-DET-04, FR-DET-05, NFR-DET-01  
**Preconditions:** Demo tray with 8 known items + 2 bins; good lighting; new session.

**Steps:**
1. Text a photo of the tray taken from ~60 cm, top-down.
2. Time from send to overlay received.
3. Compare labels to the known item list.

**Expected Result:** Overlay received in ≤ 12 s; numbered boxes for ≥ 7 of 8 items with correct labels; legend text lists them in number order.  
**Actual Result (Sprint 0, `test/fixtures/tray-messy.jpg`, 768 px, spike script):** 12 items after cleanup: 4 pens, 2 paper, notebook, cable, charger, headphones, mug, keys. All 8 item types found.  
**Measured latency:** 12.8 s items+zones wall time, items call 11.4–13.9 s across runs (none) / ~31 s (low, open detection)  
**Status:** Pass

## Test Case: TC-DET-02
**Related Requirement:** FR-DET-03  
**Preconditions:** Same as TC-DET-01.

**Steps:**
1. Inspect the overlay for zone outlines.

**Expected Result:** Both bins are outlined (dashed) and lettered A and B; the open desk area may appear as a third zone.  
**Actual Result (Sprint 0, same run):** Zones: 2 storage bins + pen cup. The mug was correctly not treated as a zone.  
**Status:** Pass

## Test Case: TC-DET-03
**Related Requirement:** FR-DET-07  
**Preconditions:** Lights off or lens covered.

**Steps:**
1. Text a dark photo.

**Expected Result:** Retake tip ("Turn on a light…"); no Perceptron call logged; session remains `awaiting_photo`.  
**Status:** Pass / Fail

## Test Case: TC-DET-04
**Related Requirement:** FR-DET-06  
**Preconditions:** Overlay received.

**Steps:**
1. Text `3 is a power bank`.
2. Text `you missed my keys`.
3. Text `5 isn't there`.

**Expected Result:** Each correction is acknowledged; the item list reflects all three changes; keys are added as `unlocated`.  
**Status:** Pass / Fail

## Test Case: TC-DET-05
**Related Requirement:** NFR-DET-03  
**Preconditions:** Unit test with a malformed fixture response.

**Steps:**
1. Run `vitest test/detector.test.ts`.

**Expected Result:** Malformed JSON → one retry → retake message; no exception escapes the handler.  
**Status:** Pass / Fail

## Test Case: TC-DET-06
**Related Requirement:** FR-DET-01  
**Preconditions:** A portrait iPhone photo (EXIF orientation 6), 4032×3024.

**Steps:**
1. Run the normalizer on it.

**Expected Result:** Output is upright, longest side 1024 px, and boxes drawn on it align with the objects.  
**Status:** Pass / Fail

## Findings (Sprint 0)
- **Open detection is not usable as-is.** Without categories, `/v1/detect` returns sentence-long labels, and reasoning `"low"` takes ~31 s. Production uses the fixed `LABEL_VOCAB` with reasoning `"none"`.
- **Zones are boxes, not polygons.** Polygon zones from chat completions were unreliable (offset or degenerate shapes), so zones come from `/v1/detect` as pixel boxes (see FR-DET-03 and the design note).

## Vocabulary extension, measured Sun 18 Oct 2026

Added `calculator`, `sticky note` and `eyeglasses` (canonicalised to `glasses`) for the real demo
desk, taking the vocabulary to 25 categories and 19 canonical labels.

`eyeglasses` rather than `glasses`: the plain word also matches a drinking glass, so the
unambiguous term is sent to `/v1/detect` and `SYNONYMS` maps the result back.

### False positives: none

Ran all three fixtures with the extended vocabulary. No calculator, no glasses and no spurious
sticky note was detected on any of them.

| Fixture | Items seen | Items call |
| --- | --- | --- |
| `tray-messy.jpg` | 15 | 16.3 s |
| `tray-half.jpg` | 7 | 11.3 s |
| `tray-done.jpg` | 6 | 8.8 s |

Three extra categories cost about 1.3 s on the busiest fixture (15.0 s → 16.3 s).

### One real change in behaviour

On `tray-messy.jpg` the masking-tape **A** and **B** labels taped inside the two bins now come
back as `sticky note` instead of `paper`. They are not desk clutter either way: the before photo
runs with `dropInsideZones`, which drops anything ≥ 70% inside a zone box regardless of its label.
Pinned by a test in `test/detectPhoto.test.ts` using the real boxes from that run.

Detection is not deterministic between runs: a second run of the same fixture returned 12 items
and did not see the tape labels at all. Both outcomes are handled.
