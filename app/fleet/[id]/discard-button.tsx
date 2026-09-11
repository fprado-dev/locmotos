"use client";

import { useActionState } from "react";
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
    <form
      action={formAction}
      onSubmit={(event) => {
        if (!confirm("Dar baixa neste veículo? Ele sai da lista da frota.")) {
          event.preventDefault();
        }
      }}
    >
      <input type="hidden" name="id" value={id} />

      <button
        type="submit"
        disabled={pending}
        className="text-red-600 underline disabled:opacity-50"
      >
        {pending ? "Removendo…" : "Remover da frota"}
      </button>

      {state.error && (
        <p role="alert" className="text-red-600">
          {state.error}
        </p>
      )}
    </form>
  );
}
