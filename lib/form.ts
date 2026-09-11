/**
 * Campo de texto obrigatório vindo de um formulário.
 *
 * `FormData` chega do browser: nada aqui é confiável antes de ser checado.
 */
export function requiredField(formData: FormData, field: string): string {
  const value = formData.get(field);

  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Campo obrigatório: ${field}`);
  }

  return value.trim();
}
