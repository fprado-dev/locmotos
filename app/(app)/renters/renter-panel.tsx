"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { formatDay, formatFullDate, formatMoney, initials } from "@/app/ui";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { AvailableVehicle } from "@/modules/fleet";
import {
  rentalWeeks,
  type Charge,
  type Payment,
  type Rental,
  type TrafficViolation,
} from "@/modules/rentals";
import { OverdueCharges, RegisteredPayments } from "../charges-block";
import { RenterViolations } from "../violations-block";
import { FinanceCell } from "../finance";
import { formatCpf, formatWhatsapp, type Renter } from "@/modules/renters";
import { liftRenterRestriction } from "./actions";
import { CnhBadge } from "./cnh-badge";
import { NewRentalSheet } from "./new-rental-sheet";
import { RenterForm } from "./renter-form";

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
 * O detalhe de um locatário, num painel à direita.
 *
 * Quem abre e fecha é a URL (`?open=<id>`), e não um estado de cliente: o
 * painel volta igual num recarregamento, pode ser mandado para um colega e
 * fecha no botão voltar. O que a tela busca já veio do servidor com a lista.
 *
 * A locação atual e a lista de motos disponíveis vêm prontas do servidor, com
 * a pessoa: abrir o painel não pode custar uma segunda volta, e o formulário
 * de nova locação precisa das duas coisas no instante em que abre.
 */
