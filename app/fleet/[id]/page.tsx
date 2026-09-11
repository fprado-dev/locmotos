import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { findVehicle } from "@/modules/fleet";
import { VehicleForm } from "../vehicle-form";
import { DiscardButton } from "./discard-button";

export default async function VehiclePage({
  params,
}: PageProps<"/fleet/[id]">) {
  const { id } = await params;

  const client = await createClient();
  const vehicle = await findVehicle(client, id);
  // Veículo de outra locadora chega aqui como inexistente: a RLS filtrou
  // antes, e a tela não distingue os dois casos de propósito.
  if (!vehicle) notFound();

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 p-4 sm:p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">
          <span className="font-mono">{vehicle.plate}</span>{" "}
          <span className="text-zinc-500">
            {vehicle.brand} {vehicle.model}
          </span>
        </h1>
        <Link href="/fleet" className="text-zinc-500 underline">
          Voltar
        </Link>
      </div>

      <VehicleForm vehicle={vehicle} />

      <div className="border-t border-zinc-200 pt-6 dark:border-zinc-800">
        <DiscardButton id={vehicle.id} />
      </div>
    </main>
  );
}
