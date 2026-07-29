-- AlterTable
ALTER TABLE "Lead"
ADD COLUMN "email" TEXT,
ADD COLUMN "instagram" TEXT,
ADD COLUMN "facebook" TEXT,
ADD COLUMN "openingHours" TEXT;

-- AlterTable
ALTER TABLE "Enrichment"
ADD COLUMN "opportunityScore" INTEGER,
ADD COLUMN "opportunityReasons" JSONB;

-- CreateIndex
CREATE INDEX "Enrichment_opportunityScore_idx" ON "Enrichment"("opportunityScore");

-- A mesma empresa pode pertencer a buscas diferentes. A deduplicação deve ser
-- por busca, não global, senão uma segunda busca parece vazia.
DROP INDEX "Lead_osmId_key";
CREATE UNIQUE INDEX "Lead_searchId_osmId_key" ON "Lead"("searchId", "osmId");
