import { LogOut, Radar } from "lucide-react";
import Link from "next/link";
import { sair } from "@/app/login/actions";
import { Button } from "@/components/ui/button";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-muted/35">
      <header className="border-b border-border/80 bg-background/95">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-5 sm:px-6">
          <div className="flex items-center gap-3 sm:gap-6">
            <Link
              href="/"
              className="flex items-center gap-2.5 font-semibold tracking-tight"
            >
              <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <Radar className="size-4" aria-hidden />
              </span>
              <span className="hidden sm:inline">Prospector</span>
            </Link>

            <nav aria-label="Navegação principal" className="flex items-center gap-1">
              <Button asChild variant="ghost" size="sm">
                <Link href="/">Buscas</Link>
              </Button>
              <Button asChild variant="ghost" size="sm">
                <Link href="/kanban">Kanban</Link>
              </Button>
            </nav>
          </div>

          <form action={sair}>
            <Button type="submit" variant="ghost" size="sm">
              <LogOut aria-hidden />
              <span className="hidden sm:inline">Sair</span>
              <span className="sr-only sm:hidden">Sair</span>
            </Button>
          </form>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-5 py-8 sm:px-6 sm:py-10">
        {children}
      </main>
    </div>
  );
}
