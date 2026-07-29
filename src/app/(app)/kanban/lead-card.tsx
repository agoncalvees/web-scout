import { KanbanStage } from "@/generated/prisma/enums";
import { estagioAnterior, ESTAGIO_LABEL, proximoEstagio } from "@/lib/kanban";
import { SITE_STATUS_CLASSE, SITE_STATUS_LABEL } from "@/lib/labels";
import { TIER_LABEL } from "@/lib/pricing";
import { categoriaPorValorOsm } from "@/lib/categorias";
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
        className="rounded border border-neutral-300 px-1.5 py-0.5 text-xs text-neutral-600 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-800"
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

  return (
    <li className="rounded-md border border-neutral-200 bg-white p-2.5 dark:border-neutral-800 dark:bg-neutral-950">
      <p className="text-sm leading-snug font-medium">{lead.name}</p>

      {lead.address && (
        <p className="mt-0.5 text-xs text-neutral-500">{lead.address}</p>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {site && (
          <span
            className={`rounded-full px-1.5 py-0.5 text-[11px] font-medium ${SITE_STATUS_CLASSE[site]}`}
          >
            {SITE_STATUS_LABEL[site]}
          </span>
        )}
        {lead.enrichment?.pricingTier && (
          <span className="text-[11px] whitespace-nowrap text-neutral-500">
            {TIER_LABEL[lead.enrichment.pricingTier]}
          </span>
        )}
      </div>

      {lead.phone && (
        <div className="mt-1.5 flex items-center justify-between gap-2">
          <p className="font-mono text-xs text-neutral-500">{lead.phone}</p>
          <WhatsAppButton
            nome={lead.name}
            telefone={lead.phone}
            categoria={
              categoriaPorValorOsm(lead.category) ?? lead.search.categoria
            }
            compacto
          />
        </div>
      )}

      <div className="mt-2 flex items-center gap-1">
        {anterior && (
          <BotaoMover
            leadId={lead.id}
            stage={anterior}
            title={`Mover para ${ESTAGIO_LABEL[anterior]}`}
          >
            ←
          </BotaoMover>
        )}
        {proximo && (
          <BotaoMover
            leadId={lead.id}
            stage={proximo}
            title={`Mover para ${ESTAGIO_LABEL[proximo]}`}
          >
            →
          </BotaoMover>
        )}
        {stage !== KanbanStage.perdido && stage !== KanbanStage.fechado && (
          <BotaoMover
            leadId={lead.id}
            stage={KanbanStage.perdido}
            title="Marcar como perdido"
          >
            ✕
          </BotaoMover>
        )}
      </div>
    </li>
  );
}
