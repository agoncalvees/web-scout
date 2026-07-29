import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, tokenValido } from "@/lib/auth";

/**
 * Bloqueia todo o app: sem cookie de sessão válido, só `/login` responde.
 * O matcher já exclui assets estáticos, então tudo que chega aqui é rota do app.
 */
export async function middleware(req: NextRequest) {
  const autenticado = await tokenValido(req.cookies.get(SESSION_COOKIE)?.value);
  const ehLogin = req.nextUrl.pathname === "/login";

  if (!autenticado && !ehLogin) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    // Preserva o destino pra voltar pra ele depois do login.
    url.search = `?next=${encodeURIComponent(req.nextUrl.pathname + req.nextUrl.search)}`;
    return NextResponse.redirect(url);
  }

  if (autenticado && ehLogin) {
    const url = req.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
