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
    throw new Error(`Campo obrigatório: ${label}`);
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

/** Número opcional, recusado se vier preenchido com coisa que não é número. */
export function optionalNumber(
  formData: FormData,
  field: string,
  label: string,
): number | null {
  const value = optionalField(formData, field);
  if (value === null) return null;

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`${label}: número inválido`);

  return parsed;
}
