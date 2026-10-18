# Feature Requirements: Photo Verification & Evidence Ledger

The user sends a follow-up photo, and Perceptron checks each planned item against it. ClutterBot reports what the photo actually shows, kept separate from what the user said they did. This is the **check** step of the observe → ask → act → check loop.

## User Story: US-VER-01

**As a** user who just finished a few steps,  
**I want** ClutterBot to look at my desk again and tell me what's done,  
**so that** I know I'm actually making progress.

## User Story: US-VER-02

**As a** user,  
**I want** ClutterBot to be upfront when it can't see whether something was put away,  
**so that** I can trust its answers.

## Functional Requirement: FR-VER-01
When a photo arrives in phase `planned`, `guiding`, or `verifying`, the system shall treat it as an **after photo** (unless the user texts `new photo` first, which restarts detection).

## Functional Requirement: FR-VER-02
The system shall call Perceptron Mk1.5 with the normalized after photo and the list of planned item labels. It asks for a box for each label that is visible (JSON schema: `{label, visible, box?}[]`), and a second call re-detects zones, or reuses the before-photo zones if the framing matches.

## Functional Requirement: FR-VER-03
The system shall classify each item into exactly one evidence state:
- **verified**: detected with its box center inside its destination zone polygon (or on the desk for `desk_keep`)
- **wrong_spot**: detected, but outside its destination zone and not at its original spot
- **still_here**: detected with IoU ≥ 0.3 against its before-photo box
- **not_visible**: not detected. Reported as "not on the desk anymore; I can't confirm where it went"
- Discarded items: **not_visible** = "gone ✓"; detected = still_here

## Functional Requirement: FR-VER-04
The system shall append evidence `{state, source: "photo", at}` to each item without deleting earlier `claimed` entries. The plan page shows both: "You said: done · Photo: verified".

## Functional Requirement: FR-VER-05
The system shall send a verification overlay: green boxes for verified, amber outlines at the original position for not_visible, red for still_here or wrong_spot. It's accompanied by a summary: "3 verified, 2 off the desk (unconfirmed), 1 still here: the mug (2) goes to bin A."

## Functional Requirement: FR-VER-06
When all non-discarded items are `verified` and all discarded items are gone, the system shall set phase `complete` and send a short wrap-up with a before/after pair.

## Non-Functional Requirement: NFR-VER-01
The verification reply shall arrive within **15 seconds (p50)** of the photo.

## Non-Functional Requirement: NFR-VER-02
On the 3 fixture photos, the classifier shall assign the correct state to **≥ 90%** of items. It shall **never** label an item `verified` when it is absent from the photo (0 false verifications).

## Non-Functional Requirement: NFR-VER-03
User-facing text shall never use "verified", "confirmed", or "done ✓" for an item whose latest photo evidence is not `verified`.

## Acceptance Criteria
- Given the user moved the charger into bin A and the bin is open in frame, when they send an after photo, then the charger is green/verified.
- Given the user put the pens inside a closed drawer, when the after photo is sent, then the pens are amber "off the desk, can't confirm," even if the user said "done."
- Given the mug hasn't moved, when the after photo is sent, then the mug is red/still_here, with its next step.
- Given everything is verified, when the final photo is sent, then the session is `complete` and a before/after pair is sent.
