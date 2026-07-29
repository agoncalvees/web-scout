import {
  Clock,
  ExternalLink,
  Mail,
  MapPin,
  Phone,
  Search,
} from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { categoriaPorValorOsm, labelCategoria } from "@/lib/categorias";
import { obterResumoGooglePlaces } from "@/lib/enrichment/google-places";
import { contarPendentes } from "@/lib/enrichment/lote";
import { SITE_STATUS_CLASSE, SITE_STATUS_LABEL } from "@/lib/labels";
import { PORTE_LABEL, TIER_LABEL } from "@/lib/pricing";
import {
  motivosDoScore,
  PRIORIDADE_CLASSE,
  PRIORIDADE_LABEL,
  prioridadePorScore,
} from "@/lib/scoring";
import { EnrichmentRunner } from "./enrichment-runner";
import { WhatsAppButton } from "../../whatsapp-button";
import { ExportLinks } from "../../export-links";

export const dynamic = "force-dynamic";

export default async function BuscaPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ mostrar?: string }>;
}) {
  const { id } = await params;
  const { mostrar } = await searchParams;
  const [busca, googlePlaces] = await Promise.all([
    prisma.search.findUnique({
      where: { id },
      include: {
        leads: {
          include: { enrichment: true },
        },
      },
    }),
    obterResumoGooglePlaces(),
  ]);

  if (!busca) notFound();

  const pendentes = await contarPendentes(busca.id);
  const leads = [...busca.leads].sort(
    (a, b) =>
      (b.enrichment?.opportunityScore ?? -1) -
        (a.enrichment?.opportunityScore ?? -1) ||
      a.name.localeCompare(b.name, "pt-BR"),
  );
  const comContato = leads.filter(
    (lead) => lead.phone || lead.email || lead.instagram,
  ).length;
  const melhores = leads.filter(
    (lead) =>
      (lead.enrichment?.siteStatus === "sem_site_alta_confianca" ||
        lead.enrichment?.siteStatus === "site_fora_do_ar") &&
      (lead.enrichment?.opportunityScore ?? 0) >= 40,
  );
  const mostrarTodos = mostrar === "todos";
  const leadsExibidos = mostrarTodos ? leads : melhores;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link
            href="/"
            className="text-sm text-neutral-500 hover:text-neutral-900"
          >
            ← Buscas
          </Link>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">
            {labelCategoria(busca.categoria)} em {busca.cidade}
          </h1>
          <p className="text-sm text-neutral-500">
            Raio de {busca.raioKm} km · melhores oportunidades primeiro
          </p>
        </div>
        <ExportLinks filtros={{ busca: busca.id }} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
          <p className="text-2xl font-semibold">{leads.length}</p>
          <p className="text-sm text-neutral-500">empresas encontradas</p>
        </div>
        <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
          <p className="text-2xl font-semibold text-emerald-700">
            {melhores.length}
          </p>
          <p className="text-sm text-neutral-500">oportunidades confirmadas</p>
        </div>
        <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
          <p className="text-2xl font-semibold">{comContato}</p>
          <p className="text-sm text-neutral-500">com algum canal de contato</p>
        </div>
        <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
          <p className="text-2xl font-semibold">
            {googlePlaces.configurado
              ? `${googlePlaces.usados}/${googlePlaces.limite}`
              : "Inativo"}
          </p>
          <p className="text-sm text-neutral-500">
            {googlePlaces.configurado
              ? "verificações Google neste mês"
              : "Google Places não configurado"}
          </p>
        </div>
      </div>

      <EnrichmentRunner
        searchId={busca.id}
        pendentesIniciais={pendentes}
        total={busca.leads.length}
      />

      {leads.length === 0 ? (
        <div className="rounded-xl border border-dashed border-neutral-300 bg-white p-8 text-center">
          <p className="font-medium">Nenhuma empresa encontrada.</p>
          <p className="mt-1 text-sm text-neutral-500">
            Tente uma categoria específica e use o raio inteligente sugerido.
          </p>
        </div>
      ) : leadsExibidos.length === 0 ? (
        <div className="rounded-xl border border-dashed border-neutral-300 bg-white p-8 text-center">
          <p className="font-medium">Nenhuma oportunidade confirmada ainda.</p>
          <p className="mt-1 text-sm text-neutral-500">
            Leads incertos e empresas com site ficam ocultos para não poluir a
            prospecção.
          </p>
          <Link
            href={`/buscas/${busca.id}?mostrar=todos`}
            className="mt-3 inline-flex text-sm font-semibold text-emerald-700 hover:underline"
          >
            Mostrar todos os {leads.length} resultados
          </Link>
        </div>
      ) : (
        <section>
          <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 className="text-lg font-semibold">Oportunidades priorizadas</h2>
              <p className="text-sm text-neutral-500">
                O score mede lacuna digital, contato disponível e valor do
                segmento. Ele não garante intenção de compra.
              </p>
            </div>
            <div className="flex flex-wrap gap-3 text-sm font-semibold">
              <Link
                href={
                  mostrarTodos
                    ? `/buscas/${busca.id}`
                    : `/buscas/${busca.id}?mostrar=todos`
                }
                className="text-neutral-600 hover:underline"
              >
                {mostrarTodos
                  ? "Mostrar apenas confirmados"
                  : `Mostrar todos (${leads.length})`}
              </Link>
              <Link
                href={`/kanban?busca=${encodeURIComponent(busca.id)}`}
                className="text-emerald-700 hover:underline"
              >
                Abrir no Kanban →
              </Link>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {leadsExibidos.map((lead) => {
              const status = lead.enrichment?.siteStatus;
              const score = lead.enrichment?.opportunityScore;
              const prioridade =
                typeof score === "number" ? prioridadePorScore(score) : null;
              const motivos = motivosDoScore(
                lead.enrichment?.opportunityReasons,
              );
              const categoria =
                categoriaPorValorOsm(lead.category) ?? busca.categoria;
              const google = `https://www.google.com/search?q=${encodeURIComponent(
                `${lead.name} ${lead.address ?? busca.cidade}`,
              )}`;
              const mapa = `https://www.google.com/maps/search/?api=1&query=${lead.lat},${lead.lon}`;

              return (
                <article
                  key={lead.id}
                  className="flex flex-col rounded-xl border border-neutral-200 bg-white p-4 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="font-semibold leading-snug">{lead.name}</h3>
                      <p className="mt-0.5 text-xs text-neutral-500">
                        {labelCategoria(categoria)}
                      </p>
                      {(lead.brand || lead.operator) && (
                        <p className="mt-1 text-xs font-medium text-violet-700">
                          Rede/franquia: {lead.brand ?? lead.operator}
                        </p>
                      )}
                    </div>
                    {prioridade && typeof score === "number" ? (
                      <span
                        className={`shrink-0 rounded-full px-2 py-1 text-xs font-semibold ${PRIORIDADE_CLASSE[prioridade]}`}
                      >
                        {PRIORIDADE_LABEL[prioridade]} · {score}
                      </span>
                    ) : (
                      <span className="shrink-0 rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-500">
                        analisando
                      </span>
                    )}
                  </div>

                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {status && (
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${SITE_STATUS_CLASSE[status]}`}
                      >
                        {SITE_STATUS_LABEL[status]}
                      </span>
                    )}
                    {lead.enrichment?.pricingTier && (
                      <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600">
                        {TIER_LABEL[lead.enrichment.pricingTier]}
                      </span>
                    )}
                    {lead.enrichment?.porte && (
                      <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600">
                        {PORTE_LABEL[lead.enrichment.porte]}
                      </span>
                    )}
                  </div>

                  <dl className="mt-3 space-y-2 text-sm">
                    {lead.address && (
                      <div className="flex gap-2 text-neutral-600">
                        <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden />
                        <dd>{lead.address}</dd>
                      </div>
                    )}
                    {lead.phone && (
                      <div className="flex gap-2 text-neutral-600">
                        <Phone className="mt-0.5 size-4 shrink-0" aria-hidden />
                        <dd>{lead.phone}</dd>
                      </div>
                    )}
                    {lead.email && (
                      <div className="flex gap-2 text-neutral-600">
                        <Mail className="mt-0.5 size-4 shrink-0" aria-hidden />
                        <dd className="truncate">{lead.email}</dd>
                      </div>
                    )}
                    {lead.openingHours && (
                      <div className="flex gap-2 text-neutral-600">
                        <Clock className="mt-0.5 size-4 shrink-0" aria-hidden />
                        <dd>{lead.openingHours}</dd>
                      </div>
                    )}
                  </dl>

                  {motivos.length > 0 && (
                    <div className="mt-3 rounded-lg bg-emerald-50 p-2.5 text-xs text-emerald-900">
                      <strong>Por que priorizar:</strong> {motivos.join(" · ")}
                    </div>
                  )}

                  <div className="mt-auto flex flex-wrap gap-2 pt-4">
                    {lead.phone && (
                      <WhatsAppButton
                        nome={lead.name}
                        telefone={lead.phone}
                        categoria={categoria}
                      />
                    )}
                    {lead.instagram && (
                      <a
                        href={lead.instagram}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-neutral-300 px-2.5 text-xs font-medium hover:bg-neutral-100"
                      >
                        <ExternalLink className="size-3.5" aria-hidden />
                        Instagram
                      </a>
                    )}
                    {lead.email && (
                      <a
                        href={`mailto:${lead.email}`}
                        className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-neutral-300 px-2.5 text-xs font-medium hover:bg-neutral-100"
                      >
                        <Mail className="size-3.5" aria-hidden />
                        E-mail
                      </a>
                    )}
                    <a
                      href={google}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-neutral-300 px-2.5 text-xs font-medium hover:bg-neutral-100"
                    >
                      <Search className="size-3.5" aria-hidden />
                      Pesquisar
                    </a>
                    <a
                      href={mapa}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-neutral-300 px-2.5 text-xs font-medium hover:bg-neutral-100"
                    >
                      <ExternalLink className="size-3.5" aria-hidden />
                      Mapa
                    </a>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
