# Feature Requirements: iMessage Gateway

Receives and sends iMessages through Photon 2.0 beta, downloads photo attachments, and routes each message to the right handler based on the session phase. Every other feature depends on this one.

## User Story: US-GW-01

**As a** person who wants a clean desk but can't get started,  
**I want** to text ClutterBot a photo from my normal Messages app,  
**so that** I can start organizing without installing anything.

## User Story: US-GW-02

**As a** returning user,  
**I want** ClutterBot to remember where I left off when I text again,  
**so that** I don't have to start over after a break.

## Functional Requirement: FR-GW-01
The system shall receive inbound iMessage events from the assigned Photon shared line, using live events with a replay cursor, or polling `listMessages` every 2 s as a fallback.

## Functional Requirement: FR-GW-02
The system shall send text replies with `sendMessage`, using an idempotency key derived from the inbound message ID (`reply:<messageId>:<n>`).

## Functional Requirement: FR-GW-03
The system shall download inbound image attachments, retrying on `ATTACHMENT_NOT_READY` (409) by honoring `Retry-After`, up to 5 attempts.

## Functional Requirement: FR-GW-04
The system shall send image attachments (annotated overlays, previews) back to the user.

## Functional Requirement: FR-GW-05
If inbound image download is unsupported or fails after retries, the system shall reply with a link to `/s/:id/upload`, where the user can upload the photo through the browser. The conversation itself continues on iMessage.

## Functional Requirement: FR-GW-06
The system shall load or create the user's `Session` by sender handle, and dispatch each message to the handler for `session.phase`.

## Functional Requirement: FR-GW-07
The system shall recognize the commands `start over`, `help`, `status`, and `where does <item> go?` in any phase.

## Non-Functional Requirement: NFR-GW-01
The system shall send an acknowledgement ("Got it — looking at your photo…") within **2 seconds** of receiving a photo, before any model call finishes.

## Non-Functional Requirement: NFR-GW-02
The system shall process each inbound event **at most once**, deduplicating by event ID across restarts.

## Non-Functional Requirement: NFR-GW-03
The system shall never log API keys, and shall mask phone numbers to the last 4 digits in logs.

## Non-Functional Requirement: NFR-GW-04
The system shall back off and honor retry guidance on HTTP 429 instead of increasing request frequency.

## Acceptance Criteria
- Given the server is running, when a user texts `ping`, then they receive a reply within 3 s.
- Given a new user, when they text a photo, then they receive an acknowledgement within 2 s and the photo is saved under `data/media/`.
- Given the same event is delivered twice (e.g., after restart), when it is processed, then only one reply is sent.
- Given a session in `guiding`, when the user texts `status`, then they receive the done/total step count and the next step.
- Given attachment download fails 5 times, when the retries are exhausted, then the user receives an upload link instead of silence.
