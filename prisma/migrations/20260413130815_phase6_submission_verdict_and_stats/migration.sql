-- CreateEnum
CREATE TYPE "SubmissionVerdict" AS ENUM ('ACCEPTED', 'WRONG_ANSWER', 'TIMEOUT', 'RUNTIME_ERROR', 'COMPILE_ERROR');

-- AlterTable
ALTER TABLE "Submission" ADD COLUMN     "failedTests" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "passedTests" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "totalTests" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "verdict" "SubmissionVerdict";
