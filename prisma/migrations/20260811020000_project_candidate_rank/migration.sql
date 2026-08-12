-- Manual ordering of candidates within a project stage.
ALTER TABLE "ProjectCandidate" ADD COLUMN     "rank" INTEGER NOT NULL DEFAULT 0;
