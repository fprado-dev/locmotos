"use client";

import { useActionState } from "react";
import type { VehicleStatus } from "@/modules/fleet";
import { changeVehicleStatus, type FormState } from "./actions";

/** O nome de cada situação na tela. Vocabulário de interface, não de banco. */
const LABELS: Record<VehicleStatus, string> = {
  available: "Disponível",
  reserved: "Reservada",
  maintenance: "Em manutenção",
  unavailable: "Indisponível",
};

const initialState: FormState = {};

/**
 * A situação do veículo, alterável na própria lista.
 *
 * Escolher já é a confirmação — um botão "salvar" ao lado de cada moto seria
 * um clique a mais para dizer o que o gestor acabou de dizer. Sem JS o select
 * continua mostrando a situação certa; só a gravação depende dele.
 */
export function StatusSelect({
  id,
  status,
}: {
  id: string;
  status: VehicleStatus;
}) {
  const [state, formAction, pending] = useActionState(
    changeVehicleStatus,
    initialState,
  );

  return (
    <form action={formAction} className="flex items-center gap-2">
      <input type="hidden" name="id" value={id} />
      <select
        name="status"
        defaultValue={status}
        disabled={pending}
        aria-label="Situação"
        onChange={(event) => event.currentTarget.form?.requestSubmit()}
        className="rounded border border-zinc-300 px-2 py-1 text-sm disabled:opacity-50 dark:border-zinc-700"
      >
        {Object.entries(LABELS).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>

      {state.error && (
        <span role="alert" className="text-sm text-red-600">
          {state.error}
        </span>
      )}
    </form>
  );
}
