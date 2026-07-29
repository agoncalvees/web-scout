import { KanbanStage } from "@/generated/prisma/enums";

/** Colunas na ordem do funil. `fechado` e `perdido` são os dois fins possíveis. */
export const ESTAGIOS = [
  KanbanStage.novo,
  KanbanStage.contatado,
  KanbanStage.respondido,
  KanbanStage.negociando,
  KanbanStage.fechado,
  KanbanStage.perdido,
] as const;

export const ESTAGIO_LABEL: Record<KanbanStage, string> = {
  [KanbanStage.novo]: "Novo",
  [KanbanStage.contatado]: "Contatado · sem resposta",
  [KanbanStage.respondido]: "Respondido",
  [KanbanStage.negociando]: "Negociando",
  [KanbanStage.fechado]: "Fechado",
  [KanbanStage.perdido]: "Perdido",
};

/** Cor do topo de cada coluna, pra distinguir de relance. */
export const ESTAGIO_CLASSE: Record<KanbanStage, string> = {
  [KanbanStage.novo]: "bg-neutral-400",
  [KanbanStage.contatado]: "bg-sky-500",
  [KanbanStage.respondido]: "bg-amber-500",
  [KanbanStage.negociando]: "bg-violet-500",
  [KanbanStage.fechado]: "bg-emerald-500",
  [KanbanStage.perdido]: "bg-red-400",
};

export function isKanbanStage(v: string): v is KanbanStage {
  return (ESTAGIOS as readonly string[]).includes(v);
}

/**
 * Vizinhos de um estágio, para os botões de avançar/voltar.
 *
 * `perdido` fica fora da linha principal: é alcançável de qualquer ponto, mas
 * não é "o próximo" de ninguém — daí o tratamento à parte.
 */
const LINHA_PRINCIPAL = [
  KanbanStage.novo,
  KanbanStage.contatado,
  KanbanStage.respondido,
  KanbanStage.negociando,
  KanbanStage.fechado,
] as const;

export function proximoEstagio(atual: KanbanStage): KanbanStage | null {
  const i = LINHA_PRINCIPAL.indexOf(atual as (typeof LINHA_PRINCIPAL)[number]);
  if (i === -1) return null; // perdido não avança
  return LINHA_PRINCIPAL[i + 1] ?? null;
}

export function estagioAnterior(atual: KanbanStage): KanbanStage | null {
  if (atual === KanbanStage.perdido) return KanbanStage.novo;
  const i = LINHA_PRINCIPAL.indexOf(atual as (typeof LINHA_PRINCIPAL)[number]);
  if (i <= 0) return null;
  return LINHA_PRINCIPAL[i - 1] ?? null;
}
