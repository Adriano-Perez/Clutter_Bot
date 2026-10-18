# Project Roadmap, You can consider each phase as each sprint

All times are PDT, Sat Oct 17 → Sun Oct 18, 2026. Hard deadlines: **Devpost draft before Sat 10:30 pm**, **final submission before Sun 10:00 am**, **HUB Ballroom by 10:20 am**.
Owners: **A** = Daniel (vision pipeline, plan, web page). **B** = Adriano (Photon, voice, repo, Devpost).

Feature folders referenced below live in `specs/features/`.

---

## Phase 0: Prove Every API (Sat 7:30 – 9:00 pm)
**Goal:** Every external service has returned real output from our own code, so nothing in later phases is blocked by an account or key.

**Features:**
- `01-imessage-gateway`: Photon project key, shared iMessage line assigned, `ping` → reply working (B)
- `01-imessage-gateway`: inbound **photo** received and downloaded (B)
- `02-item-detection`: one Perceptron Mk1.5 box-detection call on a desk photo, timed at low/no reasoning (A)
- `04-organization-plan`: one Gemini text call (JSON) and one Nano Banana 2 image edit (A)
- Repo: public GitHub, TypeScript skeleton, `.env` git-ignored (B)
- Ask the Photon booth about an SMS number for voice; redeem the ElevenLabs credit (B)

**Completion Criteria:**
- `ping` over iMessage receives the agent's reply.
- A photo texted to the line is saved to disk by the server, or we have decided on the upload-link fallback (FR-GW-05).
- Perceptron returns ≥1 box on the sample photo, with latency recorded in `02-item-detection/validation.md`.
- Gemini returns valid JSON and one edited image.

---

## Phase 1: Thin Slice + Devpost Draft (Sat 9:00 – 10:15 pm)
**Goal:** One photo makes the full trip (iMessage → Perceptron → numbered overlay → iMessage), and the Devpost draft is submitted.

**Features:**
- `01-imessage-gateway`: event loop, message router, session store (minimal)
- `02-item-detection`: detect → overlay → reply (no zones yet if short on time)
- Devpost draft: overview, tracks (Community Kitchen; Perceptron, Photon; MLH Gemini, NEXT, Commit), both members, Discord handles

**Completion Criteria:**
- TC-GW-01, TC-GW-02, and TC-DET-01 pass.
- Devpost draft submitted by **10:15 pm** (15-minute buffer).

---

## Phase 2: Core Loop Over iMessage (Sat 11:00 pm – Sun 3:00 am)
*(10:15–11:00 pm: move to Gates G01, which opens at 11 pm. Build the demo tray on the walk.)*

**Goal:** Before photo → questions → plan → after photo → verdict works over iMessage alone. **This version alone is a valid Perceptron + Photon entry.**

**Features:**
- `02-item-detection`: storage zones (polygons), label vocabulary, image downscale/crop
- `03-context-interview`: 2–3 questions, Gemini answer parsing, item-number references
- `04-organization-plan`: Gemini plan JSON, numbered step text, web plan page `/s/:id`, async "after" preview
- `06-photo-verification`: after photo → Perceptron visibility check → evidence ledger → green/amber/red overlay
- Every feature merged through a PR

**Completion Criteria:**
- All TCs for features 02, 03, 04, and 06 marked Pass, except preview-image TCs (optional).
- End-to-end run on the demo tray in under 90 seconds of system time, excluding the user's physical actions.
- At least 3 PRs merged.

---

## Phase 3: Voice Coach (Sun 3:00 – 6:00 am)
**Goal:** A phone call continues the same session one step at a time, and the call's outcome appears back in iMessage.

**Features:**
- `05-voice-guidance`: Photon SMS number → SIP → ElevenLabs agent; server tools `get_session`, `next_step`, `mark_done`, `report_blocker`; post-call webhook → iMessage summary
- `04-organization-plan`: re-plan on blocker
- Failure handling across features: blurry/dark photo, zero detections, model timeout, duplicate events

**Completion Criteria:**
- TC-VOICE-01 … TC-VOICE-04 pass on a real phone call.
- TC-PLAN-04 (re-plan) passes.
- **Cut rule:** if TC-VOICE-01 has not passed by 5:30 am, drop voice and move to Phase 4.

---

## Phase 4: Freeze, Polish, Submit (Sun 6:00 – 9:30 am)
**Goal:** A rehearsed, reliable 3-minute demo, a recorded video, and a complete Devpost submission.

**Features:**
- **Feature freeze at 6:00 am.** Only bug fixes after this.
- Plan page and overlay visual polish (phone-readable labels, consistent numbering)
- Backup screen recording of a full run (in case venue Wi-Fi fails)
- README: setup, architecture, sponsor usage
- Presentation video (< 3 min)

**Completion Criteria:**
- Demo rehearsed ≥ 3 times with the physical tray.
- Video uploaded; Devpost final submitted by **9:30 am** (hard deadline 10:00).
- Repo public; all `validation.md` statuses filled in.

---

## Cut Order (if behind)
1. Perceptron video-clip evidence (stretch)
2. MongoDB Atlas / GoDaddy domain
3. Plan-page polish beyond one clean view
4. Voice (`05-voice-guidance`). Photon eligibility remains through iMessage.
5. Gemini "after" preview image. Keep Gemini plan text for the MLH prize.

**Never cut:** photo → overlay → questions → plan → after-photo verdict over iMessage.
