"use client";

import { useRouter } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/**
 * Um select que filtra na hora de escolher, sem botão no meio.
 *
 * Escolher já é a ordem — um "Filtrar" ao lado seria um clique a mais para
 * repetir o que o gestor acabou de dizer, como no `StatusSelect` da linha. O
 * filtro continua morando na URL: quem navega é o router, e a tela volta do
 * servidor com a lista, os contadores e a paginação já de acordo.
 */
export function FilterSelect({
  name,
  label,
  value,
  options,
  query,
  className,
}: {
  name: string;
  /** Some no rótulo do campo vazio e no nome acessível do gatilho. */
  label: string;
  value?: string;
  options: { value: string; label: string }[];
  /** Os filtros correntes, como já estão na URL. */
  query: Record<string, string>;
  className?: string;
}) {
  const router = useRouter();

  return (
    <Select
      value={value ?? ""}
      onValueChange={(chosen) => {
        const params = new URLSearchParams(query);

        if (chosen) params.set(name, String(chosen));
        else params.delete(name);

        // Trocar de filtro recomeça a paginação: a página 3 do filtro anterior
        // não quer dizer nada no novo, e costuma nem existir.
        params.delete("page");

        router.push(`/fleet?${params}`);
      }}
    >
      <SelectTrigger className={className} aria-label={label}>
        <SelectValue placeholder={label} />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
