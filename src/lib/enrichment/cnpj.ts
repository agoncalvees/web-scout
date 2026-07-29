import { Porte } from "@/generated/prisma/enums";
import { prisma } from "@/lib/db";
import { createRateLimiter, fetchWithTimeout } from "@/lib/http";

/**
 * Consulta de CNPJ.
 *
 * Importante: BrasilAPI e minhaReceita só resolvem **CNPJ → dados**. Nenhuma das
 * duas faz busca reversa por nome/endereço (ambas devolvem 400 para `?q=nome`).
 * Então a única origem automática de CNPJ aqui é a tag do OSM (`ref:vatin` e
 * variantes), presente em ~1% dos POIs. Os demais leads ficam `sem_cnpj` e têm
 * o tier definido pela categoria — veja `calcularTier` em `@/lib/pricing`.
 */

const ENDPOINTS = [
  (cnpj: string) => `https://brasilapi.com.br/api/cnpj/v1/${cnpj}`,
  (cnpj: string) => `https://minhareceita.org/${cnpj}`,
] as const;

/** Ambas as APIs têm rate limit não documentado; serializamos com folga. */
const limitar = createRateLimiter(1_500);

const FETCH_TIMEOUT_MS = 15_000;

/** Extrai 14 dígitos de `"BR12345678000199"`, `"12.345.678/0001-99"` etc. */
export function normalizarCnpj(bruto: string | null | undefined): string | null {
  if (!bruto) return null;
  const digitos = bruto.replace(/\D/g, "");
  return digitos.length === 14 ? digitos : null;
}

/**
 * Valida os dois dígitos verificadores do CNPJ.
 *
 * Vale o esforço: a tag do OSM é preenchida à mão e um CNPJ inválido gastaria
 * uma chamada de API (que tem rate limit) para nada.
 */
export function cnpjValido(cnpj: string): boolean {
  if (!/^\d{14}$/.test(cnpj)) return false;
  // Sequências repetidas (00000000000000 etc.) passam no cálculo mas não existem.
  if (/^(\d)\1{13}$/.test(cnpj)) return false;

  const digito = (base: string): number => {
    // Pesos 2..9 cíclicos, da direita para a esquerda.
    let soma = 0;
    let peso = 2;
    for (let i = base.length - 1; i >= 0; i--) {
      soma += Number(base[i]) * peso;
      peso = peso === 9 ? 2 : peso + 1;
    }
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };

  const d1 = digito(cnpj.slice(0, 12));
  const d2 = digito(cnpj.slice(0, 12) + String(d1));
  return cnpj === cnpj.slice(0, 12) + String(d1) + String(d2);
}

/** Resposta das APIs, só com os campos que usamos. */
interface RespostaCnpj {
  razao_social?: string;
  nome_fantasia?: string;
  porte?: string;
  codigo_porte?: string | number;
  opcao_pelo_mei?: boolean | string | null;
  municipio?: string;
  uf?: string;
  descricao_situacao_cadastral?: string;
}

/**
 * Traduz o porte da Receita para o nosso enum.
 *
 * O código da Receita é o sinal confiável (`01` ME, `03` EPP, `05` DEMAIS); o
 * campo textual varia entre as duas APIs. MEI não é um porte separado na
 * Receita — é a opção tributária, então tem precedência sobre o código.
 *
 * Devolve `null` no porte "00 / NÃO INFORMADO": o CNPJ existe, mas não dá para
 * inferir tamanho. Nesse caso o preço cai no fallback por categoria, em vez de
 * chutar a faixa mais alta e superestimar o orçamento do lead.
 */
export function mapearPorte(r: RespostaCnpj): Porte | null {
  if (r.opcao_pelo_mei === true) return Porte.MEI;

  const codigo = String(r.codigo_porte ?? "").padStart(2, "0");
  if (codigo === "01") return Porte.ME;
  if (codigo === "03") return Porte.EPP;
  if (codigo === "05") return Porte.DEMAIS;

  const texto = (r.porte ?? "").toUpperCase();
  if (texto.includes("MICRO EMPRESA") || texto === "ME") return Porte.ME;
  if (texto.includes("PEQUENO PORTE") || texto === "EPP") return Porte.EPP;
  if (texto.includes("DEMAIS")) return Porte.DEMAIS;

  return null;
}

export interface ResultadoCnpj {
  cnpj: string;
  /** `null` quando a Receita não informa o porte. */
  porte: Porte | null;
  razaoSocial: string | null;
  nomeFantasia: string | null;
}

async function consultarApi(cnpj: string): Promise<RespostaCnpj | null> {
  const erros: string[] = [];

  for (const montarUrl of ENDPOINTS) {
    const url = montarUrl(cnpj);
    try {
      const res = await limitar(() =>
        fetchWithTimeout(url, { timeoutMs: FETCH_TIMEOUT_MS }),
      );

      // 404 é resposta definitiva: o CNPJ não existe. Não tenta o próximo.
      if (res.status === 404) return null;

      if (!res.ok) {
        erros.push(`${url} → HTTP ${res.status}`);
        continue;
      }

      return (await res.json()) as RespostaCnpj;
    } catch (err) {
      erros.push(`${url} → ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  throw new Error(`Consulta de CNPJ falhou.\n${erros.join("\n")}`);
}

/**
 * Resolve um CNPJ, servindo do cache quando já conhecido.
 *
 * O cache é obrigatório e compartilhado entre leads: filiais da mesma rede
 * repetem CNPJ, e as duas APIs têm rate limit.
 *
 * Devolve `null` quando o CNPJ é inválido ou não existe na Receita.
 */
export async function resolverCnpj(bruto: string | null): Promise<ResultadoCnpj | null> {
  const cnpj = normalizarCnpj(bruto);
  if (!cnpj || !cnpjValido(cnpj)) return null;

  const cacheado = await prisma.cnpjCache.findUnique({ where: { cnpj } });
  if (cacheado) {
    return {
      cnpj,
      porte: cacheado.porte,
      razaoSocial: cacheado.razaoSocial,
      nomeFantasia: cacheado.nomeFantasia,
    };
  }

  const resposta = await consultarApi(cnpj);
  if (!resposta) return null;

  const porte = mapearPorte(resposta);

  await prisma.cnpjCache.upsert({
    where: { cnpj },
    create: {
      cnpj,
      razaoSocial: resposta.razao_social ?? null,
      nomeFantasia: resposta.nome_fantasia ?? null,
      porte,
      municipio: resposta.municipio ?? null,
      uf: resposta.uf ?? null,
      raw: resposta as object,
    },
    update: {},
  });

  return {
    cnpj,
    porte,
    razaoSocial: resposta.razao_social ?? null,
    nomeFantasia: resposta.nome_fantasia ?? null,
  };
}
