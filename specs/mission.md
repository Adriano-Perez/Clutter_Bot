# Project Mission

## Problem
Plenty of people want a cleaner space but can't get themselves to start. It feels like too much effort, and part of that effort is mental: deciding for every object where it belongs, what goes together, what has to stay within reach, and how to use the storage they already have. Without a clear picture of the end state, cleaning turns into moving things from one surface to another, so it's easier not to start at all.

Today's tools only cover part of this. Clutter detectors rate how messy a room is. "Declutter" image generators produce a tidy picture of a room. Neither one assigns each real object a home, guides the person while they put it there, or checks afterward whether the job actually got done.

ClutterBot closes that loop and makes starting easy. It **observes** the space through photos (Perceptron). It **asks** for the context a camera can't know (iMessage via Photon). It **guides** the person one step at a time (voice via Photon + ElevenLabs). Then it **checks** the result with a follow-up photo (Perceptron). Throughout, it keeps what it has *seen* separate from what the user has *said*.

## Target Users
- **Primary:** anyone who wants a cleaner room or desk but feels too lazy, busy, or stuck to start. They'll text a photo and follow simple steps, but won't plan the whole job themselves.
- **Examples:** students in dorms and apartments, people working from home with a cluttered desk, and anyone facing a move, a guest visit, or an inspection. It also helps people who find organizing decisions hard and do better with one concrete step at a time.
- **Demo user (DubHacks judges):** a person at our table who messes up a prepared desk tray, then follows ClutterBot to put it back in order.

## Project Goals
- Give every detected item a specific, explained destination within the user's existing storage.
- Ask no more than 3 short questions to get the context photos can't provide (daily-use items, items to discard, storage availability).
- Guide the cleanup one action at a time, by voice or text. Re-plan when the user reports a blocker ("that drawer is full").
- Verify progress with a follow-up photo, reporting **verified / not visible (unconfirmed) / still here** for each item, without overstating certainty.
- Keep one session continuous across iMessage, voice calls, and a web plan page.
- Hackathon goals: win **Perceptron Perception** and **Photon** (iMessage + Best voice agent). Also enter **VEYZL**, **Community Kitchen** (title track), **MLH Best Use of Gemini**, **DubHacks NEXT**, and **MLH Commit Fellowship**.

## In Scope
- iMessage conversation on a Photon 2.0 beta shared line: receive photos and text, send text and annotated images.
- Item and storage-zone detection on a photo with Perceptron Mk1.5 (boxes and polygons), returned as a numbered overlay image.
- A short context interview, with free-text answers parsed by Gemini.
- An organization plan from Gemini: item → destination zone, a one-line reason, and step order.
- An illustrative "after" preview from Gemini (Nano Banana 2), clearly labeled as an illustration.
- A read-only web plan page per session: annotated photo, item → place list, progress.
- A voice coach on a Photon SMS number, routed to an ElevenLabs agent over SIP. Server tools read and update the same session. After a call, a summary is sent back over iMessage.
- Follow-up photo verification with an item evidence ledger.
- A single demo surface: a desk tray of 7–8 items plus 2 labeled bins/drawers.

## Out of Scope
- Whole-house or multi-room organization (one surface/zone per session for the demo).
- Accounts, logins, or multi-user households.
- Native mobile app (iMessage is the app).
- Measuring physical fit (dimensions, volume); the user confirms fit verbally.
- Purchasing storage products or shopping recommendations.
- Fine-tuning any model.
- Group chats, and unsolicited first messages (shared iMessage lines can't do either).
- Storing photos beyond the session; no analytics or tracking.
- Perceptron video-clip evidence of placement (**stretch only**, after all roadmap phases pass).
