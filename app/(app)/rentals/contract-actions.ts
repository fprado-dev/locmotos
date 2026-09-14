"use server";

import { revalidatePath } from "next/cache";
import { managerLabel } from "@/app/ui";
import { requiredField } from "@/lib/form";
import { createClient } from "@/lib/supabase/server";
import { UserError } from "@/lib/user-error";
import { attachContract } from "@/modules/rentals";
import { currentTenant } from "@/modules/tenants";

export type ContractState = { error?: string; field?: string; done?: string };

/**
 * Anexa — ou substitui — o contrato assinado de uma locação.
 *
 * Revalida `/rentals` inteiro e não só o painel: o recorte "Sem contrato" é
 * um contador da lista, e anexar aqui tem que fazê-lo descer lá.
 */
export async function saveContract(
  _state: ContractState,
  formData: FormData,
): Promise<ContractState> {
  const rentalId = requiredField(formData, "rentalId", "Locação");

  try {
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) {
      throw new UserError("Escolha o arquivo do contrato.", "file");
    }

    const client = await createClient();

    await attachContract(client, rentalId, file, {
      signedOn: requiredField(formData, "signedOn", "Data da assinatura"),
      // Quem anexou não vem do formulário: campo escondido é campo que o
      // browser pode reescrever, e este nome assina o registro.
      by: managerLabel((await currentTenant(client))?.name),
    });
  } catch (error) {
    if (error instanceof UserError) {
      return { error: error.message, field: error.field };
    }

    console.error("Falha ao anexar contrato", error);
    return { error: "Não foi possível anexar o contrato. Tente de novo." };
  }

  revalidatePath("/rentals");
  return { done: "Contrato anexado." };
}
