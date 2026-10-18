# Implementation Plan: Voice Guidance

Owner: **B** (Adriano). Phase 0 (accounts) → Phase 3. **Cut rule:** if TC-VOICE-01 hasn't passed by 5:30 am, stop and move to Phase 4.

## Tasks
- [ ] Phase 0: ask the Photon booth for an SMS number for voice; redeem the ElevenLabs Creator credit via Discord
- [ ] ElevenLabs: create the agent, write the system prompt (see design.md), pick a voice, publish
- [ ] Photon Voice → Lines → set up a SIP profile with destination `sips:sip.rtc.elevenlabs.io:5061`, TLS, encryption Auto
- [ ] ElevenLabs Deploy → Phone Numbers → import the Photon number via SIP trunk (E.164), encryption Allowed, assign the agent
- [ ] Call test with an empty agent (no tools) → audio works both ways
- [ ] `cloudflared tunnel` for a public HTTPS URL; put it in the ElevenLabs tool configs
- [ ] `VoiceToolsRouter` + `ToolAuth`: `get_session`, `next_step`, `mark_done`, `report_blocker`, `where_does`
- [ ] Register the 5 server tools in ElevenLabs with JSON parameter schemas and the secret header
- [ ] `PostCallWebhook` with HMAC verification → `Replier.send` summary
- [ ] Caller-ID fallback (ask for last 4 digits) if the variable is empty
- [ ] Unit tests: tool auth 401, webhook HMAC reject, summary formatter
- [ ] PR → VEYZL → merge

## Files to Create or Modify
- `src/voice/toolsRouter.ts`: `/tools/*` routes
- `src/voice/auth.ts`: shared-secret middleware
- `src/voice/postCall.ts`: `/hooks/elevenlabs` webhook
- `src/voice/agentPrompt.md`: system prompt kept in the repo so it's versioned
- `src/plan/guidance.ts`: add `summary()` used by `get_session`
- `src/server.ts`: mount the routes
- `.env.example`: `ELEVENLABS_WEBHOOK_SECRET`, `TOOL_SHARED_SECRET`, `PHOTON_SMS_NUMBER`, `PUBLIC_BASE_URL`
- `test/voice.test.ts`

## Dependencies
- Feature `04-organization-plan` (`GuidanceService`)
- Feature `01-imessage-gateway` (`Replier`)
- Photon 2.0 beta SMS number + Voice profile; ElevenLabs Agents (Creator plan); `cloudflared`
