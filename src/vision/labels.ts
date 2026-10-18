// Shared item vocabulary (FR-DET-02). Keeps labels consistent across before/after photos.
export const LABEL_VOCAB = [
  "phone charger",
  "cable",
  "phone",
  "notebook",
  "pen",
  "mug",
  "headphones",
  "paper",
  "book",
  "keys",
  "wallet",
  "water bottle",
  "snack",
  "laptop",
] as const;

export type Label = (typeof LABEL_VOCAB)[number];
