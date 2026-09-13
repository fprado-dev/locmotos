import Link from "next/link";
import { redirect } from "next/navigation";
import { formatDay, formatInteger, initials } from "@/app/ui";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { fleetSummary } from "@/modules/fleet";
import {
  DEFAULT_RENTAL_SORT,
  findRental,
  listRentals,
  overdueCharges,
  rentalPayments,
  rentalCounts,
  RENTAL_SITUATIONS,
  RENTAL_SORTS,
  RENTALS_PER_PAGE,
  type Rental,
  type RentalFilters,
  type RentalSituation,
  type RentalSort,
  type SortDirection,
} from "@/modules/rentals";
import { FinanceCell } from "../finance";
import { LiveSearch } from "../live-search";
import { Pagination, SortHeader } from "../sort-header";
import { RentalPanel } from "./rental-panel";

type Param = string | string[] | undefined;

/** O nome de cada recorte na tela. Vocabulário de interface, num lugar só. */
const SITUATION_LABELS: Record<RentalSituation, string> = {
  active: "Ativas",
  ended: "Encerradas",
  overdue: "Inadimplentes",
};

/** O que veio na URL é texto de fora: só passa o que dá para usar. */
function text(value: Param): string | undefined {
  const first = Array.isArray(value) ? value[0] : value;
  return first?.trim() || undefined;
}

function number(value: Param): number | undefined {
  const parsed = Number(text(value));
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function situation(value: Param): RentalSituation | undefined {
  const parsed = text(value);
  return RENTAL_SITUATIONS.find((known) => known === parsed);
}

function sort(value: Param): RentalSort | undefined {
  const parsed = text(value);
  return RENTAL_SORTS.find((known) => known === parsed);
}

function direction(value: Param): SortDirection | undefined {
  const parsed = text(value);
  return parsed === "asc" || parsed === "desc" ? parsed : undefined;
}

/** A mesma tela com uma coisa trocada — o resto do que o gestor pediu fica. */
function href(
  filters: RentalFilters,
  changes: Partial<RentalFilters> & { open?: string },
): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries({ ...filters, ...changes })) {
    if (value) query.set(key, String(value));
  }

  return `/rentals?${query}`;
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
 * Um chip de recorte, com quantas locações ele entregaria.
 *
 * O contador não conta a locadora: conta o que sobraria deste chip com a busca
 * de pé. É isso que faz do chip uma pergunta já respondida antes do clique.
 *
 * Sem `situation` é o chip "Todas", que limpa o recorte em vez de escolher um.
 */
function SituationChip({
  situation,
  label,
  count,
  filters,
}: {
  situation?: RentalSituation;
  label: string;
  count: number;
  filters: RentalFilters;
}) {
  const active = filters.situation === situation;

  return (
    <Link
      href={href(filters, { situation, page: undefined, open: undefined })}
      aria-current={active ? "true" : undefined}
      className={cn(
        "flex h-[30px] items-center gap-1.5 rounded-full border px-3 text-[12.5px] transition-colors",
        active
          ? "border-input bg-chip font-medium text-foreground"
          : "border-border text-muted-foreground hover:border-input hover:text-foreground",
      )}
    >
      {label}
      <span className="tabular-nums text-subtle">{count}</span>
    </Link>
  );
}

const CELL = "h-11 border-b border-border px-3";

/** Ponto cheio ou anel: a situação continua legível em escala de cinza. */
function SituationDot({ ended }: { ended: boolean }) {
  return (
    <span
      aria-hidden
      className="size-[9px] shrink-0 rounded-full"
      style={
        ended
          ? { boxShadow: "inset 0 0 0 2px var(--off)" }
          : { background: "var(--ok)" }
      }
    />
  );
}

