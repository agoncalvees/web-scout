"use client";

import { useState } from "react";
import {
  criarLinkWhatsApp,
  mensagemInicialWhatsApp,
} from "@/lib/whatsapp";

export function WhatsAppButton({
  nome,
  telefone,
  categoria,
  compacto = false,
}: {
  nome: string;
  telefone: string;
  categoria: string;
  compacto?: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const [mensagem, setMensagem] = useState(() =>
    mensagemInicialWhatsApp(categoria, nome),
  );

  function abrirEditor() {
    setMensagem(mensagemInicialWhatsApp(categoria, nome));
    setAberto(true);
  }

  function abrirWhatsApp() {
    const link = criarLinkWhatsApp(telefone, mensagem);
    if (!link) return;

    window.open(link, "_blank", "noopener,noreferrer");
    setAberto(false);
  }

  return (
    <>
      <button
        type="button"
        onClick={abrirEditor}
        className={
          compacto
            ? "rounded border border-emerald-300 px-1.5 py-0.5 text-xs font-medium text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-400 dark:hover:bg-emerald-950"
            : "rounded-md border border-emerald-300 px-2.5 py-1.5 text-xs font-medium whitespace-nowrap text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-400 dark:hover:bg-emerald-950"
        }
        aria-haspopup="dialog"
      >
        WhatsApp
      </button>

      {aberto && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setAberto(false);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby={`whatsapp-titulo-${telefone}`}
            className="w-full max-w-lg rounded-xl border border-neutral-200 bg-white p-5 shadow-xl dark:border-neutral-800 dark:bg-neutral-950"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3
                  id={`whatsapp-titulo-${telefone}`}
                  className="font-semibold tracking-tight"
                >
                  Mensagem para {nome}
                </h3>
                <p className="mt-1 text-xs text-neutral-500">
                  Revise o texto antes de continuar. O envio não é automático.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAberto(false)}
                className="rounded px-2 py-1 text-sm text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-900"
                aria-label="Fechar editor de mensagem"
              >
                Fechar
              </button>
            </div>

            <label className="mt-4 block">
              <span className="text-xs font-medium text-neutral-600 dark:text-neutral-400">
                Mensagem
              </span>
              <textarea
                value={mensagem}
                onChange={(event) => setMensagem(event.target.value)}
                rows={7}
                className="mt-1 w-full resize-y rounded-md border border-neutral-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-emerald-500 dark:border-neutral-700"
                autoFocus
              />
            </label>

            <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setAberto(false)}
                className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm dark:border-neutral-700"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={abrirWhatsApp}
                disabled={!mensagem.trim()}
                className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Abrir no WhatsApp
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
