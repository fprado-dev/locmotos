"use client";

import { useActionState, useState } from "react";
import { DISCARD_LABELS, formatFullDate } from "@/app/ui";
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
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DISCARD_REASONS, type DiscardReason } from "@/modules/fleet";
import { discardVehicle, type FormState } from "../actions";

const initialState: FormState = {};

/** A baixa que já aconteceu, como a ficha a conta. */
type Discarded = {
  at: string;
  reason: DiscardReason | null;
  incidentId: string | null;
};

/**
 * Baixa do veículo, com uma pergunta e um motivo.
 *
 * A moto sai da lista e a linha fica no banco — mas quem clica não sabe disso,
 * e "remover" soa definitivo. A confirmação custa um clique e evita a baixa
 * por engano no meio de uma tela de edição.
 *
 * **O motivo é obrigatório na pergunta.** Sem ele, daqui a um ano a moto que
 * sumiu da lista não diz por quê: vendida, roubada e perda total viram o mesmo
 * silêncio, e é justamente essa a pergunta que alguém vai fazer.
 */
export function DiscardButton({
  id,
  discarded,
}: {
  id: string;
  /** Preenchido quando a moto já saiu da frota. */
  discarded: Discarded | null;
}) {
  const [motivo, setMotivo] = useState<DiscardReason>("sold");
  const [state, formAction, pending] = useActionState(
    discardVehicle,
    initialState,
  );

  if (discarded) {
    return (
      <div className="flex flex-col gap-1.5 rounded-lg border border-input bg-surface-2 px-4 py-3 text-[13px]">
        <span className="font-medium">
          Fora da frota desde {formatFullDate(discarded.at)}
        </span>
        <span className="text-muted-foreground">
          {discarded.reason ? (
            <>
              Motivo: {DISCARD_LABELS[discarded.reason]}
              {/* Baixas anteriores à coluna de motivo não têm nenhum, e
                  inventar um agora seria reescrever o passado com palpite. */}
            </>
          ) : (
            "Motivo não registrado — a baixa é anterior a este campo."
          )}
          {discarded.incidentId && " · veja o sinistro no bloco acima."}
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <AlertDialog>
        <AlertDialogTrigger
          render={
            <Button variant="destructive" className="self-start">
              Remover da frota
            </Button>
          }
        />
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Dar baixa neste veículo?</AlertDialogTitle>
            <AlertDialogDescription>
              A moto sai da lista da frota, mas o histórico dela fica guardado.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="flex flex-col gap-1.5 py-2">
            <Label htmlFor="reason" className="text-xs">
              Por quê
            </Label>
            <Select
              value={motivo}
              onValueChange={(escolhido) =>
                setMotivo(escolhido as DiscardReason)
              }
            >
              <SelectTrigger id="reason">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DISCARD_REASONS.map((valor) => (
                  <SelectItem key={valor} value={valor}>
                    {DISCARD_LABELS[valor]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {/* Perda total normalmente chega pelo bloco de sinistros, que já
                oferece a baixa com o sinistro ligado. Escolhê-la aqui grava o
                motivo sem o link, e é melhor que não gravar nada. */}
            <span className="text-xs text-subtle">
              Perda total registrada como sinistro já oferece a baixa lá, com o
              link para o que aconteceu.
            </span>
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <form action={formAction}>
              <input type="hidden" name="id" value={id} />
              <input type="hidden" name="reason" value={motivo} />
              <AlertDialogAction
                render={
                  <Button
                    type="submit"
                    variant="destructive"
                    disabled={pending}
                  >
                    {pending ? "Removendo…" : "Remover"}
                  </Button>
                }
              />
            </form>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {state.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}
    </div>
  );
}
