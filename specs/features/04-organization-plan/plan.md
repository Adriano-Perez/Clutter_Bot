# Implementation Plan: Organization Plan

Owner: **A** (Daniel). Phase 0 spike (Gemini text + image) → Phase 2 → Phase 3 (re-plan).

## Tasks
- [ ] Spike `scripts/spike-gemini.ts`: one JSON call + one Nano Banana 2 edit on `tray-messy.jpg`; confirm model IDs in AI Studio; save outputs as fixtures
- [ ] Plan zod schema + Gemini prompt with rules (a)–(e)
- [ ] `PlanValidator.validate` / `repair`, with unit tests for each rule
- [ ] `Planner.build`, called from `InterviewHandler`
- [ ] `PlanFormatter.toText` (≤ 8 lines + call number + link)
- [ ] `GuidanceService.next` / `markDone` + `next` / `done` text commands
- [ ] `PlanPage`: HTML template + CSS (phone-first), `/s/:id.json`, 5 s poll for checkboxes and evidence chips
- [ ] `OverlayRenderer.renderPlan`: destination letters on each item box
- [ ] `PreviewGenerator` (async, 30 s timeout, "Illustration" caption)
- [ ] `GuidanceService.reportBlocker` + `Planner.replan` (undone steps only) → Phase 3
- [ ] Unit tests: validator rules, replan keeps done steps fixed, formatter line limit
- [ ] PR → VEYZL → merge

## Files to Create or Modify
- `src/plan/planner.ts`: `Planner`, prompt, schema
- `src/plan/validator.ts`: `PlanValidator`
- `src/plan/guidance.ts`: `GuidanceService` (shared with voice)
- `src/plan/preview.ts`: `PreviewGenerator`
- `src/plan/formatter.ts`: `PlanFormatter`
- `src/web/planPage.ts`, `src/web/plan.css`, `src/web/plan.client.ts`
- `src/vision/overlay.ts`: add `renderPlan`
- `src/handlers/guidance.ts`: `next` / `done` / blocker text handlers
- `scripts/spike-gemini.ts`
- `test/validator.test.ts`, `test/guidance.test.ts`

## Dependencies
- Features `02-item-detection`, `03-context-interview`
- `@google/genai` (Gemini Flash text; Nano Banana 2 / Gemini 3.1 Flash Image), `sharp`, `zod`, `hono`
