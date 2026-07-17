/** Canonical pipeline stages — the single source of truth for order and labels. */
export const STAGES = [
  "Pursuing",
  "Scheduling",
  "Screen",
  "Hiring Interview",
  "Offer",
  "Not Interested",
] as const;

export type Stage = (typeof STAGES)[number];
