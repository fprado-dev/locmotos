"use server";

import { revalidatePath } from "next/cache";
import { MAX_AMOUNT, optionalField, optionalNumber } from "@/lib/form";
import { createClient } from "@/lib/supabase/server";
import { UserError } from "@/lib/user-error";
import { endRental } from "@/modules/rentals";

/**
 * O que o encerramento tem a contar.
 *
 * `done` traz a frase pronta: quem encerrou precisa ouvir que a moto voltou
 * para a frota, que é a consequência que ele não vê da tela onde está.
 */
export type EndingState = { error?: string; field?: string; done?: string };

/**
 * Encerra uma locação.
 *
 * A validação daqui é pouca de propósito — faixa e formato do que veio do
 * formulário. Quem recusa data no futuro, desconto maior que a caução,
 * desconto sem motivo e locação já encerrada é o módulo, num lugar só.
 */
export async function closeRental(
  _state: EndingState,
  formData: FormData,
): Promise<EndingState> {
  let frase: string;

  try {
    const id = formData.get("id");
    if (typeof id !== "string" || !id) {
      throw new UserError("Locação não encontrada.");
    }

    const client = await createClient();
    const rental = await endRental(client, id, {
      endedOn: optionalField(formData, "endedOn"),
      depositDiscount: optionalNumber(
        formData,
        "depositDiscount",
        "Desconto na caução",
        { max: MAX_AMOUNT },
      ),
      depositDiscountReason: optionalField(formData, "depositDiscountReason"),
      earlyTerminationFee: optionalNumber(
        formData,
        "earlyTerminationFee",
        "Valor cobrado na rescisão",
        { max: MAX_AMOUNT },
      ),
    });

    frase = `A ${rental.vehicle.plate} voltou para a frota.`;
  } catch (error) {
    if (error instanceof UserError) {
      return { error: error.message, field: error.field };
    }

    console.error("Falha ao encerrar locação", error);
    return { error: "Não foi possível encerrar a locação. Tente de novo." };
  }

  // O encerramento mexe nas três telas: a moto volta a disponível na Frota, a
  // pessoa fica sem locação em Locatários, e a locação sai das ativas.
  revalidatePath("/fleet");
  revalidatePath("/renters");
  revalidatePath("/rentals");
  return { done: frase };
}
