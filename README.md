# ClutterBot

An iMessage bot that tells you where every item on your desk goes, then checks that you put it there. Built at DubHacks 2026.

## What it does

One loop, all over iMessage:

1. **Photo**: you text a photo of your desk.
2. **Numbered overlay**: ClutterBot sends the photo back with every item numbered and every storage spot lettered (A, B, …).
3. **"Which of these do you use every day?"**: you reply with numbers ("1 and 4") or `skip`.
4. **Plan**: you get a numbered list, one line per item, e.g. `3 pen -> B pen cup (keeps pens together)`.
5. **Second photo**: you put things away and text another photo. ClutterBot reports each item as put away or still out.

## Setup

Needs Node.js 22 or newer.

```sh
npm install
cp .env.example .env
```

Fill in `.env`:

| Variable | What it is |
| --- | --- |
| `PROJECT_ID`, `PROJECT_SECRET` | Photon project credentials |
| `PHOTON_AGENT_HANDLE` | The Photon iMessage line users text |
| `PERCEPTRON_API_KEY` | Perceptron API key (`PERCEPTRON_MODEL` defaults to `perceptron-mk1.5`) |
| `GEMINI_API_KEY` | Google AI Studio key (`GEMINI_TEXT_MODEL` defaults to `gemini-3.8-flash`) |

```sh
npm run dev     # Hono server on :3000 plus the Photon listener
npm test        # Vitest, offline (all API calls mocked)
```

Then text a photo of your desk to the Photon line. Text `ping` to check that it's listening; it replies `pong`.

## Architecture

```
iMessage ─▶ Photon Spectrum ─▶ MessageRouter ─▶ phase handler
                                    │             ├─ Perceptron: detect items + zones
                                    │             └─ Gemini: parse answers, build plan
                                    └──▶ SQLite session store (data/clutterbot.db)
```

- `src/photon/`: Spectrum client, photo download and HEIC → JPEG conversion, PII-masked logging.
- `src/router.ts`: drops duplicate events, loads or creates the session for the sender, and sends the message to the handler for the session's phase (`awaiting_photo` → `interview` → `planned` → …).
- `src/handlers/`: one handler per phase. Each returns replies, and the router sends them.
- `src/vision/`: photo normalization (≤ 1024 px), Perceptron calls, zone filtering, and the numbered SVG overlay drawn with sharp.
- `src/llm/gemini.ts`: `json()` makes one schema-constrained Gemini call, checks the result with zod and enforces a timeout.
- `src/store/sessionStore.ts`: `SessionStore` interface plus the SQLite version. Each session is stored as one JSON document, alongside a table of seen events for dedupe.

## How we use Perceptron

Perceptron Mk1.5 is ClutterBot's eyes. We send the normalized photo to `/v1/detect` twice: once with our item vocabulary (charger, cable, pen, mug, …) and once with storage categories (storage bin, pen cup, drawer, tray). We get pixel boxes back, remove overlapping duplicates and drop any "zone" that is really a mug, then number the items and letter the zones on the overlay. The second photo goes through the same detection, so we can compare it with the plan.

## How we use Photon

Photon Spectrum is the whole user interface: no app and no sign-up, you just text a number. We read messages from Spectrum's async stream, download photo attachments (converting iPhone HEIC to JPEG), and reply with text and annotated images. Every inbound event ID is recorded in SQLite, so a redelivered message never gets a second reply.

## How we use Gemini

Gemini Flash turns detections and the user's answers into a plan. One `json()` call sends the items, the zones and our rules (daily items stay on the desk, paper gets tossed, cables go with the charger, pens go in the pen cup). It asks for JSON that matches a schema, and zod checks the result. If Gemini fails or times out, the same rules run in plain code, so the demo never stalls.

## VEYZL

TODO: add VEYZL screenshot.

## Team

- Adriano Perez
- Daniel Diyali
