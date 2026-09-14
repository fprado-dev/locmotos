"use client";

import { useActionState, useState } from "react";
import { toast } from "sonner";
import { formatInteger } from "@/app/ui";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveRevisionDefault } from "./actions";

/**
 * O intervalo de revisão da locadora, e o jeito de trocá-lo.
 *
 * Mora no rodapé do card de revisão e não numa tela de configurações porque é
 * um número só, e é aqui que a pergunta nasce: o gestor vê "3 vencidas",
 * estranha, e quer saber de que intervalo a conta está falando.
 *
 * Trocar o padrão mexe em toda moto que **herda** — a que tem exceção própria
 * não se move. O diálogo diz isso antes de salvar, porque a diferença não é
 * visível na tela que fica atrás dele.
 */
export function RevisionDefault({ km }: { km: number }) {
  const [aberto, setAberto] = useState(false);

  const [state, formAction, pending] = useActionState(
    async (previous: { error?: string }, form: FormData) => {
      const next = await saveRevisionDefault(previous, form);
      if (!next.error) {
        toast.success("Intervalo de revisão atualizado.");
        setAberto(false);
      }
      return next;
    },
    {},
  );

  return (
    <>
      <Button
        variant="ghost"
        size="xs"
        className="-mx-2 font-normal text-muted-foreground"
        onClick={() => setAberto(true)}
      >
        A cada {formatInteger(km)} km · alterar
      </Button>

      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="sm:max-w-[420px]">
          <form action={formAction}>
            <DialogHeader>
              <DialogTitle>Intervalo de revisão</DialogTitle>
              <DialogDescription>
                De quantos em quantos quilômetros a frota vai à oficina. Vale
                para toda moto que não tiver um intervalo próprio na ficha.
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-col gap-1.5 py-5">
              <Label htmlFor="revisionIntervalKm" className="text-xs">
                Quilômetros
              </Label>
              <Input
                id="revisionIntervalKm"
                name="revisionIntervalKm"
                type="number"
                min={1}
                step={1}
                required
                defaultValue={km}
                aria-invalid={Boolean(state.error)}
                className="text-right"
              />
              <p role="alert" className="text-xs text-destructive empty:hidden">
                {state.error}
              </p>
            </div>

            <DialogFooter className="mx-0 mb-0 gap-2">
              <Button
                type="button"
                variant="outline"
                size="lg"
                onClick={() => setAberto(false)}
              >
                Cancelar
              </Button>
              <Button type="submit" size="lg" disabled={pending}>
                Salvar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
