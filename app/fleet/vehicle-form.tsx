"use client";

import { useActionState } from "react";
import { buttonClass, fieldClass } from "@/app/ui";
import { addVehicle, type FormState } from "./actions";

/** Um campo do formulário: rótulo em cima, input embaixo. */
function Field({
  name,
  label,
  type = "text",
  required = false,
  step,
}: {
  name: string;
  label: string;
  type?: string;
  required?: boolean;
  step?: string;
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
        className={fieldClass}
      />
    </label>
  );
}

const initialState: FormState = {};

export function VehicleForm() {
  const [state, formAction, pending] = useActionState(addVehicle, initialState);

  return (
    <form action={formAction} data-autofill className="flex flex-col gap-4">
      {/* A v1 só oferece motos: quem fixa isso é esta tela, não o modelo. */}
      <input type="hidden" name="category" value="motorcycle" />

      {state.error && (
        <p role="alert" className="text-red-600">
          {state.error}
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Field name="plate" label="Placa" required />
        <Field name="brand" label="Marca" required />
        <Field name="model" label="Modelo" required />
        <Field name="year" label="Ano" type="number" required />
        <Field name="color" label="Cor" />
        <Field name="mileage" label="Quilometragem" type="number" />
        <Field name="chassis" label="Chassi" />
        <Field name="renavam" label="Renavam" />
        <Field
          name="licensingDueDate"
          label="Licenciamento vence em"
          type="date"
        />
        <Field
          name="weeklyPrice"
          label="Valor semanal"
          type="number"
          step="0.01"
        />
        <Field name="fipeValue" label="Valor FIPE" type="number" step="0.01" />
        <Field
          name="purchaseValue"
          label="Valor de compra"
          type="number"
          step="0.01"
        />
        <Field name="purchaseDate" label="Data de compra" type="date" />
      </div>

      <label className="flex flex-col gap-1 text-sm">
        <span className="text-zinc-600 dark:text-zinc-400">Observações</span>
        <textarea name="notes" rows={2} className={fieldClass} />
      </label>

      <button
        type="submit"
        disabled={pending}
        className={`${buttonClass} self-start disabled:opacity-50`}
      >
        {pending ? "Cadastrando…" : "Cadastrar"}
      </button>
    </form>
  );
}
