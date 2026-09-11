import { createClient } from "@/lib/supabase/server";
import { listVehicles } from "@/modules/fleet";
import { addVehicle } from "./actions";

const field = "rounded border border-zinc-300 px-3 py-2 dark:border-zinc-700";

export default async function FleetPage() {
  const client = await createClient();
  const vehicles = await listVehicles(client);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-8 p-8">
      <h1 className="text-2xl font-semibold">Frota</h1>

      <form action={addVehicle} className="flex flex-wrap items-end gap-3">
        <input name="plate" placeholder="Placa" className={field} required />
        <input name="brand" placeholder="Marca" className={field} required />
        <input name="model" placeholder="Modelo" className={field} required />
        <input
          name="year"
          type="number"
          placeholder="Ano"
          className={`${field} w-24`}
          required
        />
        <button
          type="submit"
          className="rounded bg-black px-4 py-2 text-white dark:bg-white dark:text-black"
        >
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
