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
