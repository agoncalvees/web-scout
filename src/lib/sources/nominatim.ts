import { createRateLimiter, fetchWithTimeout } from "@/lib/http";
import { LeadSourceError, type Centro } from "./types";

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";

/**
 * A política de uso do Nominatim é de no máximo 1 req/s, sem paralelismo.
 * Todas as chamadas passam por este limitador.
 */
const limitar = createRateLimiter(1_100);

interface NominatimResultado {
  lat: string;
  lon: string;
  display_name: string;
}

/** Geocodifica uma cidade brasileira. Lança `LeadSourceError` se não achar. */
export async function geocodificarCidade(cidade: string): Promise<Centro> {
  const url = new URL(NOMINATIM_URL);
  url.searchParams.set("q", cidade);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "1");
  url.searchParams.set("countrycodes", "br");
  url.searchParams.set("addressdetails", "0");

  const res = await limitar(() =>
    fetchWithTimeout(url.toString(), {
      timeoutMs: 15_000,
      headers: { "Accept-Language": "pt-BR" },
    }),
  );

  if (!res.ok) {
    throw new LeadSourceError(
      `Nominatim respondeu ${res.status}. Tente novamente em alguns segundos.`,
    );
  }

  const dados = (await res.json()) as NominatimResultado[];
  const primeiro = dados[0];
  if (!primeiro) {
    throw new LeadSourceError(
      `Não encontrei a cidade "${cidade}". Tente incluir o estado, ex: "Sorocaba, SP".`,
    );
  }

  const lat = Number(primeiro.lat);
  const lon = Number(primeiro.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    throw new LeadSourceError("Nominatim devolveu coordenadas inválidas.");
  }

  return { lat, lon, displayName: primeiro.display_name };
}
