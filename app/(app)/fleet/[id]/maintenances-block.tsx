"use client";

import { useActionState, useState, useTransition } from "react";
import { toast } from "sonner";
import { formatDay, formatInteger, formatMoney } from "@/app/ui";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  daysInWorkshop,
  workshopDays,
  type Maintenance,
} from "@/modules/maintenance";
import {
  finishMaintenance,
  removeMaintenance,
  startMaintenance,
  type MaintenanceState,
} from "./maintenance-actions";

/** Como cada tipo se chama na tela. */
const KIND_LABELS = {
  preventive: "Preventiva",
  corrective: "Corretiva",
} as const;

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
 * Os campos que as duas pontas dividem.
 *
 * Abrir e fechar uma manutenção pedem quase a mesma coisa — o que muda é a
 * data de saída e o fato de o custo já ser conhecido. Um formulário só, com
 * valores iniciais, em vez de dois que divergem na primeira correção.
 */
function MaintenanceFields({
  maintenance,
  state,
}: {
  maintenance?: Maintenance;
  state: MaintenanceState;
}) {
  return (
    <>
      <Field
        name="description"
        label="O que foi"
        required
        defaultValue={maintenance?.description}
        placeholder="Ex.: Revisão dos 10.000 — óleo, filtro e vela"
        invalid={state.field === "description"}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          name="workshop"
          label="Oficina (opcional)"
          defaultValue={maintenance?.workshop ?? ""}
          placeholder="Ex.: Oficina do Zé"
          invalid={state.field === "workshop"}
        />
        <Field
          name="odometer"
          label="Quilometragem na entrada (opcional)"
          type="number"
          min={0}
          step={1}
          defaultValue={maintenance?.odometer ?? ""}
          placeholder="0"
          hint="É ela que dá sentido a “revisão dos 10.000”."
          invalid={state.field === "odometer"}
        />
      </div>

      <Field
        name="cost"
        label="Custo (opcional)"
        type="number"
        step="0.01"
        min={0}
        defaultValue={maintenance?.cost ?? ""}
        placeholder="0,00"
        hint="Pode ficar em branco: a nota costuma chegar depois do serviço."
        invalid={state.field === "cost"}
        className="max-w-[220px]"
      />
    </>
  );
}

/** O rodapé com a recusa do lado do botão que a provocou. */
function Footer({
  state,
  pending,
  onCancel,
  label,
}: {
  state: MaintenanceState;
  pending: boolean;
  onCancel: () => void;
  label: string;
}) {
  return (
    <DialogFooter className="mx-0 mb-0 shrink-0 flex-col items-center gap-3 px-6 py-4 sm:flex-row sm:justify-between">
      <p role="alert" className="text-xs text-destructive empty:hidden sm:mr-4">
        {state.error}
      </p>
      <span className="flex flex-col-reverse gap-2 sm:flex-row">
        <Button type="button" variant="outline" size="lg" onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="submit" size="lg" disabled={pending}>
          {label}
        </Button>
      </span>
    </DialogFooter>
  );
}

const DIALOG =
  "flex max-h-[calc(100svh-3rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-[560px]";

