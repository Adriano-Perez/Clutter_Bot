import { randomUUID } from "node:crypto";
import type { Session } from "./types.js";
import type { SessionStore } from "./store/sessionStore.js";
import { mask } from "./photon/media.js";

export type Reply = { type: "text"; text: string } | { type: "image"; path: string };

export type InboundContent =
  | { type: "text"; text: string }
  | { type: "attachment"; mimeType: string; read: () => Promise<Uint8Array> }
  | { type: "other" };

export interface InboundMessage {
  eventId: string;
  sender: string;
  content: InboundContent;
  send(reply: Reply): Promise<void>;
}

export type PhaseHandler = (session: Session, msg: InboundMessage) => Promise<Reply[]>;

const START_OVER = new Set(["start over", "reset", "restart"]);

export const isPhoto = (c: InboundContent) => c.type === "attachment" && c.mimeType.startsWith("image/");

export class MessageRouter {
  constructor(
    private store: SessionStore,
    private handlers: Partial<Record<Session["phase"], PhaseHandler>>,
  ) {}

  async route(msg: InboundMessage) {
    // Mark before handling: at-most-once, a crash mid-handler drops the event rather than double-replying.
    if (!this.store.markSeen(msg.eventId)) {
      console.log(`router: skip seen event ${msg.eventId}`);
      return;
    }

    const session = this.store.get(msg.sender) ?? newSession(msg.sender);
    console.log(`router: ${msg.content.type} from ${mask(msg.sender)} session ${session.id} phase ${session.phase}`);

    if (msg.content.type === "text" && msg.content.text.trim().toLowerCase() === "ping") {
      this.store.save(session);
      return msg.send({ type: "text", text: "pong" });
    }
    // FR-GW-07 (start over only; help, status, where does <item> go? are still TODO).
    if (msg.content.type === "text" && START_OVER.has(msg.content.text.trim().toLowerCase())) {
      resetSession(session);
      this.store.save(session);
      return msg.send({ type: "text", text: "Fresh start. Send me a photo of your desk." });
    }

    const handler = this.handlers[session.phase];
    if (!handler) {
      console.log(`router: no handler for phase ${session.phase}`);
      return this.store.save(session);
    }

    // NFR-GW-01: acknowledge photos before any slow work.
    if (isPhoto(msg.content)) await msg.send({ type: "text", text: "Got it — looking at your photo…" });
    const replies = await handler(session, msg);
    this.store.save(session);
    for (const r of replies) await msg.send(r);
  }
}

/** Replaces the session's contents in place with a fresh one (new id, phase awaiting_photo). */
export function resetSession(session: Session): void {
  const fresh = newSession(session.userHandle);
  for (const key of Object.keys(session) as (keyof Session)[]) delete (session as Partial<Session>)[key];
  Object.assign(session, fresh);
}

function newSession(userHandle: string): Session {
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
