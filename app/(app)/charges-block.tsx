"use client";

import { useActionState, useState, useTransition } from "react";
import { toast } from "sonner";
import { formatDay, formatMoney } from "@/app/ui";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { isoDay } from "@/lib/calendar";
import { delinquency, type Charge, type Payment } from "@/modules/rentals";
import { registerPayment, undoPayment } from "./finance-actions";

/** "2026-09-19" vira "19/09" — a linha é estreita e o ano é o corrente. */
function shortDay(date: string): string {
  const [, mês, dia] = date.split("-");
  return `${dia}/${mês}`;
}

/** O período de um ciclo, como a tela o nomeia: "13/09 – 19/09". */
function cycle(start: string, end: string): string {
  return `${shortDay(start)} – ${shortDay(end)}`;
}

/** Um título de bloco do painel, igual ao das outras seções. */
function Heading({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-xs font-medium tracking-[0.05em] text-muted-foreground uppercase">
      {children}
    </h3>
  );
}

/**
 * O lançamento de um pagamento, num diálogo.
 *
 * É um diálogo para o bloco inteiro e não um por linha: o que muda de uma
 * cobrança para a outra é qual ciclo está sendo quitado, e isso cabe no texto.
 *
 * A data vem preenchida com hoje e continua editável — o gestor lança na
 * segunda o que recebeu no sábado, e é esse o caso comum de uma locadora que
 * recebe em dinheiro.
 */
function PaymentDialog({
  charge,
  onClose,
}: {
  charge: Charge | null;
  onClose: () => void;
}) {
  const [state, formAction, pending] = useActionState(
    async (previous: Parameters<typeof registerPayment>[0], form: FormData) => {
      const next = await registerPayment(previous, form);
      if (next.done) {
        toast.success(next.done);
        onClose();
      }
      return next;
    },
    {},
  );

  return (
    <Dialog open={charge !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[460px]">
        {charge && (
          <form action={formAction}>
            <input type="hidden" name="chargeId" value={charge.id} />

            <DialogHeader>
              <DialogTitle>Registrar pagamento</DialogTitle>
              <DialogDescription>
                Semana de {cycle(charge.cycleStart, charge.cycleEnd)}, vencida
                em {formatDay(charge.dueOn)} — R$ {formatMoney(charge.amount)}.
                Uma cobrança é paga por inteiro.
              </DialogDescription>
            </DialogHeader>

            <div className="mt-5 flex flex-col gap-2">
              <Label htmlFor="receivedOn" className="text-xs">
                Recebido em
              </Label>
              <Input
                id="receivedOn"
                name="receivedOn"
                type="date"
                // Hoje, porque é o caso comum; editável, porque não é o único.
                defaultValue={isoDay(new Date())}
                max={isoDay(new Date())}
                aria-invalid={state.field === "receivedOn" || undefined}
              />
              {state.error && (
                <p className="text-xs text-destructive">{state.error}</p>
              )}
            </div>

            <DialogFooter className="mt-6">
              <Button
                type="button"
                variant="outline"
                size="lg"
                onClick={onClose}
              >
                Cancelar
              </Button>
              <Button type="submit" size="lg" disabled={pending}>
                Registrar pagamento
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

/**
 * As cobranças vencidas de uma locação, uma por linha, com o que fazer com
 * cada uma.
 *
 * Uma linha por ciclo em vez de um número só porque cobrar é conversa: o
 * gestor liga e diz "estão em aberto as semanas de 1º e de 8", não "você me
 * deve seiscentos". O total no rodapé é para quando a conversa chega ao fim.
 *
 * Não renderiza nada quando não há o que cobrar — um bloco vazio dizendo
 * "nenhuma" ocupa a mesma altura e não responde nada.
 */
export function OverdueCharges({
  charges,
  today = new Date(),
}: {
  charges: Charge[];
  today?: Date;
}) {
  // Guarda o id e não a cobrança: quitada, ela some da lista na revalidação, e
  // procurá-la a cada render fecha o diálogo sozinho quando isso acontece.
  const [pagandoId, setPagandoId] = useState<string | null>(null);
  const pagando = charges.find((charge) => charge.id === pagandoId) ?? null;

  if (charges.length === 0) return null;

  const total = charges.reduce((soma, charge) => soma + charge.amount, 0);

  return (
    <section className="flex flex-col gap-3">
      <Heading>Cobranças em aberto</Heading>

      <div className="overflow-hidden rounded-lg border border-border">
        {charges.map((charge) => {
          const atraso = delinquency(
            { overdueAmount: charge.amount, overdueSince: charge.dueOn },
            today,
          );

          return (
            <div
              key={charge.id}
              className="flex items-center gap-3 border-b border-border px-4 py-2.5 text-[13px] last:border-b-0"
            >
              <span className="shrink-0 tabular-nums">
                {cycle(charge.cycleStart, charge.cycleEnd)}
              </span>
              <span className="shrink-0 text-xs tabular-nums text-late">
                {atraso?.days} d
              </span>
              <span className="ml-auto shrink-0 tabular-nums">
                R$ {formatMoney(charge.amount)}
              </span>
              <Button
                variant="outline"
                size="sm"
                className="shrink-0"
                onClick={() => setPagandoId(charge.id)}
              >
                Registrar
              </Button>
            </div>
          );
        })}

        <div className="flex items-center gap-3 bg-surface-2 px-4 py-2.5 text-[13px]">
          <span className="text-muted-foreground">Total em aberto</span>
          <span className="ml-auto font-medium tabular-nums">
            R$ {formatMoney(total)}
          </span>
        </div>
      </div>

      <PaymentDialog charge={pagando} onClose={() => setPagandoId(null)} />
    </section>
  );
}

/**
 * Os pagamentos já lançados desta locação, e como desfazer um.
 *
 * Existe porque a cobrança paga sai de "Cobranças em aberto": sem esta lista,
 * um lançamento errado não teria mais de onde ser corrigido. Desfazer não
 * apaga a linha — registra o desfazimento, e a cobrança volta para o vermelho.
 */
export function RegisteredPayments({ payments }: { payments: Payment[] }) {
  const [pendente, iniciar] = useTransition();

  if (payments.length === 0) return null;

  return (
    <section className="flex flex-col gap-3">
      <Heading>Pagamentos registrados</Heading>

      <div className="overflow-hidden rounded-lg border border-border">
        {payments.map((payment) => (
          <div
            key={payment.id}
            className="flex items-center gap-3 border-b border-border px-4 py-2.5 text-[13px] last:border-b-0"
          >
            <span className="flex min-w-0 flex-col">
              <span className="tabular-nums">
                {cycle(payment.cycle.start, payment.cycle.end)}
              </span>
              {/* Quem registrou e quando fica à vista, como na restrição: é o
                  que a locadora tem para mostrar quando alguém perguntar. */}
              <span className="truncate text-xs text-subtle">
                recebido {formatDay(payment.receivedOn)} · {payment.by}
              </span>
            </span>

            <span className="ml-auto shrink-0 tabular-nums">
              R$ {formatMoney(payment.cycle.amount)}
            </span>

            <Button
              variant="ghost"
              size="sm"
              disabled={pendente}
              className="shrink-0"
              onClick={() => {
                iniciar(async () => {
                  const { error, done } = await undoPayment(payment.id);
                  if (error) toast.error(error);
                  else if (done) toast.success(done);
                });
              }}
            >
              Desfazer
            </Button>
          </div>
        ))}
      </div>
    </section>
  );
}
