"use client";

import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** Quanto tempo de silêncio o campo espera antes de ir ao servidor. */
const PAUSA = 400;

/**
 * A busca por placa, que busca sozinha.
 *
 * O gestor tem a placa na mão e digita três letras: pedir que ele também
 * aperte alguma coisa é um passo a mais para dizer o que já disse. Mas uma ida
 * ao servidor por tecla seria uma consulta por letra, então a busca espera a
 * digitação parar — e a lupa, que era enfeite, vira o botão para quem não quer
 * esperar.
 *
 * `replace` e não `push`: cada pausa da digitação viraria uma entrada no
 * histórico, e voltar teria que desfazer letra por letra.
 */
export function PlateSearch({
  value,
  query,
}: {
  value?: string;
  query: Record<string, string>;
}) {
  const router = useRouter();
  const [termo, setTermo] = useState(value ?? "");

  function buscar(termo: string) {
    const params = new URLSearchParams(query);
    const limpo = termo.trim();

    if (limpo) params.set("plate", limpo);
    else params.delete("plate");

    // Buscar recomeça a paginação: a página 3 da busca anterior não quer dizer
    // nada nesta, e costuma nem existir.
    params.delete("page");

    router.replace(`/fleet?${params}`);
  }

  useEffect(() => {
    // Já é o que está na URL — foi esta busca que trouxe a tela de volta.
    if (termo.trim() === (value ?? "")) return;

    const agendada = setTimeout(() => buscar(termo), PAUSA);
    return () => clearTimeout(agendada);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [termo, value]);

  return (
    <div className="relative">
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        aria-label="Buscar placa"
        onClick={() => buscar(termo)}
        className="absolute top-1/2 left-1 -translate-y-1/2 text-subtle hover:bg-transparent hover:text-foreground"
      >
        <Search />
      </Button>
      <Input
        value={termo}
        onChange={(event) => setTermo(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            buscar(termo);
          }
        }}
        placeholder="Buscar placa"
        aria-label="Buscar placa"
        className="w-[220px] pl-8 font-mono uppercase"
      />
    </div>
  );
}
