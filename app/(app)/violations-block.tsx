"use client";

import { useActionState, useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { formatDay, formatMoment, formatMoney } from "@/app/ui";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
import { Textarea } from "@/components/ui/textarea";
import { whoHadIt, type TrafficViolation } from "@/modules/rentals";
import { removeViolation, saveViolation } from "./violation-actions";

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

/**
 * De quem é a infração, em uma linha.
 *
 * As três saídas são deliberadamente diferentes no tom. A pessoa vira link,
 * porque a pergunta seguinte é sobre ela. "Da locadora" é afirmação, e não
 * campo vazio: o sistema **sabe** que não havia locação naquele dia, e deixar
 * em branco faria parecer que ele não olhou. E o empate é aviso, porque é o
 * único caso em que ninguém sabe a resposta.
 */
function Blame({ violation }: { violation: TrafficViolation }) {
  const blame = whoHadIt(violation);

  if (blame.kind === "renter") {
    return (
      <Link
        href={`/renters?open=${blame.renterId}`}
        className="rounded-sm font-medium text-brand-text hover:underline"
      >
        {blame.name}
      </Link>
    );
  }

  if (blame.kind === "owner") {
    return (
      <span className="text-muted-foreground">
        Moto no pátio — a infração é da locadora
      </span>
    );
  }

  return (
    <span className="text-late" title="Duas locações contêm esse dia">
      {blame.matches} locações nesse dia — confira qual
    </span>
  );
}

/** Uma infração na lista: o que foi, quando, de quem, e quanto. */
function Row({
  violation,
  onDelete,
}: {
  violation: TrafficViolation;
  /** Só a ficha da moto apaga — o painel do locatário só lê. */
  onDelete?: (violation: TrafficViolation) => void;
}) {
  return (
    <div className="flex flex-col gap-1 border-b border-border px-4 py-3 text-[13px] last:border-b-0">
      <div className="flex items-baseline gap-3">
        <span className="min-w-0 flex-1 truncate font-medium">
          {violation.description}
        </span>
        {violation.amount !== null && (
          <span className="shrink-0 tabular-nums">
            R$ {formatMoney(violation.amount)}
          </span>
        )}
        {onDelete && (
          <Button
            variant="ghost"
            size="sm"
            className="-my-1 shrink-0 text-xs text-muted-foreground"
            onClick={() => onDelete(violation)}
          >
            Apagar
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span className="tabular-nums">
          {formatMoment(violation.occurredAt)}
        </span>
        <Blame violation={violation} />
        {violation.noticeNumber && (
          <span className="font-mono text-subtle">
            auto {violation.noticeNumber}
          </span>
        )}
        {violation.dueOn && (
          <span>indicar o condutor até {formatDay(violation.dueOn)}</span>
        )}
      </div>
    </div>
  );
}

/** Um título de bloco, igual ao das outras seções. */
function Heading({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-xs font-medium tracking-[0.05em] text-muted-foreground uppercase">
      {children}
    </h3>
  );
}

/**
 * O registro de uma infração, num diálogo.
 *
 * Os campos estão na ordem em que aparecem na notificação, que é a ordem em
 * que o gestor lê o papel na mão: número do auto, quando, o que foi, valor,
 * prazo. Só "quando" e "o que foi" são obrigatórios — a autuação chega antes
 * do valor definitivo, e o prazo de indicação só vem na de penalidade.
 */
function ViolationDialog({
  vehicleId,
  plate,
  open,
  onClose,
}: {
  vehicleId: string;
  plate: string;
  open: boolean;
  onClose: () => void;
}) {
  const [state, formAction, pending] = useActionState(
    async (previous: Parameters<typeof saveViolation>[0], form: FormData) => {
      const next = await saveViolation(previous, form);
      if (next.done) {
        toast.success(next.done);
        onClose();
      }
      return next;
    },
    {},
  );

  return (
    <Dialog open={open} onOpenChange={(aberto) => !aberto && onClose()}>
      <DialogContent className="flex max-h-[calc(100svh-3rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-[560px]">
        <form action={formAction} className="flex min-h-0 flex-1 flex-col">
          <input type="hidden" name="vehicleId" value={vehicleId} />

          <DialogHeader className="shrink-0 gap-1.5 border-b border-border px-6 py-5 pr-12">
            <DialogTitle>Registrar infração da {plate}</DialogTitle>
            <DialogDescription>
              Quem estava com a moto o sistema descobre sozinho, pela data e
              hora — não há campo para isso.
            </DialogDescription>
          </DialogHeader>

          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-6 py-5">
            <Field
              name="noticeNumber"
              label="Número do auto (opcional)"
              placeholder="Ex.: AA1234567"
              invalid={state.field === "noticeNumber"}
              className="max-w-[260px]"
            />

            <Field
              name="occurredAt"
              label="Quando aconteceu"
              type="datetime-local"
              required
              hint="Hora de Brasília, como está na notificação. É ela que decide de quem é a multa."
              invalid={state.field === "occurredAt"}
              className="max-w-[260px]"
            />

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="description" className="text-xs">
                O que foi
              </Label>
              <Textarea
                id="description"
                name="description"
                required
                rows={2}
                placeholder="Ex.: Excesso de velocidade — até 20% acima do limite"
                aria-invalid={state.field === "description"}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                name="amount"
                label="Valor (opcional)"
                type="number"
                step="0.01"
                min={0}
                placeholder="0,00"
                invalid={state.field === "amount"}
              />
              <Field
                name="dueOn"
                label="Prazo de indicação (opcional)"
                type="date"
                invalid={state.field === "dueOn"}
              />
            </div>
          </div>

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
                onClick={onClose}
              >
                Cancelar
              </Button>
              <Button type="submit" size="lg" disabled={pending}>
                Registrar
              </Button>
            </span>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * As infrações de uma moto, na ficha dela.
 *
 * A notificação chega com a placa, então este é o caminho: o gestor abre a
 * moto e registra. A atribuição aparece já na linha — é a resposta que ele
 * veio buscar, e antes dela alguém abria uma pasta e torcia para a data bater.
 */
export function VehicleViolations({
  vehicleId,
  plate,
  violations,
}: {
  vehicleId: string;
  plate: string;
  violations: TrafficViolation[];
}) {
  const [registrando, setRegistrando] = useState(false);
  const [apagando, setApagando] = useState<TrafficViolation | null>(null);
  const [pendente, iniciar] = useTransition();

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-semibold">Infrações</h2>
        <Button variant="outline" onClick={() => setRegistrando(true)}>
          Registrar infração
        </Button>
      </div>

      {violations.length === 0 ? (
        <p className="rounded-lg border border-dashed border-input px-4 py-6 text-center text-[13px] text-muted-foreground">
          Nenhuma infração registrada nesta moto.
        </p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          {violations.map((violation) => (
            <Row
              key={violation.id}
              violation={violation}
              onDelete={setApagando}
            />
          ))}
        </div>
      )}

      <ViolationDialog
        vehicleId={vehicleId}
        plate={plate}
        open={registrando}
        onClose={() => setRegistrando(false)}
      />

      {/* Apagar existe porque a linha nasce de um papel digitado à mão, e a
          placa errada é o engano que esta tela convida a cometer. A pergunta
          antes é o que separa o conserto do engano de um segundo engano. */}
      <AlertDialog
        open={apagando !== null}
        onOpenChange={(aberto) => !aberto && setApagando(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Apagar esta infração?</AlertDialogTitle>
            <AlertDialogDescription>
              {apagando?.description} —{" "}
              {apagando && formatMoment(apagando.occurredAt)}. Some da ficha da
              moto e do painel de quem estava com ela.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              render={
                <Button
                  variant="destructive"
                  disabled={pendente}
                  onClick={() => {
                    const alvo = apagando;
                    if (!alvo) return;

                    iniciar(async () => {
                      const { error } = await removeViolation(
                        alvo.id,
                        vehicleId,
                      );

                      if (error) toast.error(error);
                      else toast.success("Infração apagada.");
                      setApagando(null);
                    });
                  }}
                />
              }
            >
              Apagar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

/**
 * As infrações atribuídas a um locatário, no painel dele.
 *
 * Só lê: registrar é na moto, que é por onde a notificação chega. Aqui é onde
 * o gestor olha antes de ligar para cobrar — e por isso a moto vira link, que
 * é de onde a conversa continua.
 *
 * O bloco some quando não há nenhuma: "nenhuma infração" é a vida normal de um
 * locatário, e uma caixa vazia por locatário seria ruído em toda tela.
 */
export function RenterViolations({
  violations,
}: {
  violations: TrafficViolation[];
}) {
  if (violations.length === 0) return null;

  return (
    <section className="flex flex-col gap-3">
      <Heading>Infrações de trânsito</Heading>
      <div className="overflow-hidden rounded-lg border border-border">
        {violations.map((violation) => (
          <div
            key={violation.id}
            className="flex flex-col gap-1 border-b border-border px-4 py-3 text-[13px] last:border-b-0"
          >
            <div className="flex items-baseline gap-3">
              <span className="min-w-0 flex-1 truncate font-medium">
                {violation.description}
              </span>
              {violation.amount !== null && (
                <span className="shrink-0 tabular-nums">
                  R$ {formatMoney(violation.amount)}
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-baseline gap-x-3 text-xs text-muted-foreground">
              <span className="tabular-nums">
                {formatMoment(violation.occurredAt)}
              </span>
              <Link
                href={`/fleet/${violation.vehicleId}`}
                className="rounded-sm font-mono hover:underline"
              >
                {violation.vehicle.plate}
              </Link>
              {violation.dueOn && (
                <span>indicar o condutor até {formatDay(violation.dueOn)}</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
