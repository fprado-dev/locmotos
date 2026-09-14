import { MessageCircle } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  formatInteger,
  formatMoney,
  formatMonthYear,
  initials,
  managerLabel,
} from "@/app/ui";
import { Badge } from "@/components/ui/badge";
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
import { availableVehicles } from "@/modules/fleet";
import {
  activeRentalForRenter,
  overdueCharges,
  rentalHistory,
  renterViolations,
  rentalPayments,
} from "@/modules/rentals";
import {
  DEFAULT_RENTER_SORT,
  listRenters,
  findRenter,
  maskedCpf,
  onlyDigits,
  renterCounts,
  RENTER_SITUATIONS,
  RENTER_SORTS,
  RENTERS_PER_PAGE,
  formatWhatsapp,
  type Renter,
  type RenterFilters,
  type RenterSituation,
  type RenterSort,
  type SortDirection,
} from "@/modules/renters";
import { currentTenant } from "@/modules/tenants";
import { FinanceCell } from "../finance";
import { LiveSearch } from "../live-search";
import { RowCheckbox, SelectAll, Selection, Toolbar } from "../selection";
import { Pagination, SortHeader } from "../sort-header";
import { BatchBar } from "./batch-bar";
import { CnhBadge } from "./cnh-badge";
import { NewRenterSheet } from "./new-renter-sheet";
import { RenterPanel } from "./renter-panel";

type Param = string | string[] | undefined;

/** O nome de cada recorte na tela. Vocabulário de interface, num lugar só. */
const SITUATION_LABELS: Record<RenterSituation, string> = {
  "with-rental": "Com locação",
  "without-rental": "Sem locação",
  restricted: "Com restrição",
  "cnh-overdue": "CNH vencida",
  "cnh-due-soon": "CNH vencendo",
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

function situation(value: Param): RenterSituation | undefined {
  const parsed = text(value);
  return RENTER_SITUATIONS.find((known) => known === parsed);
}

function sort(value: Param): RenterSort | undefined {
  const parsed = text(value);
  return RENTER_SORTS.find((known) => known === parsed);
}

function direction(value: Param): SortDirection | undefined {
  const parsed = text(value);
  return parsed === "asc" || parsed === "desc" ? parsed : undefined;
}

/** A mesma tela com uma coisa trocada — o resto do que o gestor pediu fica. */
function href(
  filters: RenterFilters,
  changes: Partial<RenterFilters> & { open?: string },
): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries({ ...filters, ...changes })) {
    if (value) query.set(key, String(value));
  }

  return `/renters?${query}`;
}

/** Um número grande com rótulo em cima e uma nota embaixo. */
function SummaryCard({
  label,
  dot,
  value,
  note,
}: {
  label: string;
  dot?: string;
  value: string;
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
        {value}
      </span>
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {note}
      </span>
    </Card>
  );
}

/**
 * Um chip de recorte, com quantos locatários ele entregaria.
 *
 * O contador não conta a carteira: conta o que sobraria deste chip com a busca
 * de pé. É isso que faz do chip uma pergunta já respondida antes do clique.
 *
 * Sem `situation` é o chip "Todos", que limpa o recorte em vez de escolher um.
 */
