import { KanbanStage, PricingTier, SiteStatus } from "@/generated/prisma/enums";
import { prisma } from "@/lib/db";
import { ESTAGIOS } from "@/lib/kanban";
import type { Prioridade } from "@/lib/scoring";
import type { Prisma } from "@/generated/prisma/client";

/** Máximo de cards renderizados por coluna. */
export const CARDS_POR_COLUNA = 40;

/**
 * Teto de leads buscados por render. Uma coluna pode ter mais que isso — as
 * contagens vêm de agregações separadas, então o total continua exato mesmo
 * quando os cards estão truncados.
 */
const TETO_BUSCA = 600;

const SELECAO = {
  id: true,
  name: true,
  category: true,
  address: true,
  phone: true,
  email: true,
  instagram: true,
  facebook: true,
  openingHours: true,
  brand: true,
  operator: true,
  lat: true,
  lon: true,
  search: { select: { categoria: true } },
  enrichment: {
    select: {
      siteStatus: true,
      pricingTier: true,
      opportunityScore: true,
      opportunityReasons: true,
    },
  },
  kanbanStatus: { select: { stage: true } },
} satisfies Prisma.LeadSelect;

export type LeadDoKanban = Prisma.LeadGetPayload<{ select: typeof SELECAO }>;

export interface Filtros {
  searchId?: string;
  site?: SiteStatus;
  tier?: PricingTier;
  prioridade?: Prioridade;
  contato?: "whatsapp" | "instagram" | "email";
}

function montarWhere(f: Filtros): Prisma.LeadWhereInput {
  const enrichment: Prisma.EnrichmentWhereInput = {};
  if (f.site) enrichment.siteStatus = f.site;
  if (f.tier) enrichment.pricingTier = f.tier;
  if (f.prioridade === "quente") enrichment.opportunityScore = { gte: 70 };
  if (f.prioridade === "morno") {
    enrichment.opportunityScore = { gte: 40, lt: 70 };
  }
  if (f.prioridade === "frio") enrichment.opportunityScore = { lt: 40 };
  if (!f.site && (f.tier || f.prioridade)) {
    enrichment.siteStatus = { not: SiteStatus.tem_site_ativo };
  }

  const precisaEnrichment = Boolean(f.site || f.tier || f.prioridade);

  return {
    ...(f.searchId ? { searchId: f.searchId } : {}),
    ...(f.contato === "whatsapp" ? { phone: { not: null } } : {}),
    ...(f.contato === "instagram" ? { instagram: { not: null } } : {}),
    ...(f.contato === "email" ? { email: { not: null } } : {}),
    // Por padrão o funil mostra oportunidades e pendentes, não empresas cujo
    // site ativo já foi confirmado. O filtro explícito de site pode exibi-las.
    ...(precisaEnrichment
      ? { enrichment }
      : {
          OR: [
            { enrichment: null },
            {
              enrichment: {
                siteStatus: { not: SiteStatus.tem_site_ativo },
              },
            },
          ],
        }),
  };
}

export interface Coluna {
  stage: KanbanStage;
  total: number;
  leads: LeadDoKanban[];
}

/**
 * Monta as colunas do board em 3 queries.
 *
 * Uma query por coluna (5) mais uma contagem por coluna (10 no total) estourava
 * o pool de conexões — caro em qualquer caso, e fatal em serverless. Aqui são
 * duas agregações para os totais e um `findMany` único cujo resultado é
 * agrupado em memória.
 *
 * Lead sem registro em `KanbanStatus` conta como `novo`: o registro só nasce
 * quando o lead é movido pela primeira vez, e criar um para cada lead
 * descoberto seria escrita à toa.
 */
export async function carregarColunas(f: Filtros): Promise<Coluna[]> {
  const where = montarWhere(f);

  const [porEstagio, novosImplicitos, leads] = await Promise.all([
    prisma.kanbanStatus.groupBy({
      by: ["stage"],
      where: { lead: where },
      _count: { _all: true },
    }),
    prisma.lead.count({ where: { ...where, kanbanStatus: null } }),
    prisma.lead.findMany({
      where,
      select: SELECAO,
      orderBy: { name: "asc" },
      take: TETO_BUSCA,
    }),
  ]);

  const totais = new Map<KanbanStage, number>(
    porEstagio.map((g) => [g.stage, g._count._all]),
  );
  totais.set(
    KanbanStage.novo,
    (totais.get(KanbanStage.novo) ?? 0) + novosImplicitos,
  );

  const agrupados = new Map<KanbanStage, LeadDoKanban[]>(
    ESTAGIOS.map((s) => [s, []]),
  );
  leads.sort(
    (a, b) =>
      (b.enrichment?.opportunityScore ?? -1) -
        (a.enrichment?.opportunityScore ?? -1) ||
      a.name.localeCompare(b.name, "pt-BR"),
  );

  for (const lead of leads) {
    agrupados.get(lead.kanbanStatus?.stage ?? KanbanStage.novo)!.push(lead);
  }

  return ESTAGIOS.map((stage) => ({
    stage,
    total: totais.get(stage) ?? 0,
    leads: agrupados.get(stage)!.slice(0, CARDS_POR_COLUNA),
  }));
}
