import { Porte, SiteStatus } from "@/generated/prisma/enums";
import { isCategoriaKey, type CategoriaKey } from "@/lib/categorias";

export type Prioridade = "quente" | "morno" | "frio";

export interface SinaisOportunidade {
  siteStatus: SiteStatus;
  telefone?: string | null;
  email?: string | null;
  instagram?: string | null;
  facebook?: string | null;
  endereco?: string | null;
  categoria: string;
  porte?: Porte | null;
}

const VALOR_SEGMENTO: Partial<Record<CategoriaKey, number>> = {
  clinica_medica: 12,
  odontologia: 12,
  advocacia: 10,
  contabilidade: 10,
  imobiliaria: 10,
  veterinaria: 9,
  fisioterapia: 9,
  psicologia: 9,
  academia: 8,
  otica: 8,
  massoterapia_estetica: 7,
  pet_shop: 7,
  oficina_mecanica: 7,
  salao_de_beleza: 6,
  restaurante: 5,
  padaria: 4,
  farmacia: 3,
};

export interface ResultadoScore {
  score: number;
  prioridade: Prioridade;
  motivos: string[];
}

export function prioridadePorScore(score: number): Prioridade {
  if (score >= 70) return "quente";
  if (score >= 48) return "morno";
  return "frio";
}

/**
 * Prioriza oportunidade observável, não "certeza de compra".
 *
 * O score combina lacuna digital, facilidade de contato e valor provável do
 * segmento. Os motivos são persistidos para que o usuário saiba por que um lead
 * subiu ou desceu na lista.
 */
export function pontuarOportunidade(s: SinaisOportunidade): ResultadoScore {
  let score = 10;
  const motivos: string[] = [];

  switch (s.siteStatus) {
    case SiteStatus.sem_site_alta_confianca:
      score += 42;
      motivos.push("sem site próprio");
      break;
    case SiteStatus.site_fora_do_ar:
      score += 34;
      motivos.push("site fora do ar");
      break;
    case SiteStatus.checar_manualmente:
      score += 18;
      motivos.push("presença digital incerta");
      break;
    case SiteStatus.tem_site_ativo:
      score -= 22;
      motivos.push("já possui site ativo");
      break;
  }

  if (s.telefone) {
    score += 18;
    motivos.push("contato por telefone/WhatsApp");
  }
  if (s.instagram || s.facebook) {
    score += 12;
    motivos.push("rede social ativa sem site confirmado");
  }
  if (s.email) {
    score += 7;
    motivos.push("e-mail disponível");
  }
  if (s.endereco) score += 4;

  const categoria = isCategoriaKey(s.categoria) ? s.categoria : null;
  const valorSegmento = categoria ? (VALOR_SEGMENTO[categoria] ?? 5) : 5;
  score += valorSegmento;
  if (valorSegmento >= 9) motivos.push("segmento de maior valor");

  if (s.porte === Porte.EPP || s.porte === Porte.DEMAIS) {
    score += 8;
    motivos.push("empresa de maior porte");
  } else if (s.porte === Porte.ME) {
    score += 5;
  }

  score = Math.max(0, Math.min(100, score));
  return {
    score,
    prioridade: prioridadePorScore(score),
    motivos: motivos.slice(0, 4),
  };
}

export const PRIORIDADE_LABEL: Record<Prioridade, string> = {
  quente: "Quente",
  morno: "Morno",
  frio: "Frio",
};

export const PRIORIDADE_CLASSE: Record<Prioridade, string> = {
  quente: "bg-orange-100 text-orange-800",
  morno: "bg-amber-100 text-amber-800",
  frio: "bg-slate-100 text-slate-600",
};

export function motivosDoScore(valor: unknown): string[] {
  return Array.isArray(valor)
    ? valor.filter((item): item is string => typeof item === "string")
    : [];
}
