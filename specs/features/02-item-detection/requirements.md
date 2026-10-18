# Feature Requirements: Item & Storage Detection

Uses Perceptron Mk1.5 to find each visible item and each storage zone in the user's photo, numbers them, and sends back an overlay image the user can review and correct.

## User Story: US-DET-01

**As a** user who just texted a photo of my messy desk,  
**I want** to see each of my things outlined and numbered,  
**so that** I can refer to them by number and trust that ClutterBot actually saw my stuff.

## User Story: US-DET-02

**As a** user,  
**I want** to correct a wrong label ("3 is a power bank, not a phone"),  
**so that** the plan is built on what's really there.

## Functional Requirement: FR-DET-01
The system shall normalize the photo (EXIF-rotate, resize so the longest side ≤ 1024 px, JPEG quality 85) before any model call.

## Functional Requirement: FR-DET-02
The system shall call Perceptron Mk1.5 with `annotation_format: "box"` and a JSON Schema response. It shall return up to 12 items, each with a `label` from `LABEL_VOCAB` (or `"other: <text>"`) and a pixel bounding box.

## Functional Requirement: FR-DET-03
The system shall call Perceptron Mk1.5's `/v1/detect` endpoint with `ZONE_CATEGORIES` (storage bin, box, pen cup, cup, drawer, tray) and box output to identify storage zones, each with a label and a pixel bounding box. Zones smaller than 1% of the image are dropped, overlapping zones (IoU ≥ 0.5) are merged, and the rest are lettered A, B, C… left to right. A detection labeled "mug" is always an item, never a zone.

## Functional Requirement: FR-DET-04
The system shall assign items stable 1-based IDs, sorted left-to-right then top-to-bottom, and record each as an `Item` with evidence `{state: "seen", source: "photo"}`.

## Functional Requirement: FR-DET-05
The system shall render an overlay PNG with a numbered box per item and a dashed outline + letter (A, B, …) per zone. It shall send the overlay with a one-line legend ("I see 8 things: 1 charger, 2 notebook, …").

## Functional Requirement: FR-DET-06
The system shall accept corrections in the form `<n> is <label>`, `<n> isn't there`, or `you missed <label>`, and update the item list. A missed item is added without a box (marked `unlocated`).

## Functional Requirement: FR-DET-07
If zero items are found, or the image is too dark or blurry (mean luminance < 40, or Laplacian variance below threshold), the system shall ask for a retake with a specific tip (light, distance, angle).

## Non-Functional Requirement: NFR-DET-01
The system shall return the overlay within **12 seconds (p50)** of the photo arriving on the demo tray. Detection calls use `reasoning_effort` `"low"` or `"none"`.

## Non-Functional Requirement: NFR-DET-02
On the demo tray (8 items), the system shall correctly detect and label **≥ 7 of 8** items in good lighting.

## Non-Functional Requirement: NFR-DET-03
Every Perceptron response shall be validated with zod. Malformed responses trigger one retry, then a polite retake request; they never crash the session.

## Acceptance Criteria
- Given a clear photo of the demo tray, when it is sent, then an overlay arrives with ≥ 7 correctly labeled numbered boxes and both bins outlined.
- Given a dark photo, when it is sent, then the user receives a retake tip and no overlay.
- Given the overlay, when the user texts "3 is a power bank", then item 3's label changes and a confirmation is sent.
- Given Perceptron times out (> 20 s), when the timeout fires, then the user receives "Still looking…" once, and the system retries once.
