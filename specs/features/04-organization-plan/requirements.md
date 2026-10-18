# Feature Requirements: Organization Plan

Turns detections + interview facts into a concrete plan: each item gets a home, a short reason, and an order. Delivered as numbered steps over iMessage, a web plan page, and an illustrative "after" image. Re-plans when reality disagrees.

## User Story: US-PLAN-01

**As a** user who doesn't know where things should go,  
**I want** a specific home for each item with a short reason,  
**so that** I can stop deciding and just do it.

## User Story: US-PLAN-02

**As a** visual person,  
**I want** to see roughly what my desk will look like when it's done,  
**so that** I have a goal to aim at.

## User Story: US-PLAN-03

**As a** user mid-cleanup,  
**I want** the plan to change when a bin turns out to be full,  
**so that** I'm not stuck on a step that can't work.

## Functional Requirement: FR-PLAN-01
The system shall generate a plan with Gemini (JSON-schema output). For every non-discarded item it gives `{itemId, destinationZoneId | "desk_keep", reason (≤ 12 words)}`, plus a step order.

## Functional Requirement: FR-PLAN-02
The planner shall follow these rules, and a validator shall enforce them after generation:
- (a) `daily` items stay on the desk or in the nearest zone.
- (b) `discard` items get a step "toss/recycle" and no zone.
- (c) No item is assigned to a zone marked `full`.
- (d) Related items are grouped (cables + chargers together).
- (e) Every item ID appears exactly once.

## Functional Requirement: FR-PLAN-03
The system shall send the plan as a numbered step list (≤ 8 lines). It shall end with "Call me at <SMS number> for step-by-step help, or text `next`" and a link to `/s/:id`.

## Functional Requirement: FR-PLAN-04
The system shall render the web plan page `/s/:id`: the overlay photo with destination arrows or letters, an item → place table with reasons, step checkboxes reflecting `done`, evidence state chips, and the preview image when it's ready.

## Functional Requirement: FR-PLAN-05
The system shall generate an "after" preview with Nano Banana 2 from the normalized before photo + plan text. The prompt allows only rearranging existing objects (no new objects, no removed furniture). The preview is sent asynchronously and labeled "Illustration — your item list is the real plan."

## Functional Requirement: FR-PLAN-06
The system shall support text-driven guidance: `next` returns the next undone step, and `done` marks it complete and records evidence `{state: "claimed", source: "user_text"}`.

## Functional Requirement: FR-PLAN-07
When a blocker is reported (text or voice: "B is full", "the charger doesn't fit"), the system shall mark the zone or item, re-plan **only the undone steps**, and explain the change in one line.

## Non-Functional Requirement: NFR-PLAN-01
The plan text shall arrive within **8 seconds (p50)** of the last interview answer. The preview shall arrive within **30 seconds**, or be skipped silently.

## Non-Functional Requirement: NFR-PLAN-02
**100%** of plans sent to the user shall pass the FR-PLAN-02 validator. Invalid plans are repaired deterministically or regenerated once.

## Non-Functional Requirement: NFR-PLAN-03
The plan page shall be readable at 390 px width, with no horizontal scroll, and load in < 1 s on venue Wi-Fi (no framework, images ≤ 300 KB).

## Acceptance Criteria
- Given interview facts from TC-INT-01, when the plan is generated, then items 1 and 4 stay on the desk, the receipt has a "toss" step, nothing goes into zone B, and every item appears once.
- Given the plan was sent, when the user opens the link on a phone, then the page shows the photo, the table, and the steps without sideways scrolling.
- Given guidance is in progress, when the user texts "A is full", then remaining A items move elsewhere and the user gets "Moved 3 and 6 to the desk drawer since A is full."
- Given Nano Banana fails or times out, when 30 s pass, then no preview is sent and nothing else breaks.
