# Feature Validation: Photo Verification & Evidence Ledger

## Test Case: TC-VER-01
**Related Requirement:** FR-VER-02, FR-VER-03, FR-VER-05, NFR-VER-01  
**Preconditions:** Plan from TC-PLAN-01; charger, cable, and notebook placed in **open** bin A; pens in a **closed** drawer; mug untouched.

**Steps:**
1. Text an after photo from the same angle.
2. Time the reply.

**Expected Result:** Charger, cable, and notebook green (verified); pens amber ("off the desk, can't confirm"); mug red (still here) with its next step; reply ≤ 15 s.  
**Measured:** ____ s  
**Status:** Pass / Fail

## Test Case: TC-VER-02
**Related Requirement:** FR-VER-04, NFR-VER-03  
**Preconditions:** User texted `done` for the pens before TC-VER-01.

**Steps:**
1. Open the plan page.
2. Read the iMessage summary.

**Expected Result:** Pens show "You said: done · Photo: can't confirm"; neither message nor page calls the pens verified.  
**Status:** Pass / Fail

## Test Case: TC-VER-03
**Related Requirement:** NFR-VER-02  
**Preconditions:** Fixtures + `expected-states.json`.

**Steps:**
1. Run `vitest test/classifier.test.ts`.

**Expected Result:** ≥ 90% of items correct; **0** items classified `verified` when absent.  
**Status:** Pass / Fail

## Test Case: TC-VER-04
**Related Requirement:** FR-VER-03 (discard)  
**Preconditions:** Receipt marked `discard`.

**Steps:**
1. Remove the receipt; send an after photo.

**Expected Result:** The receipt is reported "gone ✓" (not "can't confirm").  
**Status:** Pass / Fail

## Test Case: TC-VER-05
**Related Requirement:** FR-VER-06  
**Preconditions:** All items placed in open zones or kept on the desk per the plan; discards removed.

**Steps:**
1. Send the final photo.

**Expected Result:** Session `complete`; before/after side-by-side image + wrap-up message.  
**Status:** Pass / Fail

## Test Case: TC-VER-06
**Related Requirement:** FR-VER-01  
**Preconditions:** Session in `guiding`.

**Steps:**
1. Text `new photo`, then send a photo of a different surface.

**Expected Result:** Detection restarts (feature 02) instead of verification.  
**Status:** Pass / Fail
