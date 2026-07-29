export function ExportLinks({
  filtros,
}: {
  filtros?: {
    busca?: string;
    site?: string;
    tier?: string;
  };
}) {
  function href(formato: "csv" | "xlsx") {
    const params = new URLSearchParams();
    if (filtros?.busca) params.set("busca", filtros.busca);
    if (filtros?.site) params.set("site", filtros.site);
    if (filtros?.tier) params.set("tier", filtros.tier);
    params.set("formato", formato);
    return `/api/export?${params.toString()}`;
  }

  const classe =
    "rounded-md border border-neutral-300 px-2.5 py-1.5 text-xs font-medium whitespace-nowrap hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-900";

  return (
    <div className="flex flex-wrap gap-2">
      <a href={href("csv")} className={classe} download>
        Exportar CSV
      </a>
      <a href={href("xlsx")} className={classe} download>
        Exportar Excel
      </a>
    </div>
  );
}
