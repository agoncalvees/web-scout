-- AlterTable
ALTER TABLE "Lead"
ADD COLUMN "brand" TEXT,
ADD COLUMN "operator" TEXT;

-- AlterTable
ALTER TABLE "Enrichment"
ADD COLUMN "opportunityBreakdown" JSONB,
ADD COLUMN "scoreVersion" TEXT;

-- AlterEnum
ALTER TYPE "KanbanStage" ADD VALUE 'negociando' AFTER 'respondido';
