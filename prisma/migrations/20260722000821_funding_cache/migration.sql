-- CreateTable
CREATE TABLE "FundingCache" (
    "companyKey" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "confidence" TEXT NOT NULL,
    "basis" TEXT NOT NULL,
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FundingCache_pkey" PRIMARY KEY ("companyKey")
);
