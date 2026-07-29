"use client";

export default function Erro({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div
      className="rounded-lg border border-red-200 bg-red-50 p-5 dark:border-red-950 dark:bg-red-950/30"
      role="alert"
    >
      <h2 className="font-semibold text-red-900 dark:text-red-200">
        Não foi possível carregar esta página
      </h2>
      <p className="mt-1 text-sm text-red-700 dark:text-red-300">
        Verifique a conexão e tente novamente. Seus dados não foram alterados.
      </p>
      <button
        type="button"
        onClick={reset}
        className="mt-4 rounded-md bg-red-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-800"
      >
        Tentar novamente
      </button>
    </div>
  );
}
