import { PricingTier, SiteStatus } from "@/generated/prisma/enums";
import { labelCategoria } from "@/lib/categorias";
import { SITE_STATUS_LABEL } from "@/lib/labels";
import { TIER_LABEL } from "@/lib/pricing";
import type { Filtros } from "./dados";

export interface OpcaoBusca {
  id: string;
  categoria: string;
  cidade: string;
}

/**
 * Filtros via GET, sem JS: o form navega para `/kanban?...` e a página
 * re-renderiza no servidor.
 */
export function FiltrosKanban({
  buscas,
  atual,
}: {
  buscas: OpcaoBusca[];
  atual: Filtros;
}) {
  const classe =
    "rounded-md border border-neutral-300 bg-transparent px-2.5 py-1.5 text-sm dark:border-neutral-700";

  return (
    <form className="flex flex-wrap items-end gap-3">
      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-neutral-500">Busca</span>
        <select name="busca" defaultValue={atual.searchId ?? ""} className={classe}>
          <option value="">Todas</option>
          {buscas.map((b) => (
            <option key={b.id} value={b.id}>
              {labelCategoria(b.categoria)} · {b.cidade}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-neutral-500">Site</span>
        <select name="site" defaultValue={atual.site ?? ""} className={classe}>
          <option value="">Qualquer</option>
          {Object.values(SiteStatus).map((s) => (
            <option key={s} value={s}>
              {SITE_STATUS_LABEL[s]}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-neutral-500">Preço</span>
        <select name="tier" defaultValue={atual.tier ?? ""} className={classe}>
          <option value="">Qualquer</option>
          {Object.values(PricingTier).map((t) => (
            <option key={t} value={t}>
              {TIER_LABEL[t]}
            </option>
          ))}
        </select>
      </label>

      <button
        type="submit"
        className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white dark:bg-white dark:text-neutral-900"
      >
        Filtrar
      </button>
    </form>
  );
}
