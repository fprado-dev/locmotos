import Link from "next/link";
import { notFound } from "next/navigation";
import { buttonVariants } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { findVehicle, signedFileUrl } from "@/modules/fleet";
import { StatusSelect } from "../status-select";
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
    <>
      <header className="flex h-16 shrink-0 items-center justify-between gap-4 border-b border-border px-8">
        <h1 className="flex items-baseline gap-2.5 text-xl font-semibold tracking-[-0.02em]">
          <span className="font-mono tracking-[0.02em]">{vehicle.plate}</span>
          <span className="text-base font-normal text-muted-foreground">
            {vehicle.brand} {vehicle.model}
          </span>
        </h1>
        <div className="flex items-center gap-3">
          {/* A situação sai da lista, que agora é de comparar, e passa a ser
              alterada aqui — até a barra de lote da issue #25 existir. */}
          <StatusSelect id={vehicle.id} status={vehicle.status} />
          {/* Base UI não deixa um Button virar link: o `<a>` leva as
              classes do botão e mantém a semântica de link. */}
          <Link href="/fleet" className={buttonVariants({ variant: "ghost" })}>
            Voltar
          </Link>
        </div>
      </header>

      <div className="flex flex-1 flex-col gap-6 overflow-auto px-8 py-6">
        <VehicleForm vehicle={vehicle} />

        <div className="border-t border-border pt-6">
          <VehicleFiles id={vehicle.id} links={links} />
        </div>

        <div className="border-t border-border pt-6">
          <DiscardButton id={vehicle.id} />
        </div>
      </div>
    </>
  );
}
