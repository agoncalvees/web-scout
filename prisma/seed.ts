/**
 * Seed de demonstração — dados 100% fictícios.
 *
 * O repositório é público: nenhum lead, telefone ou CNPJ real entra aqui. Os
 * telefones usam o prefixo 5511 9xxxx com números da faixa reservada a ficção e
 * os domínios apontam para `example.com`/`invalid`, que nunca resolvem.
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client.js";
import { KanbanStage, Porte, PricingTier, SiteStatus } from "../src/generated/prisma/enums.js";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL não está definida.");

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

const CIDADE = "Cidade Exemplo, SP";

interface Fixture {
  name: string;
  category: string;
  address: string;
  phone: string;
  websiteRaw: string | null;
  siteStatus: SiteStatus;
  siteUrl: string | null;
  siteConfidence: number;
  porte: Porte;
  pricingTier: PricingTier;
  stage: KanbanStage;
}

const FIXTURES: Fixture[] = [
  {
    name: "Odontologia Sorriso Fictício",
    category: "dentist",
    address: "Rua das Fixtures, 100 - Centro",
    phone: "5511900000001",
    websiteRaw: null,
    siteStatus: SiteStatus.sem_site_alta_confianca,
    siteUrl: null,
    siteConfidence: 0.75,
    porte: Porte.MEI,
    pricingTier: PricingTier.T450_650,
    stage: KanbanStage.novo,
  },
  {
    name: "Clínica Demo Saúde",
    category: "clinic",
    address: "Av. dos Exemplos, 250 - Jardim Teste",
    phone: "5511900000002",
    websiteRaw: "https://instagram.com/clinicademosaude",
    siteStatus: SiteStatus.sem_site_alta_confianca,
    siteUrl: "https://instagram.com/clinicademosaude",
    siteConfidence: 0.85,
    porte: Porte.ME,
    pricingTier: PricingTier.T650_1200,
    stage: KanbanStage.contatado,
  },
  {
    name: "Salão Beleza Placeholder",
    category: "hairdresser",
    address: "Rua Amostra, 77 - Vila Mock",
    phone: "5511900000003",
    websiteRaw: "http://salaobelezaplaceholder.invalid",
    siteStatus: SiteStatus.site_fora_do_ar,
    siteUrl: "http://salaobelezaplaceholder.invalid",
    siteConfidence: 0.9,
    porte: Porte.sem_cnpj,
    pricingTier: PricingTier.T450_650,
    stage: KanbanStage.respondido,
  },
  {
    name: "Advocacia Lorem & Ipsum",
    category: "lawyer",
    address: "Praça Stub, 12 - Centro",
    phone: "5511900000004",
    websiteRaw: "https://example.com",
    siteStatus: SiteStatus.tem_site_ativo,
    siteUrl: "https://example.com",
    siteConfidence: 1,
    porte: Porte.EPP,
    pricingTier: PricingTier.T1200_MAIS,
    stage: KanbanStage.perdido,
  },
  {
    name: "Massoterapia Dummy",
    category: "massage",
    address: "Rua Sample, 909",
    phone: "5511900000005",
    websiteRaw: null,
    siteStatus: SiteStatus.checar_manualmente,
    siteUrl: null,
    siteConfidence: 0.2,
    porte: Porte.MEI,
    pricingTier: PricingTier.T450_650,
    stage: KanbanStage.novo,
  },
];

async function main() {
  // O seed é idempotente: apagar a busca de demo cascateia nos leads e no resto.
  await prisma.search.deleteMany({ where: { cidade: CIDADE } });

  const search = await prisma.search.create({
    data: {
      categoria: "odontologia",
      cidade: CIDADE,
      lat: -23.5,
      lon: -47.45,
      raioKm: 10,
    },
  });

  for (const [i, fx] of FIXTURES.entries()) {
    await prisma.lead.create({
      data: {
        searchId: search.id,
        name: fx.name,
        category: fx.category,
        address: fx.address,
        phone: fx.phone,
        lat: -23.5 + i * 0.01,
        lon: -47.45 + i * 0.01,
        osmId: `node/900000${i}`,
        websiteRaw: fx.websiteRaw,
        enrichment: {
          create: {
            siteStatus: fx.siteStatus,
            siteUrl: fx.siteUrl,
            siteConfidence: fx.siteConfidence,
            siteCheckedAt: new Date(),
            porte: fx.porte,
            cnpjCheckedAt: new Date(),
            pricingTier: fx.pricingTier,
          },
        },
        kanbanStatus: { create: { stage: fx.stage } },
      },
    });
  }

  console.log(`Seed pronto: busca ${search.id} com ${FIXTURES.length} leads fake.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
