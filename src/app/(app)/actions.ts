"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { formatarCidadeUf, isUf } from "@/lib/localidades";
import { rodarScout } from "@/lib/scout";
import { LeadSourceError } from "@/lib/sources/types";

export interface BuscaState {
  erro?: string;
}

export async function buscar(_prev: BuscaState, formData: FormData): Promise<BuscaState> {
  let searchId: string;
  const estado = String(formData.get("estado") ?? "").toUpperCase();
  const cidade = String(formData.get("cidade") ?? "");

  if (!isUf(estado)) {
    return { erro: "Selecione um estado válido." };
  }

  try {
    const resultado = await rodarScout({
      categoria: String(formData.get("categoria") ?? ""),
      cidade: formatarCidadeUf(cidade, estado),
      raioKm: Number(formData.get("raioKm")),
    });
    searchId = resultado.searchId;
  } catch (err) {
    if (err instanceof LeadSourceError) return { erro: err.message };
    console.error("Falha no Scout", err);
    return { erro: "Falha ao buscar. Tente novamente em alguns minutos." };
  }

  revalidatePath("/");
  redirect(`/buscas/${searchId}`);
}
