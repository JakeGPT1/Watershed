-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "fundingBasis" TEXT,
ADD COLUMN     "fundingCheckedAt" TIMESTAMP(3),
ADD COLUMN     "fundingStage" TEXT;

-- DropTable
DROP TABLE "FundingCache";
