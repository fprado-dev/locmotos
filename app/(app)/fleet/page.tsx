import { Search } from "lucide-react";
import Link from "next/link";
import { STATUS_LABELS } from "@/app/ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createClient } from "@/lib/supabase/server";
import {
  daysUntilLicensing,
  daysWithoutRental,
  licensingAlert,
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

/**
 * O aviso de licenciamento, quando há o que avisar.
 *
 * Vencido em vermelho, vencendo em âmbar — e a cor não carrega a informação
 * sozinha: o texto diz qual é qual.
 */
function LicensingBadge({ dueDate }: { dueDate: string | null }) {
  const alert = licensingAlert(dueDate);
  if (!alert || !dueDate) return null;

  const days = daysUntilLicensing(dueDate);

  return (
    <Badge
      className={
        alert === "overdue" ? "bg-late-bg text-late" : "bg-soon-bg text-soon-fg"
      }
    >
      {alert === "overdue"
        ? `Licenciamento vencido há ${-days} d`
        : `Licenciamento vence em ${days} d`}
    </Badge>
  );
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
    <>
      <header className="flex h-16 shrink-0 items-center gap-2.5 border-b border-border px-8">
        <h1 className="text-xl font-semibold tracking-[-0.02em]">Frota</h1>
      </header>

      <div className="flex-1 overflow-auto px-8 pb-6">
        <section className="py-6">
          <VehicleForm />
        </section>

        {/*
          Formulário GET puro: o filtro vira URL, e a URL é o estado. Dá para
          recarregar, compartilhar e voltar no histórico.
        */}
        <form className="flex flex-wrap items-end gap-3 border-t border-border py-6">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="plate-filter">Placa</Label>
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-subtle" />
              <Input
                id="plate-filter"
                name="plate"
                defaultValue={filters.plate}
                placeholder="Buscar placa"
                className="w-[220px] pl-8 font-mono uppercase"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="brand-filter">Marca</Label>
            <Input
              id="brand-filter"
              name="brand"
              defaultValue={filters.brand}
              className="w-[130px]"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="model-filter">Modelo</Label>
            <Input
              id="model-filter"
              name="model"
              defaultValue={filters.model}
              className="w-[150px]"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="year-filter">Ano</Label>
            <Input
              id="year-filter"
              name="year"
              type="number"
              defaultValue={filters.year}
              className="w-24"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Situação</Label>
            <Select name="status" defaultValue={filters.status ?? ""}>
              <SelectTrigger className="w-[164px]">
                <SelectValue placeholder="Todas" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Todas</SelectItem>
                {Object.entries(STATUS_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button type="submit">Filtrar</Button>
          {filtering && (
            <Button
              variant="ghost"
              className="text-brand-text"
              render={<Link href="/fleet" />}
            >
              Limpar filtros
            </Button>
          )}
        </form>

        {vehicles.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {filtering
              ? "Nenhum veículo encontrado com esse filtro."
              : "Nenhum veículo cadastrado."}
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-border border-y border-border">
            {vehicles.map((vehicle) => (
              <li
                key={vehicle.id}
                className="flex flex-wrap items-center gap-x-4 gap-y-2 py-2.5 text-sm"
              >
                <Link
                  href={`/fleet/${vehicle.id}`}
                  className="font-mono tracking-[0.02em] underline-offset-4 hover:underline"
                >
                  {vehicle.plate}
                </Link>
                <span>
                  <span className="text-muted-foreground">
                    {vehicle.brand}{" "}
                  </span>
                  {vehicle.model}
                </span>
                <span className="text-muted-foreground">{vehicle.year}</span>
                {vehicle.color && (
                  <span className="text-muted-foreground">{vehicle.color}</span>
                )}
                {manyTenants && (
                  <span className="text-muted-foreground">
                    {vehicle.tenantName}
                  </span>
                )}
                <span className="text-muted-foreground">
                  parada há {daysWithoutRental(vehicle.createdAt)} d
                </span>
                <LicensingBadge dueDate={vehicle.licensingDueDate} />
                <StatusSelect id={vehicle.id} status={vehicle.status} />
              </li>
            ))}
          </ul>
        )}

        {(page > 1 || hasMore) && (
          <nav className="flex items-center gap-4 py-4 text-sm">
            {page > 1 && (
              <Link
                href={pageHref(filters, page - 1)}
                className="text-brand-text underline-offset-4 hover:underline"
              >
                ← Anteriores
              </Link>
            )}
            <span className="text-muted-foreground">Página {page}</span>
            {hasMore && (
              <Link
                href={pageHref(filters, page + 1)}
                className="text-brand-text underline-offset-4 hover:underline"
              >
                Próximos →
              </Link>
            )}
          </nav>
        )}
      </div>
    </>
  );
}
