-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "icpBoost" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "GtmAudit" (
    "id" TEXT NOT NULL,
    "runAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "companiesTotal" INTEGER NOT NULL,
    "companiesResolved" INTEGER NOT NULL,
    "companiesUnknown" INTEGER NOT NULL,
    "recoveredThisRun" INTEGER NOT NULL,
    "promotedFromDb" INTEGER NOT NULL DEFAULT 0,
    "suggestedAdded" INTEGER NOT NULL DEFAULT 0,
    "opportunities" INTEGER NOT NULL,
    "winsLastWeek" INTEGER NOT NULL,
    "dismissalsLastWeek" INTEGER NOT NULL,
    "notes" TEXT,

    CONSTRAINT "GtmAudit_pkey" PRIMARY KEY ("id")
);
