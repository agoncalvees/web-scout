import { Porte, SiteStatus } from "@/generated/prisma/enums";
import { categoriaPorValorOsm } from "@/lib/categorias";
import { prisma } from "@/lib/db";
import { mapComLimite } from "@/lib/pool";
import { calcularTier } from "@/lib/pricing";
import { pontuarOportunidade, SCORE_VERSION } from "@/lib/scoring";
import { resolverCnpj } from "./cnpj";
import {
  enriquecerSite,
  versaoVerificacaoSiteAtual,
} from "./site";

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

/** Requer chamadas externas de site; muda quando a integração Google é ativada. */
function pendenteEnrichment() {
  const versao = versaoVerificacaoSiteAtual();
  return {
    OR: [
      { enrichment: null },
      { enrichment: { siteCheckedAt: null } },
      { enrichment: { siteCheckVersion: null } },
      { enrichment: { siteCheckVersion: { not: versao } } },
    ],
  };
}

/** Requer enrichment externo ou apenas recálculo local do score. */
function pendente() {
  return {
    OR: [
      ...pendenteEnrichment().OR,
      { enrichment: { scoreVersion: null } },
      { enrichment: { scoreVersion: { not: SCORE_VERSION } } },
    ],
  };
}

/** Conta quantos leads da busca ainda não passaram pelo enrichment. */
export function contarPendentes(searchId: string): Promise<number> {
  return prisma.lead.count({ where: { searchId, ...pendente() } });
}

interface ResultadoLead {
  siteStatus: SiteStatus;
  siteUrl: string | null;
  siteConfidence: number;
  googlePlaceId?: string | null;
  googleCheckedAt?: Date | null;
  cnpj: string | null;
  /** `sem_cnpj` se não achamos CNPJ; `null` se achamos mas a Receita não informa o porte. */
  porte: Porte | null;
}

interface LeadParaScore {
  id: string;
  category: string;
  phone: string | null;
  email: string | null;
  instagram: string | null;
  facebook: string | null;
  address: string | null;
  openingHours: string | null;
  brand: string | null;
  operator: string | null;
  lat: number;
  lon: number;
  enrichment: {
    siteStatus: SiteStatus | null;
    porte: Porte | null;
  } | null;
}

