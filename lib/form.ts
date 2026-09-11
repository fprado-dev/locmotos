import { UserError } from "./user-error";

/**
 * Campo de texto obrigatório vindo de um formulário.
 *
 * `FormData` chega do browser: nada aqui é confiável antes de ser checado.
 */
export function requiredField(
  formData: FormData,
  field: string,
  label: string,
): string {
  const value = formData.get(field);

  if (typeof value !== "string" || value.trim() === "") {
    throw new UserError(`Campo obrigatório: ${label}`);
  }

  return value.trim();
}

/** Campo de texto opcional: em branco vira ausente, não string vazia. */
export function optionalField(
  formData: FormData,
  field: string,
): string | null {
  const value = formData.get(field);
  if (typeof value !== "string" || value.trim() === "") return null;

  return value.trim();
}

/**
 * Número opcional, dentro do que a coluna aguenta.
 *
 * A faixa não é capricho: `numeric(10,2)` e `integer` estouram no banco, e
 * estouro de coluna chega ao gestor como erro 500, não como recado.
 */
export function optionalNumber(
  formData: FormData,
  field: string,
  label: string,
  { max, integer = false }: { max: number; integer?: boolean },
): number | null {
  const value = optionalField(formData, field);
  if (value === null) return null;

  const parsed = Number(value);
  const valid =
    Number.isFinite(parsed) &&
    parsed >= 0 &&
    parsed <= max &&
    (!integer || Number.isInteger(parsed));

  if (!valid) throw new UserError(`${label}: valor inválido`);

  return parsed;
}

/** Teto de uma coluna `numeric(10,2)`. */
export const MAX_AMOUNT = 99_999_999.99;
