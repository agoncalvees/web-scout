/**
 * Constantes compartilhadas entre servidor e cliente.
 *
 * Este módulo é importado por client components, então não pode importar nada
 * que puxe o Prisma ou o driver `pg` — isso arrastaria `fs` pro bundle do
 * navegador e quebraria o build.
 */

export const RAIO_MIN_KM = 1;

/**
 * Raio máximo. Acima disso a query Overpass tende a estourar o `timeout:25` em
 * regiões metropolitanas densas.
 */
export const RAIO_MAX_KM = 50;
