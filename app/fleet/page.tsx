import { signOut } from "@/app/(auth)/actions";
import { createClient } from "@/lib/supabase/server";
import { listVehicles } from "@/modules/fleet";
import { StatusSelect } from "./status-select";
import { VehicleForm } from "./vehicle-form";

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

      <VehicleForm />

      {vehicles.length === 0 ? (
        <p className="text-zinc-500">Nenhum veículo cadastrado.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-zinc-200 dark:divide-zinc-800">
          {vehicles.map((vehicle) => (
            <li
              key={vehicle.id}
              className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3"
            >
              <span className="font-mono">{vehicle.plate}</span>
              <span>
                {vehicle.brand} {vehicle.model}
              </span>
              <span className="text-zinc-500">{vehicle.year}</span>
              {vehicle.color && (
                <span className="text-zinc-500">{vehicle.color}</span>
              )}
              <StatusSelect id={vehicle.id} status={vehicle.status} />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
