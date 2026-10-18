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

## Model availability, measured Sun 18 Oct 2026 (hackathon API key, free tier)

Checked with `ai.models.list()` and one real JSON call each.

### Text (the plan)

| Model | Result |
| --- | --- |
| `gemini-3.8-flash` (configured default) | works, 4.8–4.9 s, **but 1 of 3 calls answered 503 UNAVAILABLE "high demand"** |
| `gemini-3-flash-preview` | works, 2.6 s |
| `gemini-flash-latest` | works, 4.3 s |
| `gemini-3.5-flash` | 503 UNAVAILABLE |
| `gemini-2.5-flash`, `gemini-2.5-flash-lite` | 404 not found |

A one-in-three failure rate would lose a live demo, so `json()` now walks
`GEMINI_TEXT_MODEL` then `GEMINI_TEXT_FALLBACK_MODELS` inside a single time budget, and the
rule-based `fallbackPlan` stays as the last resort. Budget cut from 25 s to 15 s, since a healthy
call is 2–5 s.

### Image (the preview)

Every image model the key can list returns `429 ... limit: 0` on the free tier:
`gemini-nano-banana-2.1`, `gemini-2.5-flash-image`, `gemini-3.1-flash-image`,
`gemini-3.1-flash-image-preview`, `gemini-3-pro-image`, `gemini-3.1-flash-lite-image`.

The preview is implemented and tested against a mocked model; it needs a billing-enabled key to
run. `sendPreview` treats that 429 like any other failure: logged, no message to the user, plan
unaffected. Set `GEMINI_IMAGE_MODEL` to switch models, or `PREVIEW=off` to disable it.

**TC-PLAN-06 (preview failure is invisible to the user): Pass** — verified against the real 429
and in `test/preview.test.ts`.