function distanciaKm(
  a: Pick<LeadParaScore, "lat" | "lon">,
  b: Pick<LeadParaScore, "lat" | "lon">,
): number {
  const rad = (graus: number) => (graus * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const lat1 = rad(a.lat);
  const lat2 = rad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  const hSeguro = Math.max(0, Math.min(1, h));
  return 6371 * 2 * Math.atan2(Math.sqrt(hSeguro), Math.sqrt(1 - hSeguro));
}

function categoriaEfetiva(category: string, categoriaBusca: string): string {
  return categoriaPorValorOsm(category) ?? categoriaBusca;
}

function calcularGapCompetitivo(
  lead: LeadParaScore,
  universo: readonly LeadParaScore[],
  categoriaBusca: string,
): number | null {
  const categoria = categoriaEfetiva(lead.category, categoriaBusca);
  const vizinhos = universo.filter(
    (outro) =>
      outro.id !== lead.id &&
      outro.enrichment?.siteStatus != null &&
      categoriaEfetiva(outro.category, categoriaBusca) === categoria &&
      distanciaKm(lead, outro) <= 1,
  );

  // Amostras muito pequenas geram um percentual enganoso.
  if (vizinhos.length < 3) return null;
  const comSite = vizinhos.filter(
    (outro) => outro.enrichment?.siteStatus === SiteStatus.tem_site_ativo,
  ).length;
  return comSite / vizinhos.length;
}

async function recalcularScoresDaBusca(
  searchId: string,
  categoriaBusca: string,
): Promise<void> {
  const leads: LeadParaScore[] = await prisma.lead.findMany({
    where: { searchId },
    select: {
      id: true,
      category: true,
      phone: true,
      email: true,
      instagram: true,
      facebook: true,
      address: true,
      openingHours: true,
      brand: true,
      operator: true,
      lat: true,
      lon: true,
      enrichment: { select: { siteStatus: true, porte: true } },
    },
  });

  const atualizacoes = leads.flatMap((lead) => {
    const siteStatus = lead.enrichment?.siteStatus;
    if (!siteStatus) return [];

    const oportunidade = pontuarOportunidade({
      siteStatus,
      telefone: lead.phone,
      email: lead.email,
      instagram: lead.instagram,
      facebook: lead.facebook,
      endereco: lead.address,
      horario: lead.openingHours,
      categoria: categoriaEfetiva(lead.category, categoriaBusca),
      porte: lead.enrichment?.porte,
      brand: lead.brand,
      operator: lead.operator,
      gapCompetitivo: calcularGapCompetitivo(lead, leads, categoriaBusca),
    });

    return [
      prisma.enrichment.update({
        where: { leadId: lead.id },
        data: {
          opportunityScore: oportunidade.score,
          opportunityReasons: oportunidade.motivos,
          opportunityBreakdown: oportunidade.breakdown,
          scoreVersion: SCORE_VERSION,
        },
      }),
    ];
  });

  // Evita uma transação com centenas de statements em buscas regionais.
  for (let i = 0; i < atualizacoes.length; i += 100) {
    await prisma.$transaction(atualizacoes.slice(i, i + 100));
  }
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
    select: { categoria: true, cidade: true },
  });
  if (!busca) throw new Error(`Busca ${searchId} não encontrada.`);

  const filtroEnrichment = pendenteEnrichment();
  const pendentes = await prisma.lead.findMany({
    where: { searchId, ...filtroEnrichment },
    select: {
      id: true,
      name: true,
      category: true,
      websiteRaw: true,
      cnpjRaw: true,
      phone: true,
      email: true,
      instagram: true,
      facebook: true,
      address: true,
      openingHours: true,
      brand: true,
      operator: true,
      lat: true,
      lon: true,
      enrichment: {
        select: {
          cnpj: true,
          porte: true,
          cnpjCheckedAt: true,
        },
      },
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

  // Uma troca de pesos não deve repetir requests de site e CNPJ. Quando os
  // dados externos já existem, recalculamos todos os scores somente no banco.
  if (pendentes.length === 0) {
    const desatualizados = await contarPendentes(searchId);
    if (desatualizados > 0) {
      try {
        await recalcularScoresDaBusca(searchId, busca.categoria);
      } catch (erro) {
        await prisma.enrichment.updateMany({
          where: { lead: { searchId } },
          data: { scoreVersion: null },
        });
        throw erro;
      }
    }

    return {
      processados: desatualizados,
      restantes: await contarPendentes(searchId),
      porStatus,
      cnpjResolvidos: 0,
    };
  }

  const { resultados } = await mapComLimite<(typeof pendentes)[number], ResultadoLead>(
    pendentes,
    CONCORRENCIA,
    prazoEm,
    async (lead) => {
      const site = await enriquecerSite({
        ...lead,
        cidade: busca.cidade,
      }).catch(() => ({
        // Uma falha inesperada não pode travar o lote; o lead fica pra revisão
        // manual em vez de voltar pra fila e falhar de novo indefinidamente.
        siteStatus: SiteStatus.checar_manualmente,
        siteUrl: lead.websiteRaw,
        siteConfidence: 0,
      }));

      // A tag de CNPJ existe em ~1% dos POIs; quando falta, nem chamamos a API.
      const cnpjAnterior = lead.enrichment?.cnpjCheckedAt
        ? {
            cnpj: lead.enrichment.cnpj,
            porte: lead.enrichment.porte,
          }
        : null;
      const cnpj =
        cnpjAnterior ??
        (lead.cnpjRaw
          ? await resolverCnpj(lead.cnpjRaw).catch(() => null)
          : null);

      return {
        ...site,
        cnpj: cnpj?.cnpj ?? null,
        porte: cnpj ? cnpj.porte : Porte.sem_cnpj,
      };
    },
  );

  const agora = new Date();
  const siteCheckVersion = versaoVerificacaoSiteAtual();
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
        siteCheckVersion,
        ...(r.googlePlaceId !== undefined
          ? { googlePlaceId: r.googlePlaceId }
          : {}),
        ...(r.googleCheckedAt !== undefined
          ? { googleCheckedAt: r.googleCheckedAt }
          : {}),
        cnpj: r.cnpj,
        porte: r.porte,
        cnpjCheckedAt: agora,
        pricingTier: calcularTier(
          r.porte,
          categoriaPorValorOsm(lead.category) ?? busca.categoria,
        ),
        ...(() => {
          const oportunidade = pontuarOportunidade({
            siteStatus: r.siteStatus,
            telefone: lead.phone,
            email: lead.email,
            instagram: lead.instagram,
            facebook: lead.facebook,
            endereco: lead.address,
            horario: lead.openingHours,
            categoria:
              categoriaPorValorOsm(lead.category) ?? busca.categoria,
            porte: r.porte,
            brand: lead.brand,
            operator: lead.operator,
          });
          return {
            opportunityScore: oportunidade.score,
            opportunityReasons: oportunidade.motivos,
            opportunityBreakdown: oportunidade.breakdown,
            scoreVersion: SCORE_VERSION,
          };
        })(),
      };

      return prisma.enrichment.upsert({
        where: { leadId: lead.id },
        create: { leadId: lead.id, ...dados },
        update: dados,
      });
    }),
  );

  const enriquecimentosRestantes = await prisma.lead.count({
    where: { searchId, ...pendenteEnrichment() },
  });
  let restantes: number;
  if (enriquecimentosRestantes === 0 && resultados.size > 0) {
    try {
      await recalcularScoresDaBusca(searchId, busca.categoria);
    } catch (erro) {
      // Se a consolidação falhar, a versão volta a null para o próximo clique
      // tentar novamente em vez de manter scores provisórios como definitivos.
      await prisma.enrichment.updateMany({
        where: { lead: { searchId } },
        data: { scoreVersion: null },
      });
      throw erro;
    }
    restantes = await contarPendentes(searchId);
  } else {
    restantes = await contarPendentes(searchId);
  }

  return {
    processados: resultados.size,
    restantes,
    porStatus,
    cnpjResolvidos,
  };
}
