"use client";

import {
  startTransition,
  useActionState,
  useEffect,
  useRef,
  useState,
} from "react";
import { AutofillButton } from "@/app/dev/autofill-button";
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
import { formatCpf, formatWhatsapp, type Renter } from "@/modules/renters";
import { addRenter, editRenter, type FormState } from "./actions";

/** Onde o recado do formulário mora, para os campos poderem apontar para ele. */
const FORM_ERROR_ID = "renter-form-error";

/**
 * As categorias de CNH que interessam a uma locadora de motos.
 *
 * Todas incluem o A: sem ele a pessoa não pode pilotar o que a locadora aluga,
 * e oferecer B numa lista de cadastro de locatário de moto seria convidar o
 * erro. Quem tem só B não entra nesta lista — entra na conversa.
 */
const CNH_CATEGORIES = ["A", "AB", "AC", "AD", "AE"] as const;

/** Um campo do formulário: rótulo em cima, campo embaixo. */
function Field({
  name,
  label,
  type = "text",
  required = false,
  inputMode,
  defaultValue,
  placeholder,
  className,
  fieldClassName,
  invalid,
}: {
  name: string;
  label: string;
  type?: string;
  required?: boolean;
  inputMode?: "numeric" | "tel";
  defaultValue?: string;
  placeholder?: string;
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
        inputMode={inputMode}
        required={required}
        defaultValue={defaultValue}
        placeholder={placeholder}
        aria-invalid={invalid ? true : undefined}
        aria-describedby={invalid ? FORM_ERROR_ID : undefined}
        className={className}
      />
    </div>
  );
}

const initialState: FormState = {};

/**
 * O formulário do cadastro de locatário, no cadastro novo e na correção.
 *
 * É o mesmo formulário porque são os mesmos campos: separar em dois faria as
 * duas telas divergirem no primeiro campo que alguém acrescentasse.
 *
 * O CPF e o WhatsApp são mostrados pontuados e guardados só em dígitos — quem
 * digita copia do documento, com ponto e traço, e quem compara precisa dos
 * dígitos. A tradução é do módulo, nos dois sentidos.
 */
export function RenterForm({
  renter,
  onCancel,
  onSaved,
}: {
  renter?: Renter;
  onCancel?: () => void;
  onSaved?: (created: { id: string; name: string }) => void;
}) {
  // Controlado, e não `defaultValue`: sem valor escolhido o select do Base UI
  // manda string vazia. O cadastro abre em A, que é a categoria que a locadora
  // exige para entregar uma moto.
  const [cnhCategory, setCnhCategory] = useState(renter?.cnhCategory ?? "A");
  const formRef = useRef<HTMLFormElement>(null);

  const [state, formAction, pending] = useActionState(
    // O aviso de sucesso sai daqui e não de um efeito: o cadastro termina uma
    // vez, e um efeito sobre o estado avisaria de novo a cada render do painel.
    async (previous: FormState, formData: FormData) => {
      const next = await (renter ? editRenter : addRenter)(previous, formData);

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

  // O recado aparece sempre no topo, mesmo quando acusa um campo: um lugar fixo
  // não tem como sumir. O campo acusado não repete a frase — ganha a borda
  // vermelha, o foco, e aponta para o recado do topo, que é o que o leitor de
  // tela anuncia.
  const acusado = (name: string) => state.field === name;

  return (
    <form
      ref={formRef}
      // O envio é `onSubmit` e não `action` porque o React limpa o formulário
      // assim que uma action passada por `action` termina — inclusive quando
      // ela volta com erro, que é quando o que foi digitado ainda importa.
      onSubmit={(event) => {
        event.preventDefault();
        const dados = new FormData(event.currentTarget);
        startTransition(() => formAction(dados));
      }}
      data-autofill
      className="@container flex min-h-0 flex-1 flex-col"
    >
      {renter && <input type="hidden" name="id" value={renter.id} />}

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

        <div className="grid grid-cols-2 gap-x-3 gap-y-4">
          <Field
            name="name"
            label="Nome"
            required
            defaultValue={renter?.name}
            invalid={acusado("name")}
            // O nome é o que identifica a pessoa: abre o formulário sozinho na
            // linha, e não espremido ao lado do CPF.
            fieldClassName="col-span-2"
          />
          <Field
            name="cpf"
            label="CPF"
            required
            inputMode="numeric"
            placeholder="000.000.000-00"
            defaultValue={renter && formatCpf(renter.cpf)}
            invalid={acusado("cpf")}
            className="font-mono"
          />
          <Field
            name="whatsapp"
            label="WhatsApp"
            type="tel"
            inputMode="tel"
            placeholder="(11) 98231-0475"
            defaultValue={formatWhatsapp(renter?.whatsapp ?? null) ?? undefined}
            invalid={acusado("whatsapp")}
            className="tabular-nums"
          />

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cnhCategory">Categoria CNH</Label>
            <Select
              name="cnhCategory"
              value={cnhCategory}
              onValueChange={(escolhida) => setCnhCategory(String(escolhida))}
            >
              <SelectTrigger id="cnhCategory" className="w-full font-mono">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CNH_CATEGORIES.map((categoria) => (
                  <SelectItem key={categoria} value={categoria}>
                    {categoria}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Field
            name="cnhDueDate"
            label="Validade da CNH"
            type="date"
            defaultValue={renter?.cnhDueDate ?? undefined}
            invalid={acusado("cnhDueDate")}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="notes">Observações</Label>
          <Textarea
            id="notes"
            name="notes"
            rows={2}
            defaultValue={renter?.notes ?? undefined}
          />
        </div>
      </div>

      <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border px-6 py-4">
        {/* Ferramenta de desenvolvimento: em produção ela não se desenha. */}
        <AutofillButton />

        {onCancel && (
          <Button type="button" variant="outline" size="lg" onClick={onCancel}>
            Cancelar
          </Button>
        )}
        <Button type="submit" size="lg" disabled={pending}>
          {renter
            ? pending
              ? "Salvando…"
              : "Salvar"
            : pending
              ? "Cadastrando…"
              : "Salvar locatário"}
        </Button>
      </div>
    </form>
  );
}
