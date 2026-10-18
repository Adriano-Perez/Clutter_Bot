# Voice guidance: what's built, and what's left

The server side is done and tested. What remains is ElevenLabs agent configuration and one real
phone call, neither of which can be done without the account.

## Built

Five HTTP tools at `POST /voice/<tool>`, each a thin wrapper over the same functions the text
commands use, so a phone call and the message thread can never disagree about the plan.

| Tool | Body | Returns |
| --- | --- | --- |
| `get_session` | `{handle?, last4?}` | phase, item count, step progress, `plan[]`, `speak`, `caveat` |
| `next_step` | `{handle?, last4?}` | `speak` with the next instruction |
| `mark_done` | `{handle?, last4?}` | `speak`, `stepsDone`, `stepsTotal` |
| `report_blocker` | `{handle?, last4?, zone}` | `speak` describing what moved |
| `where_does` | `{handle?, last4?, item}` | `speak` with the destination and the reason |

Every response carries a `speak` string the agent can read aloud verbatim. Failures are **not** HTTP
errors: an unknown caller returns `200` with `{ok: false, speak: "What are the last four digits…"}`,
because an agent mid-call needs something to say, not a stack trace.

### Identifying the caller

Caller ID first. Without one, the agent asks for the last four digits. Two desks ending in the same
four digits are **refused, not guessed** — handing one caller another caller's desk is worse than
asking again.

### Auth

Bearer token in `Authorization`, compared against `TOOL_SHARED_SECRET` in constant time. If that
variable is unset, every call is refused with `503` rather than running unauthenticated — an open
endpoint returning someone's desk contents by phone number is the same class of mistake VEYZL
flagged in #48.

## Left to do

1. **ElevenLabs agent.** Create a Conversational AI agent; put its ID in `ELEVENLABS_AGENT_ID`.
2. **Register the five tools** on that agent as webhooks pointing at `$PUBLIC_BASE_URL/voice/<tool>`,
   each with the header `Authorization: Bearer $TOOL_SHARED_SECRET`.
3. **Expose the server.** `cloudflared tunnel --url http://localhost:3000`, then set
   `PUBLIC_BASE_URL` to the tunnel URL. This also turns on the `/s/:id` plan link.
4. **Photon SIP.** Import the SMS number into ElevenLabs as a SIP trunk so caller ID reaches the
   agent, and put it in `PHOTON_SMS_NUMBER`.
5. **Agent prompt.** Roughly:

   > You are ClutterBot on the phone. Call `get_session` first. If it returns `ok: false`, read its
   > `speak` and ask for what it asks for. Otherwise read the `speak` field aloud. When the caller
   > says they've finished a step, call `mark_done`. If they say a bin is full, call
   > `report_blocker` with its letter. If they ask where something goes, call `where_does`. Always
   > read the `speak` field as written — don't invent destinations. Say the `caveat` once, early.

6. **Post-call webhook** (#28) → iMessage summary. Not built: delivering a message out of band needs
   a Photon send path that isn't tied to an inbound `space`, which is a design question rather than
   a config one.

## Testing without a phone

```sh
curl -s -X POST localhost:3000/voice/get_session \
  -H "Authorization: Bearer $TOOL_SHARED_SECRET" \
  -H 'Content-Type: application/json' \
  -d '{"last4":"0142"}' | jq
```

`test/voiceTools.test.ts` covers auth, caller lookup including the ambiguous case, every tool, and
a malformed body.
