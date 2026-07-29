"use client";

import { useRouter } from "next/navigation";
import { useCallback, useRef, useState } from "react";

interface LoteResposta {
  processados: number;
  restantes: number;
  erro?: string;
}

/**
 * Dispara o enrichment em lotes sucessivos e mostra o progresso.
 *
 * O loop vive no cliente porque cada chamada serverless tem 300s de teto —
 * a fila é esvaziada com várias requisições curtas em vez de uma longa.
 */
export function EnrichmentRunner({
  searchId,
  pendentesIniciais,
  total,
}: {
  searchId: string;
  pendentesIniciais: number;
  total: number;
}) {
  const router = useRouter();
  const [rodando, setRodando] = useState(false);
  const [pendentes, setPendentes] = useState(pendentesIniciais);
  const [erro, setErro] = useState<string | null>(null);
  const cancelar = useRef(false);

  const concluidos = total - pendentes;
  const pct = total === 0 ? 100 : Math.round((concluidos / total) * 100);

  const rodar = useCallback(async () => {
    setRodando(true);
    setErro(null);
    cancelar.current = false;

    try {
      for (;;) {
        if (cancelar.current) break;

        const res = await fetch("/api/enrichment", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ searchId }),
        });
        const dados = (await res.json()) as LoteResposta;

        if (!res.ok) {
          setErro(dados.erro ?? "Falha ao processar o lote.");
          break;
        }

        setPendentes(dados.restantes);
        if (dados.restantes === 0) break;

        // Sem progresso e ainda há pendentes: insistir só repetiria a falha.
        if (dados.processados === 0) {
          setErro("O lote não avançou. Tente novamente em alguns minutos.");
          break;
        }
      }
    } catch {
      setErro("Erro de rede ao processar o lote.");
    } finally {
      setRodando(false);
      router.refresh();
    }
  }, [searchId, router]);

  if (total === 0) return null;

  return (
    <div className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium">Enriquecimento de site</p>
          <p className="text-sm text-neutral-500">
            {pendentes === 0
              ? `${total} de ${total} leads processados.`
              : `${concluidos} de ${total} leads processados · ${pendentes} na fila.`}
          </p>
        </div>

        {rodando ? (
          <button
            type="button"
            onClick={() => {
              cancelar.current = true;
            }}
            className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-medium dark:border-neutral-700"
          >
            Parar
          </button>
        ) : (
          <button
            type="button"
            onClick={rodar}
            disabled={pendentes === 0}
            className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40 dark:bg-white dark:text-neutral-900"
          >
            {pendentes === 0 ? "Concluído" : "Enriquecer"}
          </button>
        )}
      </div>

      <div
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Progresso do enrichment"
        className="mt-3 h-1.5 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800"
      >
        <div
          className="h-full rounded-full bg-neutral-900 transition-[width] duration-300 dark:bg-white"
          style={{ width: `${pct}%` }}
        />
      </div>

      {rodando && (
        <p className="mt-2 text-xs text-neutral-500">
          Processando em lotes… pode deixar a aba aberta.
        </p>
      )}
      {erro && (
        <p role="alert" className="mt-2 text-sm text-red-600 dark:text-red-400">
          {erro}
        </p>
      )}
    </div>
  );
}
