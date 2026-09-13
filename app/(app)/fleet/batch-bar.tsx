"use client";

import { useTransition } from "react";
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
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { VehicleStatus } from "@/modules/fleet";
import { useSelection } from "../selection";
import { changeVehiclesStatus, discardVehicles } from "./actions";
import { StatusOptions } from "./status-options";

/**
 * O lote da frota: mudar situação de todas, ou dar baixa em todas.
 *
 * Mora aqui e não na casca da seleção porque o que se faz com um lote é do
 * domínio — a frota muda situação, Locatários aplica restrição.
 */
export function BatchBar() {
  const { ids, clear } = useSelection();
  const [pendente, iniciar] = useTransition();

  const plural = ids.length === 1 ? "" : "s";

  /**
   * Conta ao gestor o que aconteceu de fato, não o que ele pediu.
   *
   * Quando voltam menos do que foram, o que ficou de fora não era da locadora
   * dele, ou está em locação ativa — a RLS não devolve erro, devolve silêncio,
   * e sem essa frase o silêncio passaria por sucesso.
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
        : `${changed} de ${ids.length} ${feito}. O resto está em locação ou não é desta locadora.`,
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
          <StatusOptions />
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
