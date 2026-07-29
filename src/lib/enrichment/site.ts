import { SiteStatus } from "@/generated/prisma/enums";
import { fetchWithTimeout } from "@/lib/http";
import {
  googlePlacesConfigurado,
  verificarNoGooglePlaces,
} from "./google-places";
import {
  buscarSitesNoTavily,
  normalizarTexto,
  tavilyConfigurado,
  tokensRelevantes,
} from "./tavily";

const SITE_CHECK_VERSION_LOCAL = "v3-local-2026-07";
const SITE_CHECK_VERSION_GOOGLE = "v3-google-places-2026-07";
const SITE_CHECK_VERSION_TAVILY = "v4-tavily-2026-07";

export function versaoVerificacaoSiteAtual(): string {
  if (tavilyConfigurado()) return SITE_CHECK_VERSION_TAVILY;
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

/** Evita protocolos estranhos, credenciais embutidas e IPs locais/privados. */
export function ehUrlHttpPublica(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (
      !["http:", "https:"].includes(parsed.protocol) ||
      parsed.username ||
      parsed.password
    ) {
      return false;
    }

    const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");
    if (
      host === "localhost" ||
      host.endsWith(".localhost") ||
      host.endsWith(".local") ||
      host === "::1" ||
      host === "0:0:0:0:0:0:0:1" ||
      host.startsWith("fc") ||
      host.startsWith("fd") ||
      host.startsWith("fe8") ||
      host.startsWith("fe9") ||
      host.startsWith("fea") ||
      host.startsWith("feb")
    ) {
      return false;
    }

    const partes = host.split(".");
    if (partes.length === 4 && partes.every((parte) => /^\d+$/.test(parte))) {
      const [a, b] = partes.map(Number);
      if (
        a === 0 ||
        a === 10 ||
        a === 127 ||
        (a === 169 && b === 254) ||
        (a === 172 && b >= 16 && b <= 31) ||
        (a === 192 && b === 168) ||
        a >= 224
      ) {
        return false;
      }
    }

    return Boolean(host);
  } catch {
    return false;
  }
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
  if (!ehUrlHttpPublica(url)) return { vivo: false, urlFinal: url };

  for (const method of ["HEAD", "GET"] as const) {
    try {
      const res = await fetchWithTimeout(url, {
        method,
        timeoutMs: CHECK_TIMEOUT_MS,
        redirect: "follow",
      });

      if (res.status === 405 || res.status === 501) continue; // método não suportado
      const urlFinal = res.url || url;
      return {
        vivo: res.status < 400 && ehUrlHttpPublica(urlFinal),
        urlFinal,
      };
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
  tavilyCheckedAt?: Date | null;
}

function coberturaDeTokens(esperados: string[], texto: string): number {
  if (esperados.length === 0) return 0;
  const recebidos = new Set(tokensRelevantes(texto));
  return esperados.filter((token) => recebidos.has(token)).length / esperados.length;
}

function telefoneNaPagina(telefone: string | null, html: string): boolean {
  const ultimosOito = telefone?.replace(/\D/g, "").slice(-8) ?? "";
  return (
    ultimosOito.length === 8 &&
    html.replace(/\D/g, "").includes(ultimosOito)
  );
}

/**
 * Confere se uma página candidata pertence ao estabelecimento. Um resultado de
 * busca sozinho nunca é suficiente: diretórios e matérias podem citar o nome.
 */
export function siteCorrespondeAoLead(
  lead: LeadParaEnriquecer,
  url: string,
  html: string,
): boolean {
  if (telefoneNaPagina(lead.phone, html)) return true;

  const nomeNormalizado = normalizarTexto(lead.name);
  const paginaNormalizada = normalizarTexto(html.slice(0, 250_000));
  const cidadeNormalizada = normalizarTexto(lead.cidade);
  const nomeTokens = tokensRelevantes(lead.name);
  const temNomeExato =
    nomeNormalizado.length >= 5 && paginaNormalizada.includes(nomeNormalizado);
  const coberturaPagina = coberturaDeTokens(nomeTokens, paginaNormalizada);
  const temCidade =
    cidadeNormalizada.length >= 3 &&
    paginaNormalizada.includes(cidadeNormalizada);

  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, "").replace(/[.-]/g, " ");
    const coberturaHost = coberturaDeTokens(nomeTokens, host);
    const paginaRaiz = parsed.pathname.replace(/\/+$/, "") === "";

    if (nomeTokens.length === 1) {
      return coberturaHost === 1 && temCidade && coberturaPagina === 1;
    }

    return (
      (coberturaHost >= 0.5 &&
        coberturaPagina >= 0.6 &&
        (temCidade || coberturaHost >= 0.75)) ||
      (paginaRaiz && temNomeExato && temCidade)
    );
  } catch {
    return false;
  }
}