/** Uma locação por linha, do jeito que se compara com a de cima e a de baixo. */
function RentalRow({
  rental,
  filters,
  open,
}: {
  rental: Rental;
  filters: RentalFilters;
  /** Esta é a linha aberta no painel. */
  open: boolean;
}) {
  const ended = rental.endedOn !== null;

  return (
    <TableRow
      className={cn(
        "relative border-b-0 hover:bg-hover",
        open && "bg-hover",
        // Locação encerrada não compete por atenção com as que estão de pé: a
        // linha inteira recua, como a do locatário restrito.
        ended && "text-muted-foreground",
      )}
    >
      <TableCell className={cn(CELL, "overflow-hidden pl-[18px]")}>
        <span className="flex items-baseline gap-2.5">
          {/*
            O link cobre a linha inteira (`after:inset-0`), então clicar em
            qualquer lugar abre o painel — e continua sendo um link de verdade,
            alcançável pelo teclado e abrível em outra aba.
          */}
          <Link
            href={href(filters, { open: rental.id })}
            scroll={false}
            className="rounded-sm font-mono text-[13px] tracking-[0.02em] after:absolute after:inset-0 focus-visible:underline"
          >
            {rental.vehicle.plate}
          </Link>
          <span className="truncate text-muted-foreground">
            {rental.vehicle.model}
          </span>
        </span>
      </TableCell>

      <TableCell className={cn(CELL, "overflow-hidden")}>
        <span className="flex items-center gap-2.5">
          <span
            aria-hidden
            className="flex size-[26px] shrink-0 items-center justify-center rounded-full bg-chip text-[10.5px] font-semibold text-muted-foreground"
          >
            {initials(rental.renterName)}
          </span>
          <span className="truncate font-medium">{rental.renterName}</span>
        </span>
      </TableCell>

      <TableCell className={cn(CELL, "text-right tabular-nums")}>
        {formatInteger(rental.weeklyPrice)}
      </TableCell>

      <TableCell className={cn(CELL, "tabular-nums")}>
        {formatDay(rental.startedOn)}
      </TableCell>

      <TableCell className={cn(CELL, "text-right")}>
        {rental.commitmentMonths ? (
          <span className="tabular-nums">{rental.commitmentMonths} m</span>
        ) : (
          <span className="text-subtle">—</span>
        )}
      </TableCell>

      <TableCell className={CELL}>
        <FinanceCell rental={rental} />
      </TableCell>

      <TableCell className={cn(CELL, "pr-[18px]")}>
        <span className="flex items-center gap-2">
          <SituationDot ended={ended} />
          {ended ? `Encerrada em ${formatDay(rental.endedOn!)}` : "Ativa"}
        </span>
      </TableCell>
    </TableRow>
  );
}

