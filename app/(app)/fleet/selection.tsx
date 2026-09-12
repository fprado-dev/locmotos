"use client";

import { createContext, use, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { STATUS_LABELS } from "@/app/ui";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { VEHICLE_STATUSES, type VehicleStatus } from "@/modules/fleet";
import { changeVehiclesStatus, discardVehicles } from "./actions";

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

function useSelection(): SelectionState {
  const selection = use(SelectionContext);
  if (!selection) throw new Error("Use dentro da lista de veículos.");
  return selection;
}

/**
 * Quais motos o gestor marcou.
 *
 * A seleção é do cliente e morre com a aba, ao contrário dos filtros e da
 * ordem, que vivem na URL: marcar três linhas não é um endereço que alguém
 * queira compartilhar.
 *
 * Ela é cruzada com o que está na tela a cada render. Filtrar troca as linhas
 * debaixo da seleção, e o que sumiu do filtro não pode continuar no lote — o
 * gestor estaria dando baixa em moto que não está vendo.
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
export function SelectAll() {
  const { ids, visible, toggleAll } = useSelection();
  const todas = visible > 0 && ids.length === visible;

  return (
    <Checkbox
      checked={todas}
      indeterminate={ids.length > 0 && !todas}
      onCheckedChange={toggleAll}
      aria-label="Selecionar as motos desta página"
    />
  );
}

export function RowCheckbox({ id, plate }: { id: string; plate: string }) {
  const { has, toggle } = useSelection();

  return (
    <Checkbox
      checked={has(id)}
      onCheckedChange={() => toggle(id)}
      aria-label={`Selecionar ${plate}`}
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
export function Toolbar({ children }: { children: React.ReactNode }) {
  const { ids } = useSelection();

  return (
    <div className="flex h-[98px] shrink-0 items-center border-b border-border">
      {ids.length === 0 ? children : <BatchBar />}
    </div>
  );
}

function BatchBar() {
  const { ids, clear } = useSelection();
  const [pendente, iniciar] = useTransition();

  const plural = ids.length === 1 ? "" : "s";

  /**
   * Conta ao gestor o que aconteceu de fato, não o que ele pediu.
   *
   * Quando voltam menos do que foram, o que ficou de fora não era da locadora
   * dele — a RLS não devolve erro, devolve silêncio, e sem essa frase o
   * silêncio passaria por sucesso.
   */
  function relatar(
    { error, changed = 0 }: { error?: string; changed?: number },
    feito: string,
  ): void {
    if (error) {
      toast.error(error);
      return;
    }

    clear();
    toast.success(
      changed === ids.length
        ? `${changed} moto${changed === 1 ? "" : "s"} ${feito}.`
        : `${changed} de ${ids.length} ${feito}. O resto não é desta locadora.`,
    );
  }

  return (
    <div className="flex h-full w-full items-center gap-4 bg-sel px-4">
      <span className="text-sm font-medium">
        {ids.length} moto{plural} selecionada{plural}
      </span>

      <Separator orientation="vertical" className="h-[22px]" />

      <span className="text-[13px] text-muted-foreground">Mudar situação</span>
      <Select
        // Sem valor fixo: o select é um comando, não um campo. Depois de
        // aplicar ele volta a dizer "Escolher…", pronto para o próximo lote.
        value=""
        disabled={pendente}
        onValueChange={(escolhida) => {
          const situação = escolhida as VehicleStatus;

          iniciar(async () => {
            relatar(
              await changeVehiclesStatus(ids, situação),
              `alterada${plural} para ${STATUS_LABELS[situação]}`,
            );
          });
        }}
      >
        <SelectTrigger size="sm" className="w-[168px]" aria-label="Situação">
          <SelectValue placeholder="Escolher…" />
        </SelectTrigger>
        <SelectContent>
          {VEHICLE_STATUSES.map((valor) => (
            <SelectItem key={valor} value={valor}>
              {STATUS_LABELS[valor]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <AlertDialog>
        <AlertDialogTrigger
          render={
            <Button
              variant="outline"
              size="sm"
              disabled={pendente}
              className="hover:border-destructive hover:text-destructive"
            >
              Excluir
            </Button>
          }
        />
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Excluir {ids.length} moto{plural}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              As motos saem da frota, mas o histórico de locações fica guardado.
              Dá para restaurar depois.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              render={
                <Button
                  variant="destructive"
                  disabled={pendente}
                  onClick={() => {
                    iniciar(async () => {
                      relatar(
                        await discardVehicles(ids),
                        `removida${plural} da frota`,
                      );
                    });
                  }}
                >
                  Excluir
                </Button>
              }
            />
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Button
        variant="ghost"
        size="sm"
        className="ml-auto"
        onClick={clear}
        disabled={pendente}
      >
        Limpar seleção
      </Button>
    </div>
  );
}
