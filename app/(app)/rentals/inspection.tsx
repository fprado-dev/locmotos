"use client";

import { useActionState, useState } from "react";
import { toast } from "sonner";
import { formatFullDate } from "@/app/ui";
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import {
  kilometersRun,
  type Inspection,
  type Inspections,
} from "@/modules/rentals";
import { saveHandoverInspection } from "./actions";

/**
 * O ponteiro do tanque, em quartos.
 *
 * É o que o gestor lê no painel da moto. Litro exigiria bomba, e texto livre
 * viraria "metade", "1/2" e "meio tanque" na mesma locadora.
 */
export const FUEL_LABELS = ["Vazio", "1/4", "1/2", "3/4", "Cheio"];

/** "12400" vira "12.400 km". */
function km(value: number): string {
  return `${value.toLocaleString("pt-BR")} km`;
}

/**
 * Os três campos da vistoria, iguais nas duas pontas.
 *
 * Nenhum é obrigatório, e nenhum tem `required`: o gestor anota o que
 * conferiu. Quem recusa o formulário inteiro em branco é quem o chama — no
 * encerramento, em branco é o caso comum e não erro nenhum.
 */
export function InspectionFields({
  inspection,
  invalid,
}: {
  inspection?: Inspection | null;
  invalid?: string;
}) {
  return (
    // Consulta de container e não de tela: os mesmos três campos entram num
    // diálogo largo e num estreito, e quem decide se cabem lado a lado é a
    // largura de onde eles estão — não a do monitor.
    <div className="@container flex flex-col gap-4">
      <div className="grid gap-4 @sm:grid-cols-[180px_minmax(0,1fr)]">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="odometer" className="text-xs">
            Quilometragem
          </Label>
          <Input
            id="odometer"
            name="odometer"
            type="number"
            min={0}
            max={999999}
            step={1}
            inputMode="numeric"
            placeholder="Ex.: 12400"
            defaultValue={inspection?.odometer ?? ""}
            aria-invalid={invalid === "odometer"}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">Combustível</Label>
          {/* Rádio e não select: o tanque tem cinco posições e "não anotei" é
            simplesmente nenhuma marcada — que é o que opcional quer dizer. */}
          <RadioGroup
            name="fuel"
            defaultValue={inspection?.fuel?.toString()}
            className="flex h-9 items-center gap-4"
          >
            {FUEL_LABELS.map((label, quartos) => (
              <label
                key={label}
                className="flex cursor-pointer items-center gap-1.5 text-[13px]"
              >
                <RadioGroupItem value={quartos.toString()} aria-label={label} />
                {label}
              </label>
            ))}
          </RadioGroup>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="damages" className="text-xs">
          Avarias
        </Label>
        <Textarea
          id="damages"
          name="damages"
          rows={3}
          placeholder="Ex.: risco na carenagem direita, retrovisor esquerdo folgado"
          defaultValue={inspection?.damages ?? ""}
        />
      </div>
    </div>
  );
}

/** Uma das duas pontas, como se lê. */
function Side({
  title,
  inspection,
}: {
  title: string;
  inspection: Inspection | null;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
      <span className="text-xs font-medium">{title}</span>

      {inspection === null ? (
        <span className="text-[13px] text-subtle">Não registrada</span>
      ) : (
        <>
          <span className="text-[13px] tabular-nums">
            {inspection.odometer === null ? (
              <span className="text-subtle">Quilometragem não anotada</span>
            ) : (
              km(inspection.odometer)
            )}
          </span>
          <span className="text-[13px]">
            {inspection.fuel === null ? (
              <span className="text-subtle">Combustível não anotado</span>
            ) : (
              `Tanque: ${FUEL_LABELS[inspection.fuel]}`
            )}
          </span>
          {inspection.damages && (
            <span className="text-[13px] text-late">{inspection.damages}</span>
          )}
          <span className="text-xs text-subtle">
            {inspection.by} · {formatFullDate(inspection.at)}
          </span>
        </>
      )}
    </div>
  );
}

/**
 * A vistoria das duas pontas, uma ao lado da outra.
 *
 * Lado a lado porque a da devolução só diz alguma coisa comparada com a da
 * entrega: "1.200 km rodados" é uma subtração, e um risco novo na carenagem só
 * é novo se a outra coluna não o tinha.
 */
export function InspectionsBlock({
  rentalId,
  inspections,
}: {
  rentalId: string;
  inspections: Inspections;
}) {
  const rodados = kilometersRun(inspections);

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-medium tracking-[0.05em] text-muted-foreground uppercase">
          Vistoria
        </h3>
        <HandoverDialog rentalId={rentalId} inspection={inspections.handover} />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Side title="Entrega" inspection={inspections.handover} />
        <Side title="Devolução" inspection={inspections.return} />
      </div>

      {rodados !== null && (
        <p className="text-[13px] text-muted-foreground">
          <span className="font-medium text-foreground tabular-nums">
            {km(rodados)}
          </span>{" "}
          rodados nesta locação.
        </p>
      )}
    </section>
  );
}

/**
 * A vistoria de entrega, registrada ou corrigida do painel.
 *
 * Não é passo da abertura de locação por decisão da issue #47: abrir continua
 * sendo um passo só, e a vistoria entra quando o gestor tiver a moto na frente.
 * A consequência assumida é que metade das locações não vai ter esta ponta.
 */
function HandoverDialog({
  rentalId,
  inspection,
}: {
  rentalId: string;
  inspection: Inspection | null;
}) {
  const [aberto, setAberto] = useState(false);

  const [state, formAction, pending] = useActionState(
    async (
      previous: Awaited<ReturnType<typeof saveHandoverInspection>>,
      form: FormData,
    ) => {
      const next = await saveHandoverInspection(previous, form);
      if (next.done) {
        toast.success(next.done);
        setAberto(false);
      }
      return next;
    },
    {},
  );

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="-mr-2 h-7 text-xs text-brand-text"
        onClick={() => setAberto(true)}
      >
        {inspection ? "Corrigir entrega" : "Registrar entrega"}
      </Button>

      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="max-h-[calc(100svh-3rem)] overflow-y-auto sm:max-w-[560px]">
          {/* `key` remonta o formulário a cada abertura: sem isso, o
              `defaultValue` dos campos guardaria o que foi digitado e
              descartado na vez anterior. */}
          <form action={formAction} key={aberto ? "aberto" : "fechado"}>
            <input type="hidden" name="id" value={rentalId} />

            <DialogHeader>
              <DialogTitle>Vistoria de entrega</DialogTitle>
              <DialogDescription>
                O estado da moto quando ela saiu. Anote o que conferiu — nada
                aqui é obrigatório.
              </DialogDescription>
            </DialogHeader>

            <div className="mt-5">
              <InspectionFields inspection={inspection} invalid={state.field} />
            </div>

            {state.error && (
              <p className="mt-4 text-xs text-destructive">{state.error}</p>
            )}

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
                Salvar vistoria
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
