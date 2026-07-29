import { ArrowUpRight, History, MapPin, Search } from "lucide-react";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { labelCategoria } from "@/lib/categorias";
import { prisma } from "@/lib/db";
import { BuscaForm } from "./busca-form";

export const metadata = { title: "Buscar · Prospector" };

/**
 * O Prisma não é instrumentado pelo Next, então sem isto a página seria
 * pré-renderizada no build: a lista de buscas ficaria congelada no dado do
 * build e o deploy quebraria se o banco não estivesse acessível na hora.
 */
export const dynamic = "force-dynamic";

export default async function Home() {
  const buscas = await prisma.search.findMany({
    orderBy: { createdAt: "desc" },
    take: 20,
    include: { _count: { select: { leads: true } } },
  });

  return (
    <div className="flex flex-col gap-10">
      <section className="space-y-6">
        <div className="max-w-2xl">
          <p className="mb-2 text-xs font-semibold tracking-[0.16em] text-primary uppercase">
            Prospecção local
          </p>
          <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
            Encontre empresas que ainda não têm site.
          </h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground sm:text-base">
            Escolha o segmento, selecione o estado e a cidade, e deixe o Scout
            localizar oportunidades na região.
          </p>
        </div>

        <Card className="border-l-4 border-l-primary shadow-sm">
          <CardHeader className="border-b">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Search className="size-4" aria-hidden />
              </span>
              <div>
                <CardTitle>Nova busca</CardTitle>
                <CardDescription>
                  Consulte estabelecimentos mapeados no OpenStreetMap.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <BuscaForm />
          </CardContent>
        </Card>
      </section>

      <section aria-labelledby="buscas-recentes" className="space-y-4">
        <div className="flex items-center gap-2">
          <History className="size-4 text-muted-foreground" aria-hidden />
          <h2 id="buscas-recentes" className="text-lg font-semibold tracking-tight">
            Buscas recentes
          </h2>
        </div>

        {buscas.length === 0 ? (
          <Card size="sm">
            <CardContent className="py-5 text-sm text-muted-foreground">
              Nenhuma busca ainda. Configure a primeira busca acima.
            </CardContent>
          </Card>
        ) : (
          <Card className="gap-0 py-0">
            <ul className="divide-y divide-border">
              {buscas.map((busca) => (
                <li key={busca.id}>
                  <Link
                    href={`/buscas/${busca.id}`}
                    className="group flex items-center justify-between gap-4 px-4 py-3.5 transition-colors first:rounded-t-xl last:rounded-b-xl hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset sm:px-5"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">
                        {labelCategoria(busca.categoria)}
                      </span>
                      <span className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                        <MapPin className="size-3" aria-hidden />
                        {busca.cidade} · raio de {busca.raioKm} km
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-3">
                      <span className="text-xs text-muted-foreground">
                        {busca._count.leads}{" "}
                        {busca._count.leads === 1 ? "lead" : "leads"}
                      </span>
                      <ArrowUpRight
                        className="size-4 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
                        aria-hidden
                      />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </section>
    </div>
  );
}
