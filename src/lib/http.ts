/**
 * User-Agent identificando a aplicação. Nominatim exige um UA customizado com
 * forma de contato; requisições com UA genérico levam bloqueio.
 * https://operations.osmfoundation.org/policies/nominatim/
 */
export const USER_AGENT =
  process.env.OSM_USER_AGENT ??
  "webscout-prospector/0.1 (+https://github.com/seu-usuario/webscout)";

export class HttpTimeoutError extends Error {
  constructor(url: string, ms: number) {
    super(`Timeout de ${ms}ms ao acessar ${url}`);
    this.name = "HttpTimeoutError";
  }
}

/** `fetch` com timeout por AbortController e User-Agent obrigatório. */
export async function fetchWithTimeout(
  url: string,
  { timeoutMs = 15_000, ...init }: RequestInit & { timeoutMs?: number } = {},
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: { "User-Agent": USER_AGENT, ...init.headers },
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new HttpTimeoutError(url, timeoutMs);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Serializa chamadas garantindo um intervalo mínimo entre elas.
 *
 * Usado no Nominatim (limite de 1 req/s). O estado vive no módulo, então o
 * limite valem por instância de função serverless — o que é suficiente aqui
 * porque o Scout roda uma geocodificação por busca.
 */
export function createRateLimiter(minIntervalMs: number) {
  let chain: Promise<unknown> = Promise.resolve();
  let lastRunAt = 0;

  return function schedule<T>(task: () => Promise<T>): Promise<T> {
    const run = chain.then(async () => {
      const espera = lastRunAt + minIntervalMs - Date.now();
      if (espera > 0) await sleep(espera);
      lastRunAt = Date.now();
      return task();
    });
    // A corrente não pode quebrar quando uma task falha, senão as próximas
    // chamadas deixariam de respeitar o intervalo.
    chain = run.catch(() => undefined);
    return run;
  };
}