async function checarSiteDoLead(
  url: string,
  lead: LeadParaEnriquecer,
): Promise<ResultadoChecagem & { confirmado: boolean }> {
  if (!ehUrlHttpPublica(url)) {
    return { vivo: false, urlFinal: url, confirmado: false };
  }

  try {
    const res = await fetchWithTimeout(url, {
      method: "GET",
      timeoutMs: CHECK_TIMEOUT_MS,
      redirect: "follow",
      headers: {
        Accept: "text/html,application/xhtml+xml",
      },
    });
    const urlFinal = res.url || url;
    const vivo = res.status < 400 && ehUrlHttpPublica(urlFinal);
    const contentType = res.headers.get("content-type")?.toLowerCase() ?? "";
    if (!vivo || (!contentType.includes("text/html") && contentType !== "")) {
      return { vivo, urlFinal, confirmado: false };
    }

    const html = (await res.text()).slice(0, 250_000);
    return {
      vivo,
      urlFinal,
      confirmado: siteCorrespondeAoLead(lead, urlFinal, html),
    };
  } catch {
    return { vivo: false, urlFinal: url, confirmado: false };
  }
}

/**
 * Classifica a presença digital de um lead.
 *
 * - website do OSM, não-social, vivo        → tem_site_ativo (confiança alta)
 * - website do OSM, não-social, morto       → site_fora_do_ar
 * - Tavily não encontra domínio oficial plausível → sem_site_alta_confianca
 * - domínio adivinhado responde             → tem_site_ativo (confiança média)
 * - busca inconclusiva ou indisponível       → checar_manualmente
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
    const { vivo, urlFinal, confirmado } = await checarSiteDoLead(
      candidato.url,
      lead,
    );
    if (vivo && confirmado) {
      return {
        siteStatus: candidato.conclusivo
          ? SiteStatus.tem_site_ativo
          : SiteStatus.checar_manualmente,
        siteUrl: urlFinal,
        siteConfidence: candidato.confianca,
      };
    }
  }

  // A busca web gratuita encontra domínios que não seguem o nome óbvio da
  // empresa. O resultado só vale depois de baixarmos e validarmos a página.
  const tavily = await buscarSitesNoTavily(lead);
  if (tavily.status === "candidatos") {
    for (const url of tavily.urls) {
      const { vivo, urlFinal, confirmado } = await checarSiteDoLead(url, lead);
      if (vivo && confirmado) {
        return {
          siteStatus: SiteStatus.tem_site_ativo,
          siteUrl: urlFinal,
          siteConfidence: 0.9,
          tavilyCheckedAt: tavily.checkedAt,
        };
      }
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
        tavilyCheckedAt:
          tavily.status === "candidatos" || tavily.status === "sem_candidato"
            ? tavily.checkedAt
            : undefined,
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
      tavilyCheckedAt:
        tavily.status === "candidatos" || tavily.status === "sem_candidato"
          ? tavily.checkedAt
          : undefined,
    };
  }

  if (tavily.status === "sem_candidato") {
    return {
      siteStatus: SiteStatus.sem_site_alta_confianca,
      siteUrl: urlDeclarada,
      siteConfidence: 0.82,
      tavilyCheckedAt: tavily.checkedAt,
      googleCheckedAt:
        google.status === "sem_correspondencia" ? google.checkedAt : undefined,
    };
  }

  if (tavily.status === "candidatos") {
    return {
      siteStatus: SiteStatus.checar_manualmente,
      siteUrl: urlDeclarada,
      siteConfidence: 0.45,
      tavilyCheckedAt: tavily.checkedAt,
      googleCheckedAt:
        google.status === "sem_correspondencia" ? google.checkedAt : undefined,
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

  // Sem verificador configurado, com limite esgotado ou em falha transitória, a
  // ausência de um domínio adivinhável não prova que a empresa não possui site.
  return {
    siteStatus: SiteStatus.checar_manualmente,
    siteUrl: urlDeclarada,
    siteConfidence: urlDeclarada ? 0.45 : 0.2,
  };
}
