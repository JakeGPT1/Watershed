-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "atsSlug" TEXT,
ADD COLUMN     "atsType" TEXT,
ADD COLUMN     "isGtmTarget" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Job" ADD COLUMN     "department" TEXT,
ADD COLUMN     "discoveredAt" TIMESTAMP(3),
ADD COLUMN     "externalId" TEXT,
ADD COLUMN     "isGtmOpportunity" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isLeadershipRole" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "postedAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "Job_externalId_key" ON "Job"("externalId");
