"use client";

import { LoaderCircle, Search } from "lucide-react";
import { useRef, useState } from "react";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CATEGORIAS,
  CATEGORIA_KEYS,
  CATEGORIA_TODAS,
} from "@/lib/categorias";
import {
  ESTADOS_BRASIL,
  type Municipio,
} from "@/lib/localidades";
import { RAIO_MAX_KM, RAIO_MIN_KM } from "@/lib/limites";
import { buscar, type BuscaState } from "./actions";

interface MunicipiosResponse {
  municipios?: Municipio[];
  erro?: string;
}

export function BuscaForm() {
  const [state, formAction, pending] = useActionState<BuscaState, FormData>(
    buscar,
    {},
  );
  const [estado, setEstado] = useState("");
  const [cidade, setCidade] = useState("");
  const [municipios, setMunicipios] = useState<Municipio[]>([]);
  const [carregandoMunicipios, setCarregandoMunicipios] = useState(false);
  const [erroMunicipios, setErroMunicipios] = useState("");
  const requisicaoAtual = useRef<AbortController | null>(null);

  async function carregarMunicipios(uf: string) {
    requisicaoAtual.current?.abort();
    const controller = new AbortController();
    requisicaoAtual.current = controller;

    setEstado(uf);
    setCidade("");
    setMunicipios([]);
    setErroMunicipios("");
    setCarregandoMunicipios(true);

    try {
      const response = await fetch(`/api/municipios?uf=${encodeURIComponent(uf)}`, {
        signal: controller.signal,
      });
      const dados = (await response.json()) as MunicipiosResponse;

      if (!response.ok || !dados.municipios) {
        throw new Error(dados.erro ?? "Falha ao carregar cidades.");
      }

      setMunicipios(dados.municipios);
    } catch (erro) {
      if (erro instanceof Error && erro.name === "AbortError") return;
      setErroMunicipios(
        erro instanceof Error
          ? erro.message
          : "Não foi possível carregar as cidades.",
      );
    } finally {
      if (requisicaoAtual.current === controller) {
        setCarregandoMunicipios(false);
      }
    }
  }

  return (
    <form action={formAction} className="space-y-5">
      <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-[1.25fr_1fr_1.25fr_0.65fr]">
        <div className="space-y-2">
          <Label htmlFor="categoria">Categoria</Label>
          <Select
            name="categoria"
            defaultValue={CATEGORIA_TODAS}
            required
          >
            <SelectTrigger id="categoria" className="h-10 w-full bg-background">
              <SelectValue placeholder="Selecione uma categoria" />
            </SelectTrigger>
            <SelectContent position="popper" className="max-h-72">
              <SelectItem value={CATEGORIA_TODAS}>
                Todas as categorias
              </SelectItem>
              {CATEGORIA_KEYS.map((key) => (
                <SelectItem key={key} value={key}>
                  {CATEGORIAS[key].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            {CATEGORIA_KEYS.length} segmentos disponíveis.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="estado">Estado</Label>
          <Select
            name="estado"
            value={estado}
            onValueChange={carregarMunicipios}
            required
          >
            <SelectTrigger id="estado" className="h-10 w-full bg-background">
              <SelectValue placeholder="Selecione o estado" />
            </SelectTrigger>
            <SelectContent position="popper" className="max-h-72">
              {ESTADOS_BRASIL.map((item) => (
                <SelectItem key={item.sigla} value={item.sigla}>
                  {item.nome} ({item.sigla})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="cidade">Cidade</Label>
          <Select
            name="cidade"
            value={cidade}
            onValueChange={setCidade}
            disabled={!estado || carregandoMunicipios || municipios.length === 0}
            required
          >
            <SelectTrigger
              id="cidade"
              className="h-10 w-full bg-background"
              aria-busy={carregandoMunicipios}
            >
              {carregandoMunicipios ? (
                <span className="flex items-center gap-2 text-muted-foreground">
                  <LoaderCircle className="size-4 animate-spin" aria-hidden />
                  Carregando cidades
                </span>
              ) : (
                <SelectValue
                  placeholder={
                    estado
                      ? "Selecione a cidade"
                      : "Selecione o estado primeiro"
                  }
                />
              )}
            </SelectTrigger>
            <SelectContent position="popper" className="max-h-72">
              {municipios.map((municipio) => (
                <SelectItem key={municipio.id} value={municipio.nome}>
                  {municipio.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {erroMunicipios && (
            <p role="alert" className="text-xs text-destructive">
              {erroMunicipios}{" "}
              <button
                type="button"
                onClick={() => carregarMunicipios(estado)}
                className="font-medium underline underline-offset-2"
              >
                Tentar novamente
              </button>
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="raioKm">Raio (km)</Label>
          <Input
            id="raioKm"
            name="raioKm"
            type="number"
            defaultValue={10}
            min={RAIO_MIN_KM}
            max={RAIO_MAX_KM}
            required
            className="h-10 bg-background"
          />
          <p className="text-xs text-muted-foreground">
            De {RAIO_MIN_KM} a {RAIO_MAX_KM} km.
          </p>
        </div>
      </div>

      {state.erro && (
        <p role="alert" className="text-sm text-destructive">
          {state.erro}
        </p>
      )}

      <Button
        type="submit"
        size="lg"
        disabled={pending || !cidade || Boolean(erroMunicipios)}
        className="h-10 w-full sm:w-auto sm:min-w-52"
      >
        {pending ? (
          <>
            <LoaderCircle className="animate-spin" aria-hidden />
            Buscando empresas
          </>
        ) : (
          <>
            <Search aria-hidden />
            Buscar leads sem site
          </>
        )}
      </Button>
    </form>
  );
}
