import { SiteStatus } from "@/generated/prisma/enums";
import { fetchWithTimeout } from "@/lib/http";
import {
  googlePlacesConfigurado,
  verificarNoGooglePlaces,
} from "./google-places";

const SITE_CHECK_VERSION_LOCAL = "v3-local-2026-07";
const SITE_CHECK_VERSION_GOOGLE = "v3-google-places-2026-07";

export function versaoVerificacaoSiteAtual(): string {
  return googlePlacesConfigurado()
    ? SITE_CHECK_VERSION_GOOGLE
    : SITE_CHECK_VERSION_LOCAL;
}

/**
 * Domínios que indicam presença em rede social, não site próprio — que é
 * exatamente o perfil de lead que interessa.
 */
const REDES_SOCIAIS = [
  "instagram.com",
  "facebook.com",
  "fb.com",
  "linktr.ee",
  "linktree.com",
  "wa.me",
  "api.whatsapp.com",
  "x.com",
  "twitter.com",
  "tiktok.com",
  "youtube.com",
  "linkedin.com",
  "google.com",
  "goo.gl",
  "maps.app.goo.gl",
  "beacons.ai",
  "bio.link",
];

/** Timeout curto: são ~30 checagens por lote, dentro do limite de 300s. */
const CHECK_TIMEOUT_MS = 8_000;

export function ehRedeSocial(url: string): boolean {
  const host = extrairHost(url);
  if (!host) return false;
  return REDES_SOCIAIS.some((d) => host === d || host.endsWith(`.${d}`));
}

