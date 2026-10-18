# Implementation Plan: Photo Verification & Evidence Ledger

Owner: **A** (Daniel). Phase 2. Never cut.

## Tasks
- [ ] Shoot fixtures on the real demo tray: `tray-messy.jpg` (before), `tray-half.jpg` (3 moved into open bin A, 1 in closed drawer, rest unchanged), `tray-done.jpg`; write the expected state per item in `test/fixtures/expected-states.json`
- [ ] `Verifier` targeted Perceptron prompt + zod schema; save responses as fixtures
- [ ] Geometry helpers: `iou(a, b)`, `pointInPolygon(p, poly)`, `center(box)`
- [ ] `EvidenceClassifier` pure function + rules from FR-VER-03
- [ ] `Ledger.append` / `latest(item, source)` on the session document
- [ ] `OverlayRenderer.renderVerdict` (green / amber dashed at the original spot / red)
- [ ] `VerdictFormatter` with wording guard (NFR-VER-03) + unit test that scans the output for forbidden words
- [ ] `VerificationHandler` routing (photo in `planned` / `guiding` / `verifying`; `new photo` command)
- [ ] Re-open steps via `GuidanceService` for still_here and wrong_spot
- [ ] Completion wrap-up with a side-by-side before/after (sharp `join`)
- [ ] Plan page: show "You said / Photo" chips per item
- [ ] Unit tests: classifier on fixtures (≥ 90%, 0 false verifications), formatter guard
- [ ] PR → review → merge
- [ ] *(Stretch)* video clip evidence

## Files to Create or Modify
- `src/verify/verifier.ts`: `Verifier`
- `src/verify/classifier.ts`: `EvidenceClassifier`, geometry helpers
- `src/verify/ledger.ts`: `Ledger`
- `src/verify/formatter.ts`: `VerdictFormatter`
- `src/handlers/verification.ts`: `VerificationHandler`
- `src/vision/overlay.ts`: add `renderVerdict`, `beforeAfter`
- `src/web/planPage.ts`: evidence chips
- `test/fixtures/tray-half.jpg`, `tray-done.jpg`, `expected-states.json`, `perceptron-verify-*.json`
- `test/classifier.test.ts`, `test/formatter.test.ts`

## Dependencies
- Features `02-item-detection` (`PerceptronClient`, `OverlayRenderer`, zones), `04-organization-plan` (`GuidanceService`, destinations)
- Perceptron Mk1.5, `sharp`, `zod`