/** Mandar a moto para a oficina. */
function StartDialog({
  vehicleId,
  plate,
  today,
  open,
  onClose,
}: {
  vehicleId: string;
  plate: string;
  today: string;
  open: boolean;
  onClose: () => void;
}) {
  const [state, formAction, pending] = useActionState(
    async (previous: MaintenanceState, form: FormData) => {
      const next = await startMaintenance(previous, form);
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
      <DialogContent className={DIALOG}>
        <form action={formAction} className="flex min-h-0 flex-1 flex-col">
          <input type="hidden" name="vehicleId" value={vehicleId} />

          <DialogHeader className="shrink-0 gap-1.5 border-b border-border px-6 py-5 pr-12">
            <DialogTitle>Mandar a {plate} para a oficina</DialogTitle>
            <DialogDescription>
              A moto sai da frota enquanto a manutenção estiver aberta — não há
              situação para trocar à mão.
            </DialogDescription>
          </DialogHeader>

          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-6 py-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="kind" className="text-xs">
                  Tipo
                </Label>
                <Select name="kind" defaultValue="corrective" required>
                  <SelectTrigger
                    id="kind"
                    aria-invalid={state.field === "kind"}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="preventive">Preventiva</SelectItem>
                    <SelectItem value="corrective">Corretiva</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Field
                name="enteredOn"
                label="Entrou em"
                type="date"
                required
                defaultValue={today}
                max={today}
                invalid={state.field === "enteredOn"}
              />
            </div>

            <MaintenanceFields state={state} />
          </div>

          <Footer
            state={state}
            pending={pending}
            onCancel={onClose}
            label="Mandar para a oficina"
          />
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Fechar ou corrigir uma manutenção. */
function FinishDialog({
  vehicleId,
  maintenance,
  today,
  onClose,
}: {
  vehicleId: string;
  maintenance: Maintenance | null;
  today: string;
  onClose: () => void;
}) {
  const [state, formAction, pending] = useActionState(
    async (previous: MaintenanceState, form: FormData) => {
      const next = await finishMaintenance(previous, form);
      if (next.done) {
        toast.success(next.done);
        onClose();
      }
      return next;
    },
    {},
  );

  const aberta = maintenance?.leftOn === null;

  return (
    <Dialog
      open={maintenance !== null}
      onOpenChange={(aberto) => !aberto && onClose()}
    >
      <DialogContent className={DIALOG}>
        {maintenance && (
          <form
            action={formAction}
            className="flex min-h-0 flex-1 flex-col"
            // Trocar de manutenção tem que trocar os valores iniciais dos
            // campos, e `defaultValue` só é lido na montagem.
            key={maintenance.id}
          >
            <input type="hidden" name="vehicleId" value={vehicleId} />
            <input type="hidden" name="id" value={maintenance.id} />

            <DialogHeader className="shrink-0 gap-1.5 border-b border-border px-6 py-5 pr-12">
              <DialogTitle>
                {aberta ? "Fechar a manutenção" : "Corrigir a manutenção"}
              </DialogTitle>
              <DialogDescription>
                {aberta
                  ? `Entrou em ${formatDay(maintenance.enteredOn)}. Preencher a saída devolve a moto para a frota.`
                  : `De ${formatDay(maintenance.enteredOn)} a ${formatDay(maintenance.leftOn!)}.`}
              </DialogDescription>
            </DialogHeader>

            <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-6 py-5">
              <Field
                name="leftOn"
                label={aberta ? "Saiu em" : "Saída"}
                type="date"
                defaultValue={maintenance.leftOn ?? today}
                min={maintenance.enteredOn}
                max={today}
                hint={
                  aberta
                    ? "Deixe em branco se ela ainda está lá — dá para só anotar o custo."
                    : undefined
                }
                invalid={state.field === "leftOn"}
                className="max-w-[220px]"
              />

              <MaintenanceFields maintenance={maintenance} state={state} />
            </div>

            <Footer
              state={state}
              pending={pending}
              onCancel={onClose}
              label={aberta ? "Fechar e devolver à frota" : "Salvar"}
            />
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Uma manutenção na lista. */
function Row({
  maintenance,
  onEdit,
  onDelete,
}: {
  maintenance: Maintenance;
  onEdit: (maintenance: Maintenance) => void;
  onDelete: (maintenance: Maintenance) => void;
}) {
  const parada = daysInWorkshop(maintenance);
  const duração = workshopDays(maintenance);

  return (
    <div className="flex flex-col gap-1 border-b border-border px-4 py-3 text-[13px] last:border-b-0">
      <div className="flex items-baseline gap-3">
        <span className="min-w-0 flex-1 truncate font-medium">
          {maintenance.description}
        </span>
        {maintenance.cost !== null && (
          <span className="shrink-0 tabular-nums">
            R$ {formatMoney(maintenance.cost)}
          </span>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="-my-1 shrink-0 text-xs text-muted-foreground"
          onClick={() => onEdit(maintenance)}
        >
          {parada === null ? "Corrigir" : "Fechar"}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="-my-1 shrink-0 text-xs text-muted-foreground"
          onClick={() => onDelete(maintenance)}
        >
          Apagar
        </Button>
      </div>

      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span>{KIND_LABELS[maintenance.kind]}</span>
        <span className="tabular-nums">
          {parada === null
            ? `${formatDay(maintenance.enteredOn)} – ${formatDay(maintenance.leftOn!)}`
            : `Entrou em ${formatDay(maintenance.enteredOn)}`}
        </span>
        {duração !== null && (
          <span>
            {duração} {duração === 1 ? "dia" : "dias"} parada
          </span>
        )}
        {maintenance.workshop && <span>{maintenance.workshop}</span>}
        {maintenance.odometer !== null && (
          <span className="tabular-nums">
            {formatInteger(maintenance.odometer)} km
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * As manutenções de uma moto, e a porta que tira e devolve ela da frota.
 *
 * O bloco não é só histórico: é o **único** lugar em que a moto entra e sai da
 * oficina. A situação "Em manutenção" deixou de ser um select porque uma
 * palavra sem nada atrás não responde o quê, desde quando, onde, nem quanto —
 * e era isso que o gestor precisava saber duas semanas depois.
 *
 * A que está em aberto vem destacada no topo, com há quantos dias: é a única
 * sobre a qual há o que fazer.
 */
export function VehicleMaintenances({
  vehicleId,
  plate,
  maintenances,
  today,
}: {
  vehicleId: string;
  plate: string;
  maintenances: Maintenance[];
  /** Hoje em Brasília, resolvido no servidor. */
  today: string;
}) {
  const [abrindo, setAbrindo] = useState(false);
  const [editando, setEditando] = useState<Maintenance | null>(null);
  const [apagando, setApagando] = useState<Maintenance | null>(null);
  const [pendente, iniciar] = useTransition();

  const aberta = maintenances.find((linha) => linha.leftOn === null) ?? null;

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-semibold">Manutenções</h2>
        {/* Com ordem aberta, o botão de mandar para a oficina não faz sentido:
            a moto já está lá, e o que resta é fechar. */}
        {aberta ? (
          <Button variant="outline" onClick={() => setEditando(aberta)}>
            Fechar manutenção
          </Button>
        ) : (
          <Button variant="outline" onClick={() => setAbrindo(true)}>
            Mandar para a oficina
          </Button>
        )}
      </div>

      {aberta && (
        <p className="flex items-center gap-2 rounded-lg border border-input bg-surface-2 px-4 py-3 text-[13px]">
          <span aria-hidden className="size-2.5 shrink-0 rounded-full bg-off" />
          Na oficina há {daysInWorkshop(aberta)}{" "}
          {daysInWorkshop(aberta) === 1 ? "dia" : "dias"} — a moto está fora da
          frota até esta manutenção fechar.
        </p>
      )}

      {maintenances.length === 0 ? (
        <p className="rounded-lg border border-dashed border-input px-4 py-6 text-center text-[13px] text-muted-foreground">
          Nenhuma manutenção registrada nesta moto.
        </p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          {maintenances.map((maintenance) => (
            <Row
              key={maintenance.id}
              maintenance={maintenance}
              onEdit={setEditando}
              onDelete={setApagando}
            />
          ))}
        </div>
      )}

      <StartDialog
        vehicleId={vehicleId}
        plate={plate}
        today={today}
        open={abrindo}
        onClose={() => setAbrindo(false)}
      />

      <FinishDialog
        vehicleId={vehicleId}
        maintenance={editando}
        today={today}
        onClose={() => setEditando(null)}
      />

      <AlertDialog
        open={apagando !== null}
        onOpenChange={(aberto) => !aberto && setApagando(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Apagar esta manutenção?</AlertDialogTitle>
            <AlertDialogDescription>
              {apagando?.description} — entrou em{" "}
              {apagando && formatDay(apagando.enteredOn)}.
              {apagando?.leftOn === null &&
                " A moto volta para a frota na mesma hora."}
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
                      const { error } = await removeMaintenance(
                        alvo.id,
                        vehicleId,
                      );

                      if (error) toast.error(error);
                      else toast.success("Manutenção apagada.");
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
