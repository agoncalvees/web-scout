import { prisma } from "@/lib/db";
import { fetchWithTimeout } from "@/lib/http";

const GOOGLE_PLACES_BASE = "https://places.googleapis.com/v1";
const PROVIDER = "google-places-enterprise";
const LIMITE_GRATUITO_SEGURO = 900;
const TIMEOUT_MS = 10_000;

interface LeadParaGoogle {
  name: string;
  address: string | null;
  phone: string | null;
  cidade: string;
  lat: number;
  lon: number;
}

interface TextSearchResponse {
  places?: Array<{ id?: string }>;
}

interface PlaceDetailsResponse {
  id?: string;
  displayName?: { text?: string };
  location?: { latitude?: number; longitude?: number };
  nationalPhoneNumber?: string;
  websiteUri?: string;
}

export type ResultadoGooglePlaces =
  | { status: "nao_configurado" | "limite_atingido" | "falha" }
  | { status: "sem_correspondencia"; checkedAt: Date }
  | {
      status: "correspondencia";
      checkedAt: Date;
      placeId: string;
      websiteUri: string | null;
    };

export interface ResumoGooglePlaces {
  configurado: boolean;
  usados: number;
  limite: number;
  periodo: string;
}

function chaveGoogle(): string | null {
  return process.env.GOOGLE_PLACES_API_KEY?.trim() || null;
}

export function googlePlacesConfigurado(): boolean {
  return chaveGoogle() != null;
}

function periodoAtual(): string {
  return new Date().toISOString().slice(0, 7);
}

function limiteMensal(): number {
  const configurado = Number(process.env.GOOGLE_PLACES_MONTHLY_LIMIT ?? 900);
  if (!Number.isFinite(configurado)) return LIMITE_GRATUITO_SEGURO;
  return Math.max(0, Math.min(LIMITE_GRATUITO_SEGURO, Math.floor(configurado)));
}

export async function obterResumoGooglePlaces(): Promise<ResumoGooglePlaces> {
  const periodo = periodoAtual();
  const uso = await prisma.externalApiUsage.findUnique({
    where: {
      provider_period: { provider: PROVIDER, period: periodo },
    },
    select: { count: true },
  });

  return {
    configurado: googlePlacesConfigurado(),
    usados: uso?.count ?? 0,
    limite: limiteMensal(),
    periodo,
  };
}

/**
 * Reserva uma chamada paga antes de executá-la. O upsert é atômico no Postgres;
 * chamadas concorrentes acima do teto são compensadas e não chegam ao Google.
 */
async function reservarDetalhe(): Promise<boolean> {
  const limite = limiteMensal();
  if (limite === 0) return false;

  const periodo = periodoAtual();
  const uso = await prisma.externalApiUsage.upsert({
    where: {
      provider_period: { provider: PROVIDER, period: periodo },
    },
    create: { provider: PROVIDER, period: periodo, count: 1 },
    update: { count: { increment: 1 } },
    select: { count: true },
  });

  if (uso.count <= limite) return true;

  await prisma.externalApiUsage.update({
    where: {
      provider_period: { provider: PROVIDER, period: periodo },
    },
    data: { count: { decrement: 1 } },
  });
  return false;
}

