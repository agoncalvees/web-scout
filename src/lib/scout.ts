import { prisma } from "@/lib/db";
import {
  CATEGORIA_TODAS,
  isCategoriaBusca,
  type CategoriaBusca,
} from "@/lib/categorias";
import {
  RAIO_MAX_KM,
  RAIO_MAX_TODAS_KM,
  RAIO_MIN_KM,
} from "@/lib/limites";
import { osmLeadSource } from "@/lib/sources/osm";
import { LeadSourceError, type LeadSource } from "@/lib/sources/types";

export interface ScoutResultado {
  searchId: string;
  encontrados: number;
  /** Leads efetivamente gravados; menor que `encontrados` se já existiam. */
  novos: number;
  displayName: string;
}

export function validarParams(input: {
  categoria: string;
  cidade: string;
  raioKm: number;
}): { categoria: CategoriaBusca; cidade: string; raioKm: number } {
  const cidade = input.cidade.trim();

  if (!isCategoriaBusca(input.categoria)) {
    throw new LeadSourceError("Categoria inválida.");
  }
  if (cidade.length < 2) {
    throw new LeadSourceError("Informe a cidade.");
  }
  if (
    !Number.isInteger(input.raioKm) ||
    input.raioKm < RAIO_MIN_KM ||
    input.raioKm > RAIO_MAX_KM
  ) {
    throw new LeadSourceError(`O raio deve estar entre ${RAIO_MIN_KM} e ${RAIO_MAX_KM} km.`);
  }
  if (
    input.categoria === CATEGORIA_TODAS &&
    input.raioKm > RAIO_MAX_TODAS_KM
  ) {
    throw new LeadSourceError(
      `Para buscar todos os segmentos, use até ${RAIO_MAX_TODAS_KM} km. Em raios maiores, escolha uma categoria: a busca fica mais rápida e os leads são mais relevantes.`,
    );
  }

  return { categoria: input.categoria, cidade, raioKm: input.raioKm };
}

/**
 * Executa uma busca e grava os leads crus.
 *
 * `osmId` é único, então rodar a mesma busca de novo não duplica leads — o
 * `skipDuplicates` faz o insert ignorar os já conhecidos.
 */
export async function rodarScout(
  input: { categoria: string; cidade: string; raioKm: number },
  source: LeadSource = osmLeadSource,
): Promise<ScoutResultado> {
  const params = validarParams(input);
  const { centro, leads } = await source.buscar(params);

  const search = await prisma.search.create({
    data: {
      categoria: params.categoria,
      cidade: params.cidade,
      lat: centro.lat,
      lon: centro.lon,
      raioKm: params.raioKm,
    },
  });

  const { count } = await prisma.lead.createMany({
    data: leads.map((lead) => ({ ...lead, searchId: search.id })),
    skipDuplicates: true,
  });

  return {
    searchId: search.id,
    encontrados: leads.length,
    novos: count,
    displayName: centro.displayName,
  };
}
