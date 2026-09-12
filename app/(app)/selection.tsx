"use client";

import { createContext, use, useMemo, useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";

type SelectionState = {
  /** As marcadas que estão na tela, na ordem em que aparecem. */
  ids: string[];
  visible: number;
  has: (id: string) => boolean;
  toggle: (id: string) => void;
  toggleAll: () => void;
  clear: () => void;
};

const SelectionContext = createContext<SelectionState | null>(null);

export function useSelection(): SelectionState {
  const selection = use(SelectionContext);
  if (!selection) throw new Error("Use dentro de uma lista com seleção.");
  return selection;
}

/**
 * Quais linhas o gestor marcou.
 *
 * A seleção é do cliente e morre com a aba, ao contrário dos filtros e da
 * ordem, que vivem na URL: marcar três linhas não é um endereço que alguém
 * queira compartilhar.
 *
 * Ela é cruzada com o que está na tela a cada render. Filtrar troca as linhas
 * debaixo da seleção, e o que sumiu do filtro não pode continuar no lote — o
 * gestor estaria agindo sobre o que não está vendo.
 */
export function Selection({
  visible,
  children,
}: {
  visible: string[];
  children: React.ReactNode;
}) {
  const [marked, setMarked] = useState<ReadonlySet<string>>(new Set());

  const selection = useMemo<SelectionState>(() => {
    const ids = visible.filter((id) => marked.has(id));

    return {
      ids,
      visible: visible.length,
      has: (id) => marked.has(id),
      toggle: (id) =>
        setMarked((atual) => {
          const próxima = new Set(atual);
          if (!próxima.delete(id)) próxima.add(id);
          return próxima;
        }),
      // O cabeçalho manda nas linhas visíveis, que é o que sobrou do filtro.
      toggleAll: () =>
        setMarked(ids.length === visible.length ? new Set() : new Set(visible)),
      clear: () => setMarked(new Set()),
    };
  }, [marked, visible]);

  return <SelectionContext value={selection}>{children}</SelectionContext>;
}

/** Marca e desmarca de uma vez as linhas que o filtro deixou na tela. */
export function SelectAll({ label }: { label: string }) {
  const { ids, visible, toggleAll } = useSelection();
  const todas = visible > 0 && ids.length === visible;

  return (
    <Checkbox
      checked={todas}
      indeterminate={ids.length > 0 && !todas}
      onCheckedChange={toggleAll}
      aria-label={label}
    />
  );
}

export function RowCheckbox({ id, label }: { id: string; label: string }) {
  const { has, toggle } = useSelection();

  return (
    <Checkbox
      checked={has(id)}
      onCheckedChange={() => toggle(id)}
      aria-label={label}
    />
  );
}

/**
 * A barra de cima da tabela: filtros, ou o lote quando há linha marcada.
 *
 * As duas formas ocupam a mesma altura de propósito. Marcar uma linha não pode
 * empurrar a tabela para baixo — o gestor perderia de vista justamente a linha
 * que acabou de marcar.
 */
export function Toolbar({
  batch,
  children,
}: {
  batch: React.ReactNode;
  children: React.ReactNode;
}) {
  const { ids } = useSelection();

  return (
    <div className="flex h-[98px] shrink-0 items-center border-b border-border">
      {ids.length === 0 ? children : batch}
    </div>
  );
}