function normalizar(valor: string): string {
  return valor
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const TERMOS_DESCARTAVEIS = new Set([
  "a",
  "as",
  "da",
  "das",
  "de",
  "do",
  "dos",
  "e",
  "eireli",
  "ltda",
  "me",
  "mei",
]);

function tokens(valor: string): string[] {
  return normalizar(valor)
    .split(" ")
    .filter((token) => token.length >= 2 && !TERMOS_DESCARTAVEIS.has(token));
}

function coberturaDoNome(esperado: string, recebido: string): number {
  const a = tokens(esperado);
  const b = new Set(tokens(recebido));
  if (a.length === 0) return 0;
  return a.filter((token) => b.has(token)).length / a.length;
}

function digitos(valor: string | null | undefined): string {
  return valor?.replace(/\D/g, "") ?? "";
}

function mesmoTelefone(
  esperado: string | null,
  recebido: string | null | undefined,
): boolean {
  const a = digitos(esperado).slice(-8);
  const b = digitos(recebido).slice(-8);
  return a.length === 8 && a === b;
}

function distanciaKm(
  origem: Pick<LeadParaGoogle, "lat" | "lon">,
  destino: { latitude: number; longitude: number },
): number {
  const rad = (graus: number) => (graus * Math.PI) / 180;
  const dLat = rad(destino.latitude - origem.lat);
  const dLon = rad(destino.longitude - origem.lon);
  const lat1 = rad(origem.lat);
  const lat2 = rad(destino.latitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  const hSeguro = Math.max(0, Math.min(1, h));
  return 6371 * 2 * Math.atan2(Math.sqrt(hSeguro), Math.sqrt(1 - hSeguro));
}

export function correspondeAoLead(
  lead: LeadParaGoogle,
  place: PlaceDetailsResponse,
): boolean {
  const nome = place.displayName?.text;
  if (!nome) return false;

  const telefoneIgual = mesmoTelefone(lead.phone, place.nationalPhoneNumber);
  const latitude = place.location?.latitude;
  const longitude = place.location?.longitude;
  const distancia =
    typeof latitude === "number" && typeof longitude === "number"
      ? distanciaKm(lead, { latitude, longitude })
      : null;
  const nomeCompativel =
    normalizar(nome).includes(normalizar(lead.name)) ||
    normalizar(lead.name).includes(normalizar(nome)) ||
    coberturaDoNome(lead.name, nome) >= 0.6;

  return telefoneIgual || (nomeCompativel && distancia != null && distancia <= 2.5);
}

async function pesquisarPrimeiroId(
  lead: LeadParaGoogle,
  apiKey: string,
): Promise<string | null> {
  const consulta = [lead.name, lead.address, lead.cidade, "Brasil"]
    .filter(Boolean)
    .join(", ");
  const response = await fetchWithTimeout(
    `${GOOGLE_PLACES_BASE}/places:searchText`,
    {
      method: "POST",
      timeoutMs: TIMEOUT_MS,
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        // O SKU de busca apenas por ID não tem cobrança.
        "X-Goog-FieldMask": "places.id",
      },
      body: JSON.stringify({
        textQuery: consulta,
        languageCode: "pt-BR",
        regionCode: "BR",
        pageSize: 1,
        locationBias: {
          circle: {
            center: { latitude: lead.lat, longitude: lead.lon },
            radius: 2_500,
          },
        },
      }),
    },
  );

  if (!response.ok) {
    throw new Error(`Google Text Search respondeu HTTP ${response.status}.`);
  }

  const body = (await response.json()) as TextSearchResponse;
  return body.places?.[0]?.id ?? null;
}

async function buscarDetalhes(
  placeId: string,
  apiKey: string,
): Promise<PlaceDetailsResponse> {
  const response = await fetchWithTimeout(
    `${GOOGLE_PLACES_BASE}/places/${encodeURIComponent(placeId)}`,
    {
      timeoutMs: TIMEOUT_MS,
      headers: {
        "X-Goog-Api-Key": apiKey,
        // websiteUri eleva a chamada ao SKU Place Details Enterprise.
        "X-Goog-FieldMask": [
          "id",
          "displayName",
          "location",
          "nationalPhoneNumber",
          "websiteUri",
        ].join(","),
      },
    },
  );

  if (!response.ok) {
    throw new Error(`Google Place Details respondeu HTTP ${response.status}.`);
  }
  return (await response.json()) as PlaceDetailsResponse;
}

/**
 * Usa os dados do Places somente durante a verificação. Persistimos apenas o
 * Place ID permitido e, quando houver site, validamos a URL diretamente antes
 * de salvar o resultado do nosso próprio checker.
 */
export async function verificarNoGooglePlaces(
  lead: LeadParaGoogle,
): Promise<ResultadoGooglePlaces> {
  const apiKey = chaveGoogle();
  if (!apiKey) return { status: "nao_configurado" };

  try {
    const placeId = await pesquisarPrimeiroId(lead, apiKey);
    if (!placeId) {
      return { status: "sem_correspondencia", checkedAt: new Date() };
    }
    if (!(await reservarDetalhe())) return { status: "limite_atingido" };

    const place = await buscarDetalhes(placeId, apiKey);
    const checkedAt = new Date();
    if (!correspondeAoLead(lead, place) || !place.id) {
      return { status: "sem_correspondencia", checkedAt };
    }

    return {
      status: "correspondencia",
      checkedAt,
      placeId: place.id,
      websiteUri: place.websiteUri?.trim() || null,
    };
  } catch (erro) {
    console.error(
      "Falha ao verificar estabelecimento no Google Places",
      erro instanceof Error ? erro.message : erro,
    );
    return { status: "falha" };
  }
}
