import { Hono, type Context } from "hono";
import { timingSafeEqual } from "node:crypto";
import {
  HONESTY,
  markDoneText,
  nextStepText,
  statusText,
  whereDoesText,
  zoneFullText,
} from "../commands.js";
import { groupLine, groupPlan } from "../plan.js";
import { mask } from "../photon/media.js";
import type { SessionStore } from "../store/sessionStore.js";
import type { Session } from "../types.js";

const LAST4 = /^\d{4}$/;

/** Constant-time compare, so the shared secret can't be recovered a byte at a time. */
export function secretMatches(provided: string | undefined, expected: string | undefined): boolean {
  if (!expected || !provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  // timingSafeEqual throws on a length mismatch, which would itself leak the length.
  return a.length === b.length && timingSafeEqual(a, b);
}

export type Lookup = { handle?: string | undefined; last4?: string | undefined };

export type Found =
  | { ok: true; session: Session }
  | { ok: false; reason: "no_identifier" | "not_found" | "ambiguous"; speak: string };

/**
 * Which session the caller is in.
 *
 * Prefers the caller ID the SIP trunk supplies. Without one, the agent asks for the last four
 * digits of the number; two sessions ending in the same four digits are refused rather than
 * guessed, because handing one caller another caller's desk would be worse than a reprompt.
 */
export function findSession(store: SessionStore, { handle, last4 }: Lookup): Found {
  if (handle) {
    const session = store.get(handle);
    if (session) return { ok: true, session };
  }

  if (last4 && LAST4.test(last4)) {
    const matches = store.findByLast4(last4);
    if (matches.length === 1) return { ok: true, session: matches[0]! };
    if (matches.length > 1) {
      return { ok: false, reason: "ambiguous", speak: "More than one desk ends in those digits. What's the whole number?" };
    }
    return { ok: false, reason: "not_found", speak: "I can't find a desk for those digits. Text me a photo first." };
  }

  if (handle) return { ok: false, reason: "not_found", speak: "I can't find a desk for this number. Text me a photo first." };
  return { ok: false, reason: "no_identifier", speak: "What are the last four digits of your phone number?" };
}

function planSummary(session: Session) {
  const zones = session.zones.map(({ id, label }) => ({ id, label }));
  return groupPlan(session.items, zones).map(groupLine);
}

/**
 * The HTTP tools an ElevenLabs agent calls mid-conversation (FR-VOICE-02).
 *
 * Every one is a thin wrapper over the same functions the text commands use, so the phone call and
 * the message thread can never disagree about what the plan says. Each returns a `speak` string the
 * agent can read aloud verbatim, plus structured fields for anything it wants to reason about.
 *
 * Guarded by TOOL_SHARED_SECRET as a bearer token. Without that variable set, every call is
 * refused: an unauthenticated endpoint that returns someone's desk contents by phone number is
 * exactly the kind of endpoint that leaks data by default.
 */
export function voiceTools(store: SessionStore): Hono {
  const app = new Hono();

  app.use("/voice/*", async (c, next) => {
    const expected = process.env.TOOL_SHARED_SECRET;
    if (!expected) {
      console.error("voice: TOOL_SHARED_SECRET is not set; refusing every tool call");
      return c.json({ error: "voice tools are not configured" }, 503);
    }
    const provided = c.req.header("authorization")?.replace(/^Bearer\s+/i, "");
    if (!secretMatches(provided, expected)) return c.json({ error: "unauthorized" }, 401);
    return next();
  });

  // One body shape for every tool: { handle?, last4?, ... }
  const resolve = async (c: Context) => {
    const body: Record<string, unknown> = await c.req
      .json<Record<string, unknown>>()
      .catch(() => ({}) as Record<string, unknown>);
    const handle = typeof body.handle === "string" ? body.handle : undefined;
    const last4 = typeof body.last4 === "string" ? body.last4 : undefined;
    return { body, found: findSession(store, { handle, last4 }) };
  };

  app.post("/voice/get_session", async (c) => {
    const { found } = await resolve(c);
    if (!found.ok) return c.json({ ok: false, speak: found.speak, reason: found.reason }, 200);

    const { session } = found;
    console.log(`voice: get_session for ${mask(session.userHandle)} phase ${session.phase}`);
    return c.json({
      ok: true,
      phase: session.phase,
      items: session.items.length,
      stepsDone: session.steps.filter((s) => s.done).length,
      stepsTotal: session.steps.length,
      plan: planSummary(session),
      speak: statusText(session),
      caveat: HONESTY,
    });
  });

  app.post("/voice/next_step", async (c) => {
    const { found } = await resolve(c);
    if (!found.ok) return c.json({ ok: false, speak: found.speak, reason: found.reason }, 200);

    const speak = nextStepText(found.session);
    store.save(found.session); // steps are built lazily on first use
    return c.json({ ok: true, speak, stepsTotal: found.session.steps.length });
  });

  app.post("/voice/mark_done", async (c) => {
    const { found } = await resolve(c);
    if (!found.ok) return c.json({ ok: false, speak: found.speak, reason: found.reason }, 200);

    const speak = markDoneText(found.session);
    store.save(found.session);
    const { steps } = found.session;
    return c.json({ ok: true, speak, stepsDone: steps.filter((s) => s.done).length, stepsTotal: steps.length });
  });

  app.post("/voice/report_blocker", async (c) => {
    const { body, found } = await resolve(c);
    if (!found.ok) return c.json({ ok: false, speak: found.speak, reason: found.reason }, 200);

    const zone = typeof body.zone === "string" ? body.zone.trim() : "";
    if (!/^[a-z]$/i.test(zone)) {
      return c.json({ ok: false, speak: "Which bin is full? Give me its letter." }, 200);
    }

    const speak = zoneFullText(found.session, zone);
    store.save(found.session);
    return c.json({ ok: true, speak });
  });

  app.post("/voice/where_does", async (c) => {
    const { body, found } = await resolve(c);
    if (!found.ok) return c.json({ ok: false, speak: found.speak, reason: found.reason }, 200);

    const item = typeof body.item === "string" ? body.item : "";
    return c.json({ ok: true, speak: whereDoesText(found.session, item) });
  });

  return app;
}
