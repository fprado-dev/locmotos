"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatDay, formatFullDate, formatMoney, initials } from "@/app/ui";
import { buttonVariants } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import {
  rentalWeeks,
  type Charge,
  type Inspections,
  type Payment,
  type Rental,
} from "@/modules/rentals";
import { OverdueCharges, RegisteredPayments } from "../charges-block";
import { EndRentalDialog } from "./end-rental-dialog";
import { InspectionsBlock } from "./inspection";

/** Um título de seção do painel. */
function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-xs font-medium tracking-[0.05em] text-muted-foreground uppercase">
        {title}
      </h3>
      {children}
    </section>
  );
}

/** Um dado com rótulo em cima, do jeito que se lê e não do jeito que se edita. */
function Datum({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-[13px]">{children}</span>
    </div>
  );
}

/**
 * O detalhe de uma locação, num painel à direita.
 *
 * Quem abre e fecha é a URL (`?open=<id>`), e não um estado de cliente: o
 * painel volta igual num recarregamento, pode ser mandado para um colega e
 * fecha no botão voltar. O que a tela mostra já veio do servidor com a lista.
 *
 * As duas pontas da locação são links, e não texto: a pergunta que vem depois
 * de "quem está com esta moto" costuma ser sobre a moto ou sobre a pessoa, e
 * as duas telas já existem.
 */
