import Link from "next/link";
import { signOut } from "@/app/(auth)/actions";
import { buttonClass, fieldClass, STATUS_LABELS } from "@/app/ui";
import { createClient } from "@/lib/supabase/server";
import {
  listVehicles,
  VEHICLE_STATUSES,
  type VehicleFilters,
  type VehicleStatus,
} from "@/modules/fleet";
import { StatusSelect } from "./status-select";
import { VehicleForm } from "./vehicle-form";

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

/** O que veio na URL é texto de fora: só passa o que dá para usar. */
function text(value: string | string[] | undefined): string | undefined {
  const first = Array.isArray(value) ? value[0] : value;
  return first?.trim() || undefined;
}

function number(value: string | string[] | undefined): number | undefined {
  const parsed = Number(text(value));
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function status(
  value: string | string[] | undefined,
): VehicleStatus | undefined {
  const parsed = text(value);
  return VEHICLE_STATUSES.find((known) => known === parsed);
}

/** O mesmo filtro, apontando para outra página. */
function pageHref(filters: VehicleFilters, page: number): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries({ ...filters, page })) {
    if (value) query.set(key, String(value));
  }

  return `/fleet?${query}`;
}

export default async function FleetPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const filters: VehicleFilters = {
    plate: text(params.plate),
    brand: text(params.brand),
    model: text(params.model),
    year: number(params.year),
    status: status(params.status),
    page: number(params.page),
  };
  const page = filters.page ?? 1;
  // Com filtro na mão, uma lista vazia significa "não achei", não "não tem".
  const filtering = Object.entries(filters).some(
    ([key, value]) => key !== "page" && value,
  );

  const client = await createClient();
  const { vehicles, hasMore } = await listVehicles(client, filters);

  // Só o operador do SaaS enxerga mais de uma locadora. Para o gestor a coluna
  // seria a mesma palavra repetida em toda linha.
  const manyTenants =
    new Set(vehicles.map((vehicle) => vehicle.tenantId)).size > 1;

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 p-4 sm:p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Frota</h1>
        <form action={signOut}>
          <button type="submit" className="text-zinc-500 underline">
            Sair
          </button>
        </form>
      </div>

      <VehicleForm />

      {/*
        Formulário GET puro: o filtro vira URL, e a URL é o estado. Dá para
        recarregar, compartilhar e voltar no histórico sem uma linha de JS.
      */}
      <form className="flex flex-wrap items-end gap-3 border-t border-zinc-200 pt-6 dark:border-zinc-800">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-zinc-600 dark:text-zinc-400">Placa</span>
          <input
            name="plate"
            defaultValue={filters.plate}
            placeholder="ABC1D23"
            className={`${fieldClass} w-32`}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-zinc-600 dark:text-zinc-400">Marca</span>
          <input
            name="brand"
            defaultValue={filters.brand}
            className={`${fieldClass} w-32`}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-zinc-600 dark:text-zinc-400">Modelo</span>
          <input
            name="model"
            defaultValue={filters.model}
            className={`${fieldClass} w-32`}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-zinc-600 dark:text-zinc-400">Ano</span>
          <input
            name="year"
            type="number"
            defaultValue={filters.year}
            className={`${fieldClass} w-24`}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-zinc-600 dark:text-zinc-400">Situação</span>
          <select
            name="status"
            defaultValue={filters.status ?? ""}
            className={fieldClass}
          >
            <option value="">Todas</option>
            {Object.entries(STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>

        <button type="submit" className={buttonClass}>
          Filtrar
        </button>
        {filtering && (
          <Link href="/fleet" className="py-2 text-zinc-500 underline">
            Limpar
          </Link>
        )}
      </form>

      {vehicles.length === 0 ? (
        <p className="text-zinc-500">
          {filtering
            ? "Nenhum veículo encontrado com esse filtro."
            : "Nenhum veículo cadastrado."}
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-zinc-200 dark:divide-zinc-800">
          {vehicles.map((vehicle) => (
            <li
              key={vehicle.id}
              className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3"
            >
              <Link
                href={`/fleet/${vehicle.id}`}
                className="font-mono underline"
              >
                {vehicle.plate}
              </Link>
              <span>
                {vehicle.brand} {vehicle.model}
              </span>
              <span className="text-zinc-500">{vehicle.year}</span>
              {vehicle.color && (
                <span className="text-zinc-500">{vehicle.color}</span>
              )}
              {manyTenants && (
                <span className="text-zinc-500">{vehicle.tenantName}</span>
              )}
              <StatusSelect id={vehicle.id} status={vehicle.status} />
            </li>
          ))}
        </ul>
      )}

      {(page > 1 || hasMore) && (
        <nav className="flex items-center gap-4 text-sm">
          {page > 1 && (
            <Link href={pageHref(filters, page - 1)} className="underline">
              ← Anteriores
            </Link>
          )}
          <span className="text-zinc-500">Página {page}</span>
          {hasMore && (
            <Link href={pageHref(filters, page + 1)} className="underline">
              Próximos →
            </Link>
          )}
        </nav>
      )}
    </main>
  );
}
