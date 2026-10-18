# Feature Validation: Context Interview

## Test Case: TC-INT-01
**Related Requirement:** FR-INT-01, FR-INT-02, FR-INT-03  
**Preconditions:** Session in `interview` after TC-DET-01 (8 items, 2 zones).

**Steps:**
1. Reply `1 and 4`.
2. Reply `the receipt`.
3. Reply `B is full`.

**Expected Result:** Three echo lines, each correct; items 1 and 4 are `daily`, the receipt is `discard`, zone B is `full`; plan generation starts after step 3.  
**Status:** Pass / Fail

## Test Case: TC-INT-02
**Related Requirement:** FR-INT-04  
**Preconditions:** Fresh interview.

**Steps:**
1. Reply `skip` to question 1.

**Expected Result:** Defaults are applied and a plan arrives; no further questions.  
**Status:** Pass / Fail

## Test Case: TC-INT-03
**Related Requirement:** FR-INT-02  
**Preconditions:** Two items labeled `cable` (3 and 6).

**Steps:**
1. Reply `the cable` to question 1.

**Expected Result:** "Cable 3 or cable 6?"; replying `6` applies to item 6 only.  
**Status:** Pass / Fail

## Test Case: TC-INT-04
**Related Requirement:** NFR-INT-01  
**Preconditions:** TC-INT-01 run.

**Steps:**
1. Read `[latency]` log lines for each answer.

**Expected Result:** p50 reply time ≤ 4 s.  
**Measured:** ____ s  
**Status:** Pass / Fail

## Test Case: TC-INT-05
**Related Requirement:** NFR-INT-02  
**Preconditions:** `test/fixtures/answers.json` with saved Gemini responses.

**Steps:**
1. Run `vitest test/interview.test.ts`.

**Expected Result:** ≥ 9 of 10 answers resolve to the expected item IDs.  
**Status:** Pass / Fail
