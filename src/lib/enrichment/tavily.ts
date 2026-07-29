import { prisma } from "@/lib/db";
import { fetchWithTimeout } from "@/lib/http";

const TAVILY_SEARCH_URL = "https://api.tavily.com/search";
const PROVIDER = "tavily-search-basic";
const LIMITE_GRATUITO_SEGURO = 900;
const TIMEOUT_MS = 12_000;

export interface LeadParaTavily {
  name: string;
  address: string | null;
  phone: string | null;
  cidade: string;
}

interface TavilySearchResult {
  title?: string;
  url?: string;
  content?: string;
  score?: number;
}

interface TavilySearchResponse {
  results?: TavilySearchResult[];
}

export type ResultadoTavily =
  | { status: "nao_configurado" | "limite_atingido" | "falha" }
  | { status: "sem_candidato"; checkedAt: Date }
  | { status: "candidatos"; checkedAt: Date; urls: string[] };

export interface ResumoTavily {
  configurado: boolean;
  usados: number;
  limite: number;
  periodo: string;
}

const DOMINIOS_DESCARTADOS = [
  "instagram.com",
  "facebook.com",
  "fb.com",
  "linkedin.com",
  "youtube.com",
  "tiktok.com",
  "x.com",
  "twitter.com",
  "linktr.ee",
  "linktree.com",
  "wa.me",
  "whatsapp.com",
  "google.com",
  "goo.gl",
  "bing.com",
  "yahoo.com",
  "tripadvisor.com",
  "tripadvisor.com.br",
  "yelp.com",
  "foursquare.com",
  "doctoralia.com.br",
  "telelistas.net",
  "apontador.com.br",
  "cylex.com.br",
  "solutudo.com.br",
  "econodata.com.br",
  "cnpj.biz",
  "casadosdados.com.br",
  "guiamais.com.br",
  "guiatelefone.com",
  "br.todosnegocios.com",
];

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

function chaveTavily(): string | null {
  return process.env.TAVILY_API_KEY?.trim() || null;
}

export function tavilyConfigurado(): boolean {
  return chaveTavily() != null;
}

function periodoAtual(): string {
  return new Date().toISOString().slice(0, 7);
}

function limiteMensal(): number {
  const configurado = Number(process.env.TAVILY_MONTHLY_LIMIT ?? 900);
  if (!Number.isFinite(configurado)) return LIMITE_GRATUITO_SEGURO;
  return Math.max(0, Math.min(LIMITE_GRATUITO_SEGURO, Math.floor(configurado)));
}

export async function obterResumoTavily(): Promise<ResumoTavily> {
  const periodo = periodoAtual();
  const uso = await prisma.externalApiUsage.findUnique({
    where: {
      provider_period: { provider: PROVIDER, period: periodo },
    },
    select: { count: true },
  });

  return {
    configurado: tavilyConfigurado(),
    usados: uso?.count ?? 0,
    limite: limiteMensal(),
    periodo,
  };
}

/**
 * Reserva um crédito antes da busca. O teto de 900 deixa uma margem de 100
 * créditos no plano gratuito da Tavily para testes manuais e eventuais retries.
 */
