"use client";

import { useActionState } from "react";
import { buttonClass, fieldClass } from "@/app/ui";
import type { Vehicle } from "@/modules/fleet";
import { addVehicle, editVehicle, type FormState } from "./actions";

/** Um campo do formulário: rótulo em cima, input embaixo. */
function Field({
  name,
  label,
  type = "text",
  required = false,
  step,
  defaultValue,
}: {
  name: string;
  label: string;
  type?: string;
  required?: boolean;
  step?: string;
  defaultValue?: string;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-zinc-600 dark:text-zinc-400">
        {label}
        {required && " *"}
      </span>
      <input
        name={name}
        type={type}
        step={step}
        required={required}
        defaultValue={defaultValue}
        className={fieldClass}
      />
    </label>
  );
}

/** Número e data chegam do domínio; o input só entende texto. */
function value(field: string | number | null | undefined): string | undefined {
  return field === null || field === undefined ? undefined : String(field);
}

const initialState: FormState = {};

/**
 * O formulário do cadastro, no cadastro novo e na correção.
 *
 * É o mesmo formulário porque são os mesmos campos: separar em dois faria as
 * duas telas divergirem no primeiro campo que alguém acrescentasse.
 */
export function VehicleForm({ vehicle }: { vehicle?: Vehicle }) {
  const [state, formAction, pending] = useActionState(
    vehicle ? editVehicle : addVehicle,
    initialState,
  );

  return (
    <form action={formAction} data-autofill className="flex flex-col gap-4">
      {/* A v1 só oferece motos: quem fixa isso é esta tela, não o modelo. */}
      <input type="hidden" name="category" value="motorcycle" />
      {vehicle && <input type="hidden" name="id" value={vehicle.id} />}

      {state.error && (
        <p role="alert" className="text-red-600">
          {state.error}
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Field
          name="plate"
          label="Placa"
          required
          defaultValue={vehicle?.plate}
        />
        <Field
          name="brand"
          label="Marca"
          required
          defaultValue={vehicle?.brand}
        />
        <Field
          name="model"
          label="Modelo"
          required
          defaultValue={vehicle?.model}
        />
        <Field
          name="year"
          label="Ano"
          type="number"
          required
          defaultValue={value(vehicle?.year)}
        />
        <Field name="color" label="Cor" defaultValue={value(vehicle?.color)} />
        <Field
          name="mileage"
          label="Quilometragem"
          type="number"
          defaultValue={value(vehicle?.mileage)}
        />
        <Field
          name="chassis"
          label="Chassi"
          defaultValue={value(vehicle?.chassis)}
        />
        <Field
          name="renavam"
          label="Renavam"
          defaultValue={value(vehicle?.renavam)}
        />
        <Field
          name="licensingDueDate"
          label="Licenciamento vence em"
          type="date"
          defaultValue={value(vehicle?.licensingDueDate)}
        />
        <Field
          name="weeklyPrice"
          label="Valor semanal"
          type="number"
          step="0.01"
          defaultValue={value(vehicle?.weeklyPrice)}
        />
        <Field
          name="fipeValue"
          label="Valor FIPE"
          type="number"
          step="0.01"
          defaultValue={value(vehicle?.fipeValue)}
        />
        <Field
          name="purchaseValue"
          label="Valor de compra"
          type="number"
          step="0.01"
          defaultValue={value(vehicle?.purchaseValue)}
        />
        <Field
          name="purchaseDate"
          label="Data de compra"
          type="date"
          defaultValue={value(vehicle?.purchaseDate)}
        />
      </div>

      <label className="flex flex-col gap-1 text-sm">
        <span className="text-zinc-600 dark:text-zinc-400">Observações</span>
        <textarea
          name="notes"
          rows={2}
          defaultValue={value(vehicle?.notes)}
          className={fieldClass}
        />
      </label>

      <button
        type="submit"
        disabled={pending}
        className={`${buttonClass} self-start disabled:opacity-50`}
      >
        {vehicle
          ? pending
            ? "Salvando…"
            : "Salvar"
          : pending
            ? "Cadastrando…"
            : "Cadastrar"}
      </button>
    </form>
  );
}
