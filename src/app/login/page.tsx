import { LoginForm } from "./login-form";

export const metadata = { title: "Entrar · Prospector" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-semibold tracking-tight">Prospector</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Empresas locais sem site, viradas em lead.
        </p>
        <LoginForm next={next ?? "/"} />
      </div>
    </main>
  );
}
