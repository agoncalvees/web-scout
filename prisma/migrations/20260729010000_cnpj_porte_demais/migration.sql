-- AlterEnum
ALTER TYPE "Porte" ADD VALUE 'DEMAIS';

-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "cnpjRaw" TEXT;

-- AlterTable
ALTER TABLE "CnpjCache" ALTER COLUMN "porte" DROP NOT NULL;
