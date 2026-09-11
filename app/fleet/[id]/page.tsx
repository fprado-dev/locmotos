import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { findVehicle, signedFileUrl } from "@/modules/fleet";
import { VehicleForm } from "../vehicle-form";
import { DiscardButton } from "./discard-button";
import { VehicleFiles } from "./vehicle-files";

export default async function VehiclePage({
  params,
}: PageProps<"/fleet/[id]">) {
  const { id } = await params;

  const client = await createClient();
  const vehicle = await findVehicle(client, id);
  // Veículo de outra locadora chega aqui como inexistente: a RLS filtrou
  // antes, e a tela não distingue os dois casos de propósito.
  if (!vehicle) notFound();

  // As URLs são assinadas na hora de desenhar a tela e vencem em um minuto:
  // o que chega ao browser não serve para ninguém depois disso.
  const paths = {
    photo: vehicle.photoPath,
    crlv: vehicle.crlvPath,
    crv: vehicle.crvPath,
  };
  const links = Object.fromEntries(
    await Promise.all(
      Object.entries(paths)
        .filter(([, path]) => path)
        .map(async ([kind, path]) => [
          kind,
          await signedFileUrl(client, path!),
        ]),
    ),
  );

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
        <VehicleFiles id={vehicle.id} links={links} />
      </div>

      <div className="border-t border-zinc-200 pt-6 dark:border-zinc-800">
        <DiscardButton id={vehicle.id} />
      </div>
    </main>
  );
}
