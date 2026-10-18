# Feature Requirements: Context Interview

Asks the questions a camera can't answer (what's used daily, what goes in the trash, what storage is really free), then turns casual replies into structured facts on each item and zone.

## User Story: US-INT-01

**As a** user,  
**I want** to answer a couple of quick questions in my own words,  
**so that** the plan fits how I actually use my things.

## User Story: US-INT-02

**As a** user in a hurry,  
**I want** to skip the questions,  
**so that** I still get a reasonable plan right away.

## Functional Requirement: FR-INT-01
After detection, the system shall ask at most **3** questions, one message at a time, referring to items by number:
1. "Which of these do you use every day?" (`usage`)
2. "Anything here that's trash or doesn't belong on this desk?" (`discard`)
3. "Is anything already full or off-limits: A, B, …?" (`zone.full`), asked only if zones were detected.

## Functional Requirement: FR-INT-02
The system shall parse free-text answers with Gemini (JSON-schema output) into `{itemId, usage?, discard?}[]` and `{zoneId, full?}[]`. It shall accept numbers ("1 and 4"), labels ("the mug"), ranges ("2-4"), and "none".

## Functional Requirement: FR-INT-03
The system shall echo its understanding in one line ("Got it: 1 charger + 4 notebook daily; 7 receipt is trash.") so the user can correct it before planning.

## Functional Requirement: FR-INT-04
The system shall accept `skip` at any question, using defaults (all items `sometimes`, none discarded, no zones full), and move to planning.

## Functional Requirement: FR-INT-05
The system shall store each question and raw answer in `session.interview`, so voice (feature 05) and the plan page can show the same context.

## Non-Functional Requirement: NFR-INT-01
The system shall reply to each answer within **4 seconds (p50)**.

## Non-Functional Requirement: NFR-INT-02
The parser shall resolve item references correctly on **≥ 9 of 10** scripted answers in `test/fixtures/answers.json`.

## Acceptance Criteria
- Given an overlay was just sent, when the user replies "1 and 4", then items 1 and 4 get `usage: "daily"` and question 2 is sent.
- Given question 2, when the user replies "the receipt and the empty can", then those items are marked `discard: true`, matched by label.
- Given any question, when the user replies "skip", then defaults are applied and the plan is generated.
- Given an ambiguous reply ("the cable" when there are two cables), when parsed, then ClutterBot asks "Cable 3 or cable 6?"
