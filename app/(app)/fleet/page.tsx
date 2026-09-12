import {
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  Search,
} from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { formatInteger, STATUS_LABELS, vehicleColor } from "@/app/ui";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/server";
import {
  daysUntilLicensing,
  daysWithoutRental,
  DEFAULT_VEHICLE_SORT,
  fleetFilterOptions,
  fleetStatusCounts,
  fleetSummary,
  licensingAlert,
  listVehicles,
  LONG_STOP_DAYS,
  VEHICLE_SORTS,
  VEHICLE_STATUSES,
  VEHICLES_PER_PAGE,
  type SortDirection,
  type Vehicle,
  type VehicleFilters,
  type VehicleSort,
  type VehicleStatus,
} from "@/modules/fleet";
import { FilterSelect } from "./filter-select";
import { NewVehicleSheet } from "./new-vehicle-sheet";
import { RowCheckbox, SelectAll, Selection, Toolbar } from "./selection";

type Param = string | string[] | undefined;

/** O que veio na URL é texto de fora: só passa o que dá para usar. */
function text(value: Param): string | undefined {
  const first = Array.isArray(value) ? value[0] : value;
  return first?.trim() || undefined;
}

function number(value: Param): number | undefined {
  const parsed = Number(text(value));
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function status(value: Param): VehicleStatus | undefined {
  const parsed = text(value);
  return VEHICLE_STATUSES.find((known) => known === parsed);
}

function sort(value: Param): VehicleSort | undefined {
  const parsed = text(value);
  return VEHICLE_SORTS.find((known) => known === parsed);
}

function direction(value: Param): SortDirection | undefined {
  const parsed = text(value);
  return parsed === "asc" || parsed === "desc" ? parsed : undefined;
}

/** A mesma tela com uma coisa trocada — o resto do que o gestor pediu fica. */
function href(
  filters: VehicleFilters,
  changes: Partial<VehicleFilters>,
): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries({ ...filters, ...changes })) {
    if (value) query.set(key, String(value));
  }

  return `/fleet?${query}`;
}

/** Um número grande com rótulo em cima e uma nota embaixo. */
function SummaryCard({
  label,
  dot,
  value,
  prefix,
  note,
}: {
  label: string;
  dot?: string;
  value: string;
  prefix?: string;
  note: React.ReactNode;
}) {
  return (
    <Card className="gap-2 rounded-[10px] bg-card px-[18px] py-4 ring-1 ring-border">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="flex items-center gap-2.5 text-[26px] leading-none font-medium tracking-[-0.02em]">
        {dot && (
          <span
            aria-hidden
            className="size-2.5 shrink-0 rounded-full"
            style={{ background: dot }}
          />
        )}
        {prefix && (
          <span className="text-[15px] font-normal text-muted-foreground">
            {prefix}
          </span>
        )}
        {value}
      </span>
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {note}
      </span>
    </Card>
  );
}

/**
 * O cabeçalho de uma coluna, que também é o botão de ordenar por ela.
 *
 * A ordem vive na URL como os filtros: cada cabeçalho é um link, e a tela
 * ordenada pode ser recarregada, compartilhada e desfeita pelo botão voltar.
 */
function SortHeader({
  column,
  label,
  filters,
  className,
  align = "left",
}: {
  column: VehicleSort;
  label: string;
  filters: VehicleFilters;
  className?: string;
  align?: "left" | "right";
}) {
  const active = (filters.sort ?? DEFAULT_VEHICLE_SORT.sort) === column;
  const current = filters.direction ?? DEFAULT_VEHICLE_SORT.direction;
  // Coluna nova começa na ordem decrescente — o maior, o mais caro, o mais
  // parado. Clicar de novo na mesma coluna inverte.
  const next = active && current === "desc" ? "asc" : "desc";

  const Arrow = current === "asc" ? ArrowUp : ArrowDown;
  const arrow = (
    <span className="inline-flex w-2.5 shrink-0">
      {active && <Arrow className="size-2.5" />}
    </span>
  );

  return (
    <TableHead
      aria-sort={
        active ? (current === "asc" ? "ascending" : "descending") : "none"
      }
      className={cn(
        "sticky top-0 z-10 h-10 border-b border-border bg-surface-2 p-0",
        className,
      )}
    >
      {/* Base UI não deixa um Button virar link, e ordenar é navegar: a
          ordem vive na URL, então o cabeçalho é um `<a>` de verdade, com as
          classes do botão por cima. */}
      <Link
        href={href(filters, {
          sort: column,
          direction: next,
          page: undefined,
        })}
        className={cn(
          buttonVariants({ variant: "ghost" }),
          "h-10 w-full gap-1 rounded-none px-3 text-xs font-medium hover:bg-transparent hover:text-foreground",
          align === "right" ? "justify-end" : "justify-start",
          active ? "text-foreground" : "text-muted-foreground",
        )}
      >
        {align === "right" && arrow}
        {label}
        {align === "left" && arrow}
      </Link>
    </TableHead>
  );
}

