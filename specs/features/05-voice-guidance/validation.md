# Feature Validation: Voice Guidance

## Test Case: TC-VOICE-01
**Related Requirement:** FR-VOICE-01  
**Preconditions:** Photon SIP profile + ElevenLabs imported number configured; agent published.

**Steps:**
1. Call the SMS number from an iPhone.
2. Speak, then listen.
3. Check Photon → Voice → Recent calls and the ElevenLabs conversation log.

**Expected Result:** The agent answers; audio works both ways; the call ends normally; both dashboards show the call.  
**Status:** Pass / Fail

## Test Case: TC-VOICE-02
**Related Requirement:** FR-VOICE-02, FR-VOICE-03, FR-VOICE-04  
**Preconditions:** A planned session exists for the caller's number (2 of 7 steps done).

**Steps:**
1. Call; listen to the greeting.
2. Say "done".
3. Say "where does the mug go?"

**Expected Result:** The greeting includes progress + the next step; "done" advances the step (plan page checkbox updates within 5 s); the mug's destination + reason is spoken; one action per turn.  
**Status:** Pass / Fail

## Test Case: TC-VOICE-03
**Related Requirement:** FR-VOICE-03 (`report_blocker`), FR-VOICE-06  
**Preconditions:** Same as TC-VOICE-02.

**Steps:**
1. Say "the left bin is full".
2. Ask "is the charger put away?"

**Expected Result:** One-sentence re-plan explanation; for the charger, the agent says the user reported it and suggests a photo check. It never says "verified".  
**Status:** Pass / Fail

## Test Case: TC-VOICE-04
**Related Requirement:** FR-VOICE-05, NFR-VOICE-02  
**Preconditions:** Mid-call, as in TC-VOICE-02.

**Steps:**
1. Hang up.
2. Time until the iMessage arrives.

**Expected Result:** Summary in the same iMessage thread within 15 s, with the correct done/total and next step.  
**Measured:** ____ s  
**Status:** Pass / Fail

## Test Case: TC-VOICE-05
**Related Requirement:** FR-VOICE-02  
**Preconditions:** Caller number has no session.

**Steps:**
1. Call from a different phone.

**Expected Result:** The agent says to text a photo to the iMessage handle first; no invented plan.  
**Status:** Pass / Fail

## Test Case: TC-VOICE-06
**Related Requirement:** NFR-VOICE-01, NFR-VOICE-03  
**Preconditions:** Server running.

**Steps:**
1. `curl` each `/tools/*` endpoint without the secret header.
2. With the header, time 20 requests to `next_step`.
3. POST `/hooks/elevenlabs` with a bad signature.

**Expected Result:** (1) 401 (2) p95 < 800 ms (3) 401, no iMessage sent.  
**Status:** Pass / Fail