function SituationChip({
  situation,
  label,
  count,
  filters,
}: {
  situation?: RenterSituation;
  label: string;
  count: number;
  filters: RenterFilters;
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

/** Uma pessoa por linha, do jeito que se compara com a de cima e a de baixo. */
function RenterRow({
  renter,
  filters,
  open,
  entering,
}: {
  renter: Renter;
  filters: RenterFilters;
  /** Esta é a linha aberta no painel. */
  open: boolean;
  /** Acabou de ser cadastrada: a linha se apresenta e o realce apaga sozinho. */
  entering?: boolean;
}) {
  const whatsapp = formatWhatsapp(renter.whatsapp);

  return (
    <TableRow
      className={cn(
        // Quem pinta a linha marcada é o próprio checkbox, via `:has()`: não
        // há estado de React aqui, e a linha continua sendo do servidor.
        "relative border-b-0 hover:bg-hover has-[[data-checked]]:bg-sel",
        entering && "animate-[row-in_2.5s_ease-out]",
        open && "bg-hover",
        // Quem está impedido de alugar não compete por atenção com o resto da
        // carteira: a linha inteira recua, e o selo diz por quê.
        renter.restriction && "text-muted-foreground",
      )}
    >
      {/*
        `z-10` porque o link da linha se estende por cima de tudo com um
        `::after`: sem subir a célula, marcar a pessoa abriria o painel dela.
      */}
      <TableCell className={cn(CELL, "relative z-10 pl-[18px]")}>
        <RowCheckbox id={renter.id} label={`Selecionar ${renter.name}`} />
      </TableCell>

      <TableCell className={cn(CELL, "overflow-hidden")}>
        <span className="flex items-center gap-2.5">
          <span
            aria-hidden
            className="flex size-[26px] shrink-0 items-center justify-center rounded-full bg-chip text-[10.5px] font-semibold text-muted-foreground"
          >
            {initials(renter.name)}
          </span>
          {/*
            O link cobre a linha inteira (`after:inset-0`), então clicar em
            qualquer lugar abre o painel — e continua sendo um link de verdade,
            alcançável pelo teclado e abrível em outra aba.
          */}
          <Link
            href={href(filters, { open: renter.id })}
            scroll={false}
            className="truncate rounded-sm font-medium after:absolute after:inset-0 focus-visible:underline"
          >
            {renter.name}
          </Link>
        </span>
      </TableCell>

      <TableCell
        className={cn(CELL, "font-mono text-[12.5px] text-muted-foreground")}
      >
        {maskedCpf(renter.cpf)}
      </TableCell>

      <TableCell className={CELL}>
        {whatsapp ? (
          <span className="flex items-center gap-2">
            <span className="tabular-nums">{whatsapp}</span>
            {/*
              Link de verdade, e acima do link da linha (`relative z-10`):
              clicar no balão abre a conversa, não o painel.
            */}
            <a
              href={`https://wa.me/55${onlyDigits(renter.whatsapp ?? "")}`}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Abrir conversa no WhatsApp com ${renter.name}`}
              title="Abrir conversa no WhatsApp"
              className="relative z-10 flex size-[22px] shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:border-primary hover:text-primary"
            >
              <MessageCircle aria-hidden className="size-3" />
            </a>
          </span>
        ) : (
          <span className="text-subtle">—</span>
        )}
      </TableCell>

      <TableCell className={CELL}>
        <span className="flex items-center gap-2">
          <span className="font-mono text-[12.5px]">
            {renter.cnhCategory ?? "—"}
          </span>
          <CnhBadge dueDate={renter.cnhDueDate} />
        </span>
      </TableCell>

      <TableCell className={CELL}>
        {renter.rental?.plate ? (
          /*
            Link de verdade, e acima do link da linha (`relative z-10`):
            clicar na placa abre a locação, não o painel do locatário.
          */
          <Link
            href={`/rentals?open=${renter.rental.id}`}
            className="relative z-10 rounded-sm font-mono text-[12.5px] hover:underline"
          >
            {renter.rental.plate}
          </Link>
        ) : (
          <span className="text-subtle">—</span>
        )}
      </TableCell>

      <TableCell className={CELL}>
        <FinanceCell rental={renter.rental} />
      </TableCell>

      <TableCell className={CELL}>
        {renter.restriction ? (
          <Badge
            title={renter.restriction.reason}
            className="h-auto rounded-md border border-input bg-chip px-[9px] py-1 text-xs font-medium text-foreground"
          >
            Restrito
          </Badge>
        ) : (
          <span className="text-subtle">—</span>
        )}
      </TableCell>

      <TableCell
        className={cn(CELL, "pr-[18px] text-right text-muted-foreground")}
      >
        {formatMonthYear(renter.createdAt)}
      </TableCell>
    </TableRow>
  );
}

export default async function RentersPage({
  searchParams,
}: PageProps<"/renters">) {
  const params = await searchParams;
  const filters: RenterFilters = {
    q: text(params.q),
    situation: situation(params.situation),
    page: number(params.page),
    sort: sort(params.sort),
    direction: direction(params.direction),
  };
  // Nenhum dos dois é filtro: um diz qual linha está aberta no painel, o outro
  // qual acabou de ser cadastrada. Somem no clique seguinte, junto com a URL.
  const aberto = text(params.open);
  const entering = text(params.new);
  const page = filters.page ?? 1;
  // Com filtro na mão, uma lista vazia significa "não achei", não "não tem".
  const filtering = Boolean(filters.q || filters.situation);

  const client = await createClient();
  const [
    { renters, hasMore, total },
    cards,
    tenant,
    aberta,
    locação,
    motos,
    histórico,
    infrações,
  ] = await Promise.all([
    listRenters(client, filters),
    // Sem filtro: os cards são da carteira inteira, e não podem mudar porque
    // o gestor digitou três letras de um nome.
    renterCounts(client),
    currentTenant(client),
    // A pessoa aberta no painel pode não estar nesta página — o link veio de
    // outro filtro, ou de um endereço colado.
    aberto ? findRenter(client, aberto) : null,
    // O acordo inteiro é do módulo de Locações; a lista só carrega a placa.
    aberto ? activeRentalForRenter(client, aberto) : null,
    // As motos do seletor de nova locação: só custam quando o painel abre.
    aberto ? availableVehicles(client) : [],
    // O histórico é do locatário, não da locação: existe mesmo para quem
    // está sem moto agora.
    aberto ? rentalHistory(client, aberto) : [],
    // As infrações atribuídas a esta pessoa. Não são gravadas com o nome dela
    // — a view resolve pela data da multa e pelo período da locação.
    aberto ? renterViolations(client, aberto) : [],
  ]);

  // As cobranças em aberto dependem de qual é a locação, então vêm depois
  // dela — e só quando o painel está aberto, que é quando alguém as lê.
  const [emAberto, pagos] = locação
    ? await Promise.all([
        overdueCharges(client, locação.id),
        rentalPayments(client, locação.id),
      ])
    : [[], []];

  // O contador do chip responde "quantos sobrariam se eu clicasse aqui": a
  // busca mexe nos números, e sem busca é a mesma conta dos cards.
  const chips = filters.q
    ? await renterCounts(client, { q: filters.q })
    : cards;

  // Os filtros como já estão na URL: é o que a busca reescreve ao mudar.
  const query = Object.fromEntries(
    Object.entries(filters)
      .filter(([key, value]) => value && key !== "page")
      .map(([key, value]) => [key, String(value)]),
  );

  // A ordem resolvida uma vez: os três cabeçalhos dizem a mesma coisa.
  const ordem = filters.sort ?? DEFAULT_RENTER_SORT.sort;
  const sentido = filters.direction ?? DEFAULT_RENTER_SORT.direction;
  const sortHref = (sort: string, direction: SortDirection) =>
    href(filters, {
      sort: sort as RenterSort,
      direction,
      page: undefined,
      open: undefined,
    });

  const first = (page - 1) * RENTERS_PER_PAGE + 1;
  const pages = Math.max(1, Math.ceil(total / RENTERS_PER_PAGE));

  // Página além do fim é a URL de ontem: o filtro mudou, a carteira encolheu,
  // ou o número foi digitado à mão. Em vez de uma tela vazia que diz "nenhum
  // locatário cadastrado", o gestor cai na última página que existe.
  if (page > pages) redirect(href(filters, { page: pages }));

  return (
    <>
      <header className="flex h-16 shrink-0 items-center justify-between gap-4 px-8">
        <h1 className="flex items-baseline gap-2.5 text-xl font-semibold tracking-[-0.02em]">
          Locatários
          <span className="text-sm font-normal text-muted-foreground">
            {cards.all === 1
              ? "1 pessoa"
              : `${formatInteger(cards.all)} pessoas`}
          </span>
        </h1>

        <NewRenterSheet />
      </header>

      <div className="flex min-h-0 flex-1 flex-col px-8 pb-6">
        <section className="mt-1 mb-4 grid shrink-0 grid-cols-5 gap-3">
          <SummaryCard
            label="Total de locatários"
            value={formatInteger(cards.all)}
            note={`${renters.length} nesta página`}
          />
          <SummaryCard
            label="Com locação ativa"
            dot="var(--ok)"
            value={formatInteger(cards["with-rental"])}
            note={`${formatInteger(cards["without-rental"])} sem locação`}
          />
          <SummaryCard
            label="Inadimplentes"
            dot="var(--destructive)"
            value={formatInteger(cards.delinquent)}
            note={`R$ ${formatMoney(cards.overdueAmount)} em aberto`}
          />
          <SummaryCard
            label="Com restrição"
            dot="var(--off)"
            value={formatInteger(cards.restricted)}
            note="Impedidos de abrir nova locação"
          />
          <SummaryCard
            label="CNH vencida"
            dot="var(--destructive)"
            value={formatInteger(cards["cnh-overdue"])}
            note={
              <>
                <span
                  aria-hidden
                  className="size-2 shrink-0 rounded-full bg-soon-fg"
                />
                {`${cards["cnh-due-soon"]} vence${cards["cnh-due-soon"] === 1 ? "" : "m"} em 60 d`}
              </>
            }
          />
        </section>

        {/* A seleção envolve a barra e a tabela: é a barra que muda de forma
            quando uma linha é marcada, e o cabeçalho que marca as visíveis. */}
        <Selection visible={renters.map((renter) => renter.id)}>
          <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[10px] border border-border bg-card">
            <Toolbar
              batch={<BatchBar responsible={managerLabel(tenant?.name)} />}
            >
              <div className="flex h-full w-full flex-col justify-center gap-3 px-4">
                {/*
                  Filtro é URL, e a URL é o estado: dá para recarregar,
                  compartilhar e voltar no histórico. Quem a reescreve é cada
                  controle no momento em que é usado — a busca quando a
                  digitação para, os chips no clique. Não há botão "Filtrar"
                  porque não sobrou nada para ele dizer.
                */}
                <div className="flex items-center gap-2">
                  <LiveSearch
                    path="/renters"
                    name="q"
                    label="Buscar por nome ou CPF"
                    value={filters.q}
                    query={query}
                    className="w-[280px]"
                  />

                  {filtering && (
                    <Link
                      href="/renters"
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
                    label="Todos"
                    count={chips.all}
                    filters={filters}
                  />
                  {RENTER_SITUATIONS.map((value) => (
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
            </Toolbar>

            {renters.length === 0 ? (
              <p className="flex-1 p-6 text-sm text-muted-foreground">
                {filtering
                  ? "Nenhum locatário encontrado com esse filtro."
                  : "Nenhum locatário cadastrado."}
              </p>
            ) : (
              <Table
                containerClassName="min-h-0 flex-1 overflow-auto"
                className="min-w-[1232px] table-fixed border-separate border-spacing-0 text-[13px]"
              >
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="sticky top-0 z-10 h-10 w-12 border-b border-border bg-surface-2 pl-[18px]">
                      <SelectAll label="Selecionar os locatários desta página" />
                    </TableHead>
                    <SortHeader
                      column="name"
                      label="Nome"
                      sort={ordem}
                      direction={sentido}
                      // Uma agenda abre em A–Z, não em Z–A.
                      first="asc"
                      href={sortHref}
                    />
                    <TableHead className="sticky top-0 z-10 h-10 w-[148px] border-b border-border bg-surface-2 px-3 text-xs font-medium text-muted-foreground">
                      CPF
                    </TableHead>
                    <TableHead className="sticky top-0 z-10 h-10 w-[178px] border-b border-border bg-surface-2 px-3 text-xs font-medium text-muted-foreground">
                      WhatsApp
                    </TableHead>
                    <SortHeader
                      column="cnh"
                      label="CNH"
                      sort={ordem}
                      direction={sentido}
                      // A que venceu há mais tempo primeiro: é a urgente.
                      first="asc"
                      href={sortHref}
                      className="w-[190px]"
                    />
                    <TableHead className="sticky top-0 z-10 h-10 w-[118px] border-b border-border bg-surface-2 px-3 text-xs font-medium text-muted-foreground">
                      Locação atual
                    </TableHead>
                    {/* Financeiro não é ordenável nesta tela: a soma vem de
                        uma tabela embutida, e o PostgREST não ordena por
                        coluna de embutida. Quem quer a fila de cobrança
                        ordenada por dias a tem em Locações. */}
                    <TableHead className="sticky top-0 z-10 h-10 w-[132px] border-b border-border bg-surface-2 px-3 text-xs font-medium text-muted-foreground">
                      Financeiro
                    </TableHead>
                    <TableHead className="sticky top-0 z-10 h-10 w-[112px] border-b border-border bg-surface-2 px-3 text-xs font-medium text-muted-foreground">
                      Restrição
                    </TableHead>
                    <SortHeader
                      column="createdAt"
                      label="Desde"
                      sort={ordem}
                      direction={sentido}
                      href={sortHref}
                      align="right"
                      className="w-[110px]"
                    />
                  </TableRow>
                </TableHeader>

                <TableBody>
                  {renters.map((renter) => (
                    <RenterRow
                      key={renter.id}
                      renter={renter}
                      filters={filters}
                      open={renter.id === aberto}
                      entering={renter.id === entering}
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
                ? "Nenhum locatário"
                : `${first}–${first + renters.length - 1} de ${formatInteger(total)}`}
            </Pagination>
          </section>
        </Selection>
      </div>

      {aberta && (
        <RenterPanel
          renter={aberta}
          rental={locação}
          charges={emAberto}
          payments={pagos}
          history={histórico}
          violations={infrações}
          vehicles={motos}
          closeHref={href(filters, { open: undefined })}
        />
      )}
    </>
  );
}
