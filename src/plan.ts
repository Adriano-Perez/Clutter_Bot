import type { Zone } from "./types.js";

export type ZoneRef = Pick<Zone, "id" | "label">;

// Pseudo-zones every plan can use alongside the zones detected in the photo.
export const DESK: ZoneRef = { id: "desk", label: "desk" };
export const TOSS: ZoneRef = { id: "toss", label: "toss" };
export const OFF_DESK: ZoneRef = { id: "off-desk", label: "off the desk" };
export const PSEUDO_ZONES: readonly ZoneRef[] = [DESK, TOSS, OFF_DESK];

// How each destination reads in a message. Detected zones keep their letter, so "B pen cup"
// matches the letter drawn on the overlay.
const PSEUDO_HEADINGS: Record<string, string> = {
  [DESK.id]: "Stays on your desk",
  [TOSS.id]: "Toss",
  [OFF_DESK.id]: "Off the desk",
};

/** "B pen cup" for a detected zone, "Toss" for a pseudo-zone, the raw id if neither is known. */
export function zoneName(zones: readonly ZoneRef[], id: string): string {
  const zone = zones.find((z) => z.id === id);
  if (zone) return `${zone.id} ${zone.label}`;
  return PSEUDO_HEADINGS[id] ?? id;
}
