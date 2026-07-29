import type { CategoriaBusca } from "@/lib/categorias";

/** Lead como sai da fonte de descoberta, antes de ir pro banco. */
export interface LeadCru {
  /** Identificador estável na fonte. No OSM: `"<tipo>/<id>"`. */
  osmId: string;
  name: string;
  category: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  instagram: string | null;
  facebook: string | null;
  openingHours: string | null;
  brand: string | null;
  operator: string | null;
  lat: number;
  lon: number;
  /** Site como veio da fonte, sem tratamento (pode ser rede social). */
  websiteRaw: string | null;
  /** CNPJ como veio da fonte, sem validar (ex: `"BR12345678000199"`). */
  cnpjRaw: string | null;
}

export interface BuscaParams {
  categoria: CategoriaBusca;
  cidade: string;
  raioKm: number;
}

export interface Centro {
  lat: number;
  lon: number;
  /** Nome completo resolvido pelo geocoder, pra confirmar que achou a cidade certa. */
  displayName: string;
}

export interface BuscaResultado {
  centro: Centro;
  leads: LeadCru[];
}

/**
 * Fonte de descoberta de leads.
 *
 * Existe só pra manter o Scout desacoplado: hoje há uma implementação (OSM via
 * Overpass), e um fallback via Google Places Text Search pode ser plugado
 * depois sem tocar nas rotas nem na UI.
 */
export interface LeadSource {
  readonly nome: string;
  buscar(params: BuscaParams): Promise<BuscaResultado>;
}

/** Erro esperado de fonte (cidade não encontrada, API fora). Vira mensagem na UI. */
export class LeadSourceError extends Error {
  constructor(
    message: string,
    readonly causa?: unknown,
  ) {
    super(message);
    this.name = "LeadSourceError";
  }
}
