import { Porte, PricingTier } from "@/generated/prisma/enums";
import { isCategoriaKey, type CategoriaKey } from "@/lib/categorias";

/**
 * Tier de preço sugerido a partir do porte da empresa.
 *
 * MEI → R$450–650 · ME → R$650–1200 · EPP e acima → R$1200+
 */
export function tierPorPorte(porte: Porte): PricingTier {
  switch (porte) {
    case Porte.ME:
      return PricingTier.T650_1200;
    case Porte.EPP:
    case Porte.DEMAIS:
      return PricingTier.T1200_MAIS;
    case Porte.MEI:
    case Porte.sem_cnpj:
      return PricingTier.T450_650;
  }
}

/**
 * Fallback por categoria, usado quando não há CNPJ.
 *
 * É o caminho da esmagadora maioria dos leads: a tag de CNPJ existe em ~1% dos
 * POIs do OSM e não há API pública de busca reversa por nome, então o porte real
 * raramente está disponível. Ajustar preço é só mexer nesta tabela.
 */
const TIER_POR_CATEGORIA: Record<CategoriaKey, PricingTier> = {
  academia: PricingTier.T450_650,
  advocacia: PricingTier.T650_1200,
  contabilidade: PricingTier.T650_1200,
  clinica_medica: PricingTier.T650_1200,
  farmacia: PricingTier.T450_650,
  fisioterapia: PricingTier.T650_1200,
  imobiliaria: PricingTier.T650_1200,
  odontologia: PricingTier.T650_1200,
  oficina_mecanica: PricingTier.T450_650,
  otica: PricingTier.T650_1200,
  padaria: PricingTier.T450_650,
  pet_shop: PricingTier.T450_650,
  psicologia: PricingTier.T650_1200,
  restaurante: PricingTier.T450_650,
  salao_de_beleza: PricingTier.T450_650,
  massoterapia_estetica: PricingTier.T450_650,
  veterinaria: PricingTier.T650_1200,
};

export function tierPorCategoria(categoria: string): PricingTier {
  return isCategoriaKey(categoria)
    ? TIER_POR_CATEGORIA[categoria]
    : PricingTier.T450_650;
}

/**
 * Tier final de um lead.
 *
 * Porte confirmado na Receita vence o fallback: se sabemos que é MEI, a faixa é
 * a de entrada mesmo numa categoria que costuma pagar mais.
 */
export function calcularTier(
  porte: Porte | null | undefined,
  categoria: string,
): PricingTier {
  if (porte && porte !== Porte.sem_cnpj) return tierPorPorte(porte);
  return tierPorCategoria(categoria);
}

export const TIER_LABEL: Record<PricingTier, string> = {
  [PricingTier.T450_650]: "R$450–650",
  [PricingTier.T650_1200]: "R$650–1200",
  [PricingTier.T1200_MAIS]: "R$1200+",
};

export const PORTE_LABEL: Record<Porte, string> = {
  [Porte.MEI]: "MEI",
  [Porte.ME]: "ME",
  [Porte.EPP]: "EPP",
  [Porte.DEMAIS]: "Grande",
  [Porte.sem_cnpj]: "Sem CNPJ",
};
