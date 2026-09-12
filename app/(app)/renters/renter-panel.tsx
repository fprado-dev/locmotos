"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { formatDay, formatFullDate, initials } from "@/app/ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import {
  cnhAlert,
  daysUntilCnh,
  formatCpf,
  formatWhatsapp,
  type Renter,
} from "@/modules/renters";
import { liftRenterRestriction } from "./actions";
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
 * O que o painel precisa dizer sobre a CNH.
 *
 * Vencida em vermelho, vencendo em âmbar — e a cor não carrega a informação
 * sozinha: o texto diz qual é qual, e quantos dias.
 */
export function CnhBadge({ dueDate }: { dueDate: string | null }) {
  const alert = cnhAlert(dueDate);
  if (!alert || !dueDate) return null;

  const days = daysUntilCnh(dueDate);

  return (
    <Badge
      className={cn(
        "h-auto rounded-md px-[9px] py-1 text-xs",
        alert === "overdue"
          ? "bg-late font-semibold text-white"
          : "bg-soon-bg font-medium text-soon-fg",
      )}
    >
      {alert === "overdue" ? `Vencida há ${-days} d` : `Vence em ${days} d`}
    </Badge>
  );
}

/**
 * O detalhe de um locatário, num painel à direita.
 *
 * Quem abre e fecha é a URL (`?open=<id>`), e não um estado de cliente: o
 * painel volta igual num recarregamento, pode ser mandado para um colega e
 * fecha no botão voltar. O que a tela busca já veio do servidor com a lista.
 *
 * O bloco de Locação atual está desenhado e vazio de propósito. Ele não é
 * improviso: o módulo de Locações ainda não existe, e o lugar dele fica
 * marcado para quem chegar depois encaixar em vez de redesenhar.
 */
export function RenterPanel({
  renter,
  closeHref,
}: {
  renter: Renter;
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
        <SheetHeader className="h-16 shrink-0 flex-row items-center gap-3 border-b border-border px-6">
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
                <p className="rounded-lg border border-dashed border-input px-4 py-6 text-center text-[13px] text-muted-foreground">
                  Sem locação no momento.
                </p>
              </Section>
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
                O botão existe desabilitado, e não escondido, porque o desenho
                promete este caminho: o gestor precisa saber que ele vem, e que
                a restrição é o que o fecha quando ela existir.
              */}
              <Button
                size="lg"
                disabled
                title={
                  restriction
                    ? "Locatário com restrição não abre nova locação."
                    : "Disponível quando o módulo de Locações existir."
                }
              >
                Nova locação
              </Button>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
