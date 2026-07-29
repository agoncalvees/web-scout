/**
 * Executa tarefas com concorrência limitada, parando de iniciar novas quando o
 * prazo passa.
 *
 * O prazo existe por causa do limite de 300s da Vercel Hobby: é melhor devolver
 * um lote parcial (o cliente chama de novo) do que a função ser morta no meio.
 */
export async function mapComLimite<T, R>(
  itens: readonly T[],
  limite: number,
  prazoEm: number,
  tarefa: (item: T) => Promise<R>,
): Promise<{ resultados: Map<T, R>; naoIniciados: T[] }> {
  const resultados = new Map<T, R>();
  const fila = [...itens];
  const naoIniciados: T[] = [];

  async function worker() {
    for (;;) {
      const item = fila.shift();
      if (item === undefined) return;

      if (Date.now() >= prazoEm) {
        naoIniciados.push(item);
        continue;
      }

      resultados.set(item, await tarefa(item));
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(limite, itens.length) }, () => worker()),
  );

  return { resultados, naoIniciados };
}
