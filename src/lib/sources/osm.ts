import {
  CATEGORIAS,
  CATEGORIA_TODAS,
  TODAS_AS_TAGS,
} from "@/lib/categorias";
import { geocodificarCidade } from "./nominatim";
import { executarQuery, montarQuery, type OverpassElement } from "./overpass";
import type { BuscaParams, BuscaResultado, LeadCru, LeadSource } from "./types";

/** Monta o endereço a partir das tags `addr:*` do OSM, que vêm fragmentadas. */
function montarEndereco(tags: Record<string, string>): string | null {
  const rua = tags["addr:street"];
  const numero = tags["addr:housenumber"];
  const bairro = tags["addr:suburb"] ?? tags["addr:neighbourhood"];
  const cidade = tags["addr:city"];

  const linha = [rua && numero ? `${rua}, ${numero}` : rua, bairro, cidade]
    .filter(Boolean)
    .join(" - ");

  return linha || null;
}

/** Normaliza telefone para dígitos com DDI 55, formato aceito pelo wa.me. */
export function normalizarTelefone(bruto: string | undefined): string | null {
  if (!bruto) return null;

  // Tags de telefone no OSM costumam listar vários separados por ";" ou ",".
  const primeiro = bruto.split(/[;,]/)[0]?.trim();
  if (!primeiro) return null;

  const digitos = primeiro.replace(/\D/g, "");
  if (digitos.length < 8) return null;

  if (digitos.startsWith("55") && digitos.length >= 12) return digitos;
  // 10 (fixo) ou 11 (celular) dígitos = já tem DDD, falta só o DDI.
  if (digitos.length === 10 || digitos.length === 11) return `55${digitos}`;

  return digitos;
}

/**
 * Chaves de CNPJ usadas no OSM brasileiro, em ordem de preferência.
 * `ref:vatin` é a padronizada (valor no formato `"BR" + 14 dígitos`); as outras
 * são legado de mapeamentos antigos.
 */
const CHAVES_CNPJ = ["ref:vatin", "ref:CNPJ", "ref:cnpj", "cnpj"] as const;

function extrairCnpj(tags: Record<string, string>): string | null {
  for (const chave of CHAVES_CNPJ) {
    const valor = tags[chave]?.trim();
    if (valor) return valor;
  }
  return null;
}

function extrairLead(el: OverpassElement): LeadCru | null {
  const tags = el.tags;
  const name = tags?.name?.trim();
  // Sem nome não há como casar CNPJ nem adivinhar domínio — o lead é inútil.
  if (!tags || !name) return null;

  const lat = el.lat ?? el.center?.lat;
  const lon = el.lon ?? el.center?.lon;
  if (lat === undefined || lon === undefined) return null;

  return {
    osmId: `${el.type}/${el.id}`,
    name,
    category:
      tags.amenity ??
      tags.healthcare ??
      tags.shop ??
      tags.office ??
      tags.leisure ??
      "",
    address: montarEndereco(tags),
    phone: normalizarTelefone(tags.phone ?? tags["contact:phone"] ?? tags["contact:mobile"]),
    lat,
    lon,
    websiteRaw: tags.website ?? tags["contact:website"] ?? null,
    cnpjRaw: extrairCnpj(tags),
  };
}

/** Fonte de leads baseada em OpenStreetMap: Nominatim + Overpass. */
export const osmLeadSource: LeadSource = {
  nome: "OpenStreetMap (Overpass)",

  async buscar({ categoria, cidade, raioKm }: BuscaParams): Promise<BuscaResultado> {
    const centro = await geocodificarCidade(cidade);
    const tags =
      categoria === CATEGORIA_TODAS
        ? TODAS_AS_TAGS
        : CATEGORIAS[categoria].tags;

    const query = montarQuery(tags, centro.lat, centro.lon, raioKm * 1000);
    const elementos = await executarQuery(query);

    // Uma way e um node podem descrever o mesmo estabelecimento; dedup por osmId
    // não pega isso, mas nome + coordenada arredondada pega os casos óbvios.
    const vistos = new Set<string>();
    const leads: LeadCru[] = [];

    for (const el of elementos) {
      const lead = extrairLead(el);
      if (!lead) continue;

      const chave = `${lead.name.toLowerCase()}@${lead.lat.toFixed(4)},${lead.lon.toFixed(4)}`;
      if (vistos.has(chave)) continue;
      vistos.add(chave);

      leads.push(lead);
    }

    return { centro, leads };
  },
};
