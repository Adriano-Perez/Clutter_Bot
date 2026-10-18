import { describe, expect, it, vi } from "vitest";
import type { InboundMessage, Reply } from "../src/router.js";
import type { Session } from "../src/types.js";

// Stand-in for the real first-photo handler: records the session it was given, then moves to interview.
const seen: Session[] = [];
vi.mock("../src/handlers/awaitingPhoto.js", () => ({
  awaitingPhoto: vi.fn(async (session: Session): Promise<Reply[]> => {
    seen.push(structuredClone(session));
    session.phase = "interview";
    return [{ type: "text", text: "I see 3 things: …" }];
  }),
}));

const { complete } = await import("../src/handlers/complete.js");

function doneSession(): Session {
  return {
    id: "old12345",
    userHandle: "+12065550142",
    phase: "complete",
    beforePhoto: "before.jpg",
    afterPhotos: ["after.jpg"],
    preStored: [{ label: "paper", box: [0, 0, 10, 10] }],
    items: [{ id: 1, label: "mug", box: [0, 0, 10, 10], evidence: [] }],
    zones: [],
    interview: [],
    steps: [],
    createdAt: "2026-10-17T00:00:00.000Z",
    updatedAt: "2026-10-17T00:00:00.000Z",
  };
}

function message(content: InboundMessage["content"]): InboundMessage {
  return { eventId: "e1", sender: "+12065550142", content, send: async () => {} };
}

describe("complete", () => {
  it("restarts the flow when a new photo arrives", async () => {
    const session = doneSession();
    const photo = message({ type: "attachment", mimeType: "image/jpeg", read: async () => new Uint8Array() });

    const replies = await complete(session, photo);

    expect(replies).toEqual([{ type: "text", text: "I see 3 things: …" }]);
    const handed = seen.at(-1)!;
    expect(handed.phase).toBe("awaiting_photo");
    expect(handed.id).not.toBe("old12345");
    expect(handed.items).toEqual([]);
    expect(handed.afterPhotos).toEqual([]);
    expect(handed.beforePhoto).toBeUndefined();
    expect(handed.preStored).toBeUndefined();
    expect(session.phase).toBe("interview");
  });

  it("answers text without resetting", async () => {
    const session = doneSession();

    const replies = await complete(session, message({ type: "text", text: "thanks!" }));

    expect(replies).toEqual([
      { type: "text", text: "Your desk is done! Send a new photo or text 'start over' to go again." },
    ]);
    expect(session.phase).toBe("complete");
    expect(session.id).toBe("old12345");
  });
});
