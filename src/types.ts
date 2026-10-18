export type EvidenceState = "seen" | "claimed" | "verified" | "not_visible" | "still_here";

export interface Item {
  id: number;                 // 1-based, matches the number drawn on the overlay
  label: string;              // from LABEL_VOCAB, e.g. "phone charger"
  box: [number, number, number, number];   // x1,y1,x2,y2 in pixels of the normalized photo
  destinationZoneId?: string;
  reason?: string;
  usage?: "daily" | "sometimes" | "rarely";
  discard?: boolean;
  evidence: { state: EvidenceState; at: string; source: "photo" | "user_text" | "voice" }[];
}

export interface Zone {
  id: string;
  label: string;
  polygon: [number, number][];  // for box zones, the box's 4 corners
  box?: [number, number, number, number];  // x1,y1,x2,y2 when the zone came from /v1/detect
  full?: boolean;
}

export interface Step { n: number; itemId: number; instruction: string; done: boolean; }

export interface Session {
  id: string;                  // short slug used in /s/:id
  userHandle: string;          // iMessage sender, normalized E.164 or Apple ID email
  phase: "awaiting_photo" | "interview" | "planned" | "guiding" | "verifying" | "complete";
  beforePhoto?: string; afterPhotos: string[];
  preStored?: { label: string; box: [number, number, number, number] }[];  // already in a bin in the before photo
  items: Item[]; zones: Zone[];
  interview: { q: string; a?: string }[];
  steps: Step[]; previewImage?: string;
  verificationSummary?: string;
  createdAt: string; updatedAt: string;
}
