import { randomUUID } from "node:crypto";
import type { Session } from "./types.js";

export function newSession(userHandle: string): Session {
  const now = new Date().toISOString();
  return {
    id: randomUUID().slice(0, 8),
    userHandle,
    phase: "awaiting_photo",
    afterPhotos: [],
    items: [],
    zones: [],
    interview: [],
    steps: [],
    createdAt: now,
    updatedAt: now,
  };
}

/** Replaces the session's contents in place with a fresh one (new id, phase awaiting_photo). */
export function resetSession(session: Session): void {
  const fresh = newSession(session.userHandle);
  for (const key of Object.keys(session) as (keyof Session)[]) delete (session as Partial<Session>)[key];
  Object.assign(session, fresh);
}