export function RentalPanel({
  rental,
  charges,
  payments,
  inspections,
  closeHref,
}: {
  rental: Rental;
  /** As cobranças vencidas e em aberto, já lidas pela tela. */
  charges: Charge[];
  /** Os pagamentos já lançados, para desfazer o que entrou errado. */
  payments: Payment[];
  /** O estado da moto nas duas pontas, quando alguém anotou. */
  inspections: Inspections;
  closeHref: string;
}) {
  const router = useRouter();
  const encerrada = rental.endedOn !== null;

  return (
    <Sheet
      open
      onOpenChange={(aberto) => {
        if (!aberto) router.push(closeHref);
      }}
    >
      {/* Largura de duas colunas: a 520px o painel de uma locação encerrada
          passava de mil pixels de altura e virava rolagem. `min()` para ele não
          exceder a tela num notebook, e as colunas viram uma só quando não
          couberem — quem decide é a largura do painel, não a do monitor. */}
      <SheetContent className="w-[920px] gap-0 sm:max-w-[min(920px,92vw)]">
        {/* `pr-14` reserva o canto do X: sem isso o botão de fechar sentava em
            cima do badge de situação. */}
        <SheetHeader className="h-16 shrink-0 flex-row items-center gap-3 border-b border-border px-6 pr-14">
          <span className="flex min-w-0 flex-col gap-0.5">
            <SheetTitle className="flex min-w-0 items-baseline gap-2.5 text-base font-medium">
              <span className="shrink-0 font-mono tracking-[0.02em]">
                {rental.vehicle.plate}
              </span>
              <span className="truncate text-[13px] font-normal text-muted-foreground">
                {rental.vehicle.brand} {rental.vehicle.model}
              </span>
            </SheetTitle>
            <SheetDescription className="text-xs">
              {encerrada
                ? `Devolvida em ${formatDay(rental.endedOn!)}`
                : `Aberta em ${formatFullDate(rental.createdAt)}`}
            </SheetDescription>
          </span>

          <span
            className={cn(
              "ml-auto flex shrink-0 items-center gap-2 rounded-md border px-2.5 py-1 text-xs",
              encerrada
                ? "border-border text-muted-foreground"
                : "border-input text-foreground",
            )}
          >
            <span
              aria-hidden
              className="size-2 shrink-0 rounded-full"
              style={
                encerrada
                  ? { boxShadow: "inset 0 0 0 2px var(--off)" }
                  : { background: "var(--ok)" }
              }
            />
            {encerrada ? "Encerrada" : "Ativa"}
          </span>
        </SheetHeader>

        {/* Duas colunas: o que é o acordo à esquerda, o que aconteceu com a
            moto e com o dinheiro à direita. A rolagem fica como rede — uma
            locação com dez semanas em aberto estoura qualquer altura. */}
        <div className="@container flex min-h-0 flex-1 flex-col overflow-y-auto px-6 pt-5 pb-6">
          <div className="grid items-start gap-x-6 gap-y-[22px] @3xl:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
            <div className="flex flex-col gap-[22px]">
              <Section title="Locatário">
                <div className="flex items-center gap-2.5 rounded-lg border border-border px-4 py-3">
                  <span
                    aria-hidden
                    className="flex size-[30px] shrink-0 items-center justify-center rounded-full bg-chip text-[11px] font-semibold text-muted-foreground"
                  >
                    {initials(rental.renterName)}
                  </span>
                  <span className="truncate text-[13px] font-medium">
                    {rental.renterName}
                  </span>
                  {/* O cadastro da pessoa abre no painel dela, pela mesma URL que
                  a tela de Locatários usa. */}
                  <Link
                    href={`/renters?open=${rental.renterId}`}
                    className="ml-auto shrink-0 rounded-sm text-xs text-brand-text hover:underline"
                  >
                    Ver cadastro
                  </Link>
                </div>
              </Section>

              <Section title="O acordo">
                <div className="grid grid-cols-2 gap-x-3 gap-y-4">
                  <Datum label="Valor semanal">
                    <span className="tabular-nums">
                      R$ {formatMoney(rental.weeklyPrice)}
                    </span>
                  </Datum>
                  <Datum label="Início">{formatDay(rental.startedOn)}</Datum>
                  <Datum label="Fidelidade">
                    {rental.commitmentMonths ? (
                      `${rental.commitmentMonths} ${rental.commitmentMonths === 1 ? "mês" : "meses"}`
                    ) : (
                      <span className="text-subtle">—</span>
                    )}
                  </Datum>
                  <Datum label="Caução">
                    {rental.deposit === null ? (
                      <span className="text-subtle">—</span>
                    ) : (
                      <span className="tabular-nums">
                        R$ {formatMoney(rental.deposit)}
                      </span>
                    )}
                  </Datum>
                </div>
              </Section>

              {encerrada && (
                <Section title="O encerramento">
                  <div className="grid grid-cols-2 gap-x-3 gap-y-4">
                    <Datum label="Devolvida em">
                      {formatDay(rental.endedOn!)}
                    </Datum>
                    <Datum label="Duração">
                      {rentalWeeks(rental)}{" "}
                      {rentalWeeks(rental) === 1 ? "semana" : "semanas"}
                    </Datum>
                    {rental.endedEarly && (
                      <Datum label="Rescisão antecipada">
                        faltavam {rental.weeksRemaining}{" "}
                        {rental.weeksRemaining === 1 ? "semana" : "semanas"}
                      </Datum>
                    )}
                    {rental.earlyTerminationFee !== null && (
                      <Datum label="Cobrado na rescisão">
                        <span className="tabular-nums">
                          R$ {formatMoney(rental.earlyTerminationFee)}
                        </span>
                      </Datum>
                    )}
                    {rental.depositReturned !== null && (
                      <Datum label="Caução devolvida">
                        <span className="tabular-nums">
                          R$ {formatMoney(rental.depositReturned)}
                        </span>
                      </Datum>
                    )}
                    {rental.depositDiscount !== null &&
                      rental.depositDiscount > 0 && (
                        <Datum label="Desconto na caução">
                          <span className="tabular-nums">
                            R$ {formatMoney(rental.depositDiscount)}
                          </span>
                          {/* O motivo fica junto do número: um desconto sem
                          explicação é dinheiro sumindo da caução. */}
                          <span className="block text-xs text-subtle">
                            {rental.depositDiscountReason}
                          </span>
                        </Datum>
                      )}
                  </div>
                </Section>
              )}
            </div>

            <div className="flex flex-col gap-[22px]">
              <InspectionsBlock
                rentalId={rental.id}
                inspections={inspections}
              />

              <OverdueCharges charges={charges} />

              <RegisteredPayments payments={payments} />
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border px-6 py-4">
          {/* Encerrar é decisão uma a uma, com a moto no pátio — por isso vive
              aqui e não na barra de lote, que esta tela nem tem. */}
          {!encerrada && (
            <EndRentalDialog rental={rental} handover={inspections.handover} />
          )}
          <Link
            href={`/fleet/${rental.vehicleId}`}
            className={buttonVariants({ variant: "outline", size: "lg" })}
          >
            Ver moto
          </Link>
        </div>
      </SheetContent>
    </Sheet>
  );
}
