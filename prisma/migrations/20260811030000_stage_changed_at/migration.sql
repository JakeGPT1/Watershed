-- Per-stage timestamp for the client report ("Client Interviewed on X" etc.).
-- Backfill existing rows from addedAt — the honest best estimate for rows whose
-- stage history was never tracked.
ALTER TABLE "ProjectCandidate" ADD COLUMN "stageChangedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
UPDATE "ProjectCandidate" SET "stageChangedAt" = "addedAt";
