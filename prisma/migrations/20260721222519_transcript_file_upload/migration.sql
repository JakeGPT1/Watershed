-- AlterTable
ALTER TABLE "Transcript" ADD COLUMN     "fileName" TEXT,
ADD COLUMN     "fileUrl" TEXT,
ALTER COLUMN "rawText" DROP NOT NULL;
