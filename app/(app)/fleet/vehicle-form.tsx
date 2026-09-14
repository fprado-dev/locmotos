"use client";

import {
  startTransition,
  useActionState,
  useEffect,
  useRef,
  useState,
} from "react";
import { Upload } from "lucide-react";
import { AutofillButton } from "@/app/dev/autofill-button";
import {
  formatInteger,
  STATUS_LABELS,
  VEHICLE_COLORS,
  vehicleColor,
} from "@/app/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { type Vehicle, type VehicleStatus } from "@/modules/fleet";
import { addVehicle, editVehicle, type FormState } from "./actions";
import { StatusOptions } from "./status-options";

/** Onde o recado do formulário mora, para os campos poderem apontar para ele. */
const FORM_ERROR_ID = "vehicle-form-error";

/** Um campo do formulário: rótulo em cima, campo embaixo. */
function Field({
  name,
  label,
  type = "text",
  required = false,
  step,
  defaultValue,
  placeholder,
  min,
  className,
  fieldClassName,
  invalid,
}: {
  name: string;
  label: string;
  type?: string;
  required?: boolean;
  step?: string;
  defaultValue?: string;
  /** O que vale sem o campo preenchido — não o que vai ser gravado. */
  placeholder?: string;
  min?: number;
  className?: string;
  fieldClassName?: string;
  /** O recado é um só, e mora no topo: aqui o campo só se marca como o acusado. */
  invalid?: boolean;
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
        placeholder={placeholder}
        min={min}
        aria-invalid={invalid ? true : undefined}
        aria-describedby={invalid ? FORM_ERROR_ID : undefined}
        className={className}
      />
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
  revisionDefault,
  onCancel,
  onSaved,
}: {
  vehicle?: Vehicle;
  /**
   * O intervalo de revisão da locadora, só para o placeholder.
   *
   * Placeholder e não `defaultValue`: em branco a moto **herda**, e o campo
   * precisa mostrar o que vai valer sem gravar o número dentro dela — copiado,
   * ele pararia de acompanhar a locadora no dia em que o padrão mudasse.
   */
  revisionDefault?: number;
  onCancel?: () => void;
  onSaved?: (created: { id: string; plate: string }) => void;
}) {
  const [crlv, setCrlv] = useState<string | null>(null);
  // Controlado, e não `defaultValue`: sem valor escolhido o select do Base UI
  // manda string vazia, e o cadastro morria em "Situação inválida" antes de
  // chegar ao banco. O painel abre em Disponível, que é como a moto nasce.
  const [status, setStatus] = useState<VehicleStatus>("available");
  const formRef = useRef<HTMLFormElement>(null);

  const [state, formAction, pending] = useActionState(
    // O aviso de sucesso sai daqui e não de um efeito: o cadastro termina uma
    // vez, e um efeito sobre o estado avisaria de novo a cada render do painel.
    async (previous: FormState, formData: FormData) => {
      const next = await (vehicle ? editVehicle : addVehicle)(
        previous,
        formData,
      );

      if (next.created) onSaved?.(next.created);
      return next;
    },
    initialState,
  );

  // No painel os campos rolam, e o recado costuma nascer fora da vista: o
  // gestor aperta Salvar, nada visível muda, e ele aperta de novo. Levar o foco
  // ao campo acusado traz a rolagem junto e diz qual é, para quem enxerga a
  // tela e para quem a ouve.
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

  // O recado aparece sempre no topo, mesmo quando acusa um campo. Já aconteceu
  // de ele acusar um campo que esta tela não desenha — a situação, que só o
  // painel oferece — e então não aparecer em canto nenhum: o formulário
  // limpava e o gestor ficava sem saber o que houve. Um lugar fixo não tem
  // como sumir.
  //
  // O campo acusado não repete a frase: ganha a borda vermelha, o foco, e
  // aponta para o recado do topo, que é o que o leitor de tela anuncia.
  const acusado = (name: string) => state.field === name;

  const painel = onCancel !== undefined;

  return (
    <form
      ref={formRef}
      // O envio é `onSubmit` e não `action` porque o React limpa o formulário
      // assim que uma action passada por `action` termina — inclusive quando
      // ela volta com erro. Perder catorze campos preenchidos para reler uma
      // frase de validação é o oposto do que a frase pede.
      onSubmit={(event) => {
        event.preventDefault();
        const dados = new FormData(event.currentTarget);
        startTransition(() => formAction(dados));
      }}
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
        {state.error && (
          <p
            id={FORM_ERROR_ID}
            role="alert"
            className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {state.error}
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
            invalid={acusado("plate")}
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
            invalid={acusado("brand")}
          />
          <Field
            name="model"
            label="Modelo"
            required
            defaultValue={vehicle?.model}
            invalid={acusado("model")}
          />
          <Field
            name="year"
            label="Ano"
            type="number"
            required
            defaultValue={value(vehicle?.year)}
            invalid={acusado("year")}
          />
          <ColorPicker current={vehicle?.color ?? null} />
          <Field
            name="mileage"
            label="Km"
            type="number"
            defaultValue={value(vehicle?.mileage)}
            invalid={acusado("mileage")}
            className="text-right"
          />
          <Field
            name="revisionIntervalKm"
            label="Revisão a cada (km)"
            type="number"
            min={1}
            step="1"
            defaultValue={value(vehicle?.revisionIntervalKm)}
            placeholder={
              revisionDefault ? formatInteger(revisionDefault) : undefined
            }
            invalid={acusado("revisionIntervalKm")}
            className="text-right"
          />

          {!vehicle && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="status">Situação</Label>
              <Select
                name="status"
                value={status}
                onValueChange={(escolhida) =>
                  setStatus(escolhida as VehicleStatus)
                }
              >
                <SelectTrigger id="status" className="w-full">
                  {/* Sem isto o gatilho mostra o valor cru — "available" em vez
                      de "Disponível". Quem sabe traduzir é o mapa de rótulos. */}
                  <SelectValue>
                    {(valor: VehicleStatus) => STATUS_LABELS[valor]}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <StatusOptions />
                </SelectContent>
              </Select>
            </div>
          )}

          <Field
            name="weeklyPrice"
            label="R$/semana"
            type="number"
            step="0.01"
            defaultValue={value(vehicle?.weeklyPrice)}
            invalid={acusado("weeklyPrice")}
            className="text-right"
          />
          <Field
            name="licensingDueDate"
            label="Licenciamento"
            type="date"
            defaultValue={value(vehicle?.licensingDueDate)}
            invalid={acusado("licensingDueDate")}
          />
          <Field
            name="chassis"
            label="Chassi"
            defaultValue={value(vehicle?.chassis)}
            invalid={acusado("chassis")}
            className="font-mono"
          />
          <Field
            name="renavam"
            label="Renavam"
            defaultValue={value(vehicle?.renavam)}
            invalid={acusado("renavam")}
            className="font-mono"
          />
          <Field
            name="fipeValue"
            label="FIPE"
            type="number"
            step="0.01"
            defaultValue={value(vehicle?.fipeValue)}
            invalid={acusado("fipeValue")}
            className="text-right"
          />
          <Field
            name="purchaseValue"
            label="Compra"
            type="number"
            step="0.01"
            defaultValue={value(vehicle?.purchaseValue)}
            invalid={acusado("purchaseValue")}
            className="text-right"
          />
          <Field
            name="purchaseDate"
            label="Comprada em"
            type="date"
            defaultValue={value(vehicle?.purchaseDate)}
            invalid={acusado("purchaseDate")}
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
          <CrlvDropzone
            name={crlv}
            onPick={setCrlv}
            invalid={acusado("crlv")}
          />
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
        {/* Ferramenta de desenvolvimento: em produção ela não se desenha. */}
        <AutofillButton />

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
 * A cor da moto, escolhida em vez de digitada.
 *
 * A coluna é texto livre e continua sendo: o que vai para o banco é o nome da
 * amostra. Digitar deixava "Preta", "preto" e "PRETA" conviverem na mesma
 * frota, e o ponto de cor da lista — que é o que o gestor compara — só entende
 * o que está no mapa.
 *
 * A cor já guardada que não estiver entre as oferecidas ganha uma amostra
 * própria, com o nome como está no banco: escolher de uma lista não pode
 * apagar o que alguém escreveu antes dela existir.
 */
function ColorPicker({ current }: { current: string | null }) {
  const oferecidas = VEHICLE_COLORS.map(({ name, hex }) => ({ name, hex }));
  const conhecida = oferecidas.some((cor) => cor.name === current);
  const cores =
    current && !conhecida
      ? [...oferecidas, { name: current, hex: vehicleColor(current) }]
      : oferecidas;

  return (
    <div className="col-span-2 flex flex-col gap-1.5 @2xl:col-span-1">
      <Label>Cor</Label>
      <RadioGroup
        name="color"
        defaultValue={current ?? undefined}
        className="flex h-8 flex-wrap items-center gap-2"
      >
        {cores.map(({ name, hex }) => (
          <RadioGroupItem
            key={name}
            value={name}
            aria-label={name}
            title={name}
            style={{ background: hex }}
            // A bolinha branca do meio some: numa amostra branca ela não se vê.
            // Quem diz o que está escolhido é o anel em volta, que funciona
            // sobre qualquer cor.
            className="size-6 border-border data-checked:border-border data-checked:ring-2 data-checked:ring-primary data-checked:ring-offset-2 data-checked:ring-offset-card [&_[data-slot=radio-group-indicator]]:hidden"
          />
        ))}
      </RadioGroup>
    </div>
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
  invalid,
}: {
  name: string | null;
  onPick: (name: string | null) => void;
  invalid?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor="crlv">Documentos</Label>
      <label
        className={cn(
          "relative flex h-[84px] cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed text-center text-xs transition-colors",
          invalid
            ? "border-destructive text-destructive"
            : "border-input text-muted-foreground hover:border-primary",
        )}
      >
        <input
          id="crlv"
          type="file"
          name="crlv"
          accept="image/*,application/pdf"
          aria-describedby={invalid ? FORM_ERROR_ID : undefined}
          onChange={(event) => onPick(event.target.files?.[0]?.name ?? null)}
          className="absolute inset-0 cursor-pointer opacity-0"
        />
        <Upload aria-hidden className="size-4" />
        {name ?? "Arraste o CRLV aqui, ou clique para escolher"}
      </label>
    </div>
  );
}
