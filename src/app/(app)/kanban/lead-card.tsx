import {
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Mail,
  MapPin,
  Search,
  X,
} from "lucide-react";
import { KanbanStage } from "@/generated/prisma/enums";
import { estagioAnterior, ESTAGIO_LABEL, proximoEstagio } from "@/lib/kanban";
import { SITE_STATUS_CLASSE, SITE_STATUS_LABEL } from "@/lib/labels";
import { TIER_LABEL } from "@/lib/pricing";
import { categoriaPorValorOsm } from "@/lib/categorias";
import {
  motivosDoScore,
  PRIORIDADE_CLASSE,
  PRIORIDADE_LABEL,
  prioridadePorScore,
} from "@/lib/scoring";
import type { LeadDoKanban } from "./dados";
import { moverEstagio } from "./actions";
import { WhatsAppButton } from "../whatsapp-button";

function BotaoMover({
  leadId,
  stage,
  children,
  title,
}: {
  leadId: string;
  stage: KanbanStage;
  children: React.ReactNode;
  title: string;
}) {
  return (
    <form action={moverEstagio}>
      <input type="hidden" name="leadId" value={leadId} />
      <input type="hidden" name="stage" value={stage} />
      <button
        type="submit"
        title={title}
        aria-label={title}
        className="flex size-7 items-center justify-center rounded-md border border-neutral-300 text-neutral-600 hover:bg-neutral-100"
      >
        {children}
      </button>
    </form>
  );
}

export function LeadCard({ lead }: { lead: LeadDoKanban }) {
  const stage = lead.kanbanStatus?.stage ?? KanbanStage.novo;
  const anterior = estagioAnterior(stage);
  const proximo = proximoEstagio(stage);
  const site = lead.enrichment?.siteStatus;
  const score = lead.enrichment?.opportunityScore;
  const prioridade =
    typeof score === "number" ? prioridadePorScore(score) : null;
  const motivos = motivosDoScore(lead.enrichment?.opportunityReasons);
  const buscaGoogle = `https://www.google.com/search?q=${encodeURIComponent(
    `${lead.name} ${lead.address ?? ""}`,
  )}`;
  const mapa = `https://www.google.com/maps/search/?api=1&query=${lead.lat},${lead.lon}`;

  return (
    <li className="rounded-lg border border-neutral-200 bg-white p-3 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm leading-snug font-semibold">{lead.name}</p>
        {prioridade && typeof score === "number" && (
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${PRIORIDADE_CLASSE[prioridade]}`}
            title={motivos.join(" · ")}
          >
            {PRIORIDADE_LABEL[prioridade]} · {score}
          </span>
        )}
      </div>

      {lead.address && (
        <p className="mt-1 line-clamp-2 text-xs text-neutral-500">
          {lead.address}
        </p>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {site ? (
          <span
            className={`rounded-full px-1.5 py-0.5 text-[11px] font-medium ${SITE_STATUS_CLASSE[site]}`}
          >
            {SITE_STATUS_LABEL[site]}
          </span>
        ) : (
          <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-500">
            aguardando análise
          </span>
        )}
        {lead.enrichment?.pricingTier && (
          <span className="text-[11px] whitespace-nowrap text-neutral-500">
            {TIER_LABEL[lead.enrichment.pricingTier]}
          </span>
        )}
      </div>

      {motivos.length > 0 && (
        <p className="mt-2 line-clamp-2 text-[11px] leading-4 text-neutral-500">
          {motivos.join(" · ")}
        </p>
      )}

      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {lead.phone && (
          <WhatsAppButton
            nome={lead.name}
            telefone={lead.phone}
            categoria={
              categoriaPorValorOsm(lead.category) ?? lead.search.categoria
            }
            compacto
          />
        )}
        {lead.instagram && (
          <a
            href={lead.instagram}
            target="_blank"
            rel="noreferrer"
            title="Abrir Instagram"
            className="flex h-7 items-center gap-1 rounded-md border border-neutral-300 px-2 text-[11px] font-medium hover:bg-neutral-100"
          >
            <ExternalLink className="size-3" aria-hidden />
            Instagram
          </a>
        )}
        {lead.email && (
          <a
            href={`mailto:${lead.email}`}
            title={lead.email}
            className="flex size-7 items-center justify-center rounded-md border border-neutral-300 hover:bg-neutral-100"
          >
            <Mail className="size-3" aria-hidden />
            <span className="sr-only">Enviar e-mail</span>
          </a>
        )}
        <a
          href={buscaGoogle}
          target="_blank"
          rel="noreferrer"
          title="Pesquisar empresa"
          className="flex size-7 items-center justify-center rounded-md border border-neutral-300 hover:bg-neutral-100"
        >
          <Search className="size-3" aria-hidden />
          <span className="sr-only">Pesquisar empresa</span>
        </a>
        <a
          href={mapa}
          target="_blank"
          rel="noreferrer"
          title="Abrir no mapa"
          className="flex size-7 items-center justify-center rounded-md border border-neutral-300 hover:bg-neutral-100"
        >
          <MapPin className="size-3" aria-hidden />
          <span className="sr-only">Abrir no mapa</span>
        </a>
      </div>

      <div className="mt-3 flex items-center gap-1 border-t border-neutral-100 pt-2">
        {anterior && (
          <BotaoMover
            leadId={lead.id}
            stage={anterior}
            title={`Mover para ${ESTAGIO_LABEL[anterior]}`}
          >
            <ChevronLeft className="size-3.5" />
          </BotaoMover>
        )}
        {proximo && (
          <BotaoMover
            leadId={lead.id}
            stage={proximo}
            title={`Mover para ${ESTAGIO_LABEL[proximo]}`}
          >
            <ChevronRight className="size-3.5" />
          </BotaoMover>
        )}
        {stage !== KanbanStage.perdido && stage !== KanbanStage.fechado && (
          <BotaoMover
            leadId={lead.id}
            stage={KanbanStage.perdido}
            title="Marcar como perdido"
          >
            <X className="size-3.5" />
          </BotaoMover>
        )}
      </div>
    </li>
  );
}
