"use client";

import { useActionState, useState } from "react";
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
import { cn } from "@/lib/utils";
import {
  commitmentAt,
  delinquency,
  type Inspection,
  type Rental,
} from "@/modules/rentals";
import { closeRental } from "./actions";
import { FUEL_LABELS, InspectionFields } from "./inspection";

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
export function EndRentalDialog({
  rental,
  handover,
}: {
  rental: Rental;
  /** A vistoria de entrega, quando existe: é contra ela que se compara. */
  handover: Inspection | null;
}) {
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
        {/* Teto de altura com o miolo rolando: este diálogo cresce com a
            locação — rescisão, atraso, vistoria e caução podem aparecer todos
            juntos —, e sem teto ele passava da tela levando junto o título e
            os botões, que é onde se cancela. `svh` e não `vh` porque no
            celular a barra do navegador some e volta. */}
        <DialogContent className="flex max-h-[calc(100svh-3rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-[640px]">
          <form action={formAction} className="flex min-h-0 flex-1 flex-col">
            <input type="hidden" name="id" value={rental.id} />

            <DialogHeader className="shrink-0 gap-1.5 border-b border-border px-6 py-5 pr-12">
              <DialogTitle>
                Encerrar a locação da {rental.vehicle.plate}
              </DialogTitle>
              <DialogDescription>
                A moto volta para a frota como disponível e {rental.renterName}{" "}
                fica livre para uma locação nova.
              </DialogDescription>
            </DialogHeader>

            <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-6 py-5">
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
                className="max-w-[220px]"
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
                    className="max-w-[220px]"
                  />
                </div>
              )}

              {atraso && (
                <p className="rounded-lg border border-input bg-late-bg px-4 py-3 text-[13px] text-late">
                  R$ {formatMoney(atraso.amount)} em cobranças vencidas
                  continuam devidos depois do encerramento. Encerrar não apaga o
                  que está em aberto.
                </p>
              )}

              <div className="flex flex-col gap-3 rounded-lg border border-border p-4">
                <span className="text-[13px] font-semibold">
                  Vistoria de devolução{" "}
                  <span className="font-normal text-muted-foreground">
                    (opcional)
                  </span>
                </span>

                {/* A da entrega fica à vista: a de devolução só quer dizer
                    alguma coisa comparada com ela, e o gestor está com a moto
                    na frente, não com o painel aberto em outra aba. */}
                {handover && (
                  <p className="text-[13px] text-muted-foreground">
                    A moto saiu com{" "}
                    {handover.odometer === null
                      ? "quilometragem não anotada"
                      : `${handover.odometer.toLocaleString("pt-BR")} km`}
                    {handover.fuel !== null &&
                      `, tanque ${FUEL_LABELS[handover.fuel].toLowerCase()}`}
                    .
                    {handover.damages &&
                      ` Avarias na entrega: ${handover.damages}`}
                  </p>
                )}

                <InspectionFields invalid={state.field} />
              </div>

              {rental.deposit === null ? (
                <p className="text-[13px] text-muted-foreground">
                  Esta locação não tem caução registrada — não há o que
                  devolver.
                </p>
              ) : (
                <div className="flex flex-col gap-3 rounded-lg border border-border p-4">
                  <Line
                    label="Caução retida"
                    value={`R$ ${formatMoney(caução)}`}
                  />
                  <div className="@container">
                    <div className="grid gap-4 @sm:grid-cols-[180px_minmax(0,1fr)]">
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
                      {/* O motivo entra ao lado do número, e não embaixo: é a
                          mesma frase partida em dois campos. */}
                      {descontado > 0 && (
                        <Field
                          name="depositDiscountReason"
                          label="Motivo do desconto"
                          placeholder="Ex.: retrovisor quebrado"
                          invalid={state.field === "depositDiscountReason"}
                        />
                      )}
                    </div>
                  </div>
                  <Line
                    strong
                    label="A devolver"
                    value={`R$ ${formatMoney(caução - descontado)}`}
                  />
                </div>
              )}
            </div>

            {/* A recusa fica no rodapé, junto do botão que a provocou: no fim
                do miolo ela nasceria fora da área visível, e o gestor veria um
                formulário que não envia sem nenhum recado na tela. */}
            <DialogFooter className="mx-0 mb-0 shrink-0 flex-col items-center gap-3 px-6 py-4 sm:flex-row sm:justify-between">
              <p
                role="alert"
                className="text-xs text-destructive empty:hidden sm:mr-4"
              >
                {state.error}
              </p>
              <span className="flex flex-col-reverse gap-2 sm:flex-row">
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
              </span>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