function extrairHost(url: string): string | null {
  try {
    const comEsquema = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    return new URL(comEsquema).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

function normalizarUrl(url: string): string | null {
  const host = extrairHost(url);
  if (!host) return null;
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

const EMAILS_GRATUITOS = new Set([
  "bol.com.br",
  "gmail.com",
  "hotmail.com",
  "icloud.com",
  "live.com",
  "outlook.com",
  "proton.me",
  "protonmail.com",
  "terra.com.br",
  "uol.com.br",
  "yahoo.com",
  "yahoo.com.br",
]);

function sitePeloEmail(email: string | null): string | null {
  const dominio = email?.trim().toLowerCase().split("@")[1];
  if (!dominio || EMAILS_GRATUITOS.has(dominio) || !dominio.includes(".")) {
    return null;
  }
  return normalizarUrl(dominio);
}

/** Palavras genéricas de categoria e conectivos, que poluem o slug. */
const GENERICAS = new Set([
  "clinica",
  "clinicas",
  "consultorio",
  "odontologica",
  "odontologico",
  "odontologia",
  "salao",
  "beleza",
  "estetica",
  "restaurante",
  "advocacia",
  "advogados",
  "escritorio",
  "dr",
  "dra",
  "doutor",
  "doutora",
  "de",
  "da",
  "do",
  "das",
  "dos",
  "e",
  "ltda",
  "me",
  "mei",
]);

export interface CandidatoDominio {
  url: string;
  /** Confiança atribuída se *este* candidato responder. */
  confianca: number;
  /**
   * Se um acerto aqui é forte o bastante para concluir `tem_site_ativo`.
   *
   * Nome de uma só palavra gera domínio genérico que provavelmente é de outra
   * empresa ("Pesqueiro" → pesqueiro.com.br). Nesse caso o acerto vira
   * `checar_manualmente`: um humano decide, em vez de descartar o lead.
   */
  conclusivo: boolean;
}

/**
 * Gera candidatos de domínio a partir do nome do estabelecimento, **em ordem de
 * precisão decrescente**.
 *
 * A ordem importa: um acerto encerra a busca e marca o lead como
 * `tem_site_ativo`, tirando-o da lista de prospecção. Um falso positivo custa um
 * lead bom, então o slug do nome inteiro — específico e improvável de colidir —
 * vem antes do slug reduzido, que tem mais alcance mas colide fácil
 * ("Salão Beleza Pura" reduz para "pura", e `pura.com.br` é de outra empresa).
 */
export function candidatosDeDominio(nome: string): CandidatoDominio[] {
  const semAcento = nome
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

  const todasPalavras = semAcento
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

  const especificas = todasPalavras.filter((p) => !GENERICAS.has(p));

  const candidatos: CandidatoDominio[] = [];
  const vistos = new Set<string>();

  // Um nome de palavra única não distingue a empresa do substantivo comum.
  const conclusivo = todasPalavras.length >= 2;

  function adicionar(base: string, confianca: number) {
    if (base.length < 5 || base.length > 40) return;
    for (const tld of [".com.br", ".com"]) {
      const url = `https://${base}${tld}`;
      if (vistos.has(url)) continue;
      vistos.add(url);
      candidatos.push({ url, confianca, conclusivo });
    }
  }

  // 1. Nome inteiro concatenado: o candidato mais específico.
  adicionar(todasPalavras.join(""), 0.6);

  // 2. Só as palavras específicas — mais provável de ser o domínio real, mas
  //    também mais sujeito a homônimo. Uma palavra só é fraca demais para
  //    justificar descartar o lead.
  if (especificas.length >= 2) {
    adicionar(especificas.join(""), 0.5);
    adicionar(especificas.join("-"), 0.5);
  }

  // Mais que isso estoura o orçamento de tempo do lote.
  return candidatos.slice(0, 4);
}

export interface ResultadoChecagem {
  vivo: boolean;
  /** URL final após redirects, quando disponível. */
  urlFinal: string;
}

/**
 * Verifica se a URL responde. Tenta HEAD (barato) e cai pra GET, porque muitos
 * servidores de site pequeno respondem 405 a HEAD.
 */
export async function checarUrl(url: string): Promise<ResultadoChecagem> {
  for (const method of ["HEAD", "GET"] as const) {
    try {
      const res = await fetchWithTimeout(url, {
        method,
        timeoutMs: CHECK_TIMEOUT_MS,
        redirect: "follow",
      });

      if (res.status === 405 || res.status === 501) continue; // método não suportado
      return { vivo: res.status < 400, urlFinal: res.url || url };
    } catch {
      // DNS inexistente, TLS inválido, timeout: tenta o próximo método.
    }
  }
  return { vivo: false, urlFinal: url };
}

export interface LeadParaEnriquecer {
  name: string;
  websiteRaw: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  cidade: string;
  lat: number;
  lon: number;
}

export interface EnrichmentSite {
  siteStatus: SiteStatus;
  siteUrl: string | null;
  siteConfidence: number;
  googlePlaceId?: string | null;
  googleCheckedAt?: Date | null;
}

/**
 * Classifica a presença digital de um lead.
 *
 * - website do OSM, não-social, vivo        → tem_site_ativo (confiança alta)
 * - website do OSM, não-social, morto       → site_fora_do_ar
 * - só rede social e nenhum domínio adivinhado responde → sem_site_alta_confianca
 * - domínio adivinhado responde             → tem_site_ativo (confiança média)
 * - sem website e nenhum candidato plausível → checar_manualmente
 */
export async function enriquecerSite(lead: LeadParaEnriquecer): Promise<EnrichmentSite> {
  const bruto = lead.websiteRaw?.trim();
  const urlDeclarada = bruto ? normalizarUrl(bruto) : null;

  if (urlDeclarada && !ehRedeSocial(urlDeclarada)) {
    const { vivo, urlFinal } = await checarUrl(urlDeclarada);
    return vivo
      ? { siteStatus: SiteStatus.tem_site_ativo, siteUrl: urlFinal, siteConfidence: 1 }
      : {
          siteStatus: SiteStatus.site_fora_do_ar,
          siteUrl: urlDeclarada,
          siteConfidence: 0.9,
        };
  }

  // Um e-mail corporativo revela o domínio sem depender de nenhuma API paga.
  const urlDoEmail = sitePeloEmail(lead.email);
  if (urlDoEmail) {
    const { vivo, urlFinal } = await checarUrl(urlDoEmail);
    if (vivo) {
      return {
        siteStatus: SiteStatus.tem_site_ativo,
        siteUrl: urlFinal,
        siteConfidence: 0.95,
      };
    }
  }

  // Sem site próprio declarado (ausente ou só rede social): tenta adivinhar.
  const candidatos = candidatosDeDominio(lead.name);

  for (const candidato of candidatos) {
    const { vivo, urlFinal } = await checarUrl(candidato.url);
    if (vivo) {
      // O domínio existe, mas pode ser homônimo de outra cidade/ramo — daí a
      // confiança parcial e nunca o status de "sem site".
      return {
        siteStatus: candidato.conclusivo
          ? SiteStatus.tem_site_ativo
          : SiteStatus.checar_manualmente,
        siteUrl: urlFinal,
        siteConfidence: candidato.confianca,
      };
    }
  }

  const google = await verificarNoGooglePlaces(lead);
  if (google.status === "correspondencia") {
    if (!google.websiteUri || ehRedeSocial(google.websiteUri)) {
      return {
        siteStatus: SiteStatus.sem_site_alta_confianca,
        siteUrl: urlDeclarada,
        siteConfidence: 0.95,
        googlePlaceId: google.placeId,
        googleCheckedAt: google.checkedAt,
      };
    }

    const { vivo, urlFinal } = await checarUrl(google.websiteUri);
    return {
      siteStatus: vivo
        ? SiteStatus.tem_site_ativo
        : SiteStatus.site_fora_do_ar,
      siteUrl: vivo ? urlFinal : google.websiteUri,
      siteConfidence: 0.98,
      googlePlaceId: google.placeId,
      googleCheckedAt: google.checkedAt,
    };
  }

  if (google.status === "sem_correspondencia") {
    return {
      siteStatus: SiteStatus.checar_manualmente,
      siteUrl: urlDeclarada,
      siteConfidence: candidatos.length === 0 ? 0.15 : 0.3,
      googleCheckedAt: google.checkedAt,
    };
  }

  // Sem Google configurado, com limite esgotado ou em falha transitória, a
  // ausência de um domínio adivinhável não prova que a empresa não possui site.
  return {
    siteStatus: SiteStatus.checar_manualmente,
    siteUrl: urlDeclarada,
    siteConfidence: urlDeclarada ? 0.45 : 0.2,
  };
}
