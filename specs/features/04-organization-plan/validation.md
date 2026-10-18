# Feature Validation: Organization Plan

## Test Case: TC-PLAN-01
**Related Requirement:** FR-PLAN-01, FR-PLAN-02, NFR-PLAN-01, NFR-PLAN-02  
**Preconditions:** Interview completed as in TC-INT-01.

**Steps:**
1. Wait for the plan text; note latency.
2. Check each rule (a)–(e) against the plan JSON in logs.

**Expected Result:** Plan arrives in ≤ 8 s; all rules hold; every item appears once.  
**Measured:** ____ s  
**Status:** Pass / Fail

## Test Case: TC-PLAN-02
**Related Requirement:** FR-PLAN-03, FR-PLAN-04, NFR-PLAN-03  
**Preconditions:** Plan sent.

**Steps:**
1. Tap the `/s/:id` link on an iPhone.
2. Scroll the whole page.

**Expected Result:** Photo with destination letters, item → place table with reasons, and step checkboxes all render; no horizontal scroll; loads in < 1 s.  
**Status:** Pass / Fail

## Test Case: TC-PLAN-03
**Related Requirement:** FR-PLAN-05  
**Preconditions:** Plan sent; Gemini image model reachable.

**Steps:**
1. Wait up to 30 s for the preview.
2. Compare it to the before photo.

**Expected Result:** Preview shows the same tray and bins with items rearranged; no invented objects; captioned "Illustration".  
**Status:** Pass / Fail

## Test Case: TC-PLAN-04
**Related Requirement:** FR-PLAN-07  
**Preconditions:** Guidance started; 2 steps done; ≥ 2 undone items assigned to zone A.

**Steps:**
1. Text `A is full`.

**Expected Result:** One-line explanation; undone A items reassigned; done steps unchanged; plan page updates within 5 s.  
**Status:** Pass / Fail

## Test Case: TC-PLAN-05
**Related Requirement:** FR-PLAN-06  
**Preconditions:** Plan sent.

**Steps:**
1. Text `next`.
2. Text `done`.
3. Text `next`.

**Expected Result:** Step 1 instruction → "Nice, 1 of N done" → step 2 instruction; item evidence shows `claimed (user_text)`.  
**Status:** Pass / Fail

## Test Case: TC-PLAN-06
**Related Requirement:** NFR-PLAN-01 (preview timeout)  
**Preconditions:** `GEMINI_IMAGE_MODEL` set to an invalid ID.

**Steps:**
1. Complete the interview.

**Expected Result:** Plan text still arrives; no preview; no error shown to the user; warning in logs.  
**Status:** Pass / Fail
