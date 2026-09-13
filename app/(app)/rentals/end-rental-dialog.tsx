"use client";

import { useActionState, useState } from "react";
import { toast } from "sonner";
import { formatDay, formatInteger } from "@/app/ui";
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
import { cn } from "@/lib/utils";
import { commitmentAt, delinquency, type Rental } from "@/modules/rentals";
import { closeRental } from "./actions";

/** Um campo do formulário, com rótulo em cima. */
function Field({
  name,
  label,
  hint,
  invalid,
  ...props
}: React.ComponentProps<typeof Input> & {
  name: string;
  label: string;
  hint?: string;
  invalid?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={name} className="text-xs">
        {label}
      </Label>
      <Input id={name} name={name} aria-invalid={invalid} {...props} />
      {hint && <span className="text-xs text-subtle">{hint}</span>}
    </div>
  );
}

/** Uma linha da conta da caução. */
function Line({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-baseline justify-between text-[13px]",
        strong && "font-medium",
      )}
    >
      <span className={strong ? undefined : "text-muted-foreground"}>
        {label}
      </span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}

/**
 * A devolução da moto, com a conta na frente antes de confirmar.
 *
 * Encerrar é decisão uma a uma, com a moto no pátio — por isso é confirmação
 * de painel e não ação de lote. O diálogo diz em palavras o que vai acontecer
 * com as três coisas que o gestor não vê daqui: a moto, a caução e o que
 * estiver em aberto.
 *
 * **A rescisão antecipada aparece, mas não é calculada.** Quanto paga quem sai
 * antes do fim da fidelidade é a lacuna nº 2 do `CONTEXT.md` — só o dono da
 * locadora responde. O diálogo diz quantas semanas faltavam e abre um campo
 * para o gestor digitar o que cobrou; inventar o número aqui seria pior que
 * deixá-lo em branco.
 */
export function EndRentalDialog({ rental }: { rental: Rental }) {
  const [aberto, setAberto] = useState(false);
  const hoje = isoDay(new Date());

  // A data manda na conta da fidelidade, então ela é estado: mudar "Encerrada
  // em" tem que mudar o aviso na mesma hora, e não só depois de confirmar.
  const [endedOn, setEndedOn] = useState(hoje);
  const [desconto, setDesconto] = useState("");

  const [state, formAction, pending] = useActionState(
    async (
      previous: Awaited<ReturnType<typeof closeRental>>,
      form: FormData,
    ) => {
      const next = await closeRental(previous, form);
      if (next.done) {
        toast.success(next.done);
        setAberto(false);
      }
      return next;
    },
    {},
  );

  const caução = rental.deposit ?? 0;
  const descontado = Math.min(Math.max(Number(desconto) || 0, 0), caução);
  const fidelidade = commitmentAt(rental, endedOn);
  const atraso = delinquency(rental);

  return (
    <>
      <Button variant="outline" size="lg" onClick={() => setAberto(true)}>
        Encerrar locação
      </Button>

      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="sm:max-w-[520px]">
          <form action={formAction}>
            <input type="hidden" name="id" value={rental.id} />

            <DialogHeader>
              <DialogTitle>
                Encerrar a locação da {rental.vehicle.plate}
              </DialogTitle>
              <DialogDescription>
                A moto volta para a frota como disponível e {rental.renterName}{" "}
                fica livre para uma locação nova.
              </DialogDescription>
            </DialogHeader>

            <div className="mt-5 flex flex-col gap-4">
              <Field
                name="endedOn"
                label="Encerrada em"
                type="date"
                // Hoje, que é quando a moto está no pátio. Editável porque o
                // gestor pode estar lançando a devolução de ontem.
                value={endedOn}
                max={hoje}
                min={rental.startedOn}
                onChange={(event) => setEndedOn(event.target.value)}
                invalid={state.field === "endedOn"}
              />

              {fidelidade?.early && (
                <div className="flex flex-col gap-3 rounded-lg border border-input bg-surface-2 p-4">
                  <span className="text-[13px] font-semibold">
                    Rescisão antecipada
                  </span>
                  <p className="text-[13px] text-muted-foreground">
                    A fidelidade ia até {formatDay(fidelidade.endsOn)} — faltam{" "}
                    {fidelidade.weeksRemaining}{" "}
                    {fidelidade.weeksRemaining === 1 ? "semana" : "semanas"}.
                    Fica registrado na locação. O sistema não calcula
                    penalidade: o valor é seu.
                  </p>
                  <Field
                    name="earlyTerminationFee"
                    label="Valor cobrado na rescisão (opcional)"
                    type="number"
                    step="0.01"
                    min={0}
                    placeholder="0,00"
                    invalid={state.field === "earlyTerminationFee"}
                  />
                </div>
              )}

              {atraso && (
                <p className="rounded-lg border border-input bg-late-bg px-4 py-3 text-[13px] text-late">
                  R$ {formatInteger(atraso.amount)} em cobranças vencidas
                  continuam devidos depois do encerramento. Encerrar não apaga o
                  que está em aberto.
                </p>
              )}

              {rental.deposit === null ? (
                <p className="text-[13px] text-muted-foreground">
                  Esta locação não tem caução registrada — não há o que
                  devolver.
                </p>
              ) : (
                <div className="flex flex-col gap-3 rounded-lg border border-border p-4">
                  <Line
                    label="Caução retida"
                    value={`R$ ${formatInteger(caução)}`}
                  />
                  <Field
                    name="depositDiscount"
                    label="Desconto por avaria"
                    type="number"
                    step="0.01"
                    min={0}
                    max={caução}
                    value={desconto}
                    placeholder="0,00"
                    onChange={(event) => setDesconto(event.target.value)}
                    invalid={state.field === "depositDiscount"}
                  />
                  {descontado > 0 && (
                    <Field
                      name="depositDiscountReason"
                      label="Motivo do desconto"
                      placeholder="Ex.: retrovisor quebrado"
                      invalid={state.field === "depositDiscountReason"}
                    />
                  )}
                  <Line
                    strong
                    label="A devolver"
                    value={`R$ ${formatInteger(caução - descontado)}`}
                  />
                </div>
              )}

              {state.error && (
                <p className="text-xs text-destructive">{state.error}</p>
              )}
            </div>

            <DialogFooter className="mt-6">
              <Button
                type="button"
                variant="outline"
                size="lg"
                onClick={() => setAberto(false)}
              >
                Cancelar
              </Button>
              <Button type="submit" size="lg" disabled={pending}>
                Encerrar locação
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
