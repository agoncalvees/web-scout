import { Porte, SiteStatus } from "@/generated/prisma/enums";
import { isCategoriaKey, type CategoriaKey } from "@/lib/categorias";

export type Prioridade = "quente" | "morno" | "frio";

export const SCORE_VERSION = "v4-hibrido-web-2026-07";

export interface SinaisOportunidade {
  siteStatus: SiteStatus;
  telefone?: string | null;
  email?: string | null;
  instagram?: string | null;
  facebook?: string | null;
  endereco?: string | null;
  horario?: string | null;
  categoria: string;
  porte?: Porte | null;
  brand?: string | null;
  operator?: string | null;
  /** Fração 0..1 de concorrentes locais com site ativo. */
  gapCompetitivo?: number | null;
}

/**
 * Categorias em que descoberta, credibilidade ou agendamento online têm maior
 * influência na compra. Os pesos devem ser recalibrados com conversões reais.
 */
const NECESSIDADE_CATEGORIA: Record<CategoriaKey, number> = {
  academia: 20,
  advocacia: 20,
  contabilidade: 20,
  clinica_medica: 20,
  farmacia: 5,
  fisioterapia: 20,
  imobiliaria: 20,
  odontologia: 20,
  oficina_mecanica: 10,
  otica: 10,
  padaria: 5,
  pet_shop: 10,
  psicologia: 20,
  massoterapia_estetica: 20,
  restaurante: 20,
  salao_de_beleza: 20,
  veterinaria: 15,
};

export interface ScoreBreakdown {
  [sinal: string]: number | boolean;
  telefone: number;
  redeSocial: number;
  email: number;
  categoria: number;
  cadastro: number;
  capacidade: number;
  gapCompetitivo: number;
  total: number;
  elegivel: boolean;
  limiteFranquia: boolean;
  limiteIncerteza: boolean;
}

export interface ResultadoScore {
  score: number;
  prioridade: Prioridade;
  motivos: string[];
  breakdown: ScoreBreakdown;
}

export function prioridadePorScore(score: number): Prioridade {
  if (score >= 70) return "quente";
  if (score >= 40) return "morno";
  return "frio";
}

function pontosCapacidade(porte: Porte | null | undefined): number {
  switch (porte) {
    case Porte.DEMAIS:
    case Porte.EPP:
      return 10;
    case Porte.ME:
      return 7;
    case Porte.MEI:
      return 3;
    default:
      return 0;
  }
}

/**
 * Score v2, normalizado em 100 pontos.
 *
 * O status do site é filtro de elegibilidade, não um atalho de 40+ pontos. Uma
 * empresa só fica quente quando combina necessidade, contato e sinais de
 * operação. Redes/franquias nunca ultrapassam "Morno".
 */
export function pontuarOportunidade(s: SinaisOportunidade): ResultadoScore {
  const elegivel = s.siteStatus !== SiteStatus.tem_site_ativo;
  const limiteFranquia = Boolean(s.brand || s.operator);
  const limiteIncerteza = s.siteStatus === SiteStatus.checar_manualmente;
  const categoria = isCategoriaKey(s.categoria) ? s.categoria : null;

  const breakdown: ScoreBreakdown = {
    telefone: s.telefone ? 20 : 0,
    redeSocial: s.instagram || s.facebook ? 20 : 0,
    email: s.email ? 5 : 0,
    categoria: categoria ? NECESSIDADE_CATEGORIA[categoria] : 0,
    cadastro: (s.endereco ? 5 : 0) + (s.horario ? 5 : 0),
    capacidade: pontosCapacidade(s.porte),
    gapCompetitivo:
      typeof s.gapCompetitivo === "number"
        ? Math.round(Math.max(0, Math.min(1, s.gapCompetitivo)) * 15)
        : 0,
    total: 0,
    elegivel,
    limiteFranquia,
    limiteIncerteza,
  };

  const motivos: string[] = [];
  if (!elegivel) {
    motivos.push("já possui site ativo");
  } else {
    if (s.telefone) motivos.push("telefone/WhatsApp disponível");
    if (s.instagram || s.facebook) motivos.push("rede social sem site próprio");
    if (breakdown.categoria >= 20) motivos.push("segmento com alta necessidade");
    if (breakdown.cadastro === 10) motivos.push("cadastro comercial completo");
    if (breakdown.capacidade >= 7) motivos.push("capacidade comercial confirmada");
    if (breakdown.gapCompetitivo >= 8) {
      motivos.push("concorrentes locais investem em site");
    }
    if (s.siteStatus === SiteStatus.site_fora_do_ar) {
      motivos.push("site atual fora do ar");
    } else if (s.siteStatus === SiteStatus.checar_manualmente) {
      motivos.push("presença digital precisa de revisão");
    }
  }

  const soma =
    breakdown.telefone +
    breakdown.redeSocial +
    breakdown.email +
    breakdown.categoria +
    breakdown.cadastro +
    breakdown.capacidade +
    breakdown.gapCompetitivo;

  let score = elegivel ? Math.min(100, soma) : 0;
  if (limiteIncerteza && score >= 40) {
    score = 39;
    motivos.unshift("site ainda não confirmado");
  }
  if (limiteFranquia && score >= 70) {
    score = 69;
    motivos.unshift("rede/franquia: decisão provavelmente centralizada");
  }

  breakdown.total = score;

  return {
    score,
    prioridade: prioridadePorScore(score),
    motivos: motivos.slice(0, 5),
    breakdown,
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
