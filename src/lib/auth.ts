/**
 * Auth de usuário único: uma senha em `APP_PASSWORD`. Não há cadastro, nem
 * banco de usuários — o app é pessoal.
 *
 * O cookie de sessão guarda um HMAC de `APP_PASSWORD` com `AUTH_SECRET`, não a
 * senha. Usa Web Crypto para rodar tanto no middleware (Edge) quanto no Node.
 */

const COOKIE_NAME = "webscout_session";
const MAX_AGE_S = 60 * 60 * 24 * 30; // 30 dias

export const SESSION_COOKIE = COOKIE_NAME;

export const COOKIE_OPTIONS = {
  name: COOKIE_NAME,
  httpOnly: true,
  sameSite: "lax",
  path: "/",
  maxAge: MAX_AGE_S,
  secure: process.env.NODE_ENV === "production",
} as const;

function exigirEnv(nome: "APP_PASSWORD" | "AUTH_SECRET"): string {
  const valor = process.env[nome];
  if (!valor) {
    throw new Error(`${nome} não está definida. Veja o .env.example.`);
  }
  return valor;
}

/** Token de sessão: HMAC-SHA256(APP_PASSWORD) com AUTH_SECRET, em hex. */
export async function gerarToken(): Promise<string> {
  const chave = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(exigirEnv("AUTH_SECRET")),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const assinatura = await crypto.subtle.sign(
    "HMAC",
    chave,
    new TextEncoder().encode(exigirEnv("APP_PASSWORD")),
  );
  return Array.from(new Uint8Array(assinatura))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Comparação em tempo constante, pra não vazar o token por timing. */
function comparaSegura(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export async function tokenValido(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  return comparaSegura(token, await gerarToken());
}

export function senhaCorreta(senha: string): boolean {
  return comparaSegura(senha, exigirEnv("APP_PASSWORD"));
}
