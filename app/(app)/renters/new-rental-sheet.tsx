"use client";

import {
  startTransition,
  useActionState,
  useEffect,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { formatInteger } from "@/app/ui";
import { Button } from "@/components/ui/button";
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
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { isoDay } from "@/lib/calendar";
import { cn } from "@/lib/utils";
import type { AvailableVehicle } from "@/modules/fleet";
import { cnhAlert, type Renter } from "@/modules/renters";
import { openNewRental, type RentalFormState } from "./actions";
import { CnhBadge } from "./cnh-badge";

/** Onde o recado do formulário mora, para os campos poderem apontar para ele. */
const FORM_ERROR_ID = "rental-form-error";

/** Um campo do formulário: rótulo em cima, campo embaixo. */
function Field({
  name,
  label,
  type = "text",
  step,
  value,
  defaultValue,
  onChange,
  placeholder,
  prefix,
  invalid,
}: {
  name: string;
  label: string;
  type?: string;
  step?: string;
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  /** "R$" encostado no campo: a unidade é da tela, não do que se digita. */
  prefix?: string;
  invalid?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={name}>{label}</Label>
      <div className="relative">
        {prefix && (
          <span
            aria-hidden
            className="absolute top-1/2 left-3 -translate-y-1/2 text-[13px] text-muted-foreground"
          >
            {prefix}
          </span>
        )}
        <Input
          id={name}
          name={name}
          type={type}
          step={step}
          value={value}
          defaultValue={defaultValue}
          onChange={onChange && ((event) => onChange(event.target.value))}
          placeholder={placeholder}
          aria-invalid={invalid ? true : undefined}
          aria-describedby={invalid ? FORM_ERROR_ID : undefined}
          className={cn("tabular-nums", prefix && "pl-9")}
        />
      </div>
    </div>
  );
}

const initialState: RentalFormState = {};

/**
 * A abertura de uma locação, no painel do locatário.
 *
 * Começa pelo locatário e não pela moto porque é assim que a conversa
 * acontece: a pessoa está na frente do gestor pedindo uma moto, e o que falta
 * decidir é qual. Por isso o seletor oferece só as **disponíveis** — moto em
 * manutenção, indisponível ou já alugada não é escolha a recusar depois, é
 * escolha que não aparece.
 *
 * O valor semanal chega preenchido com o da moto e continua editável: é cópia,
 * não vínculo. A partir daqui ele vive na locação, e a tabela de preços da
 * frota pode mudar sem mexer no que foi acordado.
 */
export function NewRentalSheet({
  renter,
  vehicles,
}: {
  renter: Renter;
  vehicles: AvailableVehicle[];
}) {
  const [open, setOpen] = useState(false);
  const [vehicleId, setVehicleId] = useState("");
  const [weeklyPrice, setWeeklyPrice] = useState("");
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);

  const [state, formAction, pending] = useActionState(
    async (previous: RentalFormState, formData: FormData) => {
      const next = await openNewRental(previous, formData);

      if (next.created) {
        setOpen(false);
        toast.success(`${renter.name} está com a ${next.created.plate}.`);
        // O painel continua aberto pela URL: o que ele precisa é reler a
        // locação que acabou de nascer.
        router.refresh();
      }

      return next;
    },
    initialState,
  );

  // O recado costuma nascer fora da vista num painel que rola: levar o foco ao
  // campo acusado traz a rolagem junto e diz qual é, para quem vê e para quem
  // ouve a tela.
  useEffect(() => {
    if (!state.error) return;

    const alvo = state.field
      ? formRef.current?.elements.namedItem(state.field)
      : formRef.current?.querySelector(`#${FORM_ERROR_ID}`);

    if (alvo instanceof HTMLElement) {
      alvo.scrollIntoView({ block: "center", behavior: "smooth" });
      if (state.field) alvo.focus({ preventScroll: true });
    }
  }, [state]);

  const acusado = (name: string) => state.field === name;
  const alerta = cnhAlert(renter.cnhDueDate);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger render={<Button size="lg" />}>Nova locação</SheetTrigger>

      <SheetContent className="w-[560px] gap-0 sm:max-w-[560px]">
        <SheetHeader className="h-16 shrink-0 justify-center border-b border-border px-6">
          <SheetTitle>Nova locação — {renter.name}</SheetTitle>
        </SheetHeader>

        <form
          ref={formRef}
          // O envio é `onSubmit` e não `action` porque o React limpa o
          // formulário assim que uma action passada por `action` termina —
          // inclusive quando ela volta com erro, que é quando o que foi
          // digitado ainda importa.
          onSubmit={(event) => {
            event.preventDefault();
            const dados = new FormData(event.currentTarget);
            startTransition(() => formAction(dados));
          }}
          className="flex min-h-0 flex-1 flex-col"
        >
          <input type="hidden" name="renterId" value={renter.id} />

          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-6">
            {state.error && (
              <p
                id={FORM_ERROR_ID}
                role="alert"
                className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              >
                {state.error}
              </p>
            )}

            {/*
              Aviso, não bloqueio. Entregar moto a quem está com a habilitação
              vencida é risco da locadora, mas transformar isso em impedimento
              é regra que ninguém decidiu — quem decide é quem está operando.
            */}
            {alerta && (
              <p className="flex items-center gap-2 rounded-lg border border-input bg-surface-2 px-3 py-2 text-[13px] text-muted-foreground">
                <CnhBadge dueDate={renter.cnhDueDate} />
                {alerta === "overdue"
                  ? "A CNH está vencida. O sistema não impede a locação — a decisão é sua."
                  : "A CNH está perto de vencer."}
              </p>
            )}

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="vehicleId">Moto *</Label>
              <Select
                name="vehicleId"
                value={vehicleId}
                onValueChange={(escolhida) => {
                  const id = String(escolhida);
                  setVehicleId(id);

                  // O valor da tabela entra no campo; daí em diante ele é do
                  // gestor, e trocar de moto traz o preço da nova.
                  const moto = vehicles.find((vehicle) => vehicle.id === id);
                  setWeeklyPrice(
                    moto?.weeklyPrice == null ? "" : String(moto.weeklyPrice),
                  );
                }}
              >
                <SelectTrigger
                  id="vehicleId"
                  className="w-full"
                  aria-invalid={acusado("vehicleId") ? true : undefined}
                >
                  <SelectValue placeholder="Escolher moto disponível…" />
                </SelectTrigger>
                <SelectContent>
                  {vehicles.map((vehicle) => (
                    <SelectItem key={vehicle.id} value={vehicle.id}>
                      <span className="font-mono tracking-[0.02em]">
                        {vehicle.plate}
                      </span>
                      <span className="ml-2 text-muted-foreground">
                        {vehicle.brand} {vehicle.model}
                      </span>
                      {vehicle.weeklyPrice !== null && (
                        <span className="ml-2 text-subtle tabular-nums">
                          R$ {formatInteger(vehicle.weeklyPrice)}/sem
                        </span>
                      )}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {vehicles.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  Nenhuma moto disponível na frota agora.
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-x-3 gap-y-4">
              <Field
                name="weeklyPrice"
                label="Valor semanal *"
                type="number"
                step="0.01"
                prefix="R$"
                value={weeklyPrice}
                onChange={setWeeklyPrice}
                placeholder="340"
                invalid={acusado("weeklyPrice")}
              />
              <Field
                name="startedOn"
                label="Início"
                type="date"
                // A locação começa hoje, que é quando a moto sai do pátio.
                defaultValue={isoDay(new Date())}
                invalid={acusado("startedOn")}
              />
              <Field
                name="commitmentMonths"
                label="Fidelidade (meses)"
                type="number"
                placeholder="12"
                invalid={acusado("commitmentMonths")}
              />
              <Field
                name="deposit"
                label="Caução"
                type="number"
                step="0.01"
                prefix="R$"
                placeholder="0"
                invalid={acusado("deposit")}
              />
            </div>
          </div>

          <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border px-6 py-4">
            <Button
              type="button"
              variant="outline"
              size="lg"
              onClick={() => setOpen(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" size="lg" disabled={pending}>
              {pending ? "Abrindo…" : "Abrir locação"}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
