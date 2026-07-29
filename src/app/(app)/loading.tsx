export default function Carregando() {
  return (
    <div
      className="flex min-h-48 items-center justify-center"
      role="status"
      aria-live="polite"
    >
      <div className="text-center">
        <div
          className="mx-auto h-5 w-5 animate-spin rounded-full border-2 border-neutral-300 border-t-neutral-900 dark:border-neutral-700 dark:border-t-white"
          aria-hidden
        />
        <p className="mt-3 text-sm text-neutral-500">Carregando dados…</p>
      </div>
    </div>
  );
}
