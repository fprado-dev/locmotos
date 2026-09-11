import { signOut } from "@/app/(auth)/actions";
import { buttonClass, fieldClass } from "@/app/ui";
import { createClient } from "@/lib/supabase/server";
import { listVehicles } from "@/modules/fleet";
import { addVehicle } from "./actions";

export default async function FleetPage() {
  const client = await createClient();
  const vehicles = await listVehicles(client);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-8 p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Frota</h1>
        <form action={signOut}>
          <button type="submit" className="text-zinc-500 underline">
            Sair
          </button>
        </form>
      </div>

      <form action={addVehicle} className="flex flex-wrap items-end gap-3">
        <input
          name="plate"
          placeholder="Placa"
          className={fieldClass}
          required
        />
        <input
          name="brand"
          placeholder="Marca"
          className={fieldClass}
          required
        />
        <input
          name="model"
          placeholder="Modelo"
          className={fieldClass}
          required
        />
        <input
          name="year"
          type="number"
          placeholder="Ano"
          className={`${fieldClass} w-24`}
          required
        />
        <button type="submit" className={buttonClass}>
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
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
