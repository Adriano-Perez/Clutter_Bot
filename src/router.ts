import type { Session } from "./types.js";
import type { SessionStore } from "./store/sessionStore.js";
import { handleCommand } from "./commands.js";
import { mask } from "./photon/media.js";
import { newSession } from "./session.js";

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

export const isPhoto = (c: InboundContent) => c.type === "attachment" && c.mimeType.startsWith("image/");

export class MessageRouter {
  private pending = new Map<string, Promise<void>>();

  /** Order each person's events without making every other person wait for their model call. */
  route(msg: InboundMessage): Promise<void> {
    const previous = this.pending.get(msg.sender) ?? Promise.resolve();
    const current = previous.catch(() => {}).then(() => this.handle(msg));
    this.pending.set(msg.sender, current);
    void current.finally(() => {
      if (this.pending.get(msg.sender) === current) this.pending.delete(msg.sender);
    }).catch(() => {});
    return current;
  }

  constructor(
    private store: SessionStore,
    private handlers: Partial<Record<Session["phase"], PhaseHandler>>,
  ) {}

  private async handle(msg: InboundMessage) {
    // Mark before handling: at-most-once, a crash mid-handler drops the event rather than double-replying.
    if (!this.store.markSeen(msg.eventId)) {
      console.log(`router: skip seen event ${msg.eventId}`);
      return;
    }

    const session = this.store.get(msg.sender) ?? newSession(msg.sender);
    console.log(`router: ${msg.content.type} from ${mask(msg.sender)} session ${session.id} phase ${session.phase}`);

    // FR-GW-07: ping, help, status, where does <item> go?, start over — in any phase.
    if (msg.content.type === "text") {
      const replies = handleCommand(session, msg.content.text);
      if (replies) {
        this.store.save(session);
        for (const r of replies) await msg.send(r);
        return;
      }
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
