/**
 * Dicionário categoria → tags OSM. Expandir sob demanda.
 *
 * Cada tag é um par `chave=valor` do OpenStreetMap. Uma categoria casa se o
 * elemento tiver *qualquer uma* das tags listadas (união, não interseção).
 */
export const CATEGORIAS = {
  academia: {
    label: "Academia",
    tags: ["leisure=fitness_centre"],
  },
  advocacia: {
    label: "Escritório de advocacia",
    tags: ["office=lawyer"],
  },
  contabilidade: {
    label: "Escritório de contabilidade",
    tags: ["office=accountant"],
  },
  clinica_medica: {
    label: "Clínica médica",
    tags: ["amenity=clinic", "healthcare=clinic", "amenity=doctors"],
  },
  farmacia: {
    label: "Farmácia",
    tags: ["amenity=pharmacy", "shop=chemist"],
  },
  fisioterapia: {
    label: "Fisioterapia",
    tags: ["healthcare=physiotherapist"],
  },
  imobiliaria: {
    label: "Imobiliária",
    tags: ["office=estate_agent"],
  },
  odontologia: {
    label: "Odontologia",
    tags: ["amenity=dentist", "healthcare=dentist"],
  },
  oficina_mecanica: {
    label: "Oficina mecânica",
    tags: ["shop=car_repair"],
  },
  otica: {
    label: "Ótica",
    tags: ["shop=optician"],
  },
  padaria: {
    label: "Padaria",
    tags: ["shop=bakery"],
  },
  pet_shop: {
    label: "Pet shop",
    tags: ["shop=pet"],
  },
  psicologia: {
    label: "Psicologia",
    tags: ["healthcare=psychotherapist"],
  },
  massoterapia_estetica: {
    label: "Massoterapia/estética",
    tags: ["shop=massage"],
  },
  restaurante: {
    label: "Restaurante",
    tags: ["amenity=restaurant"],
  },
  salao_de_beleza: {
    label: "Salão de beleza",
    tags: ["shop=hairdresser", "shop=beauty"],
  },
  veterinaria: {
    label: "Clínica veterinária",
    tags: ["amenity=veterinary"],
  },
} as const satisfies Record<string, { label: string; tags: readonly string[] }>;

export type CategoriaKey = keyof typeof CATEGORIAS;
export type CategoriaBusca = CategoriaKey | typeof CATEGORIA_TODAS;

export const CATEGORIA_KEYS = Object.keys(CATEGORIAS) as CategoriaKey[];
export const CATEGORIA_TODAS = "todas" as const;
export const TODAS_AS_TAGS = [
  ...new Set(CATEGORIA_KEYS.flatMap((key) => CATEGORIAS[key].tags)),
] as string[];

export function isCategoriaKey(value: string): value is CategoriaKey {
  return Object.hasOwn(CATEGORIAS, value);
}

export function isCategoriaBusca(value: string): value is CategoriaBusca {
  return value === CATEGORIA_TODAS || isCategoriaKey(value);
}

export function labelCategoria(key: string): string {
  if (key === CATEGORIA_TODAS) return "Todas as categorias";
  return isCategoriaKey(key) ? CATEGORIAS[key].label : key;
}

/**
 * Converte o valor cru salvo em `Lead.category` (ex.: `dentist`) para a chave
 * da categoria. Algumas fontes podem não fornecer um valor reconhecido; nesse
 * caso a categoria escolhida na busca continua sendo o fallback.
 */
export function categoriaPorValorOsm(value: string): CategoriaKey | null {
  for (const key of CATEGORIA_KEYS) {
    if (CATEGORIAS[key].tags.some((tag) => tag.endsWith(`=${value}`))) {
      return key;
    }
  }
  return null;
}

/** Divide `"amenity=clinic"` em `["amenity", "clinic"]`. */
export function parseTag(tag: string): [chave: string, valor: string] {
  const i = tag.indexOf("=");
  if (i === -1) {
    throw new Error(`Tag OSM inválida (esperado "chave=valor"): ${tag}`);
  }
  return [tag.slice(0, i), tag.slice(i + 1)];
}
