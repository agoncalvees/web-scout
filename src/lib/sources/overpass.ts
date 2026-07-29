import { fetchWithTimeout } from "@/lib/http";
import { parseTag } from "@/lib/categorias";
import { LeadSourceError } from "./types";

/**
 * Endpoints em ordem de preferência. O overpass-api.de é fair-use por IP e cai
 * com alguma frequência; o kumi.systems é o mirror de fallback.
 */
const ENDPOINTS = [
  "https://overpass.private.coffee/api/interpreter",
  "https://overpass-api.de/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
] as const;

/** A consulta otimizada costuma responder antes; a folga cobre raios regionais. */
const QL_TIMEOUT_S = 45;
const FETCH_TIMEOUT_MS = 45_000;

export interface OverpassElement {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

/**
 * Monta a query Overpass QL: união das tags da categoria, cada uma restrita ao
 * raio em torno do centro. `nwr` cobre node/way/relation; `out center tags`
 * devolve um ponto único mesmo para ways e relations.
 */
export function montarQuery(
  tags: readonly string[],
  lat: number,
  lon: number,
  raioMetros: number,
): string {
  const porChave = new Map<string, string[]>();
  for (const tag of tags) {
    const [chave, valor] = parseTag(tag);
    const valores = porChave.get(chave) ?? [];
    valores.push(valor);
    porChave.set(chave, valores);
  }

  const escaparRegex = (valor: string) =>
    valor.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  const clausulas = Array.from(porChave, ([chave, valores]) => {
    if (valores.length === 1) {
      return `  nwr["${chave}"="${valores[0]}"](around:${raioMetros},${lat},${lon});`;
    }
    const regex = valores.map(escaparRegex).join("|");
    return `  nwr["${chave}"~"^(${regex})$"](around:${raioMetros},${lat},${lon});`;
  })
    .join("\n");

  return `[out:json][timeout:${QL_TIMEOUT_S}];\n(\n${clausulas}\n);\nout center tags qt;`;
}

/** Executa a query, tentando cada endpoint até um responder. */
export async function executarQuery(query: string): Promise<OverpassElement[]> {
  const erros: string[] = [];

  for (const endpoint of ENDPOINTS) {
    try {
      const res = await fetchWithTimeout(endpoint, {
        method: "POST",
        timeoutMs: FETCH_TIMEOUT_MS,
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ data: query }).toString(),
      });

      if (!res.ok) {
        // 429 (rate limit) e 504 (timeout do servidor) são os casos típicos em
        // que vale insistir no mirror seguinte.
        erros.push(`${endpoint} → HTTP ${res.status}`);
        continue;
      }

      const json = (await res.json()) as { elements?: OverpassElement[] };
      return json.elements ?? [];
    } catch (err) {
      erros.push(`${endpoint} → ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  throw new LeadSourceError(
    `Nenhum servidor Overpass respondeu. Tente novamente em alguns minutos.\n${erros.join("\n")}`,
  );
}
