"use client";

import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/** Quanto tempo de silêncio o campo espera antes de ir ao servidor. */
const PAUSA = 400;

/**
 * A busca que busca sozinha.
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
export function LiveSearch({
  path,
  name,
  label,
  value,
  query,
  className,
}: {
  /** A rota que recebe a busca, por exemplo `/fleet`. */
  path: string;
  /** O parâmetro da URL onde o termo mora. */
  name: string;
  /** O texto do campo vazio, que também é o nome acessível. */
  label: string;
  value?: string;
  /** Os filtros correntes, como já estão na URL. */
  query: Record<string, string>;
  className?: string;
}) {
  const router = useRouter();
  const [termo, setTermo] = useState(value ?? "");

  function buscar(termo: string) {
    const params = new URLSearchParams(query);
    const limpo = termo.trim();

    if (limpo) params.set(name, limpo);
    else params.delete(name);

    // Buscar recomeça a paginação: a página 3 da busca anterior não quer dizer
    // nada nesta, e costuma nem existir.
    params.delete("page");

    router.replace(`${path}?${params}`);
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
        aria-label={label}
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
        placeholder={label}
        aria-label={label}
        className={cn("w-[220px] pl-8", className)}
      />
    </div>
  );
}
