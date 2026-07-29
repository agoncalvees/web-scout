"use client";

import { useActionState } from "react";
import { entrar, type LoginState } from "./actions";

export function LoginForm({ next }: { next: string }) {
  const [state, formAction, pending] = useActionState<LoginState, FormData>(entrar, {});

  return (
    <form action={formAction} className="mt-8 flex flex-col gap-3">
      <input type="hidden" name="next" value={next} />
      <input
        name="username"
        autoComplete="username"
        value="prospector"
        readOnly
        tabIndex={-1}
        aria-hidden
        hidden
      />

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Senha de acesso</span>
        <input
          name="senha"
          type="password"
          autoComplete="current-password"
          autoFocus
          required
          className="rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900 dark:border-neutral-700 dark:bg-neutral-900 dark:focus:border-neutral-300"
        />
      </label>

      {state.erro && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {state.erro}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="mt-1 rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-neutral-900"
      >
        {pending ? "Entrando…" : "Entrar"}
      </button>
    </form>
  );
}
