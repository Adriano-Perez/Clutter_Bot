# Implementation Plan: Item & Storage Detection

Owner: **A** (Daniel). Phase 0 spike → Phase 1 (items) → Phase 2 (zones, corrections).

## Tasks
- [ ] Get the Perceptron API key from the workshop team; confirm endpoint, request shape, and coordinate system
- [ ] Spike script `scripts/spike-perceptron.ts`: one items call on `test/fixtures/tray-messy.jpg`; log latency at `reasoning_effort` `none` / `low`; save raw JSON as a fixture
- [ ] `PhotoNormalizer` (sharp: `rotate()`, `resize({width:1024,height:1024,fit:"inside"})`, jpeg 85)
- [ ] `QualityGate` (mean luminance via `sharp.stats()`; blur via Laplacian variance on greyscale)
- [ ] `PerceptronClient` with 20 s timeout, 1 retry, latency log
- [ ] `Detector.detectItems` with `LABEL_VOCAB` prompt + zod schema; `toPixels()`; sort and number
- [ ] `OverlayRenderer.renderDetections` (SVG boxes + number badges, composite)
- [ ] Wire into `DetectionHandler`; reply with overlay + legend → **Phase 1 thin slice done**
- [ ] `Detector.detectZones` (polygon); dashed outlines with letters
- [ ] `CorrectionParser` + handler for corrections during `interview`
- [ ] Tune the prompt on 3 fixture photos until NFR-DET-02 holds
- [ ] Unit tests: `toPixels`, sorting/numbering, correction regexes, overlay geometry within bounds
- [ ] PR → review → merge

## Files to Create or Modify
- `src/vision/normalize.ts`: `PhotoNormalizer`
- `src/vision/quality.ts`: `QualityGate`
- `src/vision/perceptron.ts`: `PerceptronClient`
- `src/vision/detector.ts`: `Detector`, `LABEL_VOCAB`, zod schemas
- `src/vision/overlay.ts`: `OverlayRenderer` (shared with feature 06)
- `src/handlers/detection.ts`: `DetectionHandler`, `CorrectionParser`
- `scripts/spike-perceptron.ts`
- `test/fixtures/tray-messy.jpg`, `tray-half.jpg`, `tray-done.jpg`, `perceptron-items.json`, `perceptron-zones.json`
- `test/detector.test.ts`, `test/overlay.test.ts`

## Dependencies
- Feature `01-imessage-gateway` (photo download, replies)
- Perceptron API (`perceptron-mk1.5`), `sharp`, `zod`
- Gemini (fallback correction parsing only)