/**
 * Um passo de página, para frente ou para trás.
 *
 * Com página para onde ir é link de verdade, e não um Button fingindo de link:
 * o gestor abre a página seguinte em outra aba se quiser. Sem para onde ir
 * volta a ser botão, porque só um botão pode estar desabilitado.
 */
function PageStep({
  href: to,
  label,
  children,
}: {
  href: string | undefined;
  label: string;
  children: React.ReactNode;
}) {
  if (!to) {
    return (
      <Button variant="outline" size="icon-sm" aria-label={label} disabled>
        {children}
      </Button>
    );
  }

  return (
    <Link
      href={to}
      aria-label={label}
      className={buttonVariants({ variant: "outline", size: "icon-sm" })}
    >
      {children}
    </Link>
  );
}

const CELL = "h-11 border-b border-border px-3";

/** Ponto cheio ou anel: a situação continua legível em escala de cinza. */
function StatusDot({ status }: { status: VehicleStatus }) {
  const hollow = status === "reserved" || status === "maintenance";
  const color =
    status === "available" || status === "reserved"
      ? "var(--ok)"
      : "var(--off)";

  return (
    <span
      aria-hidden
      className="size-[9px] shrink-0 rounded-full"
      style={
        hollow
          ? { boxShadow: `inset 0 0 0 2px ${color}` }
          : { background: color }
      }
    />
  );
}

/**
 * Um chip de situação, com quantas motos ele entregaria.
 *
 * O contador não conta a frota: conta o que sobraria deste chip com os outros
 * filtros de pé. Filtrar por Honda mexe nos números, e é isso que faz do chip
 * uma pergunta respondida antes de ser clicada.
 *
 * Sem `status` é o chip "Todas", que limpa a situação em vez de escolher uma.
 */
function StatusChip({
  status,
  label,
  count,
  filters,
}: {
  status?: VehicleStatus;
  label: string;
  count: number;
  filters: VehicleFilters;
}) {
  const active = filters.status === status;

  return (
    <Link
      href={href(filters, { status, page: undefined })}
      aria-current={active ? "true" : undefined}
      className={cn(
        "flex h-[30px] items-center gap-1.5 rounded-full border px-3 text-[12.5px] transition-colors",
        active
          ? "border-input bg-chip font-medium text-foreground"
          : "border-border text-muted-foreground hover:border-input hover:text-foreground",
      )}
    >
      {status && <StatusDot status={status} />}
      {label}
      <span className="tabular-nums text-subtle">{count}</span>
    </Link>
  );
}

/**
 * O que a lista precisa gritar sobre o licenciamento.
 *
 * Vencido em vermelho, vencendo em âmbar — e a cor não carrega a informação
 * sozinha: o texto diz qual é qual, e quantos dias.
 */
function LicensingBadge({ dueDate }: { dueDate: string | null }) {
  const alert = licensingAlert(dueDate);
  if (!alert || !dueDate) {
    return <span className="text-subtle">—</span>;
  }

  const days = daysUntilLicensing(dueDate);

  return (
    <Badge
      className={cn(
        "h-auto rounded-md px-[9px] py-1 text-xs",
        alert === "overdue"
          ? "bg-late font-semibold text-white"
          : "bg-soon-bg font-medium text-soon-fg",
      )}
    >
      {alert === "overdue" ? `Vencido há ${-days} d` : `Vence em ${days} d`}
    </Badge>
  );
}

