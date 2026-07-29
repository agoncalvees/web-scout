-- AlterTable
ALTER TABLE "Enrichment"
ADD COLUMN "siteCheckVersion" TEXT,
ADD COLUMN "googlePlaceId" TEXT,
ADD COLUMN "googleCheckedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "ExternalApiUsage" (
    "provider" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExternalApiUsage_pkey" PRIMARY KEY ("provider", "period")
);
