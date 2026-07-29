import {
  CATEGORIAS,
  CATEGORIA_TODAS,
  TODAS_AS_TAGS,
  parseTag,
} from "@/lib/categorias";
import { geocodificarCidade } from "./nominatim";
import { executarQuery, montarQuery, type OverpassElement } from "./overpass";
import type { BuscaParams, BuscaResultado, LeadCru, LeadSource } from "./types";

/** Monta o endereço a partir das tags `addr:*` do OSM, que vêm fragmentadas. */
function montarEndereco(tags: Record<string, string>): string | null {
  if (tags["addr:full"]?.trim()) return tags["addr:full"].trim();

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

function primeiroValor(...valores: Array<string | undefined>): string | null {
  for (const valor of valores) {
    const limpo = valor?.split(/[;,]/)[0]?.trim();
    if (limpo) return limpo;
  }
  return null;
}

function normalizarRedeSocial(
  bruto: string | null,
  dominio: "instagram.com" | "facebook.com",
): string | null {
  if (!bruto) return null;
  if (/^https?:\/\//i.test(bruto)) return bruto;
  const usuario = bruto.replace(/^@/, "").replace(/^\/+|\/+$/g, "");
  return usuario ? `https://${dominio}/${usuario}` : null;
}

function extrairLead(el: OverpassElement): LeadCru | null {
  const tags = el.tags;
  const name = tags?.name?.trim();
  // Sem nome não há como casar CNPJ nem adivinhar domínio — o lead é inútil.
  if (!tags || !name) return null;

  const lat = el.lat ?? el.center?.lat;
  const lon = el.lon ?? el.center?.lon;
  if (lat === undefined || lon === undefined) return null;
  const websiteRaw = primeiroValor(tags.website, tags["contact:website"]);
  const instagramDeclarado = primeiroValor(
    tags["contact:instagram"],
    tags.instagram,
  );
  const facebookDeclarado = primeiroValor(
    tags["contact:facebook"],
    tags.facebook,
  );

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
    phone: normalizarTelefone(
      tags["contact:whatsapp"] ??
        tags.phone ??
        tags["contact:phone"] ??
        tags["contact:mobile"],
    ),
    email: primeiroValor(tags.email, tags["contact:email"]),
    instagram: normalizarRedeSocial(
      instagramDeclarado ??
        (websiteRaw?.includes("instagram.com") ? websiteRaw : null),
      "instagram.com",
    ),
    facebook: normalizarRedeSocial(
      facebookDeclarado ??
        (websiteRaw?.includes("facebook.com") ? websiteRaw : null),
      "facebook.com",
    ),
    openingHours: primeiroValor(tags.opening_hours),
    lat,
    lon,
    websiteRaw,
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

    let elementos: OverpassElement[];

    if (categoria === CATEGORIA_TODAS) {
      // Uma busca regional por todos os segmentos é dividida por chave OSM.
      // Isso evita uma consulta monolítica que os mirrors encerram com 504.
      const grupos = new Map<string, string[]>();
      for (const tag of tags) {
        const [chave] = parseTag(tag);
        const grupo = grupos.get(chave) ?? [];
        grupo.push(tag);
        grupos.set(chave, grupo);
      }

      const queries = Array.from(grupos.values(), (grupo) =>
        montarQuery(grupo, centro.lat, centro.lon, raioKm * 1000),
      );
      const resultados: OverpassElement[][] = [];
      const erros: unknown[] = [];
      let proxima = 0;

      async function worker() {
        for (;;) {
          const indice = proxima++;
          const query = queries[indice];
          if (!query) return;
          try {
            resultados[indice] = await executarQuery(query);
          } catch (erro) {
            erros.push(erro);
            resultados[indice] = [];
          }
        }
      }

      await Promise.all([worker(), worker()]);
      elementos = resultados.flat();

      if (elementos.length === 0 && erros.length > 0) {
        throw erros[0];
      }
    } else {
      const query = montarQuery(tags, centro.lat, centro.lon, raioKm * 1000);
      elementos = await executarQuery(query);
    }

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

    // Em áreas regionais podem existir milhares de POIs. Para prospecção
    // individual, priorizamos os 800 com melhor chance de contato antes do
    // enrichment detalhado, em vez de criar uma fila impraticável.
    leads.sort((a, b) => {
      const qualidade = (lead: LeadCru) =>
        (lead.phone ? 5 : 0) +
        (lead.email ? 4 : 0) +
        (lead.instagram || lead.facebook ? 4 : 0) +
        (lead.address ? 2 : 0) +
        (!lead.websiteRaw ? 2 : 0);
      return qualidade(b) - qualidade(a);
    });

    return { centro, leads: leads.slice(0, 800) };
  },
};
