import Link from "next/link";
import { notFound } from "next/navigation";
import { extension, FILE_SECONDS, isImage } from "@/app/ui";
import { buttonVariants } from "@/components/ui/button";
import { brasiliaDay } from "@/lib/calendar";
import { createClient } from "@/lib/supabase/server";
import { findVehicle, revisionDefault, signedFileUrl } from "@/modules/fleet";
import { vehicleMaintenances } from "@/modules/maintenance";
import { vehicleIncidents, vehicleViolations } from "@/modules/rentals";
import { VehicleIncidents } from "../../incidents-block";
import { VehicleViolations } from "../../violations-block";
import { StatusSelect } from "../status-select";
import { VehicleForm } from "../vehicle-form";
import { DiscardButton } from "./discard-button";
import { VehicleFiles } from "./vehicle-files";
import { VehicleMaintenances } from "./maintenances-block";

export default async function VehiclePage({
  params,
}: PageProps<"/fleet/[id]">) {
  const { id } = await params;

  const client = await createClient();
  // A ficha é a única tela que abre uma moto com baixa: é onde o motivo
  // dela fica escrito, e é para onde levam os links antigos.
  const vehicle = await findVehicle(client, id, { discarded: true });
  // Veículo de outra locadora chega aqui como inexistente: a RLS filtrou
  // antes, e a tela não distingue os dois casos de propósito.
  if (!vehicle) notFound();

  const [violations, maintenances, incidents, intervalo] = await Promise.all([
    vehicleViolations(client, vehicle.id),
    vehicleMaintenances(client, vehicle.id),
    vehicleIncidents(client, vehicle.id),
    revisionDefault(client),
  ]);

  const paths = {
    photo: vehicle.photoPath,
    crlv: vehicle.crlvPath,
    crv: vehicle.crvPath,
  };

  const links = Object.fromEntries(
    await Promise.all(
      Object.entries(paths)
        .filter(([, path]) => path)
        .map(async ([kind, path]) => {
          // Duas URLs para o mesmo arquivo porque são dois pedidos diferentes:
          // ver na tela e guardar no computador. Quem separa os dois é o
          // cabeçalho que o Storage devolve, e ele é assinado junto.
          const [view, download] = await Promise.all([
            signedFileUrl(client, path!, { seconds: FILE_SECONDS }),
            signedFileUrl(client, path!, {
              seconds: FILE_SECONDS,
              download: `${vehicle.plate}-${kind}${extension(path!)}`,
            }),
          ]);

          return [kind, { view, download, image: isImage(path!) }];
        }),
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
        <VehicleForm vehicle={vehicle} revisionDefault={intervalo} />

        <div className="border-t border-border pt-6">
          <VehicleFiles id={vehicle.id} links={links} />
        </div>

        {/* Manutenções antes de infrações: é a ordem em que a ficha se lê —
            o que a moto é, o que ela tem de papel, o que já foi feito nela, e
            o que aconteceu com ela na rua. E é daqui que a moto sai e volta
            da oficina, então o bloco é ação, não só histórico. */}
        <div className="border-t border-border pt-6">
          <VehicleMaintenances
            vehicleId={vehicle.id}
            plate={vehicle.plate}
            maintenances={maintenances}
            today={brasiliaDay()}
            revision={{
              currentKm: vehicle.currentKm,
              nextRevisionKm: vehicle.nextRevisionKm,
            }}
          />
        </div>

        <div className="border-t border-border pt-6">
          <VehicleViolations
            vehicleId={vehicle.id}
            plate={vehicle.plate}
            violations={violations}
          />
        </div>

        {/* Sinistro por último entre os históricos: é o que menos acontece, e
            o que mais muda o destino da moto quando acontece. */}
        <div className="border-t border-border pt-6">
          <VehicleIncidents
            vehicleId={vehicle.id}
            plate={vehicle.plate}
            incidents={incidents}
            today={brasiliaDay()}
          />
        </div>

        <div className="border-t border-border pt-6">
          <DiscardButton
            id={vehicle.id}
            discarded={
              vehicle.discardedAt
                ? {
                    at: vehicle.discardedAt,
                    reason: vehicle.discardReason,
                    incidentId: vehicle.discardIncidentId,
                  }
                : null
            }
          />
        </div>
      </div>
    </>
  );
}
