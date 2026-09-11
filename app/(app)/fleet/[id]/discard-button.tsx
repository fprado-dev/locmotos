"use client";

import { useActionState } from "react";
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
import { discardVehicle, type FormState } from "../actions";

const initialState: FormState = {};

/**
 * Baixa do veículo, com uma pergunta antes.
 *
 * A moto sai da lista e a linha fica no banco — mas quem clica não sabe disso,
 * e "remover" soa definitivo. A confirmação custa um clique e evita a baixa
 * por engano no meio de uma tela de edição.
 */
export function DiscardButton({ id }: { id: string }) {
  const [state, formAction, pending] = useActionState(
    discardVehicle,
    initialState,
  );

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
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <form action={formAction}>
              <input type="hidden" name="id" value={id} />
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
