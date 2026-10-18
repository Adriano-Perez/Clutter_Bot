# Feature Requirements: Voice Guidance

A hands-free coach. The user calls ClutterBot's Photon SMS number while cleaning. An ElevenLabs agent (connected over SIP) reads and updates the **same session** through server tools, gives one step at a time, re-plans on blockers, and hands the conversation back to iMessage when the call ends.

## User Story: US-VOICE-01

**As a** user with my hands full,  
**I want** to talk to ClutterBot instead of typing,  
**so that** I can keep cleaning while it guides me.

## User Story: US-VOICE-02

**As a** user who hangs up halfway,  
**I want** a text summary of where I left off,  
**so that** I can pick it back up later from iMessage.

## Functional Requirement: FR-VOICE-01
The system shall route inbound calls on the Photon SMS number to the ElevenLabs agent via SIP (`sips:sip.rtc.elevenlabs.io:5061`, TLS, media encryption Auto/Allowed).

## Functional Requirement: FR-VOICE-02
The agent shall identify the session by caller number (ElevenLabs system caller-ID variable) through the server tool `get_session(caller_id)`. If none is found, it says "Text me a photo first at <iMessage handle>" and ends politely.

## Functional Requirement: FR-VOICE-03
The agent shall expose these server tools (HTTPS POST to our backend, shared-secret header), all backed by `GuidanceService`:
- `get_session(caller_id)` → summary, done/total, next step
- `next_step(session_id)` → instruction for the next undone step
- `mark_done(session_id, step_n)` → records evidence `claimed (voice)`, returns the next step
- `report_blocker(session_id, text)` → re-plans and returns a one-line explanation
- `where_does(session_id, item)` → destination + reason

## Functional Requirement: FR-VOICE-04
The agent shall give **one** action per turn, refer to items by name and number ("the charger, number 3"), and confirm before moving on.

## Functional Requirement: FR-VOICE-05
On call end, the system shall receive the ElevenLabs post-call webhook (HMAC verified), store the transcript summary on the session, and send an iMessage: "{done} of {total} done. Next up: {step}. Send a photo when you want me to check."

## Functional Requirement: FR-VOICE-06
The agent shall never claim an item is verified. It may only say what the user reported, and suggest a photo check.

## Non-Functional Requirement: NFR-VOICE-01
Server tool endpoints shall respond in **< 800 ms (p95)**, so turns feel natural. They make no model calls on the hot path, except `report_blocker` (≤ 5 s, with a spoken filler line).

## Non-Functional Requirement: NFR-VOICE-02
The post-call iMessage summary shall arrive within **15 seconds** of hang-up.

## Non-Functional Requirement: NFR-VOICE-03
Tool endpoints shall reject requests without the shared secret (401), and the webhook shall reject invalid HMAC signatures.

## Acceptance Criteria
- Given a planned session for phone X, when X calls the SMS number, then the agent greets with progress and the next step.
- Given the agent gave a step, when the user says "done", then `mark_done` is called, the plan page checkbox updates, and the next step is spoken.
- Given the user says "the left bin's full", when `report_blocker` runs, then the agent explains the change in one sentence.
- Given the user hangs up, when 15 s pass, then the iMessage summary is in the same thread as the photos.
- Given an unknown caller, when they call, then the agent points them to iMessage and does not invent a plan.
