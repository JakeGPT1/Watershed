/** Canonical pipeline stages — the single source of truth for order and labels. */
export const STAGES = [
  "Pursuing",
  "Scheduling",
  "Screen",
  "Hiring Interview",
  "Offer",
  "Not Interested",
  "Disqualified",
] as const;

export type Stage = (typeof STAGES)[number];

/**
 * Terminal stages — the candidate is out of the running. "Not Interested" is the
 * candidate's call; "Disqualified" is ours (or the client's). Both are kept on the
 * project rather than removed, because the record is what backs a candidate-ownership
 * claim later. Rendered muted and last everywhere.
 */
export const INACTIVE_STAGES = ["Not Interested", "Disqualified"] as const;

export const isInactiveStage = (stage: string): boolean =>
  (INACTIVE_STAGES as readonly string[]).includes(stage);
