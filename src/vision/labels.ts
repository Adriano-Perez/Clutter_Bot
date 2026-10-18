// Shared item vocabulary (FR-DET-02). Keeps labels consistent across before/after photos.
// "power adapter", "earbuds" and "receipt" are synonyms that cleanDetections maps to canonical labels,
// as are "food wrapper", "chip bag", "soda can", "tissue" (→ "trash"), "clothing" (→ "clothes") and
// "eyeglasses" (→ "glasses").
// Concrete nouns detect far better than an abstract word like "trash", so ask for those and merge after.
export const LABEL_VOCAB = [
  "charger",
  "power adapter",
  "power bank",
  "cable",
  "phone",
  "notebook",
  "pen",
  "mug",
  "headphones",
  "earbuds",
  "paper",
  "receipt",
  "keys",
  "wallet",
  "calculator",
  "sticky note",
  // "glasses" would also match a drinking glass, so ask for the unambiguous word and merge after.
  "eyeglasses",
  "water bottle",
  "snack",
  "laptop",
  "backpack",
  "clothing",
  "shoes",
  "book",
  "pillow",
  "blanket",
  "plate",
  "bowl",
  "toy horse",
  "toy figurine",
  "doll",
  "toy car",
  "stuffed animal",
  "board game",
  "food wrapper",
  "chip bag",
  "soda can",
  "tissue",
] as const;

export type Label = (typeof LABEL_VOCAB)[number];

// The labels that actually reach a session, i.e. what survives cleanDetections: every vocabulary
// entry that isn't a synonym, plus the canonical names the synonyms map to. Used to recognise the
// item in "where does the charger go?". A test in cleanup.test.ts keeps this in step with SYNONYMS.
export const CANONICAL_LABELS = [
  "charger",
  "power bank",
  "cable",
  "phone",
  "notebook",
  "pen",
  "mug",
  "headphones",
  "paper",
  "keys",
  "wallet",
  "calculator",
  "sticky note",
  "glasses",
  "water bottle",
  "snack",
  "laptop",
  "backpack",
  "clothes",
  "shoes",
  "book",
  "pillow",
  "blanket",
  "plate",
  "bowl",
  "toy",
  "stuffed animal",
  "board game",
  "trash",
] as const;

export type CanonicalLabel = (typeof CANONICAL_LABELS)[number];

// FR-DET-03: storage-zone categories for /v1/detect. No "mug" here: a mug is always an item.
// Ordered most specific first, since an earlier category wins when two zone boxes overlap.
// Covers a whole room, not just a desk: a closet and a laundry basket are storage too.
export const ZONE_CATEGORIES = [
  "closet",
  "dresser",
  "laundry basket",
  "bookshelf",
  "shelf",
  "nightstand",
  "toy box",
  "storage basket",
  "storage bin",
  "box",
  "pen cup",
  "drawer",
  "cup",
  "tray",
] as const;

// Unused since zones moved to /v1/detect boxes; kept for annotate() experiments.
export const ZONE_PROMPT =
  "Outline every place in this photo where things can be put away or kept: bins, boxes, drawers, trays, shelves, cups or holders, and the open desk surface. Give each a short name as the mention, like left bin, right bin, pen cup, open desk area.";
