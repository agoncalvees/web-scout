"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { isKanbanStage } from "@/lib/kanban";

/**
 * Move um lead de estágio.
 *
 * `upsert` porque `KanbanStatus` só passa a existir quando o lead é tocado pela
 * primeira vez — leads recém-descobertos não têm registro e contam como `novo`.
 */
export async function moverEstagio(formData: FormData) {
  const leadId = String(formData.get("leadId") ?? "");
  const stage = String(formData.get("stage") ?? "");

  if (!leadId || !isKanbanStage(stage)) {
    throw new Error("Parâmetros inválidos ao mover o lead.");
  }

  await prisma.kanbanStatus.upsert({
    where: { leadId },
    create: { leadId, stage },
    update: { stage },
  });

  revalidatePath("/kanban");
}
