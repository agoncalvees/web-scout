-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "SiteStatus" AS ENUM ('sem_site_alta_confianca', 'site_fora_do_ar', 'tem_site_ativo', 'checar_manualmente');

-- CreateEnum
CREATE TYPE "Porte" AS ENUM ('MEI', 'ME', 'EPP', 'sem_cnpj');

-- CreateEnum
CREATE TYPE "PricingTier" AS ENUM ('T450_650', 'T650_1200', 'T1200_MAIS');

-- CreateEnum
CREATE TYPE "KanbanStage" AS ENUM ('novo', 'contatado', 'respondido', 'fechado', 'perdido');

-- CreateTable
CREATE TABLE "Search" (
    "id" TEXT NOT NULL,
    "categoria" TEXT NOT NULL,
    "cidade" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lon" DOUBLE PRECISION NOT NULL,
    "raioKm" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Search_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lead" (
    "id" TEXT NOT NULL,
    "searchId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "address" TEXT,
    "phone" TEXT,
    "lat" DOUBLE PRECISION NOT NULL,
    "lon" DOUBLE PRECISION NOT NULL,
    "osmId" TEXT NOT NULL,
    "websiteRaw" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Enrichment" (
    "leadId" TEXT NOT NULL,
    "siteStatus" "SiteStatus",
    "siteUrl" TEXT,
    "siteConfidence" DOUBLE PRECISION,
    "siteCheckedAt" TIMESTAMP(3),
    "cnpj" TEXT,
    "porte" "Porte",
    "cnpjCheckedAt" TIMESTAMP(3),
    "pricingTier" "PricingTier",
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Enrichment_pkey" PRIMARY KEY ("leadId")
);

-- CreateTable
CREATE TABLE "CnpjCache" (
    "cnpj" TEXT NOT NULL,
    "razaoSocial" TEXT,
    "nomeFantasia" TEXT,
    "porte" "Porte" NOT NULL,
    "municipio" TEXT,
    "uf" TEXT,
    "raw" JSONB NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CnpjCache_pkey" PRIMARY KEY ("cnpj")
);

-- CreateTable
CREATE TABLE "KanbanStatus" (
    "leadId" TEXT NOT NULL,
    "stage" "KanbanStage" NOT NULL DEFAULT 'novo',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KanbanStatus_pkey" PRIMARY KEY ("leadId")
);

-- CreateIndex
CREATE INDEX "Search_createdAt_idx" ON "Search"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Lead_osmId_key" ON "Lead"("osmId");

-- CreateIndex
CREATE INDEX "Lead_searchId_idx" ON "Lead"("searchId");

-- CreateIndex
CREATE INDEX "Enrichment_siteStatus_idx" ON "Enrichment"("siteStatus");

-- CreateIndex
CREATE INDEX "Enrichment_siteCheckedAt_idx" ON "Enrichment"("siteCheckedAt");

-- CreateIndex
CREATE INDEX "KanbanStatus_stage_idx" ON "KanbanStatus"("stage");

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_searchId_fkey" FOREIGN KEY ("searchId") REFERENCES "Search"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Enrichment" ADD CONSTRAINT "Enrichment_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KanbanStatus" ADD CONSTRAINT "KanbanStatus_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;
