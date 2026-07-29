import { Porte, SiteStatus } from "@/generated/prisma/enums";
import { categoriaPorValorOsm } from "@/lib/categorias";
import { prisma } from "@/lib/db";
import { mapComLimite } from "@/lib/pool";
import { calcularTier } from "@/lib/pricing";
import { resolverCnpj } from "./cnpj";
import { enriquecerSite } from "./site";

/** Leads por chamada. ~30 cabe no orçamento de tempo com folga. */
export const TAMANHO_LOTE = 30;

/**
 * Checagens de site simultâneas. Cada lead bate em um host diferente, então não
 * há rate limit a respeitar aqui — o limite é só pra não abrir 30 sockets de uma
 * vez. A consulta de CNPJ tem seu próprio limitador serializado.
 */
const CONCORRENCIA = 8;

/**
 * Orçamento de tempo do lote. A função serverless morre em 300s; paramos bem
 * antes pra sobrar tempo de gravar no banco e responder.
 */
const ORCAMENTO_MS = 200_000;

export interface LoteResultado {
  processados: number;
  /** Leads da busca ainda sem enrichment de site depois deste lote. */
  restantes: number;
  porStatus: Record<SiteStatus, number>;
  /** Quantos leads deste lote tiveram CNPJ confirmado na Receita. */
  cnpjResolvidos: number;
}

/** Filtro de leads que ainda não passaram pelo enrichment. */
const PENDENTE = {
  OR: [{ enrichment: null }, { enrichment: { siteCheckedAt: null } }],
};

/** Conta quantos leads da busca ainda não passaram pelo enrichment. */
export function contarPendentes(searchId: string): Promise<number> {
  return prisma.lead.count({ where: { searchId, ...PENDENTE } });
}

interface ResultadoLead {
  siteStatus: SiteStatus;
  siteUrl: string | null;
  siteConfidence: number;
  cnpj: string | null;
  /** `sem_cnpj` se não achamos CNPJ; `null` se achamos mas a Receita não informa o porte. */
  porte: Porte | null;
}

/**
 * Processa um lote de leads pendentes da busca: checagem de site + CNPJ.
 *
 * Idempotente e retomável: cada chamada pega os próximos pendentes, então o
 * cliente só precisa chamar em loop até `restantes` chegar a zero.
 */
export async function processarLote(searchId: string): Promise<LoteResultado> {
  const prazoEm = Date.now() + ORCAMENTO_MS;

  // Em buscas por todas as categorias, o fallback de preço vem do valor cru da
  // tag OSM de cada lead. A categoria da busca segue como fallback para fontes
  // que não entreguem um valor reconhecido.
  const busca = await prisma.search.findUnique({
    where: { id: searchId },
    select: { categoria: true },
  });
  if (!busca) throw new Error(`Busca ${searchId} não encontrada.`);

  const pendentes = await prisma.lead.findMany({
    where: { searchId, ...PENDENTE },
    select: {
      id: true,
      name: true,
      category: true,
      websiteRaw: true,
      cnpjRaw: true,
    },
    orderBy: { createdAt: "asc" },
    take: TAMANHO_LOTE,
  });

  const porStatus: Record<SiteStatus, number> = {
    [SiteStatus.sem_site_alta_confianca]: 0,
    [SiteStatus.site_fora_do_ar]: 0,
    [SiteStatus.tem_site_ativo]: 0,
    [SiteStatus.checar_manualmente]: 0,
  };

  const { resultados } = await mapComLimite<(typeof pendentes)[number], ResultadoLead>(
    pendentes,
    CONCORRENCIA,
    prazoEm,
    async (lead) => {
      const site = await enriquecerSite(lead).catch(() => ({
        // Uma falha inesperada não pode travar o lote; o lead fica pra revisão
        // manual em vez de voltar pra fila e falhar de novo indefinidamente.
        siteStatus: SiteStatus.checar_manualmente,
        siteUrl: lead.websiteRaw,
        siteConfidence: 0,
      }));

      // A tag de CNPJ existe em ~1% dos POIs; quando falta, nem chamamos a API.
      const cnpj = lead.cnpjRaw
        ? await resolverCnpj(lead.cnpjRaw).catch(() => null)
        : null;

      return {
        ...site,
        cnpj: cnpj?.cnpj ?? null,
        porte: cnpj ? cnpj.porte : Porte.sem_cnpj,
      };
    },
  );

  const agora = new Date();
  let cnpjResolvidos = 0;

  await prisma.$transaction(
    Array.from(resultados, ([lead, r]) => {
      porStatus[r.siteStatus]++;
      if (r.cnpj) cnpjResolvidos++;

      const dados = {
        siteStatus: r.siteStatus,
        siteUrl: r.siteUrl,
        siteConfidence: r.siteConfidence,
        siteCheckedAt: agora,
        cnpj: r.cnpj,
        porte: r.porte,
        cnpjCheckedAt: agora,
        pricingTier: calcularTier(
          r.porte,
          categoriaPorValorOsm(lead.category) ?? busca.categoria,
        ),
      };

      return prisma.enrichment.upsert({
        where: { leadId: lead.id },
        create: { leadId: lead.id, ...dados },
        update: dados,
      });
    }),
  );

  return {
    processados: resultados.size,
    restantes: await contarPendentes(searchId),
    porStatus,
    cnpjResolvidos,
  };
}
