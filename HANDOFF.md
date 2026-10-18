# Demo handoff — October 18, 2026

The managed demo server is run with `npm run demo:server -- start` (not watch mode). `status`, `restart` and `stop` manage only that process; its log is `out/demo/server.log`. `npm start` remains available for a foreground server after stopping the managed instance. `npm run preflight` checks configuration, local health and the public tunnel. `npm run preflight -- --live` makes real Perceptron/Gemini fixture calls and checks Photon authentication without sending messages.

## Implemented in this readiness pass

- Preserved and committed the room vocabulary and placement expansion. Added toy horses/figurines, dolls, toy cars, stuffed animals and board games after the room rehearsal exposed missing toys. The rerun detected four toy groups in the middle of the image (about 24 seconds total).
- Verification checks the intended destination, preserves before-photo zone letters, records photo evidence and refuses empty or incomparable after photos. Missing storage items remain inconclusive; absence never proves disposal or delivery to the kitchen.
- Full bins stay excluded, label corrections preserve unrelated progress, neighboring books and crockery stay separate, and omitted model placements use the rule planner.
- Each sender has an ordered queue; different senders run independently. Corrupt input receives a retry response. Replies and photo/caption groups are unwrapped; receipts and reactions do not trigger bot prompts.
- Photon shared-chat history is polled every five seconds to recover missed live events, with router deduplication shared across both paths.
- Public photo links use 128-bit tokens, reject filesystem symlink escapes, and disable browser caching/referrer leakage. Old short tokens are rotated on database startup.
- Late illustrations are suppressed when the session/plan changes. Image edits also pass a bounded Gemini comparison against the original; detected layout/furniture changes or an unavailable check suppress the optional illustration. This is model-based and can miss errors. Room illustrations remain enabled by request, with a disclaimer in both the image and message. The page shows user claims separately from photo evidence and lists every item in each group.
- `npm run demo:snapshot -- <last4>` saves a private offline HTML copy of the current session under `out/demo/`.

## Live checks observed

Gemini structured output succeeded (about 1.8 seconds). Perceptron detected the messy tray (about 13 seconds) and half tray (about 11 seconds). Gemini image editing succeeded (about 15 seconds). The public HTTPS tunnel and local health returned HTTP 200.

Photon authenticated but initially missed the tester's delivered `start over` event. Photon history proved receipt; the recovery path restored incoming commands and photos. The tester then reached a 13-item plan and received an illustration through iMessage. A second room photo reached a six-item plan; the primary model timed out and the code fallback delivered it. An independent live same-photo verification reported unfinished items and stayed planned. A successful physical tidy-and-verify run is still not established by those checks.

## Required operational context

Photon reports **shared** routing, not a dedicated bot number. Each sender must be registered under the project's Users tab and text their own assigned recipient number. A registered team phone is the simplest judge demo. Confirm `ping` → `pong` before starting. The current tunnel URL is in `.env` and works only while the local Cloudflare tunnel process is running.

Use a real same-view before/after scene. The three bundled tray photos change storage positions and some objects, so they are independent detection samples, not a trustworthy verification pair.

Text `start over` between runs; avoid resetting every user's session while anyone is testing. Read `DEMO.md` for the run sheet and limits.

Voice is outside the verified demo. The configured ElevenLabs credential returned HTTP 401; no voice agent ID/calling number is configured, and the post-call summary webhook is not built.


Final local checks: all 257 regression tests passed across 24 files. TypeScript checks passed. CI now repeats both checks on Node 24 for pushes and pull requests. The real room re-detection found four middle toy groups. The improved image instructions still produced an imperfect illustration, so its visible disclaimer explicitly allows furniture/detail differences; it must not be treated as verification evidence.
