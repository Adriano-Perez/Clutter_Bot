# Implementation Plan: iMessage Gateway

Owner: **B** (Adriano). Phase 0 → Phase 1.

## Tasks
- [ ] Create Photon project + key (`project:read`, `project:write`, `platforms:write`); assign shared iMessage line in the dashboard
- [ ] `.env`: `PROJECT_ID`, `PROJECT_SECRET`, `PHOTON_AGENT_HANDLE`; add `.env` to `.gitignore`
- [ ] `PhotonClient` with `listMessages`, `sendMessage` (idempotency key), and the beta `ping` → reply test
- [ ] Text a photo to the line; inspect the raw event JSON; implement `downloadAttachment` with 409/`Retry-After` retry
- [ ] **Decision point (by 9:00 pm):** inbound photos work → continue; otherwise build `/s/:id/upload` (FR-GW-05)
- [ ] `sendAttachment` for PNG replies
- [ ] `SqliteSessionStore` + `events_seen` table + cursor persistence
- [ ] `MessageRouter` with phase dispatch + global commands (`start over`, `help`, `status`, `where does … go?`)
- [ ] Immediate acknowledgement before handler work (NFR-GW-01)
- [ ] Log masking helper; 429 backoff
- [ ] Unit tests: router dispatch, command parsing, dedupe
- [ ] Open PR → VEYZL audit → address findings → merge

## Files to Create or Modify
- `src/photon/client.ts`: Photon beta API wrapper
- `src/photon/eventLoop.ts`: live events / polling, dedupe, cursor
- `src/router.ts`: `MessageRouter`, global commands
- `src/replier.ts`: idempotent text and image sending, log masking
- `src/store/sessionStore.ts`: `SessionStore` interface + `SqliteSessionStore`
- `src/store/mediaStore.ts`: save/serve media
- `src/types.ts`: shared `Session`, `Item`, `Zone`, `Step` types (see `tech-stack.md`)
- `src/server.ts`: Hono app; mounts `/media`, `/s/:id`, `/s/:id/upload`
- `.env.example`, `.gitignore`
- `test/router.test.ts`

## Dependencies
- Photon 2.0 beta API client / REST (`https://api.photon.codes`)
- `hono`, `@hono/node-server`, `better-sqlite3`, `zod`, `dotenv`, `tsx`, `vitest`
