import { signOut } from "@/app/(auth)/actions";
import { buttonClass, fieldClass } from "@/app/ui";
import { createClient } from "@/lib/supabase/server";
import { listVehicles } from "@/modules/fleet";
import { addVehicle } from "./actions";

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

export default async function FleetPage() {
  const client = await createClient();
  const vehicles = await listVehicles(client);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Frota</h1>
        <form action={signOut}>
          <button type="submit" className="text-zinc-500 underline">
            Sair
          </button>
        </form>
      </div>

      <form action={addVehicle} className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Field name="plate" label="Placa" required />
          <Field name="brand" label="Marca" required />
          <Field name="model" label="Modelo" required />
          <Field name="year" label="Ano" type="number" required />
          <Field name="color" label="Cor" />
          <Field name="mileage" label="Quilometragem" type="number" />
          <Field name="vin" label="Chassi" />
          <Field name="renavam" label="Renavam" />
          <Field
            name="licensingDueOn"
            label="Licenciamento vence em"
            type="date"
          />
          <Field
            name="weeklyRate"
            label="Valor semanal"
            type="number"
            step="0.01"
          />
          <Field
            name="fipeValue"
            label="Valor FIPE"
            type="number"
            step="0.01"
          />
          <Field
            name="purchaseValue"
            label="Valor de compra"
            type="number"
            step="0.01"
          />
          <Field name="purchasedOn" label="Data de compra" type="date" />
        </div>

        <label className="flex flex-col gap-1 text-sm">
          <span className="text-zinc-600 dark:text-zinc-400">Observações</span>
          <textarea name="notes" rows={2} className={fieldClass} />
        </label>

        <button type="submit" className={`${buttonClass} self-start`}>
          Cadastrar
        </button>
      </form>

      {vehicles.length === 0 ? (
        <p className="text-zinc-500">Nenhum veículo cadastrado.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-zinc-200 dark:divide-zinc-800">
          {vehicles.map((vehicle) => (
            <li key={vehicle.id} className="flex gap-4 py-3">
              <span className="font-mono">{vehicle.plate}</span>
              <span>
                {vehicle.brand} {vehicle.model}
              </span>
              <span className="text-zinc-500">{vehicle.year}</span>
              {vehicle.color && (
                <span className="text-zinc-500">{vehicle.color}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
