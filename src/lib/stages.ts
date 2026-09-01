/**
 * Canonical pipeline stages, in the order a candidate moves THROUGH them — the order the
 * stage dropdown offers and the order the client report prints. The project board renders a
 * different order (BOARD_STAGES, below). Also the source of truth for the labels themselves.
 */
export const STAGES = [
  "Pursuing",
  "Scheduling",
  "Screen",
  "Hiring Interview",
  "Case",
  "Offer",
  "Disqualified",
  "Not Interested",
] as const;

export type Stage = (typeof STAGES)[number];

/**
 * Terminal stages — the candidate is out of the running. "Not Interested" is the
 * candidate's call; "Disqualified" is ours (or the client's). Both are kept on the
 * project rather than removed, because the record is what backs a candidate-ownership
 * claim later. Rendered muted and last everywhere.
 */
export const INACTIVE_STAGES = ["Disqualified", "Not Interested"] as const;

export const isInactiveStage = (stage: string): boolean =>
  (INACTIVE_STAGES as readonly string[]).includes(stage);

/**
 * Board order for the project view: furthest-along stage first, so the candidates closest
 * to an offer are what you see when the page opens. Terminal stages sink to the bottom.
 * Same set as STAGES — only the order differs.
 */
export const BOARD_STAGES = [
  "Offer",
  "Case",
  "Hiring Interview",
  "Screen",
  "Scheduling",
  "Pursuing",
  ...INACTIVE_STAGES,
] as const satisfies readonly Stage[];

// Compile-time guarantee that the board renders every stage: a stage missing from
// BOARD_STAGES would silently hide its candidates, so make that a build error instead.
type _BoardCoversEveryStage = Exclude<Stage, (typeof BOARD_STAGES)[number]> extends never
  ? true
  : never;
const _boardCoversEveryStage: _BoardCoversEveryStage = true;
void _boardCoversEveryStage;
