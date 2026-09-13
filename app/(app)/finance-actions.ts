"use server";

import { revalidatePath } from "next/cache";
import { managerLabel } from "@/app/ui";
import { createClient } from "@/lib/supabase/server";
import { UserError } from "@/lib/user-error";
import { payCharge, reversePayment } from "@/modules/rentals";
import { currentTenant } from "@/modules/tenants";

/**
 * O que um lançamento de pagamento tem a contar.
 *
 * `done` traz a frase pronta porque quem chama são dois painéis, em duas
 * telas, e a confirmação é a mesma nos dois — "a semana de 1º/09 está paga".
 */
export type PaymentState = { error?: string; field?: string; done?: string };

/** "2026-09-19" vira "19/09". */
function shortDay(date: string): string {
  const [, mês, dia] = date.split("-");
  return `${dia}/${mês}`;
}

/**
 * Quem fica registrado como responsável, como na restrição.
 *
 * O nome é gravado como está agora: a locadora pode ser renomeada, e o que
 * valeu foi o nome de então.
 */
async function responsible(client: Awaited<ReturnType<typeof createClient>>) {
  return managerLabel((await currentTenant(client))?.name);
}

/**
 * As duas telas que mostram dinheiro, revalidadas juntas.
 *
 * Um pagamento mexe na coluna Financeiro das duas listas, no card
 * "Inadimplentes" e no chip de inadimplência — e o gestor pode ter chegado
 * aqui por qualquer uma das duas.
 */
function revalidateMoney() {
  revalidatePath("/renters");
  revalidatePath("/rentals");
}

/** Registra que uma cobrança foi paga. */
export async function registerPayment(
  _state: PaymentState,
  formData: FormData,
): Promise<PaymentState> {
  let frase: string;

  try {
    const chargeId = formData.get("chargeId");
    if (typeof chargeId !== "string" || !chargeId) {
      throw new UserError("Cobrança não encontrada.");
    }

    const receivedOn = formData.get("receivedOn");

    const client = await createClient();
    const payment = await payCharge(client, chargeId, {
      receivedOn: typeof receivedOn === "string" ? receivedOn : null,
      by: await responsible(client),
    });

    frase = `A semana de ${shortDay(payment.cycle.start)} está paga.`;
  } catch (error) {
    if (error instanceof UserError) {
      return { error: error.message, field: error.field };
    }

    console.error("Falha ao registrar pagamento", error);
    return { error: "Não foi possível registrar o pagamento. Tente de novo." };
  }

  revalidateMoney();
  return { done: frase };
}

/** Desfaz um pagamento lançado errado: a cobrança volta para o vermelho. */
export async function undoPayment(paymentId: string): Promise<PaymentState> {
  let frase: string;

  try {
    const client = await createClient();
    const payment = await reversePayment(client, paymentId, {
      by: await responsible(client),
    });

    if (!payment) {
      throw new UserError("Este pagamento já tinha sido desfeito.");
    }

    frase = `A semana de ${shortDay(payment.cycle.start)} voltou para as cobranças em aberto.`;
  } catch (error) {
    if (error instanceof UserError) return { error: error.message };

    console.error("Falha ao desfazer pagamento", error);
    return { error: "Não foi possível desfazer o pagamento. Tente de novo." };
  }

  revalidateMoney();
  return { done: frase };
}
