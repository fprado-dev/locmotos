"use client";

import { useActionState, useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { formatDay, formatMoment, INCIDENT_LABELS } from "@/app/ui";
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
import { Badge } from "@/components/ui/badge";
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
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { INCIDENT_KINDS, whoHadIt, type Incident } from "@/modules/rentals";
import { discardVehicle } from "./fleet/actions";
import { removeIncident, saveIncident } from "./incident-actions";

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
 * Quem estava com a moto, em uma linha.
 *
 * A mesma decisão da infração, e por isso a mesma função — `whoHadIt`. O que
 * muda é a redação: "moto no pátio" aqui não desculpa ninguém, só situa.
 */
function Who({ incident }: { incident: Incident }) {
  const quem = whoHadIt(incident);

  if (quem.kind === "renter") {
    return (
      <Link
        href={`/renters?open=${quem.renterId}`}
        className="rounded-sm font-medium text-brand-text hover:underline"
      >
        com {quem.name}
      </Link>
    );
  }

  if (quem.kind === "owner") {
    return <span className="text-muted-foreground">moto no pátio</span>;
  }

  return (
    <span className="text-late" title="Duas locações contêm esse dia">
      {quem.matches} locações nesse dia — confira qual
    </span>
  );
}

/** Perda total e roubo saltam; batida e furto informam. */
function KindBadge({ kind }: { kind: Incident["kind"] }) {
  const grave = kind === "total_loss" || kind === "robbery";

  return (
    <Badge
      className={cn(
        "h-auto shrink-0 rounded-md px-[7px] py-0.5 text-[11px]",
        grave
          ? "bg-late font-semibold text-white"
          : "bg-chip font-medium text-foreground",
      )}
    >
      {INCIDENT_LABELS[kind]}
    </Badge>
  );
}

/** Um sinistro na lista: o que foi, quando, com quem, e o papel. */
function Row({
  incident,
  onDelete,
}: {
  incident: Incident;
  /** Só a ficha da moto apaga — o painel do locatário só lê. */
  onDelete?: (incident: Incident) => void;
}) {
  return (
    <div className="flex flex-col gap-1 border-b border-border px-4 py-3 text-[13px] last:border-b-0">
      <div className="flex items-baseline gap-3">
        <KindBadge kind={incident.kind} />
        <span className="min-w-0 flex-1 truncate font-medium">
          {incident.description}
        </span>
        {onDelete && (
          <Button
            variant="ghost"
            size="sm"
            className="-my-1 shrink-0 text-xs text-muted-foreground"
            onClick={() => onDelete(incident)}
          >
            Apagar
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span className="tabular-nums">
          {formatMoment(incident.occurredAt)}
        </span>
        <Who incident={incident} />
        {incident.policeReport && (
          <span className="font-mono text-subtle">
            B.O. {incident.policeReport}
          </span>
        )}
        {incident.insurer && (
          <span>
            {incident.insurer}
            {incident.insurerNotifiedOn &&
              ` · avisada em ${formatDay(incident.insurerNotifiedOn)}`}
          </span>
        )}
        <span className="text-subtle">{incident.by}</span>
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
 * O registro de um sinistro, num diálogo.
 *
 * Os campos estão na ordem em que a história é contada: o que foi, quando, o
 * que aconteceu, e só então o papel — B.O. e seguradora chegam dias depois, e
 * exigi-los na hora faria o gestor adiar o registro justamente do fato que ele
 * mais vai precisar procurar depois.
 */
function IncidentDialog({
  vehicleId,
  plate,
  today,
  open,
  onClose,
  onTotalLoss,
}: {
  vehicleId: string;
  plate: string;
  /** Hoje em Brasília, resolvido no servidor. */
  today: string;
  open: boolean;
  onClose: () => void;
  onTotalLoss: (incidentId: string) => void;
}) {
  const [state, formAction, pending] = useActionState(
    async (previous: Parameters<typeof saveIncident>[0], form: FormData) => {
      const next = await saveIncident(previous, form);
      if (next.done) {
        toast.success(next.done);
        onClose();
        if (next.discardable) onTotalLoss(next.discardable.incidentId);
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
            <DialogTitle>Registrar sinistro da {plate}</DialogTitle>
            <DialogDescription>
              Quem estava com a moto o sistema descobre sozinho, pela data e
              hora — não há campo para isso. A situação da moto não muda aqui.
            </DialogDescription>
          </DialogHeader>

          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-6 py-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="kind" className="text-xs">
                  O que foi
                </Label>
                <Select name="kind" defaultValue="damage" required>
                  <SelectTrigger
                    id="kind"
                    aria-invalid={state.field === "kind"}
                  >
                    <SelectValue placeholder="Escolher…" />
                  </SelectTrigger>
                  <SelectContent>
                    {INCIDENT_KINDS.map((tipo) => (
                      <SelectItem key={tipo} value={tipo}>
                        {INCIDENT_LABELS[tipo]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Field
                name="occurredAt"
                label="Quando aconteceu"
                type="datetime-local"
                required
                hint="Hora de Brasília. É ela que diz quem estava com a moto."
                invalid={state.field === "occurredAt"}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="description" className="text-xs">
                O que aconteceu
              </Label>
              <Textarea
                id="description"
                name="description"
                required
                rows={3}
                placeholder="Ex.: Colisão traseira na Av. Brasil, sem vítimas. Moto rodando."
                aria-invalid={state.field === "description"}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                name="policeReport"
                label="Boletim de ocorrência (opcional)"
                placeholder="Ex.: 2026.123456"
                invalid={state.field === "policeReport"}
              />
              <Field
                name="insurer"
                label="Seguradora acionada (opcional)"
                placeholder="Ex.: Porto Seguro"
                invalid={state.field === "insurer"}
              />
            </div>

            <Field
              name="insurerNotifiedOn"
              label="Data do aviso à seguradora (opcional)"
              type="date"
              max={today}
              invalid={state.field === "insurerNotifiedOn"}
              className="max-w-[260px]"
            />
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
 * Os sinistros de uma moto, na ficha dela.
 *
 * Registrar um sinistro **não mexe na situação da moto**: batida pode
 * significar oficina, baixa ou nada, e adivinhar por quem sabe faria a frota
 * mentir. A única exceção é perda total, e ela é uma oferta — ver abaixo.
 */
export function VehicleIncidents({
  vehicleId,
  plate,
  incidents,
  today,
}: {
  vehicleId: string;
  plate: string;
  incidents: Incident[];
  today: string;
}) {
  const [registrando, setRegistrando] = useState(false);
  const [apagando, setApagando] = useState<Incident | null>(null);
  const [baixa, setBaixa] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  const [baixaState, baixaAction, baixaPending] = useActionState(
    discardVehicle,
    {},
  );

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-semibold">Sinistros</h2>
        <Button variant="outline" onClick={() => setRegistrando(true)}>
          Registrar sinistro
        </Button>
      </div>

      {incidents.length === 0 ? (
        <p className="rounded-lg border border-dashed border-input px-4 py-6 text-center text-[13px] text-muted-foreground">
          Nenhum sinistro registrado nesta moto.
        </p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          {incidents.map((incident) => (
            <Row key={incident.id} incident={incident} onDelete={setApagando} />
          ))}
        </div>
      )}

      <IncidentDialog
        vehicleId={vehicleId}
        plate={plate}
        today={today}
        open={registrando}
        onClose={() => setRegistrando(false)}
        onTotalLoss={setBaixa}
      />

      {/* Perda total tira a moto da frota para sempre — mas quem sabe que o
          laudo da seguradora já saiu é o gestor. O sistema **oferece** a baixa
          com o motivo já preenchido, e aceita "agora não": o sinistro fica
          registrado de qualquer jeito, e a baixa continua disponível no fim
          da ficha. */}
      <AlertDialog
        open={baixa !== null}
        onOpenChange={(aberto) => !aberto && setBaixa(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Dar baixa na {plate} agora?</AlertDialogTitle>
            <AlertDialogDescription>
              Perda total tira a moto da frota para sempre. A baixa fica
              registrada com o motivo e com link para este sinistro — mas só faz
              sentido depois que o laudo da seguradora sair. Você pode deixar
              para depois: o botão continua no fim desta ficha.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <p role="alert" className="text-sm text-destructive empty:hidden">
            {baixaState.error}
          </p>

          <AlertDialogFooter>
            <AlertDialogCancel>Agora não</AlertDialogCancel>
            <form action={baixaAction}>
              <input type="hidden" name="id" value={vehicleId} />
              <input type="hidden" name="reason" value="total_loss" />
              <input type="hidden" name="incidentId" value={baixa ?? ""} />
              <AlertDialogAction
                render={
                  <Button
                    type="submit"
                    variant="destructive"
                    disabled={baixaPending}
                  />
                }
              >
                Dar baixa
              </AlertDialogAction>
            </form>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={apagando !== null}
        onOpenChange={(aberto) => !aberto && setApagando(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Apagar este sinistro?</AlertDialogTitle>
            <AlertDialogDescription>
              {apagando?.description} —{" "}
              {apagando && formatMoment(apagando.occurredAt)}. Some da ficha da
              moto e do painel de quem estava com ela. Se a baixa da moto
              apontava para ele, ela continua de pé, sem o link.
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
                      const { error } = await removeIncident(
                        alvo.id,
                        vehicleId,
                      );

                      if (error) toast.error(error);
                      else toast.success("Sinistro apagado.");
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
 * Os sinistros atribuídos a um locatário, no painel dele.
 *
 * Só lê: registrar é na moto. É o que o gestor olha antes de decidir sobre
 * caução e sobre alugar de novo para essa pessoa — e por isso a moto vira
 * link, que é de onde a conversa continua.
 *
 * O bloco some quando não há nenhum: "nenhum sinistro" é a vida normal de um
 * locatário, e uma caixa vazia por locatário seria ruído em toda tela.
 */
export function RenterIncidents({ incidents }: { incidents: Incident[] }) {
  if (incidents.length === 0) return null;

  return (
    <section className="flex flex-col gap-3">
      <Heading>Sinistros</Heading>
      <div className="overflow-hidden rounded-lg border border-border">
        {incidents.map((incident) => (
          <div
            key={incident.id}
            className="flex flex-col gap-1 border-b border-border px-4 py-3 text-[13px] last:border-b-0"
          >
            <div className="flex items-baseline gap-3">
              <KindBadge kind={incident.kind} />
              <span className="min-w-0 flex-1 truncate font-medium">
                {incident.description}
              </span>
            </div>
            <div className="flex flex-wrap items-baseline gap-x-3 text-xs text-muted-foreground">
              <span className="tabular-nums">
                {formatMoment(incident.occurredAt)}
              </span>
              <Link
                href={`/fleet/${incident.vehicleId}`}
                className="rounded-sm font-mono hover:underline"
              >
                {incident.vehicle.plate}
              </Link>
              {incident.policeReport && (
                <span className="font-mono text-subtle">
                  B.O. {incident.policeReport}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