export function RenterPanel({
  renter,
  rental,
  charges,
  payments,
  history,
  violations,
  vehicles,
  closeHref,
}: {
  renter: Renter;
  /** A locação ativa, quando há uma. */
  rental: Rental | null;
  /** As cobranças vencidas e em aberto dessa locação. */
  charges: Charge[];
  /** Os pagamentos já lançados, para desfazer o que entrou errado. */
  payments: Payment[];
  /** As locações que já terminaram, da mais recente para a mais antiga. */
  history: Rental[];
  /** As infrações que caíram no período de alguma locação desta pessoa. */
  violations: TrafficViolation[];
  /** As motos livres para uma locação nova. */
  vehicles: AvailableVehicle[];
  closeHref: string;
}) {
  const router = useRouter();
  const [editando, setEditando] = useState(false);
  const [pendente, iniciar] = useTransition();

  const { restriction } = renter;

  return (
    <Sheet
      open
      onOpenChange={(aberto) => {
        if (!aberto) router.push(closeHref);
      }}
    >
      <SheetContent className="w-[520px] gap-0 sm:max-w-[520px]">
        {/* `pr-14` reserva o canto do X: um nome comprido corria por baixo do
            botão de fechar. */}
        <SheetHeader className="h-16 shrink-0 flex-row items-center gap-3 border-b border-border px-6 pr-14">
          <span
            aria-hidden
            className="flex size-9 shrink-0 items-center justify-center rounded-full bg-chip text-xs font-semibold text-muted-foreground"
          >
            {initials(renter.name)}
          </span>
          <span className="flex min-w-0 flex-col">
            <SheetTitle className="truncate text-base">
              {renter.name}
            </SheetTitle>
            <SheetDescription className="text-xs">
              Locatário desde {formatFullDate(renter.createdAt)}
            </SheetDescription>
          </span>
        </SheetHeader>

        {editando ? (
          <RenterForm renter={renter} onCancel={() => setEditando(false)} />
        ) : (
          <>
            <div className="flex min-h-0 flex-1 flex-col gap-[22px] overflow-y-auto px-6 pt-5 pb-6">
              {restriction && (
                <div className="flex flex-col gap-2 rounded-lg border border-input bg-surface-2 p-4">
                  <span className="flex items-center gap-2 text-[13px] font-semibold">
                    <span
                      aria-hidden
                      className="size-2.5 shrink-0 rounded-full bg-off"
                    />
                    Com restrição — não pode abrir nova locação
                  </span>
                  <p className="text-[13px] text-muted-foreground">
                    {restriction.reason}
                  </p>
                  <span className="text-xs text-subtle">
                    {restriction.by} · {formatFullDate(restriction.at)}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={pendente}
                    className="mt-1 self-start"
                    onClick={() => {
                      iniciar(async () => {
                        const { error } = await liftRenterRestriction(
                          renter.id,
                        );

                        if (error) toast.error(error);
                        else
                          toast.success(
                            `${renter.name} voltou a poder abrir locação.`,
                          );
                      });
                    }}
                  >
                    Remover restrição
                  </Button>
                </div>
              )}

              <Section title="Dados pessoais e CNH">
                <div className="grid grid-cols-2 gap-x-3 gap-y-4">
                  {/* Inteiro aqui, e mascarado na lista: o painel é o clique
                      que o gestor dá quando precisa do número para preencher
                      um contrato. */}
                  <Datum label="CPF">
                    <span className="font-mono">{formatCpf(renter.cpf)}</span>
                  </Datum>
                  <Datum label="WhatsApp">
                    {formatWhatsapp(renter.whatsapp) ?? (
                      <span className="text-subtle">—</span>
                    )}
                  </Datum>
                  <Datum label="Categoria CNH">
                    {renter.cnhCategory ? (
                      <span className="font-mono">{renter.cnhCategory}</span>
                    ) : (
                      <span className="text-subtle">—</span>
                    )}
                  </Datum>
                  <Datum label="Validade da CNH">
                    {renter.cnhDueDate ? (
                      <span className="flex items-center gap-2">
                        {formatDay(renter.cnhDueDate)}
                        <CnhBadge dueDate={renter.cnhDueDate} />
                      </span>
                    ) : (
                      <span className="text-subtle">—</span>
                    )}
                  </Datum>
                </div>
              </Section>

              {renter.notes && (
                <Section title="Observações">
                  <p className="text-[13px] whitespace-pre-line">
                    {renter.notes}
                  </p>
                </Section>
              )}

              <Section title="Locação atual">
                {rental ? (
                  <div className="overflow-hidden rounded-lg border border-border">
                    <div className="flex items-center gap-2.5 border-b border-border bg-surface-2 px-4 py-2.5">
                      <Link
                        href={`/rentals?open=${rental.id}`}
                        className="rounded-sm font-mono text-[13px] font-medium tracking-[0.02em] hover:underline"
                      >
                        {rental.vehicle.plate}
                      </Link>
                      <span className="truncate text-[13px] text-muted-foreground">
                        {rental.vehicle.brand} {rental.vehicle.model}
                      </span>
                      {/* O sinal financeiro no cabeçalho do cartão: quem abre
                          o painel de alguém quer saber se pode alugar de novo,
                          e é isto que responde antes de qualquer outra coisa. */}
                      <span className="ml-auto shrink-0 text-[13px]">
                        <FinanceCell rental={rental} />
                      </span>
                      {/* A moto está a um clique: é dela que vêm quilometragem,
                          licenciamento e documentos. */}
                      <Link
                        href={`/fleet/${rental.vehicleId}`}
                        className="shrink-0 rounded-sm text-xs text-brand-text hover:underline"
                      >
                        Ver moto
                      </Link>
                    </div>

                    <div className="grid grid-cols-3 gap-3 px-4 py-3">
                      <Datum label="Semana">
                        <span className="tabular-nums">
                          R$ {formatMoney(rental.weeklyPrice)}
                        </span>
                      </Datum>
                      <Datum label="Início">
                        {formatDay(rental.startedOn)}
                      </Datum>
                      <Datum label="Fidelidade">
                        {rental.commitmentMonths ? (
                          `${rental.commitmentMonths} ${rental.commitmentMonths === 1 ? "mês" : "meses"}`
                        ) : (
                          <span className="text-subtle">—</span>
                        )}
                      </Datum>
                    </div>

                    {rental.deposit !== null && (
                      <div className="border-t border-border px-4 py-3">
                        <Datum label="Caução">
                          <span className="tabular-nums">
                            R$ {formatMoney(rental.deposit)}
                          </span>
                        </Datum>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="rounded-lg border border-dashed border-input px-4 py-6 text-center text-[13px] text-muted-foreground">
                    Sem locação no momento.
                  </p>
                )}
              </Section>

              <OverdueCharges charges={charges} />

              <RegisteredPayments payments={payments} />

              {/* Antes do histórico de locações: o que a pessoa deve hoje vem
                  primeiro, e a infração é dívida em aberto do mesmo jeito que
                  a semana atrasada. */}
              <RenterViolations violations={violations} />

              {history.length > 0 && (
                <Section title="Histórico de locações">
                  {/*
                    Com que motos a pessoa já andou e por quanto tempo. É o que
                    responde "vale a pena alugar de novo para ela" sem ninguém
                    ter que procurar em outra tela — e a locação em pé fica de
                    fora, porque já tem o cartão dela logo acima.
                  */}
                  <div className="overflow-hidden rounded-lg border border-border">
                    {history.map((anterior) => (
                      <div
                        key={anterior.id}
                        className="flex items-center gap-3 border-b border-border px-4 py-2.5 text-[13px] last:border-b-0"
                      >
                        <Link
                          href={`/rentals?open=${anterior.id}`}
                          className="shrink-0 rounded-sm font-mono text-[12.5px] hover:underline"
                        >
                          {anterior.vehicle.plate}
                        </Link>
                        <span className="truncate text-xs text-muted-foreground">
                          {formatDay(anterior.startedOn)} –{" "}
                          {formatDay(anterior.endedOn!)}
                        </span>
                        {anterior.endedEarly && (
                          <span className="shrink-0 text-xs text-subtle">
                            antecipada
                          </span>
                        )}
                        <span className="ml-auto shrink-0 tabular-nums">
                          {rentalWeeks(anterior)} sem
                        </span>
                      </div>
                    ))}
                  </div>
                </Section>
              )}
            </div>

            <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border px-6 py-4">
              <Button
                variant="outline"
                size="lg"
                onClick={() => setEditando(true)}
              >
                Editar cadastro
              </Button>
              {/*
                Quem tem restrição, ou já está com uma moto, vê o botão
                desabilitado com o motivo — e não o botão escondido: o caminho
                existe, e saber por que ele está fechado é parte da resposta.
              */}
              {restriction || rental ? (
                <Button
                  size="lg"
                  disabled
                  title={
                    restriction
                      ? "Locatário com restrição não abre nova locação."
                      : "Já está com uma moto. Encerre a locação atual primeiro."
                  }
                >
                  Nova locação
                </Button>
              ) : (
                <NewRentalSheet renter={renter} vehicles={vehicles} />
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
