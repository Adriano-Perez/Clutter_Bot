// Shared item vocabulary (FR-DET-02). Keeps labels consistent across before/after photos.
// "power adapter", "earbuds" and "receipt" are synonyms that cleanDetections maps to canonical labels.
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
  "book",
  "keys",
  "wallet",
  "water bottle",
  "snack",
  "laptop",
] as const;

export type Label = (typeof LABEL_VOCAB)[number];

// FR-DET-03: prompt for storage-zone polygons via chat-completions annotations.
export const ZONE_PROMPT =
  "Outline every place in this photo where things can be put away or kept: bins, boxes, drawers, trays, shelves, cups or holders, and the open desk surface. Give each a short name as the mention, like left bin, right bin, pen cup, open desk area.";
