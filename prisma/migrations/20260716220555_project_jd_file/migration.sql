-- DropIndex
DROP INDEX "candidate_embedding_idx";

-- DropIndex
DROP INDEX "job_embedding_idx";

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "jdFileName" TEXT,
ADD COLUMN     "jdFileUrl" TEXT;