export default async function RentalsPage({
  searchParams,
}: PageProps<"/rentals">) {
  const params = await searchParams;
  const filters: RentalFilters = {
    q: text(params.q),
    situation: situation(params.situation),
    page: number(params.page),
    sort: sort(params.sort),
    direction: direction(params.direction),
  };
  // Não é filtro: diz qual linha está aberta no painel, e some no clique
  // seguinte junto com a URL.
  const aberto = text(params.open);
  const page = filters.page ?? 1;
  // Com filtro na mão, uma lista vazia significa "não achei", não "não tem".
  const filtering = Boolean(filters.q || filters.situation);

  const client = await createClient();
  const [{ rentals, hasMore, total }, cards, frota, aberta, emAberto, pagos] =
    await Promise.all([
      listRentals(client, filters),
      // Sem filtro: os cards são da locadora inteira, e não podem mudar porque
      // o gestor digitou três letras de uma placa.
      rentalCounts(client),
      // Quantas motos a locadora tem, para "alugadas" ter sobre o que ser uma
      // fração.
      fleetSummary(client),
      // A locação aberta no painel pode não estar nesta página — o link veio
      // de outro filtro, do painel do locatário, ou de um endereço colado.
      aberto ? findRental(client, aberto) : null,
      // As cobranças em aberto e os pagamentos já lançados só custam quando
      // o painel abre.
      aberto ? overdueCharges(client, aberto) : [],
      aberto ? rentalPayments(client, aberto) : [],
    ]);

  // O contador do chip responde "quantas sobrariam se eu clicasse aqui": a
  // busca mexe nos números, e sem busca é a mesma conta dos cards.
  const chips = filters.q
    ? await rentalCounts(client, { q: filters.q })
    : cards;

  // Os filtros como já estão na URL: é o que a busca reescreve ao mudar.
  const query = Object.fromEntries(
    Object.entries(filters)
      .filter(([key, value]) => value && key !== "page")
      .map(([key, value]) => [key, String(value)]),
  );

  // A ordem resolvida uma vez: todos os cabeçalhos dizem a mesma coisa.
  const ordem = filters.sort ?? DEFAULT_RENTAL_SORT.sort;
  const sentido = filters.direction ?? DEFAULT_RENTAL_SORT.direction;
  const sortHref = (sort: string, direction: SortDirection) =>
    href(filters, {
      sort: sort as RentalSort,
      direction,
      page: undefined,
      open: undefined,
    });

  const first = (page - 1) * RENTALS_PER_PAGE + 1;
  const pages = Math.max(1, Math.ceil(total / RENTALS_PER_PAGE));

  // Página além do fim é a URL de ontem: o filtro mudou, ou o número foi
  // digitado à mão. Em vez de uma tela vazia que diz "nenhuma locação", o
  // gestor cai na última página que existe.
  if (page > pages) redirect(href(filters, { page: pages }));

  // Quanto da frota está rendendo. Sem moto na frota não há fração: o card
  // mostra zero em vez de uma divisão por zero.
  const ocupação =
    frota.total === 0 ? 0 : Math.round((cards.active / frota.total) * 100);

  return (
    <>
      <header className="flex h-16 shrink-0 items-center justify-between gap-4 px-8">
        <h1 className="flex items-baseline gap-2.5 text-xl font-semibold tracking-[-0.02em]">
          Locações
          <span className="text-sm font-normal text-muted-foreground">
            {cards.all === 1
              ? "1 locação"
              : `${formatInteger(cards.all)} locações`}
          </span>
        </h1>

        {/*
          Não há "Nova locação" aqui, e não é esquecimento: a locação começa no
          locatário, que é quem está na frente do gestor pedindo uma moto. O
          caminho é a tela de Locatários, e este link leva até ela.
        */}
        <Link
          href="/renters"
          className={buttonVariants({ variant: "outline", size: "lg" })}
        >
          Abrir pelo locatário
        </Link>
      </header>

      <div className="flex min-h-0 flex-1 flex-col px-8 pb-6">
        <section className="mt-1 mb-4 grid shrink-0 grid-cols-3 gap-3">
          <SummaryCard
            label="Locações ativas"
            dot="var(--ok)"
            value={formatInteger(cards.active)}
            note={`${formatInteger(cards.ended)} encerrada${cards.ended === 1 ? "" : "s"}`}
          />
          <SummaryCard
            label="Motos alugadas"
            value={`${ocupação}%`}
            note={`${formatInteger(cards.active)} de ${formatInteger(frota.total)} na frota`}
          />
          <SummaryCard
            label="Receita semanal contratada"
            prefix="R$"
            value={formatInteger(cards.activeWeeklyPrice)}
            note="Soma do valor semanal das ativas"
          />
        </section>

        <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[10px] border border-border bg-card">
          {/*
            Sem barra de lote: locação não é coisa que se mude às dezenas —
            encerrar é decisão uma a uma, com devolução e caução no meio. A
            casca tem a peça pronta para o dia em que aparecer uma ação que
            faça sentido em lote.
          */}
          <div className="flex h-[98px] shrink-0 items-center border-b border-border">
            <div className="flex h-full w-full flex-col justify-center gap-3 px-4">
              {/*
                Filtro é URL, e a URL é o estado: dá para recarregar,
                compartilhar e voltar no histórico. Quem a reescreve é cada
                controle no momento em que é usado.
              */}
              <div className="flex items-center gap-2">
                <LiveSearch
                  path="/rentals"
                  name="q"
                  label="Buscar por placa ou locatário"
                  value={filters.q}
                  query={query}
                  className="w-[280px]"
                />

                {filtering && (
                  <Link
                    href="/rentals"
                    className={cn(
                      buttonVariants({ variant: "ghost" }),
                      "text-brand-text",
                    )}
                  >
                    Limpar filtros
                  </Link>
                )}
              </div>

              <div className="flex items-center gap-1.5">
                <SituationChip
                  label="Todas"
                  count={chips.all}
                  filters={filters}
                />
                {RENTAL_SITUATIONS.map((value) => (
                  <SituationChip
                    key={value}
                    situation={value}
                    label={SITUATION_LABELS[value]}
                    count={chips[value]}
                    filters={filters}
                  />
                ))}
              </div>
            </div>
          </div>

          {rentals.length === 0 ? (
            <p className="flex-1 p-6 text-sm text-muted-foreground">
              {filtering
                ? "Nenhuma locação encontrada com esse filtro."
                : "Nenhuma locação aberta. Comece pelo painel de um locatário."}
            </p>
          ) : (
            <Table
              containerClassName="min-h-0 flex-1 overflow-auto"
              className="min-w-[1112px] table-fixed border-separate border-spacing-0 text-[13px]"
            >
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <SortHeader
                    column="vehicle"
                    label="Moto"
                    sort={ordem}
                    direction={sentido}
                    // Uma lista de placas abre em A–Z.
                    first="asc"
                    href={sortHref}
                    className="w-[230px] pl-[6px]"
                  />
                  <SortHeader
                    column="renter"
                    label="Locatário"
                    sort={ordem}
                    direction={sentido}
                    first="asc"
                    href={sortHref}
                  />
                  <SortHeader
                    column="weeklyPrice"
                    label="Semana"
                    sort={ordem}
                    direction={sentido}
                    href={sortHref}
                    align="right"
                    className="w-[120px]"
                  />
                  <SortHeader
                    column="startedOn"
                    label="Início"
                    sort={ordem}
                    direction={sentido}
                    href={sortHref}
                    className="w-[128px]"
                  />
                  <SortHeader
                    column="commitment"
                    label="Fidelidade"
                    sort={ordem}
                    direction={sentido}
                    href={sortHref}
                    align="right"
                    className="w-[120px]"
                  />
                  <SortHeader
                    column="finance"
                    label="Financeiro"
                    sort={ordem}
                    direction={sentido}
                    // A mais antiga em aberto primeiro: é a ordem de quem vai
                    // cobrar. O chip diz quem deve, a coluna diz desde quando.
                    first="asc"
                    href={sortHref}
                    className="w-[132px]"
                  />
                  {/* Situação não é ordenável: ela é chip, e ordenar por ela
                      responderia a mesma pergunta duas vezes. */}
                  <TableHead className="sticky top-0 z-10 h-10 w-[190px] border-b border-border bg-surface-2 px-3 text-xs font-medium text-muted-foreground">
                    Situação
                  </TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {rentals.map((rental) => (
                  <RentalRow
                    key={rental.id}
                    rental={rental}
                    filters={filters}
                    open={rental.id === aberto}
                  />
                ))}
              </TableBody>
            </Table>
          )}

          <Pagination
            page={page}
            pages={pages}
            hasMore={hasMore}
            href={(page) => href(filters, { page })}
          >
            {total === 0
              ? "Nenhuma locação"
              : `${first}–${first + rentals.length - 1} de ${formatInteger(total)}`}
          </Pagination>
        </section>
      </div>

      {aberta && (
        <RentalPanel
          rental={aberta}
          charges={emAberto}
          payments={pagos}
          closeHref={href(filters, { open: undefined })}
        />
      )}
    </>
  );
}
