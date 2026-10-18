# Demo run sheet

Everything needed to run ClutterBot in front of a judge without thinking.

## Before you start

```sh
npm run demo:server -- start  # managed background server
npm run demo:server -- status # reports health and log path
npm run preflight         # in a second terminal
# Optional API checks (uses model quota, sends no messages):
npm run preflight -- --live
```

Check in this order:

- [ ] The demo server is up and the log says `photon: iMessage connected`
- [ ] Text `ping` from your phone, get `pong` back
- [ ] Hotspot on — don't trust venue Wi-Fi
- [ ] Desk set up messy, bins visible, decent light
- [ ] Backup screen recording open in a tab, in case the network dies
- [ ] Text `start over` and wait for its reply between judges; this resets only that sender

## The 3-minute run

**0:00 — the problem (15s).**
"You know you should tidy your desk. You don't, because you don't know where to start. A chatbot
will give you advice. It won't check whether you did anything."

**0:15 — the photo (30s).**
Text a photo of the desk. While it's working, say what's happening: *"That's going to Perceptron
twice — once for the items, once for the storage spots."* The overlay comes back in about 15
seconds with everything numbered and the bins lettered.

> **Offer the judge a registered team phone.** Photon currently uses shared-number routing. A judge using their own phone must first be registered in the Photon project and text the recipient number assigned to them; copying another tester’s bot number will not work.

**0:45 — the question (20s).**
"Which of these do you use every day?" Reply `2 5`. One question, two characters.

**1:05 — the plan (30s).**
The plan comes back grouped by destination, with the reason for each group. Point out that the
letters match the overlay. If a label is wrong, fix it live:

```
3 is a power bank
```

It re-plans just that item and shows the updated plan instantly. **This is a good thing to let
happen rather than hide.**

**1:35 — tidy up (30s).**
Put things away while talking. Text the second photo.

> If a judge looks like they want more, text `next` — it walks you through one step at a time, and
> `done` moves on. `A is full` re-plans everything still to do out of that bin. All over iMessage.

**2:05 — the check (40s).**
Green boxes for what's away, red for what's still out, plus:

```
Put away: charger, cable. No longer visible (planned to toss): 2 papers. Still out: mug (5).
I can't see inside closed bins, so I'm only counting what's visible.
```

Say the last line out loud. *"Most demos overclaim. This one tells you what it can't see."*

Two details worth pointing at while they look at the overlay:

- **Round badge = away, square badge = still out.** Red and green are the pair people confuse most,
  so the verdict is readable with the colour removed entirely.
- **Tap the link** in the plan message to see the whole run on a page — before photo, plan, after
  photo.

**2:45 — what's next (15s).**
Voice guidance: a call that walks you through it hands-free.

## If something goes wrong

| Problem | What to do |
| --- | --- |
| Nothing comes back | Check the server log. A connected health check alone does not prove that a message arrived. Text `status` — it'll say what phase you're in |
| Wrong label | `3 is a power bank`. Treat it as a feature, because it is one |
| It says too dark / blurry | Retake with more light, straight down. This is the quality gate working |
| Plan is slow | It's falling through the Gemini model list; the rules kick in by 15s regardless |
| No preview image | Expected without a billing-enabled Gemini key. Don't mention it |
| Detection missed something | Say so plainly: 29 item types, only what's visible. Honesty lands better than excuses |
| Network dies | Play the backup recording |

## Questions judges ask

**"How does this differ from a general chatbot?"**
ClutterBot keeps a numbered item list, an explicit plan and an evidence history across messages. The second photo checks that particular plan, and distinguishes what is visible from what the user claims.

**"How accurate is it?"**
29 kinds of desk and room item, and only what's visible. It's wrong sometimes, which is why correcting a
label is one text. It never reports something it can't find as put away.

**"What happens if the model is down?"**
The plan falls through three Gemini models and then runs the same rules in plain code. We measured
the configured model failing one call in three, which is why that exists.

**"Is my photo safe?"**
Phone numbers are masked in logs. The user's text is reduced to an allow-list before any model sees
it, so an instruction typed into a text message can't reach the model.

**"What if it's wrong about where something goes?"**
Correct the label (`3 is a power bank`) and it re-plans that item. If a bin fills up, `A is full`
moves the rest elsewhere. Neither costs a model call, so both reply instantly.

## Track notes

| Track | The one-liner |
| --- | --- |
| Perceptron | Without it there are no numbers and no check. Open detection took ~31s and returned sentences; a fixed 26-term vocabulary plus our cleanup rules does it in 9–16s |
| Photon | The whole product is iMessage. Native iMessage; use a registered tester or enroll the judge first |
| Gemini | Schema-constrained JSON for the plan, with a measured model fallback and a code fallback; a second call makes the preview |
| Security | User text is reduced to an allow-list before any model sees it; the image prompt and label corrections are built only from our own vocabulary |


## Verification rehearsal

Use a real desk or room with a few distinct objects and clearly visible storage. Text `start over`, wait for the reply, then send the before photo. Keep the camera position and storage furniture approximately fixed for the after photo. Leave stored items visible in open containers when demonstrating successful verification. A closed drawer is correctly reported as unconfirmed.

The three bundled tray images are independent detection examples: furniture positions and some objects differ between them. Do not present them as a reliable matched before/after pair. Sending the same before image again should report the unfinished items, not success.

The checker never treats zero detections as success. A kitchen-bound mug put in a storage bin is still wrong. Missing objects planned for storage keep the session open; missing toss/take-away objects are described as no longer visible, without claiming their final destination.

After a successful live run, save an offline backup:

```sh
npm run demo:snapshot -- <your-last-four-digits>
```

Open `out/demo/snapshot.html` before judging. It embeds the actual before/after overlays and verdict, works without a network, and clearly labels itself as a recorded snapshot. It contains your photos, so keep it out of Git.

## What is outside this demo

Voice tools exist and are tested, but the current ElevenLabs credential returned HTTP 401 during this readiness pass. No agent ID or Photon calling number is configured. Present voice as future work. Do not claim that a successful health check verifies the voice service or an end-to-end phone conversation.


## Server operations

```sh
npm run demo:server -- status
npm run demo:server -- restart
npm run demo:server -- stop
```

The managed server writes to `out/demo/server.log` and remains alive when the launching terminal closes. Restart only between tests. It manages only its own recorded process. If you prefer an interactive terminal, stop the managed process first and use `npm start`.

The public Cloudflare tunnel is a separate process. Keep it running; if it restarts, use its newly printed URL in `PUBLIC_BASE_URL` and restart the demo server. `npm run preflight` checks that the public URL is reachable.


Room illustrations remain enabled by request. Every illustration is labelled as approximate in both the message and the image itself; furniture and other details may differ. Follow the numbered plan, and never use the illustration as after-photo evidence. A model-based comparison suppresses detected major layout changes or unavailable checks; it is not a guarantee of visual accuracy.