/** Uma moto por linha, do jeito que se compara com a de cima e a de baixo. */
function VehicleRow({ vehicle }: { vehicle: Vehicle }) {
  const stopped = daysWithoutRental(vehicle.createdAt);

  return (
    <TableRow
      className={cn(
        // Quem pinta a linha marcada é o próprio checkbox, via `:has()`: não
        // há estado de React aqui, e a linha continua sendo do servidor.
        "relative border-b-0 hover:bg-hover has-[[data-checked]]:bg-sel",
        // Moto fora de operação não compete por atenção com o resto da frota.
        vehicle.status === "unavailable" && "text-muted-foreground",
      )}
    >
      {/*
        `z-10` porque o link da linha se estende por cima de tudo com um
        `::after`: sem subir a célula, marcar a moto abriria o cadastro dela.
      */}
      <TableCell className={cn(CELL, "relative z-10 pl-[18px]")}>
        <RowCheckbox id={vehicle.id} plate={vehicle.plate} />
      </TableCell>

      <TableCell
        className={cn(CELL, "font-mono text-[13px] tracking-[0.02em]")}
      >
        {/*
          O link cobre a linha inteira (`after:inset-0`), então clicar em
          qualquer lugar abre o veículo — e continua sendo um link de verdade,
          alcançável pelo teclado e abrível em outra aba.
        */}
        <Link
          href={`/fleet/${vehicle.id}`}
          className="rounded-sm after:absolute after:inset-0 focus-visible:underline"
        >
          {vehicle.plate}
        </Link>
      </TableCell>

      <TableCell className={cn(CELL, "overflow-hidden text-ellipsis")}>
        <span className="flex items-center gap-2.5">
          <span
            title={vehicle.color ?? "Cor não informada"}
            className="size-3 shrink-0 rounded-full border border-input"
            style={{ background: vehicleColor(vehicle.color) }}
          />
          <span className="truncate">
            <span className="text-muted-foreground">{vehicle.brand} </span>
            <span className="font-medium">{vehicle.model}</span>
          </span>
        </span>
      </TableCell>

      <TableCell className={cn(CELL, "text-right text-muted-foreground")}>
        {vehicle.year}
      </TableCell>

      <TableCell className={cn(CELL, "text-right")}>
        {vehicle.mileage === null ? (
          <span className="text-subtle">—</span>
        ) : (
          formatInteger(vehicle.mileage)
        )}
      </TableCell>

      <TableCell className={cn(CELL, "text-right")}>
        {vehicle.weeklyPrice === null ? (
          <span className="text-subtle">—</span>
        ) : (
          formatInteger(vehicle.weeklyPrice)
        )}
      </TableCell>

      <TableCell className={CELL}>
        <span className="flex items-center gap-2">
          <StatusDot status={vehicle.status} />
          {STATUS_LABELS[vehicle.status]}
        </span>
      </TableCell>

      <TableCell className={cn(CELL, "text-right")}>
        {/* Passou de um ciclo de cobrança parada, a linha precisa saltar. */}
        <span
          className={cn(
            stopped > LONG_STOP_DAYS
              ? "rounded-md bg-chip px-2 py-[3px] font-semibold text-foreground"
              : "text-muted-foreground",
          )}
        >
          {stopped} d
        </span>
      </TableCell>

      <TableCell className={cn(CELL, "pr-[18px]")}>
        <LicensingBadge dueDate={vehicle.licensingDueDate} />
      </TableCell>
    </TableRow>
  );
}

