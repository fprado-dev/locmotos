"use server";

import { revalidatePath } from "next/cache";
import { managerLabel } from "@/app/ui";
import { MAX_AMOUNT, optionalField, requiredField } from "@/lib/form";
import { createClient } from "@/lib/supabase/server";
import { UserError } from "@/lib/user-error";
import {
  deleteExpense,
  EXPENSE_CATEGORIES,
  recordExpense,
  type ExpenseCategory,
} from "@/modules/finance";
import { currentTenant } from "@/modules/tenants";

/** O que o lançamento de uma despesa tem a contar. */
export type ExpenseState = { error?: string; field?: string; done?: string };

/** A categoria que veio do formulário, que veio do browser. */
function category(formData: FormData): ExpenseCategory {
  const value = formData.get("category");
  const known = EXPENSE_CATEGORIES.find((conhecida) => conhecida === value);

  if (!known) throw new UserError("Escolha uma categoria.", "category");
  return known;
}

/**
 * O valor em reais, obrigatório.
 *
 * `optionalNumber` não serve: ele aceita branco, e despesa sem valor não é
 * despesa. A faixa é a da coluna `numeric(10,2)` — estouro de coluna chega ao
 * gestor como erro 500, não como recado.
 */
function amount(formData: FormData): number {
  const raw = requiredField(formData, "amount", "Valor");
  const parsed = Number(raw);

  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > MAX_AMOUNT) {
    throw new UserError("Valor inválido.", "amount");
  }

  return parsed;
}

/** Lança uma saída de caixa. */
export async function saveExpense(
  _state: ExpenseState,
  formData: FormData,
): Promise<ExpenseState> {
  try {
    const client = await createClient();

    await recordExpense(client, {
      spentOn: requiredField(formData, "spentOn", "Quando"),
      amount: amount(formData),
      description: requiredField(formData, "description", "O que foi"),
      category: category(formData),
      vehicleId: optionalField(formData, "vehicleId"),
      // O nome é gravado como está agora: a locadora pode ser renomeada, e
      // quem lançou foi o nome de então. É o mesmo que o pagamento faz.
      by: managerLabel((await currentTenant(client))?.name),
    });
  } catch (error) {
    if (error instanceof UserError) {
      return { error: error.message, field: error.field };
    }

    console.error("Falha ao lançar despesa", error);
    return { error: "Não foi possível lançar a despesa. Tente de novo." };
  }

  revalidatePath("/finance");
  return { done: "Despesa lançada." };
}

/**
 * Apaga uma despesa.
 *
 * Entrada não tem equivalente: desfazer um pagamento é estorná-lo, e o estorno
 * **registra** o desfazimento em vez de sumir com a linha.
 */
export async function removeExpense(id: string): Promise<{ error?: string }> {
  try {
    await deleteExpense(await createClient(), id);
  } catch (error) {
    console.error("Falha ao apagar despesa", error);
    return { error: "Não foi possível apagar a despesa." };
  }

  revalidatePath("/finance");
  return {};
}
