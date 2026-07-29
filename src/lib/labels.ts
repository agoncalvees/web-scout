import { SiteStatus } from "@/generated/prisma/enums";

export const SITE_STATUS_LABEL: Record<SiteStatus, string> = {
  [SiteStatus.sem_site_alta_confianca]: "Sem site provável",
  [SiteStatus.site_fora_do_ar]: "Site fora do ar",
  [SiteStatus.tem_site_ativo]: "Tem site ativo",
  [SiteStatus.checar_manualmente]: "Checar manualmente",
};

/** Classes Tailwind do badge de cada status. */
export const SITE_STATUS_CLASSE: Record<SiteStatus, string> = {
  [SiteStatus.sem_site_alta_confianca]:
    "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  [SiteStatus.site_fora_do_ar]:
    "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  [SiteStatus.tem_site_ativo]:
    "bg-neutral-200 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-400",
  [SiteStatus.checar_manualmente]:
    "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
};
