import { PricingTier, SiteStatus } from "@/generated/prisma/enums";
import Link from "next/link";
import { labelCategoria } from "@/lib/categorias";
import { SITE_STATUS_LABEL } from "@/lib/labels";
import { TIER_LABEL } from "@/lib/pricing";
import { PRIORIDADE_LABEL, type Prioridade } from "@/lib/scoring";
import type { Filtros } from "./dados";

export interface OpcaoBusca {
  id: string;
  categoria: string;
  cidade: string;
}

export function FiltrosKanban({
  buscas,
  atual,
}: {
  buscas: OpcaoBusca[];
  atual: Filtros;
}) {
  const classe =
    "h-9 rounded-lg border border-neutral-300 bg-white px-3 text-sm text-neutral-900";
  const ativos = Object.values(atual).filter(Boolean).length;

  return (
    <form className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold">Filtrar oportunidades</p>
          <p className="text-xs text-neutral-500">
            {ativos === 0
              ? "Nenhum filtro ativo."
              : `${ativos} ${ativos === 1 ? "filtro ativo" : "filtros ativos"}.`}
          </p>
        </div>
        {ativos > 0 && (
          <Link
            href="/kanban"
            className="text-xs font-medium text-emerald-700 hover:underline"
          >
            Limpar filtros
          </Link>
        )}
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-neutral-500">Busca</span>
          <select
            name="busca"
            defaultValue={atual.searchId ?? ""}
            className={`${classe} max-w-72`}
          >
            <option value="">Todas as buscas</option>
            {buscas.map((busca) => (
              <option key={busca.id} value={busca.id}>
                {labelCategoria(busca.categoria)} · {busca.cidade}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-neutral-500">
            Status do site
          </span>
          <select
            name="site"
            defaultValue={atual.site ?? ""}
            className={classe}
          >
            <option value="">Qualquer status</option>
            {Object.values(SiteStatus).map((status) => (
              <option key={status} value={status}>
                {SITE_STATUS_LABEL[status]}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-neutral-500">
            Faixa sugerida
          </span>
          <select
            name="tier"
            defaultValue={atual.tier ?? ""}
            className={classe}
          >
            <option value="">Qualquer faixa</option>
            {Object.values(PricingTier).map((tier) => (
              <option key={tier} value={tier}>
                {TIER_LABEL[tier]}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-neutral-500">Prioridade</span>
          <select
            name="prioridade"
            defaultValue={atual.prioridade ?? ""}
            className={classe}
          >
            <option value="">Todas</option>
            {(["quente", "morno", "frio"] as Prioridade[]).map((prioridade) => (
              <option key={prioridade} value={prioridade}>
                {PRIORIDADE_LABEL[prioridade]}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-neutral-500">Tem contato</span>
          <select
            name="contato"
            defaultValue={atual.contato ?? ""}
            className={classe}
          >
            <option value="">Qualquer canal</option>
            <option value="whatsapp">Telefone/WhatsApp</option>
            <option value="instagram">Instagram</option>
            <option value="email">E-mail</option>
          </select>
        </label>

        <button
          type="submit"
          className="h-9 rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-700"
        >
          Aplicar filtros
        </button>
      </div>
    </form>
  );
}