async function reservarCredito(): Promise<boolean> {
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

export function normalizarTexto(valor: string): string {
  return valor
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function tokensRelevantes(valor: string): string[] {
  return normalizarTexto(valor)
    .split(" ")
    .filter((token) => token.length >= 2 && !TERMOS_DESCARTAVEIS.has(token));
}

function cobertura(esperado: string, recebido: string): number {
  const esperados = tokensRelevantes(esperado);
  const recebidos = new Set(tokensRelevantes(recebido));
  if (esperados.length === 0) return 0;
  return esperados.filter((token) => recebidos.has(token)).length / esperados.length;
}

function hostDaUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password) {
      return null;
    }
    return parsed.hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

function dominioDescartado(host: string): boolean {
  return DOMINIOS_DESCARTADOS.some(
    (dominio) => host === dominio || host.endsWith(`.${dominio}`),
  );
}

function telefoneCompativel(
  esperado: string | null,
  texto: string,
): boolean {
  const ultimosOito = esperado?.replace(/\D/g, "").slice(-8) ?? "";
  return (
    ultimosOito.length === 8 &&
    texto.replace(/\D/g, "").includes(ultimosOito)
  );
}

interface CandidatoPontuado {
  url: string;
  pontos: number;
}

/**
 * Seleciona somente resultados que parecem ser o domínio oficial. A resposta
 * ainda será baixada e conferida pelo nosso checker antes de virar `tem site`.
 */
export function selecionarCandidatosTavily(
  lead: LeadParaTavily,
  resultados: TavilySearchResult[],
): string[] {
  const cidadeNormalizada = normalizarTexto(lead.cidade);
  const candidatos: CandidatoPontuado[] = [];
  const vistos = new Set<string>();

  for (const resultado of resultados) {
    const url = resultado.url?.trim();
    if (!url || vistos.has(url)) continue;

    const host = hostDaUrl(url);
    if (!host || dominioDescartado(host)) continue;

    const titulo = resultado.title ?? "";
    const trecho = resultado.content ?? "";
    const texto = `${titulo} ${trecho}`;
    const coberturaHost = cobertura(lead.name, host.replace(/[.-]/g, " "));
    const coberturaTitulo = cobertura(lead.name, titulo);
    const coberturaTrecho = cobertura(lead.name, trecho);
    const temCidade = normalizarTexto(texto).includes(cidadeNormalizada);
    const temTelefone = telefoneCompativel(lead.phone, texto);

    const nomeForte =
      coberturaTitulo >= 0.6 ||
      coberturaHost >= 0.5 ||
      (coberturaTrecho >= 0.75 && temCidade);
    if (!temTelefone && !nomeForte) continue;

    let pontos = (resultado.score ?? 0) * 2;
    pontos += coberturaHost * 5;
    pontos += coberturaTitulo * 3;
    pontos += coberturaTrecho * 2;
    if (temCidade) pontos += 1.5;
    if (temTelefone) pontos += 5;

    try {
      const caminho = new URL(url).pathname.replace(/\/+$/, "");
      if (!caminho) pontos += 0.5;
    } catch {
      continue;
    }

    vistos.add(url);
    candidatos.push({ url, pontos });
  }

  return candidatos
    .sort((a, b) => b.pontos - a.pontos)
    .slice(0, 3)
    .map((candidato) => candidato.url);
}

export async function buscarSitesNoTavily(
  lead: LeadParaTavily,
): Promise<ResultadoTavily> {
  const apiKey = chaveTavily();
  if (!apiKey) return { status: "nao_configurado" };
  if (!(await reservarCredito())) return { status: "limite_atingido" };

  try {
    const consulta = [`"${lead.name}"`, lead.cidade, lead.address, "site oficial"]
      .filter(Boolean)
      .join(" ");
    const response = await fetchWithTimeout(TAVILY_SEARCH_URL, {
      method: "POST",
      timeoutMs: TIMEOUT_MS,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: consulta,
        topic: "general",
        search_depth: "basic",
        max_results: 5,
        country: "brazil",
        auto_parameters: false,
        include_answer: false,
        include_raw_content: false,
        include_images: false,
        include_favicon: false,
        include_usage: true,
        exclude_domains: DOMINIOS_DESCARTADOS,
      }),
    });

    if (!response.ok) {
      throw new Error(`Tavily Search respondeu HTTP ${response.status}.`);
    }

    const body = (await response.json()) as TavilySearchResponse;
    const checkedAt = new Date();
    const urls = selecionarCandidatosTavily(lead, body.results ?? []);
    return urls.length > 0
      ? { status: "candidatos", checkedAt, urls }
      : { status: "sem_candidato", checkedAt };
  } catch (erro) {
    console.error(
      "Falha ao buscar site oficial na Tavily",
      erro instanceof Error ? erro.message : erro,
    );
    return { status: "falha" };
  }
}
