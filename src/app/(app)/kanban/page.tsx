import { PricingTier, SiteStatus } from "@/generated/prisma/enums";
import { prisma } from "@/lib/db";
import { ESTAGIO_CLASSE, ESTAGIO_LABEL } from "@/lib/kanban";
import { carregarColunas, CARDS_POR_COLUNA, type Filtros } from "./dados";
import { FiltrosKanban } from "./filtros";
import { LeadCard } from "./lead-card";
import { ExportLinks } from "../export-links";

export const metadata = { title: "Kanban · Prospector" };

// Mesma razão da home: o Prisma não sinaliza dinamismo ao Next.
export const dynamic = "force-dynamic";

/** Aceita só valores do enum; qualquer outra coisa na URL é ignorada. */
function parseEnum<T extends Record<string, string>>(
  valores: T,
  bruto: string | undefined,
): T[keyof T] | undefined {
  if (!bruto) return undefined;
  return Object.values(valores).includes(bruto) ? (bruto as T[keyof T]) : undefined;
}

export default async function KanbanPage({
  searchParams,
}: {
  searchParams: Promise<{ busca?: string; site?: string; tier?: string }>;
}) {
  const params = await searchParams;

  const filtros: Filtros = {
    searchId: params.busca || undefined,
    site: parseEnum(SiteStatus, params.site),
    tier: parseEnum(PricingTier, params.tier),
  };

  const [buscas, colunas] = await Promise.all([
    prisma.search.findMany({
      orderBy: { createdAt: "desc" },
      select: { id: true, categoria: true, cidade: true },
      take: 30,
    }),
    carregarColunas(filtros),
  ]);

  const totalGeral = colunas.reduce((s, c) => s + c.total, 0);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Kanban</h2>
          <p className="mt-1 text-sm text-neutral-500">
            {totalGeral} {totalGeral === 1 ? "lead" : "leads"} no funil.
          </p>
        </div>
        <ExportLinks
          filtros={{
            busca: filtros.searchId,
            site: filtros.site,
            tier: filtros.tier,
          }}
        />
      </div>

      <FiltrosKanban buscas={buscas} atual={filtros} />

      {totalGeral === 0 ? (
        <p className="text-sm text-neutral-500">
          Nenhum lead com esses filtros. Faça uma busca ou afrouxe os filtros.
        </p>
      ) : (
        <div className="-mx-6 overflow-x-auto px-6">
          <div className="flex gap-3">
            {colunas.map((coluna) => (
              <section
                key={coluna.stage}
                className="flex w-64 shrink-0 flex-col rounded-lg bg-neutral-100 dark:bg-neutral-900"
              >
                <div
                  className={`h-1 rounded-t-lg ${ESTAGIO_CLASSE[coluna.stage]}`}
                  aria-hidden
                />
                <header className="flex items-baseline justify-between px-3 pt-2.5 pb-1">
                  <h3 className="text-sm font-semibold">
                    {ESTAGIO_LABEL[coluna.stage]}
                  </h3>
                  <span className="text-xs text-neutral-500">{coluna.total}</span>
                </header>

                <ul className="flex flex-col gap-2 p-2">
                  {coluna.leads.map((lead) => (
                    <LeadCard key={lead.id} lead={lead} />
                  ))}
                </ul>

                {coluna.total > CARDS_POR_COLUNA && (
                  <p className="px-3 pb-3 text-xs text-neutral-500">
                    + {coluna.total - CARDS_POR_COLUNA} não exibidos. Use os filtros.
                  </p>
                )}
              </section>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
