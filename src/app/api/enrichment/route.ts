import { NextResponse } from "next/server";
import { processarLote } from "@/lib/enrichment/lote";

/**
 * Processa um lote de enrichment. O cliente chama em loop até `restantes: 0`.
 *
 * É client-driven de propósito: Cron Job no plano Hobby da Vercel só dispara
 * 1x/dia, o que não serve pra esvaziar uma fila.
 */
export const maxDuration = 300;

export async function POST(req: Request) {
  let searchId: unknown;
  try {
    ({ searchId } = await req.json());
  } catch {
    return NextResponse.json({ erro: "Corpo inválido." }, { status: 400 });
  }

  if (typeof searchId !== "string" || !searchId) {
    return NextResponse.json({ erro: "searchId é obrigatório." }, { status: 400 });
  }

  try {
    return NextResponse.json(await processarLote(searchId));
  } catch (err) {
    console.error("Falha no lote de enrichment", err);
    return NextResponse.json(
      { erro: "Falha ao processar o lote. Tente novamente." },
      { status: 500 },
    );
  }
}
