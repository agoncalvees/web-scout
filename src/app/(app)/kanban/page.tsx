import { PricingTier, SiteStatus } from "@/generated/prisma/enums";
import { prisma } from "@/lib/db";
import { ESTAGIO_CLASSE, ESTAGIO_LABEL } from "@/lib/kanban";
import type { Prioridade } from "@/lib/scoring";
import { carregarColunas, CARDS_POR_COLUNA, type Filtros } from "./dados";
import { FiltrosKanban } from "./filtros";
import { LeadCard } from "./lead-card";
import { ExportLinks } from "../export-links";

export const metadata = { title: "Kanban · Prospector" };
export const dynamic = "force-dynamic";

function parseEnum<T extends Record<string, string>>(
  valores: T,
  bruto: string | undefined,
): T[keyof T] | undefined {
  if (!bruto) return undefined;
  return Object.values(valores).includes(bruto)
    ? (bruto as T[keyof T])
    : undefined;
}

function parsePrioridade(valor: string | undefined): Prioridade | undefined {
  return valor === "quente" || valor === "morno" || valor === "frio"
    ? valor
    : undefined;
}

function parseContato(
  valor: string | undefined,
): Filtros["contato"] | undefined {
  return valor === "whatsapp" || valor === "instagram" || valor === "email"
    ? valor
    : undefined;
}

export default async function KanbanPage({
  searchParams,
}: {
  searchParams: Promise<{
    busca?: string;
    site?: string;
    tier?: string;
    prioridade?: string;
    contato?: string;
  }>;
}) {
  const params = await searchParams;
  const filtros: Filtros = {
    searchId: params.busca || undefined,
    site: parseEnum(SiteStatus, params.site),
    tier: parseEnum(PricingTier, params.tier),
    prioridade: parsePrioridade(params.prioridade),
    contato: parseContato(params.contato),
  };

  const [buscas, colunas] = await Promise.all([
    prisma.search.findMany({
      orderBy: { createdAt: "desc" },
      select: { id: true, categoria: true, cidade: true },
      take: 30,
    }),
    carregarColunas(filtros),
  ]);

  const totalGeral = colunas.reduce((soma, coluna) => soma + coluna.total, 0);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold tracking-[0.14em] text-emerald-700 uppercase">
            Pipeline comercial
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Kanban</h1>
          <p className="mt-1 text-sm text-neutral-500">
            {totalGeral} {totalGeral === 1 ? "oportunidade" : "oportunidades"} ·
            melhores scores aparecem primeiro.
          </p>
        </div>
        <ExportLinks
          filtros={{
            busca: filtros.searchId,
            site: filtros.site,
            tier: filtros.tier,
            prioridade: filtros.prioridade,
            contato: filtros.contato,
          }}
        />
      </div>

      <FiltrosKanban buscas={buscas} atual={filtros} />

      {totalGeral === 0 ? (
        <div className="rounded-xl border border-dashed border-neutral-300 bg-white p-8 text-center">
          <p className="font-medium">Nenhum lead corresponde aos filtros.</p>
          <p className="mt-1 text-sm text-neutral-500">
            Limpe os filtros ou conclua a análise de uma busca.
          </p>
        </div>
      ) : (
        <div className="grid items-start gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
          {colunas.map((coluna) => (
            <section
              key={coluna.stage}
              className="min-w-0 overflow-hidden rounded-xl border border-neutral-200 bg-neutral-50"
            >
              <div
                className={`h-1 ${ESTAGIO_CLASSE[coluna.stage]}`}
                aria-hidden
              />
              <header className="flex items-baseline justify-between border-b border-neutral-200 bg-white px-3 py-3">
                <h2 className="text-sm font-semibold">
                  {ESTAGIO_LABEL[coluna.stage]}
                </h2>
                <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-600">
                  {coluna.total}
                </span>
              </header>

              {coluna.leads.length > 0 ? (
                <ul className="flex flex-col gap-2 p-2.5">
                  {coluna.leads.map((lead) => (
                    <LeadCard key={lead.id} lead={lead} />
                  ))}
                </ul>
              ) : (
                <p className="px-3 py-6 text-center text-xs text-neutral-400">
                  Nenhum lead nesta etapa
                </p>
              )}

              {coluna.total > CARDS_POR_COLUNA && (
                <p className="border-t border-neutral-200 px-3 py-2 text-xs text-neutral-500">
                  Mostrando os {CARDS_POR_COLUNA} melhores de {coluna.total}.
                </p>
              )}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
