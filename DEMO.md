# Demo run sheet

Everything needed to run ClutterBot in front of a judge without thinking.

## Before you start

```sh
npm run reset      # clears sessions, so the next photo starts a fresh run
npm run dev        # leave this running; watch the log while you demo
```

Check in this order:

- [ ] `npm run dev` is up and the log says `photon: iMessage connected`
- [ ] Text `ping` from your phone, get `pong` back
- [ ] Hotspot on — don't trust venue Wi-Fi
- [ ] Desk set up messy, bins visible, decent light
- [ ] Backup screen recording open in a tab, in case the network dies
- [ ] `npm run reset` between every judge

## The 3-minute run

**0:00 — the problem (15s).**
"You know you should tidy your desk. You don't, because you don't know where to start. A chatbot
will give you advice. It won't check whether you did anything."

**0:15 — the photo (30s).**
Text a photo of the desk. While it's working, say what's happening: *"That's going to Perceptron
twice — once for the items, once for the storage spots."* The overlay comes back in about 15
seconds with everything numbered and the bins lettered.

> **Offer the judge your phone, or the number.** It works for any phone number, with no app and no
> sign-up. This is the moment people remember.

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

**2:05 — the check (40s).**
Green boxes for what's away, red for what's still out, plus:

```
Put away: charger, cable. Tossed: 2 paper. Still out: mug (5).
I can't see inside closed bins, so I'm only counting what's visible.
```

Say the last line out loud. *"Most demos overclaim. This one tells you what it can't see."*

**2:45 — what's next (15s).**
Voice guidance: a call that walks you through it hands-free.

## If something goes wrong

| Problem | What to do |
| --- | --- |
| Nothing comes back | Check the `npm run dev` log. Text `status` — it'll say what phase you're in |
| Wrong label | `3 is a power bank`. Treat it as a feature, because it is one |
| It says too dark / blurry | Retake with more light, straight down. This is the quality gate working |
| Plan is slow | It's falling through the Gemini model list; the rules kick in by 15s regardless |
| No preview image | Expected without a billing-enabled Gemini key. Don't mention it |
| Detection missed something | Say so plainly: 20 item types, only what's visible. Honesty lands better than excuses |
| Network dies | Play the backup recording |

## Questions judges ask

**"Can't ChatGPT do this?"**
It can give advice. It can't number the things on *your* desk, and it can't check whether you did
it. The second photo is the part no chatbot does.

**"How accurate is it?"**
20 kinds of desk item, and only what's visible. It's wrong sometimes, which is why correcting a
label is one text. It never reports something it can't find as put away.

**"What happens if the model is down?"**
The plan falls through three Gemini models and then runs the same rules in plain code. We measured
the configured model failing one call in three, which is why that exists.

**"Is my photo safe?"**
Phone numbers are masked in logs. The user's text is reduced to an allow-list before any model sees
it — that was a real VEYZL finding, fixed in #48.

## Track notes

| Track | The one-liner |
| --- | --- |
| Perceptron | Without it there are no numbers and no check. Open detection took ~31s and returned sentences; a fixed 26-term vocabulary plus our cleanup rules does it in 9–16s |
| Photon | The whole product is iMessage. No app, no sign-up, works from a judge's own phone |
| Gemini | Schema-constrained JSON for the plan, with a measured model fallback and a code fallback; a second call makes the preview |
| VEYZL | Found a real prompt-injection path from an inbound text into the plan prompt. Fixed in #48, and the same allow-list principle now covers the image prompt and label corrections |
