import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { categoriaPorValorOsm, labelCategoria } from "@/lib/categorias";
import { contarPendentes } from "@/lib/enrichment/lote";
import { SITE_STATUS_CLASSE, SITE_STATUS_LABEL } from "@/lib/labels";
import { PORTE_LABEL, TIER_LABEL } from "@/lib/pricing";
import { EnrichmentRunner } from "./enrichment-runner";
import { WhatsAppButton } from "../../whatsapp-button";
import { ExportLinks } from "../../export-links";

export const dynamic = "force-dynamic";

export default async function BuscaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const busca = await prisma.search.findUnique({
    where: { id },
    include: {
      leads: {
        orderBy: { name: "asc" },
        include: { enrichment: true },
      },
    },
  });

  if (!busca) notFound();

  const pendentes = await contarPendentes(busca.id);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link href="/" className="text-sm text-neutral-500 hover:opacity-70">
            ← Buscas
          </Link>
          <h2 className="mt-2 text-lg font-semibold tracking-tight">
            {labelCategoria(busca.categoria)} em {busca.cidade}
          </h2>
          <p className="text-sm text-neutral-500">
            Raio de {busca.raioKm} km · {busca.leads.length} leads
          </p>
        </div>
        <ExportLinks filtros={{ busca: busca.id }} />
      </div>

      <EnrichmentRunner
        searchId={busca.id}
        pendentesIniciais={pendentes}
        total={busca.leads.length}
      />

      {busca.leads.length === 0 ? (
        <p className="text-sm text-neutral-500">
          Nenhum estabelecimento encontrado. Tente aumentar o raio ou outra categoria.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-neutral-200 text-left dark:border-neutral-800">
                <th className="py-2 pr-4 font-medium">Nome</th>
                <th className="py-2 pr-4 font-medium">Endereço</th>
                <th className="py-2 pr-4 font-medium">Telefone</th>
                <th className="py-2 pr-4 font-medium">Site</th>
                <th className="py-2 pr-4 font-medium">Status</th>
                <th className="py-2 pr-4 font-medium">Porte</th>
                <th className="py-2 font-medium">Preço</th>
                <th className="py-2 pl-4 font-medium">Contato</th>
              </tr>
            </thead>
            <tbody>
              {busca.leads.map((lead) => {
                const status = lead.enrichment?.siteStatus;
                return (
                  <tr
                    key={lead.id}
                    className="border-b border-neutral-100 last:border-0 dark:border-neutral-900"
                  >
                    <td className="py-2 pr-4">{lead.name}</td>
                    <td className="py-2 pr-4 text-neutral-500">{lead.address ?? "—"}</td>
                    <td className="py-2 pr-4 text-neutral-500">{lead.phone ?? "—"}</td>
                    <td className="max-w-[16rem] truncate py-2 pr-4 text-neutral-500">
                      {lead.enrichment?.siteUrl ?? lead.websiteRaw ?? "—"}
                    </td>
                    <td className="py-2 pr-4">
                      {status ? (
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${SITE_STATUS_CLASSE[status]}`}
                        >
                          {SITE_STATUS_LABEL[status]}
                        </span>
                      ) : (
                        <span className="text-xs text-neutral-400">na fila</span>
                      )}
                    </td>
                    <td className="py-2 pr-4 text-neutral-500">
                      {lead.enrichment?.porte
                        ? PORTE_LABEL[lead.enrichment.porte]
                        : "—"}
                    </td>
                    <td className="py-2 whitespace-nowrap text-neutral-500">
                      {lead.enrichment?.pricingTier
                        ? TIER_LABEL[lead.enrichment.pricingTier]
                        : "—"}
                    </td>
                    <td className="py-2 pl-4">
                      {lead.phone ? (
                        <WhatsAppButton
                          nome={lead.name}
                          telefone={lead.phone}
                          categoria={
                            categoriaPorValorOsm(lead.category) ?? busca.categoria
                          }
                        />
                      ) : (
                        <span className="text-xs text-neutral-400">Sem telefone</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
