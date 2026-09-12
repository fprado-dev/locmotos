"use client";

import { useActionState, useState } from "react";
import { Upload } from "lucide-react";
import { STATUS_LABELS } from "@/app/ui";
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
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { VEHICLE_STATUSES, type Vehicle } from "@/modules/fleet";
import { addVehicle, editVehicle, type FormState } from "./actions";

/** Um campo do formulário: rótulo em cima, campo embaixo, recado embaixo dele. */
function Field({
  name,
  label,
  type = "text",
  required = false,
  step,
  defaultValue,
  className,
  fieldClassName,
  error,
}: {
  name: string;
  label: string;
  type?: string;
  required?: boolean;
  step?: string;
  defaultValue?: string;
  className?: string;
  fieldClassName?: string;
  error?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", fieldClassName)}>
      <Label htmlFor={name}>
        {label}
        {required && " *"}
      </Label>
      <Input
        id={name}
        name={name}
        type={type}
        step={step}
        required={required}
        defaultValue={defaultValue}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${name}-error` : undefined}
        className={className}
      />
      {error && (
        <p
          id={`${name}-error`}
          role="alert"
          className="text-xs text-destructive"
        >
          {error}
        </p>
      )}
    </div>
  );
}

/** Número e data chegam do domínio; o campo só entende texto. */
function value(field: string | number | null | undefined): string | undefined {
  return field === null || field === undefined ? undefined : String(field);
}

const initialState: FormState = {};

/**
 * O formulário do cadastro, no cadastro novo e na correção.
 *
 * É o mesmo formulário porque são os mesmos campos: separar em dois faria as
 * duas telas divergirem no primeiro campo que alguém acrescentasse.
 *
 * O que só existe no cadastro novo é a situação e o CRLV. Não é divergência de
 * layout: na página de detalhe os dois já têm dono — o select da situação vive
 * no cabeçalho, e os anexos têm a própria seção, onde dá para trocar um
 * documento sem reenviar o cadastro inteiro.
 *
 * `onCancel` é o que distingue o painel da página. Tendo para onde cancelar, o
 * formulário vira coluna de altura cheia: os campos rolam e o rodapé fica
 * parado, para salvar não depender de rolar até o fim.
 */
export function VehicleForm({
  vehicle,
  onCancel,
  onSaved,
}: {
  vehicle?: Vehicle;
  onCancel?: () => void;
  onSaved?: (plate: string) => void;
}) {
  const [crlv, setCrlv] = useState<string | null>(null);

  const [state, formAction, pending] = useActionState(
    // O aviso de sucesso sai daqui e não de um efeito: o cadastro termina uma
    // vez, e um efeito sobre o estado avisaria de novo a cada render do painel.
    async (previous: FormState, formData: FormData) => {
      const next = await (vehicle ? editVehicle : addVehicle)(
        previous,
        formData,
      );

      if (next.created) onSaved?.(next.created.plate);
      return next;
    },
    initialState,
  );

  // Recado sem campo é o que não encosta em nenhum: fica no topo, onde o
  // gestor esbarra nele antes de procurar o erro campo a campo.
  //
  // ponytail: um erro que acuse campo não desenhado nesta tela ficaria mudo;
  // hoje todos os que acusam campo estão aqui. Se a divergência aparecer, o
  // conserto é o topo receber o que não achou dono.
  const geral = state.error && !state.field ? state.error : undefined;
  const erro = (name: string) =>
    state.field === name ? state.error : undefined;

  const painel = onCancel !== undefined;

  return (
    <form
      action={formAction}
      data-autofill
      className={cn(
        "@container flex flex-col",
        painel ? "min-h-0 flex-1" : "gap-4",
      )}
    >
      {/* A v1 só oferece motos: quem fixa isso é esta tela, não o modelo. */}
      <input type="hidden" name="category" value="motorcycle" />
      {vehicle && <input type="hidden" name="id" value={vehicle.id} />}

      <div
        className={cn(
          "flex flex-col gap-4",
          painel && "min-h-0 flex-1 overflow-y-auto p-6",
        )}
      >
        {geral && (
          <p role="alert" className="text-sm text-destructive">
            {geral}
          </p>
        )}

        {/* Duas colunas no painel lateral, quatro na página de detalhe: quem
            decide é a largura do formulário, não a da janela. */}
        <div className="grid grid-cols-2 gap-x-3 gap-y-4 @2xl:grid-cols-3 @5xl:grid-cols-4">
          <Field
            name="plate"
            label="Placa"
            required
            defaultValue={vehicle?.plate}
            error={erro("plate")}
            // A placa é o que identifica a moto: no painel ela abre o
            // formulário sozinha na linha, e não espremida ao lado da marca.
            fieldClassName="col-span-2 @2xl:col-span-1"
            className="font-mono uppercase"
          />
          <Field
            name="brand"
            label="Marca"
            required
            defaultValue={vehicle?.brand}
            error={erro("brand")}
          />
          <Field
            name="model"
            label="Modelo"
            required
            defaultValue={vehicle?.model}
            error={erro("model")}
          />
          <Field
            name="year"
            label="Ano"
            type="number"
            required
            defaultValue={value(vehicle?.year)}
            error={erro("year")}
          />
          <Field
            name="color"
            label="Cor"
            defaultValue={value(vehicle?.color)}
            error={erro("color")}
          />
          <Field
            name="mileage"
            label="Quilometragem"
            type="number"
            defaultValue={value(vehicle?.mileage)}
            error={erro("mileage")}
            className="text-right"
          />

          {!vehicle && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="status">Situação</Label>
              <Select name="status" defaultValue="available">
                <SelectTrigger id="status" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {VEHICLE_STATUSES.map((status) => (
                    <SelectItem key={status} value={status}>
                      {STATUS_LABELS[status]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <Field
            name="weeklyPrice"
            label="Valor semanal"
            type="number"
            step="0.01"
            defaultValue={value(vehicle?.weeklyPrice)}
            error={erro("weeklyPrice")}
            className="text-right"
          />
          <Field
            name="licensingDueDate"
            label="Licenciamento vence em"
            type="date"
            defaultValue={value(vehicle?.licensingDueDate)}
            error={erro("licensingDueDate")}
          />
          <Field
            name="chassis"
            label="Chassi"
            defaultValue={value(vehicle?.chassis)}
            error={erro("chassis")}
            className="font-mono"
          />
          <Field
            name="renavam"
            label="Renavam"
            defaultValue={value(vehicle?.renavam)}
            error={erro("renavam")}
            className="font-mono"
          />
          <Field
            name="fipeValue"
            label="Valor FIPE"
            type="number"
            step="0.01"
            defaultValue={value(vehicle?.fipeValue)}
            error={erro("fipeValue")}
            className="text-right"
          />
          <Field
            name="purchaseValue"
            label="Valor de compra"
            type="number"
            step="0.01"
            defaultValue={value(vehicle?.purchaseValue)}
            error={erro("purchaseValue")}
            className="text-right"
          />
          <Field
            name="purchaseDate"
            label="Data de compra"
            type="date"
            defaultValue={value(vehicle?.purchaseDate)}
            error={erro("purchaseDate")}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="notes">Observações</Label>
          <Textarea
            id="notes"
            name="notes"
            rows={2}
            defaultValue={value(vehicle?.notes)}
          />
        </div>

        {!vehicle && (
          <CrlvDropzone name={crlv} onPick={setCrlv} error={erro("crlv")} />
        )}
      </div>

      <div
        className={cn(
          "flex items-center gap-2",
          painel
            ? "shrink-0 justify-end border-t border-border px-6 py-4"
            : "justify-start",
        )}
      >
        {onCancel && (
          <Button type="button" variant="outline" size="lg" onClick={onCancel}>
            Cancelar
          </Button>
        )}
        <Button type="submit" size="lg" disabled={pending}>
          {vehicle
            ? pending
              ? "Salvando…"
              : "Salvar"
            : pending
              ? "Cadastrando…"
              : "Salvar veículo"}
        </Button>
      </div>
    </form>
  );
}

/**
 * Onde o CRLV entra, por arrasto ou por clique.
 *
 * O `<input type="file">` cobre a caixa inteira, transparente: arrastar um
 * arquivo para cima dele é comportamento do navegador, e nenhuma linha de
 * JavaScript de arrasto precisa existir. O que o React faz aqui é só mostrar o
 * nome do que foi escolhido.
 */
function CrlvDropzone({
  name,
  onPick,
  error,
}: {
  name: string | null;
  onPick: (name: string | null) => void;
  error?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor="crlv">Documentos</Label>
      <label
        className={cn(
          "relative flex h-[84px] cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed text-center text-xs transition-colors",
          error
            ? "border-destructive text-destructive"
            : "border-input text-muted-foreground hover:border-primary",
        )}
      >
        <input
          id="crlv"
          type="file"
          name="crlv"
          accept="image/*,application/pdf"
          aria-describedby={error ? "crlv-error" : undefined}
          onChange={(event) => onPick(event.target.files?.[0]?.name ?? null)}
          className="absolute inset-0 cursor-pointer opacity-0"
        />
        <Upload aria-hidden className="size-4" />
        {name ?? "Arraste o CRLV aqui, ou clique para escolher"}
      </label>
      {error && (
        <p id="crlv-error" role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
