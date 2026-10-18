# Feature Validation: iMessage Gateway

## Test Case: TC-GW-01
**Related Requirement:** FR-GW-01, FR-GW-02  
**Preconditions:** Server running; shared line assigned; tester's iPhone is not the agent handle.

**Steps:**
1. Text `ping` to the ClutterBot number.
2. Measure time to reply.

**Expected Result:** Reply received within 3 s; one reply only.  
**Status:** Pass / Fail

## Test Case: TC-GW-02
**Related Requirement:** FR-GW-03, NFR-GW-01  
**Preconditions:** New user (no session).

**Steps:**
1. Text a photo of the demo tray.
2. Measure time to acknowledgement.
3. Check `data/media/<sessionId>/`.

**Expected Result:** Acknowledgement within 2 s; image file saved; session `phase` advances from `awaiting_photo`.  
**Status:** Pass / Fail

## Test Case: TC-GW-03
**Related Requirement:** NFR-GW-02  
**Preconditions:** One message processed.

**Steps:**
1. Restart the server (cursor replays recent events).
2. Watch logs and the phone.

**Expected Result:** No duplicate reply; log shows `skip seen event`.  
**Status:** Pass / Fail

## Test Case: TC-GW-04
**Related Requirement:** FR-GW-05  
**Preconditions:** Force `downloadAttachment` to fail (env flag `FORCE_DOWNLOAD_FAIL=1`).

**Steps:**
1. Text a photo.

**Expected Result:** After retries, the user receives a `/s/:id/upload` link; uploading there continues the flow in iMessage.  
**Status:** Pass / Fail

## Test Case: TC-GW-05
**Related Requirement:** FR-GW-07  
**Preconditions:** Session in `guiding` with 2 of 7 steps done.

**Steps:**
1. Text `status`.
2. Text `where does the charger go?`
3. Text `start over`.

**Expected Result:** (1) "2 of 7 done. Next: …" (2) the charger's zone + reason (3) the session resets to `awaiting_photo`.  
**Status:** Pass / Fail

## Test Case: TC-GW-06
**Related Requirement:** NFR-GW-03  
**Preconditions:** Logs captured during TC-GW-01 … 05.

**Steps:**
1. `grep` logs for the API key and the full phone number.

**Expected Result:** No matches; numbers appear as `•••1234`.  
**Status:** Pass / Fail
