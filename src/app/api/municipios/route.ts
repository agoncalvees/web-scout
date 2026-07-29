import { NextRequest, NextResponse } from "next/server";
import { fetchWithTimeout } from "@/lib/http";
import { isUf, type Municipio } from "@/lib/localidades";

interface MunicipioIbge {
  id?: unknown;
  nome?: unknown;
}

export async function GET(request: NextRequest) {
  const uf = (request.nextUrl.searchParams.get("uf") ?? "").toUpperCase();

  if (!isUf(uf)) {
    return NextResponse.json(
      { erro: "Selecione um estado válido." },
      { status: 400 },
    );
  }

  try {
    const url =
      `https://servicodados.ibge.gov.br/api/v1/localidades/estados/${uf}/municipios` +
      "?orderBy=nome";
    const response = await fetchWithTimeout(url, {
      timeoutMs: 12_000,
      next: { revalidate: 86_400 },
    });

    if (!response.ok) {
      throw new Error(`IBGE respondeu ${response.status}.`);
    }

    const dados = (await response.json()) as MunicipioIbge[];
    const municipios: Municipio[] = dados.flatMap((municipio) =>
      typeof municipio.id === "number" && typeof municipio.nome === "string"
        ? [{ id: municipio.id, nome: municipio.nome }]
        : [],
    );

    if (municipios.length === 0) {
      throw new Error("O IBGE não devolveu municípios válidos.");
    }

    return NextResponse.json(
      { municipios },
      {
        headers: {
          "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800",
        },
      },
    );
  } catch (erro) {
    console.error(`Falha ao carregar municípios de ${uf}`, erro);
    return NextResponse.json(
      { erro: "Não foi possível carregar as cidades. Tente novamente." },
      { status: 502 },
    );
  }
}