export default async function FleetPage({ searchParams }: PageProps<"/fleet">) {
  const params = await searchParams;
  const filters: VehicleFilters = {
    plate: text(params.plate),
    brand: text(params.brand),
    model: text(params.model),
    year: number(params.year),
    status: status(params.status),
    page: number(params.page),
    sort: sort(params.sort),
    direction: direction(params.direction),
  };
  const page = filters.page ?? 1;
  // Com filtro na mão, uma lista vazia significa "não achei", não "não tem".
  const filtering = Object.entries(filters).some(
    ([key, value]) => !["page", "sort", "direction"].includes(key) && value,
  );

  const client = await createClient();
  const [{ vehicles, hasMore, total }, summary, options, counts] =
    await Promise.all([
      listVehicles(client, filters),
      fleetSummary(client),
      fleetFilterOptions(client),
      fleetStatusCounts(client, filters),
    ]);

  // Os filtros como já estão na URL: é o que os selects reescrevem ao mudar.
  const query = Object.fromEntries(
    Object.entries(filters)
      .filter(([key, value]) => value && key !== "page")
      .map(([key, value]) => [key, String(value)]),
  );

  const first = (page - 1) * VEHICLES_PER_PAGE + 1;
  const pages = Math.max(1, Math.ceil(total / VEHICLES_PER_PAGE));

  // Página além do fim é a URL de ontem: o filtro mudou, a frota encolheu, ou
  // o número foi digitado à mão. Em vez de uma tela vazia que diz "nenhum
  // veículo cadastrado", o gestor cai na última página que existe.
  if (page > pages) redirect(href(filters, { page: pages }));

  return (
    <>
      <header className="flex h-16 shrink-0 items-center justify-between gap-4 px-8">
        <h1 className="flex items-baseline gap-2.5 text-xl font-semibold tracking-[-0.02em]">
          Frota
          <span className="text-sm font-normal text-muted-foreground">
            {summary.total === 1
              ? "1 veículo"
              : `${formatInteger(summary.total)} veículos`}
          </span>
        </h1>

        <NewVehicleSheet />
      </header>

      <div className="flex min-h-0 flex-1 flex-col px-8 pb-6">
        <section className="mt-1 mb-4 grid shrink-0 grid-cols-2 gap-3 xl:grid-cols-4">
          <SummaryCard
            label="Total de motos"
            value={formatInteger(summary.total)}
            note={`${vehicles.length} nesta página`}
          />
          <SummaryCard
            label="Disponíveis"
            dot="var(--ok)"
            value={formatInteger(summary.available)}
            note={`${summary.reserved} reservada${summary.reserved === 1 ? "" : "s"} · ${summary.maintenance} em manutenção`}
          />
          <SummaryCard
            label="Licenciamento em 60 d"
            dot="var(--soon-fg)"
            value={formatInteger(summary.licensingDueSoon)}
            note={
              <>
                <span
                  aria-hidden
                  className="size-2 shrink-0 rounded-full bg-late"
                />
                {`${summary.licensingOverdue} vencido${summary.licensingOverdue === 1 ? "" : "s"}`}
              </>
            }
          />
          <SummaryCard
            label="Receita semanal potencial"
            prefix="R$"
            value={formatInteger(summary.availableWeeklyPrice)}
            note="Só motos disponíveis"
          />
        </section>

        {/* A seleção envolve a barra e a tabela: é a barra que muda de forma
            quando uma linha é marcada, e o cabeçalho que marca as visíveis. */}
        <Selection visible={vehicles.map((vehicle) => vehicle.id)}>
          <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[10px] border border-border bg-card">
            <Toolbar>
              <div className="flex h-full w-full flex-col justify-center gap-3 px-4">
                {/*
                A busca continua sendo formulário GET puro: o filtro vira URL, e
                a URL é o estado. Dá para recarregar, compartilhar e voltar no
                histórico — e digitar uma placa e apertar Enter funciona sem
                JavaScript nenhum. Os selects e os chips, que agem no clique,
                reescrevem a mesma URL.
              */}
                <form className="flex items-center gap-2">
                  {/* O que não está neste formulário mas está na URL volta por
                    aqui: buscar uma placa não desfaz a ordem nem os selects. */}
                  {Object.entries(query)
                    .filter(([key]) => key !== "plate")
                    .map(([key, value]) => (
                      <input key={key} type="hidden" name={key} value={value} />
                    ))}

                  <div className="relative">
                    <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-subtle" />
                    <Input
                      name="plate"
                      defaultValue={filters.plate}
                      placeholder="Buscar placa"
                      aria-label="Buscar placa"
                      className="w-[220px] pl-8 font-mono uppercase"
                    />
                  </div>

                  <FilterSelect
                    name="brand"
                    label="Marca"
                    value={filters.brand}
                    query={query}
                    className="w-[130px]"
                    options={[
                      { value: "", label: "Todas as marcas" },
                      ...options.brands.map((brand) => ({
                        value: brand,
                        label: brand,
                      })),
                    ]}
                  />
                  <FilterSelect
                    name="model"
                    label="Modelo"
                    value={filters.model}
                    query={query}
                    className="w-[150px]"
                    options={[
                      { value: "", label: "Todos os modelos" },
                      ...options.models.map((model) => ({
                        value: model,
                        label: model,
                      })),
                    ]}
                  />
                  <FilterSelect
                    name="year"
                    label="Ano"
                    value={filters.year ? String(filters.year) : undefined}
                    query={query}
                    className="w-24"
                    options={[
                      { value: "", label: "Todos" },
                      ...options.years.map((year) => ({
                        value: String(year),
                        label: String(year),
                      })),
                    ]}
                  />

                  {filtering && (
                    <Link
                      href="/fleet"
                      className={cn(
                        buttonVariants({ variant: "ghost" }),
                        "text-brand-text",
                      )}
                    >
                      Limpar filtros
                    </Link>
                  )}
                </form>

                <div className="flex items-center gap-1.5">
                  <StatusChip
                    label="Todas"
                    count={counts.all}
                    filters={filters}
                  />
                  {VEHICLE_STATUSES.map((value) => (
                    <StatusChip
                      key={value}
                      status={value}
                      label={STATUS_LABELS[value]}
                      count={counts[value]}
                      filters={filters}
                    />
                  ))}
                </div>
              </div>
            </Toolbar>

            {vehicles.length === 0 ? (
              <p className="flex-1 p-6 text-sm text-muted-foreground">
                {filtering
                  ? "Nenhum veículo encontrado com esse filtro."
                  : "Nenhum veículo cadastrado."}
              </p>
            ) : (
              <Table
                containerClassName="min-h-0 flex-1 overflow-auto"
                className="min-w-[1100px] table-fixed border-separate border-spacing-0 text-[13px]"
              >
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="sticky top-0 z-10 h-10 w-12 border-b border-border bg-surface-2 pl-[18px]">
                      <SelectAll />
                    </TableHead>
                    <SortHeader
                      column="plate"
                      label="Placa"
                      filters={filters}
                      className="w-[118px]"
                    />
                    <SortHeader
                      column="vehicle"
                      label="Veículo"
                      filters={filters}
                    />
                    <SortHeader
                      column="year"
                      label="Ano"
                      filters={filters}
                      align="right"
                      className="w-[72px]"
                    />
                    <SortHeader
                      column="mileage"
                      label="Km"
                      filters={filters}
                      align="right"
                      className="w-[104px]"
                    />
                    <SortHeader
                      column="weeklyPrice"
                      label="R$/semana"
                      filters={filters}
                      align="right"
                      className="w-[116px]"
                    />
                    <SortHeader
                      column="status"
                      label="Situação"
                      filters={filters}
                      className="w-[164px]"
                    />
                    <SortHeader
                      column="daysWithoutRental"
                      label="Parada há"
                      filters={filters}
                      align="right"
                      className="w-[112px]"
                    />
                    <SortHeader
                      column="licensing"
                      label="Licenciamento"
                      filters={filters}
                      className="w-[190px]"
                    />
                  </TableRow>
                </TableHeader>

                <TableBody>
                  {vehicles.map((vehicle) => (
                    <VehicleRow key={vehicle.id} vehicle={vehicle} />
                  ))}
                </TableBody>
              </Table>
            )}

            <footer className="flex h-12 shrink-0 items-center justify-between border-t border-border bg-surface-2 px-[18px] text-[12.5px] text-muted-foreground">
              <span>
                {total === 0
                  ? "Nenhum veículo"
                  : `${first}–${first + vehicles.length - 1} de ${formatInteger(total)}`}
              </span>

              <span className="flex items-center gap-1.5">
                <PageStep
                  href={
                    page === 1 ? undefined : href(filters, { page: page - 1 })
                  }
                  label="Página anterior"
                >
                  <ChevronLeft />
                </PageStep>
                <span>
                  Página {page} de {pages}
                </span>
                <PageStep
                  href={hasMore ? href(filters, { page: page + 1 }) : undefined}
                  label="Próxima página"
                >
                  <ChevronRight />
                </PageStep>
              </span>
            </footer>
          </section>
        </Selection>
      </div>
    </>
  );
}
