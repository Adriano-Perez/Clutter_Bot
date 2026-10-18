// Shared item vocabulary (FR-DET-02). Keeps labels consistent across before/after photos.
// "power adapter", "earbuds" and "receipt" are synonyms that cleanDetections maps to canonical labels,
// as are "food wrapper", "chip bag", "soda can", "tissue" (→ "trash") and "clothing" (→ "clothes").
// Concrete nouns detect far better than an abstract word like "trash", so ask for those and merge after.
export const LABEL_VOCAB = [
  "charger",
  "power adapter",
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
  "water bottle",
  "snack",
  "laptop",
  "backpack",
  "clothing",
  "food wrapper",
  "chip bag",
  "soda can",
  "tissue",
] as const;

export type Label = (typeof LABEL_VOCAB)[number];

// FR-DET-03: storage-zone categories for /v1/detect. No "mug" here: a mug is always an item.
export const ZONE_CATEGORIES = ["storage bin", "box", "pen cup", "cup", "drawer", "tray"] as const;

// Unused since zones moved to /v1/detect boxes; kept for annotate() experiments.
export const ZONE_PROMPT =
  "Outline every place in this photo where things can be put away or kept: bins, boxes, drawers, trays, shelves, cups or holders, and the open desk surface. Give each a short name as the mention, like left bin, right bin, pen cup, open desk area.";
