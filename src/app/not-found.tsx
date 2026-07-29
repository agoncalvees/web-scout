import Link from "next/link";

export default function NaoEncontrado() {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="max-w-sm text-center">
        <p className="text-sm font-medium text-neutral-500">Página não encontrada</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          Este conteúdo não existe
        </h1>
        <p className="mt-2 text-sm text-neutral-500">
          O endereço pode estar incorreto ou o item pode ter sido removido.
        </p>
        <Link
          href="/"
          className="mt-5 inline-block rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white dark:bg-white dark:text-neutral-900"
        >
          Voltar para as buscas
        </Link>
      </div>
    </main>
  );
}
