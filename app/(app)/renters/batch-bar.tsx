"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
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
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { useSelection } from "../selection";
import { discardRenters, exportRenters, restrictSelected } from "./actions";

/** O corte que o banco impõe ao motivo, repetido aqui para o botão saber esperar. */
const MOTIVO_MINIMO = 4;

/**
 * O lote de Locatários: restringir, exportar ou dar baixa.
 *
 * `responsible` vem do servidor porque é o que fica registrado na restrição, e
 * o browser não é fonte de quem é quem — o campo aqui é readonly justamente
 * por isso: ele mostra o que vai ser gravado, não coleta.
 */
export function BatchBar({ responsible }: { responsible: string }) {
  const { ids, clear } = useSelection();
  const [pendente, iniciar] = useTransition();
  const [motivo, setMotivo] = useState("");
  const [restringindo, setRestringindo] = useState(false);

  const plural = ids.length === 1 ? "" : "s";

  /**
   * Conta ao gestor o que aconteceu de fato, não o que ele pediu.
   *
   * Quando voltam menos do que foram, o que ficou de fora não era da locadora
   * dele — ou já estava restrito. A RLS não devolve erro, devolve silêncio, e
   * sem essa frase o silêncio passaria por sucesso.
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
        ? `${changed} locatário${changed === 1 ? "" : "s"} ${feito}.`
        : `${changed} de ${ids.length} ${feito}. O resto não entrou.`,
    );
  }

  return (
    <div className="flex h-full w-full items-center gap-4 bg-sel px-4">
      <span className="text-sm font-medium">
        {ids.length} locatário{plural} selecionado{plural}
      </span>

      <Separator orientation="vertical" className="h-[22px]" />

      <Dialog open={restringindo} onOpenChange={setRestringindo}>
        <DialogTrigger
          render={
            <Button variant="outline" size="sm" disabled={pendente}>
              Aplicar restrição
            </Button>
          }
        />
        <DialogContent className="sm:max-w-[460px]">
          <DialogHeader>
            <DialogTitle>
              Aplicar restrição a {ids.length} locatário{plural}
            </DialogTitle>
            <DialogDescription>
              Impede nova locação até ser removida. Motivo e responsável ficam
              registrados.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="reason">Motivo</Label>
              <Textarea
                id="reason"
                rows={3}
                value={motivo}
                onChange={(event) => setMotivo(event.target.value)}
                placeholder="Ex.: inadimplência acima de 30 dias"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="responsible">Responsável</Label>
              {/* Readonly: mostra o que vai ser gravado, e quem grava é o
                  servidor. Um campo editável aqui deixaria o gestor assinar a
                  restrição com o nome de outra pessoa. */}
              <Input
                id="responsible"
                value={responsible}
                readOnly
                className="bg-surface-2 text-muted-foreground"
              />
            </div>
          </div>

          <DialogFooter>
            <DialogClose render={<Button variant="outline">Cancelar</Button>} />
            <Button
              disabled={pendente || motivo.trim().length < MOTIVO_MINIMO}
              onClick={() => {
                iniciar(async () => {
                  const resultado = await restrictSelected(ids, motivo);

                  if (!resultado.error) {
                    setRestringindo(false);
                    setMotivo("");
                  }
                  relatar(resultado, `restrito${plural}`);
                });
              }}
            >
              Aplicar restrição
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Button
        variant="outline"
        size="sm"
        disabled={pendente}
        onClick={() => {
          iniciar(async () => {
            const { csv, error } = await exportRenters(ids);
            if (error || !csv) {
              toast.error(error ?? "Não foi possível exportar.");
              return;
            }

            // O arquivo nasce no browser: o servidor devolveu texto, e uma
            // rota só para servir download seria uma URL a mais para proteger.
            const url = URL.createObjectURL(
              new Blob([csv], { type: "text/csv;charset=utf-8" }),
            );
            const link = document.createElement("a");
            link.href = url;
            link.download = `locatarios-${new Date().toISOString().slice(0, 10)}.csv`;
            link.click();
            URL.revokeObjectURL(url);

            toast.success(
              `${ids.length} locatário${plural} exportado${plural}.`,
            );
          });
        }}
      >
        Exportar
      </Button>

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
              Excluir {ids.length} locatário{plural}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              O cadastro sai da lista, mas as locações e cobranças ligadas a ele
              ficam guardadas.
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
                      relatar(await discardRenters(ids), `removido${plural}`);
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
