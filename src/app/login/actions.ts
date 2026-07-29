"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { COOKIE_OPTIONS, SESSION_COOKIE, gerarToken, senhaCorreta } from "@/lib/auth";

export interface LoginState {
  erro?: string;
}

export async function entrar(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const senha = String(formData.get("senha") ?? "");
  if (!senha) return { erro: "Informe a senha." };

  if (!senhaCorreta(senha)) {
    return { erro: "Senha incorreta." };
  }

  const store = await cookies();
  store.set({ ...COOKIE_OPTIONS, value: await gerarToken() });

  const destinoBruto = String(formData.get("next") ?? "/");
  // Só aceita caminho interno — evita open redirect via query string.
  const destino = destinoBruto.startsWith("/") && !destinoBruto.startsWith("//")
    ? destinoBruto
    : "/";

  redirect(destino);
}

export async function sair() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
  redirect("/login");
}
