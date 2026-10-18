import { describe, expect, it } from "vitest";
import { HELP, HONESTY, findLabel, handleCommand, statusText, whereDoesText } from "../src/commands.js";
import { newSession } from "../src/session.js";
import type { Item, Session, Zone } from "../src/types.js";

const item = (id: number, label: string, extra: Partial<Item> = {}): Item => ({
  id,
  label,
  box: [0, 0, 10, 10],
  evidence: [],
  ...extra,
});

const zone = (id: string, label: string): Zone => ({ id, label, polygon: [], box: [0, 0, 10, 10] });

function session(over: Partial<Session> = {}): Session {
  return { ...newSession("+12065550142"), ...over };
}

const planned = () =>
  session({
    phase: "planned",
    zones: [zone("A", "storage bin"), zone("B", "pen cup")],
    items: [
      item(1, "charger", { destinationZoneId: "A", reason: "stored out of the way" }),
      item(2, "phone", { usage: "daily", destinationZoneId: "desk", reason: "you use it every day" }),
      item(3, "pen", { destinationZoneId: "B", reason: "keeps pens together" }),
      item(7, "pen", { destinationZoneId: "B", reason: "keeps pens together" }),
      item(4, "paper", { destinationZoneId: "toss", reason: "loose paper is clutter" }),
    ],
  });

describe("handleCommand", () => {
  it("answers ping, help and status in any phase", () => {
    expect(handleCommand(session(), " Ping ")).toEqual([{ type: "text", text: "pong" }]);
    expect(handleCommand(session(), "help")).toEqual([{ type: "text", text: HELP }]);
    expect(handleCommand(session(), "Status?")![0]).toMatchObject({ type: "text" });
  });

  it("leaves a non-command for the phase handler", () => {
    expect(handleCommand(session({ phase: "interview" }), "2 5")).toBeUndefined();
    expect(handleCommand(session(), "skip")).toBeUndefined();
    expect(handleCommand(session(), "thanks!")).toBeUndefined();
  });

  it("resets the session on start over", () => {
    const s = session({ phase: "planned", beforePhoto: "a.jpg", items: [item(1, "pen")] });
    const before = s.id;
    expect(handleCommand(s, "  Start Over ")).toEqual([
      { type: "text", text: "Fresh start. Send me a photo of your desk." },
    ]);
    expect(s.phase).toBe("awaiting_photo");
    expect(s.items).toEqual([]);
    expect(s.beforePhoto).toBeUndefined();
    expect(s.id).not.toBe(before);
  });

  it("states the visibility limit in help", () => {
    expect(HELP).toContain(HONESTY);
  });
});

describe("statusText", () => {
  it("tells the user what is expected next in each phase", () => {
    expect(statusText(session())).toMatch(/send me a photo/i);
    expect(statusText(session({ phase: "interview", items: [item(1, "pen"), item(2, "mug")] }))).toContain("2 things");
    expect(statusText(session({ phase: "interview", items: [item(1, "pen")] }))).toContain("1 thing");
    expect(statusText(session({ phase: "complete" }))).toMatch(/clear/i);
  });

  it("counts only the things that still have to move", () => {
    // 1 charger, 3 pen, 7 pen and 4 paper move; 2 phone stays on the desk.
    expect(statusText(planned())).toContain("4 things to move");
    expect(statusText(planned())).toContain(HONESTY);
  });
});

describe("whereDoesText", () => {
  it("answers by item number, with the zone letter and the reason", () => {
    expect(whereDoesText(planned(), "where does 1 go?")).toBe("1 charger → A storage bin — stored out of the way");
  });

  it("answers by label, covering every item with that label", () => {
    expect(whereDoesText(planned(), "where do my pens go")).toBe(
      "3 pen → B pen cup — keeps pens together\n7 pen → B pen cup — keeps pens together",
    );
  });

  it("names the pseudo-zones in words", () => {
    expect(whereDoesText(planned(), "where does the phone go")).toContain("Stays on your desk");
    expect(whereDoesText(planned(), "where does 4 go")).toContain("Toss");
  });

  it("falls back to the rule when there is no plan yet", () => {
    expect(whereDoesText(session(), "where does the pen go?")).toMatch(/pen cup/i);
    expect(whereDoesText(session(), "where do cables go?")).toMatch(/charger/i);
    expect(whereDoesText(session(), "where does my mug go?")).toMatch(/storage bin/i);
  });

  it("asks which item when it can't tell", () => {
    expect(whereDoesText(session(), "where does this go?")).toMatch(/number from the photo/i);
  });

  it("says an item is unplanned rather than guessing", () => {
    const s = session({ phase: "interview", items: [item(5, "mug")] });
    expect(whereDoesText(s, "where does 5 go?")).toMatch(/haven't planned it yet/i);
  });
});

describe("findLabel", () => {
  it("matches singulars, plurals and multi-word labels", () => {
    expect(findLabel("where does the charger go")).toBe("charger");
    expect(findLabel("my keys")).toBe("keys");
    expect(findLabel("the water bottle")).toBe("water bottle");
    expect(findLabel("where does this go")).toBeUndefined();
  });
});
