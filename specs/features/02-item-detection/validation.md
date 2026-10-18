# Feature Validation: Item & Storage Detection

## Test Case: TC-DET-01
**Related Requirement:** FR-DET-02, FR-DET-04, FR-DET-05, NFR-DET-01  
**Preconditions:** Demo tray with 8 known items + 2 bins; good lighting; new session.

**Steps:**
1. Text a photo of the tray taken from ~60 cm, top-down.
2. Time from send to overlay received.
3. Compare labels to the known item list.

**Expected Result:** Overlay received in ≤ 12 s; numbered boxes for ≥ 7 of 8 items with correct labels; legend text lists them in number order.  
**Measured latency:** ____ s (none) / ____ s (low)  
**Status:** Pass / Fail

## Test Case: TC-DET-02
**Related Requirement:** FR-DET-03  
**Preconditions:** Same as TC-DET-01.

**Steps:**
1. Inspect the overlay for zone outlines.

**Expected Result:** Both bins are outlined (dashed) and lettered A and B; the open desk area may appear as a third zone.  
**Status:** Pass / Fail

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
