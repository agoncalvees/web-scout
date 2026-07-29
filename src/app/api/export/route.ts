import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import {
  KanbanStage,
  PricingTier,
  SiteStatus,
} from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";
import { categoriaPorValorOsm, labelCategoria } from "@/lib/categorias";
import { prisma } from "@/lib/db";
import { ESTAGIO_LABEL } from "@/lib/kanban";
import { SITE_STATUS_LABEL } from "@/lib/labels";
import { PORTE_LABEL, TIER_LABEL } from "@/lib/pricing";
import {
  motivosDoScore,
  PRIORIDADE_LABEL,
  prioridadePorScore,
} from "@/lib/scoring";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function parseEnum<T extends Record<string, string>>(
  valores: T,
  bruto: string | null,
): T[keyof T] | undefined {
  if (!bruto) return undefined;
  return Object.values(valores).includes(bruto)
    ? (bruto as T[keyof T])
    : undefined;
}

function montarWhere(request: NextRequest): Prisma.LeadWhereInput {
  const searchId = request.nextUrl.searchParams.get("busca") || undefined;
  const site = parseEnum(
    SiteStatus,
    request.nextUrl.searchParams.get("site"),
  );
  const tier = parseEnum(
    PricingTier,
    request.nextUrl.searchParams.get("tier"),
  );
  const enrichment: Prisma.EnrichmentWhereInput = {};
  if (site) enrichment.siteStatus = site;
  if (tier) enrichment.pricingTier = tier;
  const prioridade = request.nextUrl.searchParams.get("prioridade");
  if (prioridade === "quente") enrichment.opportunityScore = { gte: 70 };
  if (prioridade === "morno") {
    enrichment.opportunityScore = { gte: 40, lt: 70 };
  }
  if (prioridade === "frio") enrichment.opportunityScore = { lt: 40 };
  const contato = request.nextUrl.searchParams.get("contato");

  return {
    ...(searchId ? { searchId } : {}),
    ...(contato === "whatsapp" ? { phone: { not: null } } : {}),
    ...(contato === "instagram" ? { instagram: { not: null } } : {}),
    ...(contato === "email" ? { email: { not: null } } : {}),
    ...(site || tier || prioridade ? { enrichment } : {}),
  };
}

function nomeArquivo(formato: "csv" | "xlsx"): string {
  const data = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
  }).format(new Date());
  return `leads-${data}.${formato}`;
}

/**
 * Campos vindos do OSM não podem virar fórmulas quando o CSV é aberto no
 * Excel. O apóstrofo força texto e é interpretado pela planilha como prefixo,
 * não como parte visível do valor.
 */
function celulaSegura(valor: string): string {
  return /^[=+\-@\t\r]/.test(valor) ? `'${valor}` : valor;
}

export async function GET(request: NextRequest) {
  const formato =
    request.nextUrl.searchParams.get("formato") === "csv" ? "csv" : "xlsx";

  const leads = await prisma.lead.findMany({
    where: montarWhere(request),
    orderBy: { name: "asc" },
    select: {
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
      websiteRaw: true,
      search: { select: { categoria: true } },
      enrichment: {
        select: {
          siteStatus: true,
          siteUrl: true,
          cnpj: true,
          porte: true,
          pricingTier: true,
          opportunityScore: true,
          opportunityReasons: true,
        },
      },
      kanbanStatus: { select: { stage: true } },
    },
  });

  const linhas = leads.map((lead) => {
    const categoria =
      categoriaPorValorOsm(lead.category) ?? lead.search.categoria;
    const enrichment = lead.enrichment;
    const estagio = lead.kanbanStatus?.stage ?? KanbanStage.novo;

    return {
      Nome: celulaSegura(lead.name),
      Categoria: labelCategoria(categoria),
      Endereço: celulaSegura(lead.address ?? ""),
      Telefone: celulaSegura(lead.phone ?? ""),
      Email: celulaSegura(lead.email ?? ""),
      Instagram: celulaSegura(lead.instagram ?? ""),
      Facebook: celulaSegura(lead.facebook ?? ""),
      "Horário": celulaSegura(lead.openingHours ?? ""),
      "Rede/franquia": celulaSegura(lead.brand ?? lead.operator ?? ""),
      Prioridade:
        typeof enrichment?.opportunityScore === "number"
          ? PRIORIDADE_LABEL[prioridadePorScore(enrichment.opportunityScore)]
          : "",
      Score: enrichment?.opportunityScore ?? "",
      "Motivos do score": celulaSegura(
        motivosDoScore(enrichment?.opportunityReasons).join(" · "),
      ),
      "Status do site": enrichment?.siteStatus
        ? SITE_STATUS_LABEL[enrichment.siteStatus]
        : "Na fila",
      "URL do site": celulaSegura(
        enrichment?.siteUrl ?? lead.websiteRaw ?? "",
      ),
      CNPJ: celulaSegura(enrichment?.cnpj ?? ""),
      Porte: enrichment?.porte ? PORTE_LABEL[enrichment.porte] : "",
      "Faixa de preço": enrichment?.pricingTier
        ? TIER_LABEL[enrichment.pricingTier]
        : "",
      "Estágio do Kanban": ESTAGIO_LABEL[estagio],
    };
  });

  // SheetJS é usado somente para geração. Esta rota não aceita upload nem lê
  // conteúdo de planilhas de terceiros.
  const planilha = XLSX.utils.json_to_sheet(linhas, {
    header: [
      "Nome",
      "Categoria",
      "Endereço",
      "Telefone",
      "Email",
      "Instagram",
      "Facebook",
      "Horário",
      "Rede/franquia",
      "Prioridade",
      "Score",
      "Motivos do score",
      "Status do site",
      "URL do site",
      "CNPJ",
      "Porte",
      "Faixa de preço",
      "Estágio do Kanban",
    ],
  });
  planilha["!cols"] = [
    { wch: 32 },
    { wch: 24 },
    { wch: 42 },
    { wch: 17 },
    { wch: 28 },
    { wch: 34 },
    { wch: 34 },
    { wch: 28 },
    { wch: 24 },
    { wch: 14 },
    { wch: 10 },
    { wch: 54 },
    { wch: 24 },
    { wch: 36 },
    { wch: 18 },
    { wch: 14 },
    { wch: 18 },
    { wch: 20 },
  ];

  const headers = {
    "Content-Disposition": `attachment; filename="${nomeArquivo(formato)}"`,
    "Cache-Control": "no-store",
  };

  if (formato === "csv") {
    const csv = `\uFEFF${XLSX.utils.sheet_to_csv(planilha, { FS: ";" })}`;
    return new NextResponse(csv, {
      headers: {
        ...headers,
        "Content-Type": "text/csv; charset=utf-8",
      },
    });
  }

  const pasta = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(pasta, planilha, "Leads");
  const arquivo = XLSX.write(pasta, {
    type: "buffer",
    bookType: "xlsx",
    compression: true,
  });

  return new NextResponse(arquivo, {
    headers: {
      ...headers,
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    },
  });
}
