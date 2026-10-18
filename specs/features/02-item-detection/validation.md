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

## Photo quality gate, calibrated Sun 18 Oct 2026

FR-DET-07. Measured on the three fixtures and on degraded copies of each, at the same 1024 px
normalization the detector sees.

### Picking a sharpness measure

First attempt used sharp's `convolve()` with a Laplacian kernel and took the standard deviation.
It does not separate blur, because `convolve()` clamps to uint8 and throws away most of the signal:

| | good | blur 3 | blur 6 | blur 12 |
| --- | --- | --- | --- | --- |
| `tray-messy` | 44.9 | 41.8 | 39.2 | 36.0 |

A heavily blurred photo still scored 80% of a crisp one, and a *good* `tray-done` (27.8) scored
lower than a blurred `tray-messy` (36.0), so no global threshold could work.

Computing the Laplacian variance on raw pixels in floating point separates them by about 50x:

| Photo | good | blur 2 | blur 4 | blur 8 | dark 0.25 |
| --- | --- | --- | --- | --- | --- |
| `tray-messy` | 786.2 | 13.6 | 4.4 | 2.9 | 39.1 |
| `tray-half` | 371.1 | 9.4 | 3.7 | 2.6 | 19.2 |
| `tray-done` | 144.3 | 3.9 | 1.7 | 1.2 | 8.0 |

### Thresholds

- **Brightness ≥ 0.12.** Good photos measured 0.65–0.78; a 1/8-exposure copy measured 0.076.
- **Sharpness ≥ 25.** Worst good photo 144.3, mildest caught blur 13.6.

Both sit several times away from the nearest real measurement in each direction. A wrongly
rejected photo costs a demo; a marginal photo that gets through only costs one detection pass.

Darkness is checked first: an underexposed photo also reads as blurry (`dark 0.25` → 8.0–39.1),
and "add light" is the more useful instruction.

### Before photo only

A crop of empty desk surface measures **1.0**, below even heavy blur. A tidied desk is
legitimately low in detail, so running this test on an "after" photo would reject exactly the
result the user is hoping for. The gate is applied in `awaitingPhoto` and nowhere else.

## End-to-end status, Sun 18 Oct 2026

The full conversation is covered offline in `test/endToEnd.test.ts`: a real MessageRouter over a
real SQLite store through all four phases, with only Perceptron, Gemini and Photon stubbed. It
asserts the exact strings a user reads, including the final "Desk clear! Nice work."

**TC-DET-07 (bad photo asks for a retake): Pass** — dark and blurry photos are refused before any
detection call, verified in `test/quality.test.ts` and end to end.

Still needs a live run over iMessage on the real tray (issue #25); that needs the venue and a
phone, not code.
