# Where things stand

Written at the end of the overnight build. 13 PRs merged (#50–#62), 205 tests, `tsc --noEmit`
clean, `main` green.

## What works right now, with no further setup

The whole loop: photo → numbered overlay → one question → grouped plan → second photo →
green/red verdict. Plus `help`, `status`, `where does X go?`, `3 is a power bank`, `next`, `done`,
`A is full`, `start over`, `ping`, a photo quality gate, and the `/s/:id` plan page.

Run `npm run dev`, text a photo, and it works.

## Three things need you

### 1. VEYZL screenshot — 5 minutes, blocks nothing

The README has a `TODO` where a screenshot of the finding should go. The fix itself is documented
in detail; it just needs the dashboard image. Issue #31.

### 2. Gemini billing — turns on the preview illustration

Every image model on the current key returns `429 … limit: 0`, which is the free tier having zero
image quota. Enable billing on the key's Google Cloud project at
[aistudio.google.com/apikey](https://aistudio.google.com/apikey) and the preview starts working
with no code change. Ask the MLH table for credits first.

Until then it's silently skipped — the plan is unaffected and nothing looks broken.

### 3. Voice — config only, no code left

The five server tools are built and tested (`POST /voice/*`). What's left is ElevenLabs agent
setup, the tunnel and the SIP import, all written up in
[`specs/features/05-voice-guidance/SETUP.md`](specs/features/05-voice-guidance/SETUP.md).

`.env` already has the slots, with `ELEVENLABS_WEBHOOK_SECRET` and `TOOL_SHARED_SECRET` generated.
You need to fill in `ELEVENLABS_API_KEY`, `ELEVENLABS_AGENT_ID` and `PHOTON_SMS_NUMBER`.

The post-call webhook (#28) is **not** built. It needs a Photon send path not tied to an inbound
message, which is a design decision rather than configuration — don't start it under time pressure.

## Before you demo

Read [`DEMO.md`](DEMO.md). It has the pre-flight checklist, a timed three-minute run, a
what-to-do-when-it-breaks table, and answers to the questions judges ask.

Two things to run between judges:

```sh
npm run reset
```

and keep `npm run dev` in view so you can see what's happening.

## Two numbers worth knowing by heart

- **Open-ended Perceptron detection took ~31 s** and returned sentence-long labels. A fixed 26-term
  vocabulary with reasoning `"none"` does it in **9–16 s**. That's the engineering story.
- **`gemini-3.8-flash` failed 1 call in 3** with `503 high demand` when measured. That's why there's
  a model fallback and a plain-code fallback underneath it. That's the production-thinking story.

## What I deliberately didn't do

- **A three-question interview** (#16). One question is the better product and a much better demo.
  The issue is still open rather than closed, because that's your call, not mine.
- **Blur-gating the after photo.** An empty patch of desk measures *lower* than a blurred photo, so
  the gate would reject a tidied desk — the exact result the demo builds towards. It runs on the
  before photo only.
