"use server";

import { revalidatePath } from "next/cache";
import { brasiliaMoment } from "@/lib/calendar";
import {
  MAX_AMOUNT,
  optionalField,
  optionalNumber,
  requiredField,
} from "@/lib/form";
import { createClient } from "@/lib/supabase/server";
import { UserError } from "@/lib/user-error";
import { deleteViolation, recordViolation } from "@/modules/rentals";

/**
 * O que o registro de uma infração tem a contar.
 *
 * `done` traz a frase pronta com a atribuição dentro: registrar a infração e
 * descobrir de quem ela é são o mesmo ato para o gestor, e é essa resposta que
 * ele veio buscar.
 */
export type ViolationState = { error?: string; field?: string; done?: string };

/**
 * As telas que uma infração mexe.
 *
 * A ficha da moto é onde ela nasce; o painel do locatário é onde ela vira
 * cobrança de conversa. Registrar numa tem que aparecer na outra.
 */
function revalidateViolations(vehicleId: string) {
  revalidatePath(`/fleet/${vehicleId}`);
  revalidatePath("/renters");
}

/** Registra uma infração numa moto, e diz de quem ela ficou. */
export async function saveViolation(
  _state: ViolationState,
  formData: FormData,
): Promise<ViolationState> {
  const vehicleId = requiredField(formData, "vehicleId", "Moto");
  let frase: string;

  try {
    const client = await createClient();

    const infração = await recordViolation(client, vehicleId, {
      noticeNumber: optionalField(formData, "noticeNumber"),
      // O que foi digitado é hora de Brasília, que é a que está impressa na
      // notificação — e a mesma que o banco usa para decidir o dono.
      occurredAt: brasiliaMoment(
        requiredField(formData, "occurredAt", "Data e hora"),
      ),
      description: requiredField(formData, "description", "O que foi"),
      amount: optionalNumber(formData, "amount", "Valor", { max: MAX_AMOUNT }),
      dueOn: optionalField(formData, "dueOn"),
    });

    frase =
      infração.renterName === null
        ? "Infração registrada."
        : `Infração registrada — a moto estava com ${infração.renterName}.`;
  } catch (error) {
    if (error instanceof UserError) {
      return { error: error.message, field: error.field };
    }

    // `brasiliaMoment` recusa o que não é instante; o resto é erro de verdade.
    if (error instanceof RangeError) {
      return { error: "Data e hora inválidas.", field: "occurredAt" };
    }

    console.error("Falha ao registrar infração", error);
    return { error: "Não foi possível registrar a infração. Tente de novo." };
  }

  revalidateViolations(vehicleId);
  return { done: frase };
}

/**
 * Apaga uma infração.
 *
 * Existe porque a linha nasce de um papel digitado à mão: infração lançada na
 * placa errada não é história, é lixo — e sem este caminho ela ficaria para
 * sempre na ficha da moto errada.
 */
export async function removeViolation(
  id: string,
  vehicleId: string,
): Promise<{ error?: string }> {
  try {
    await deleteViolation(await createClient(), id);
  } catch (error) {
    console.error("Falha ao apagar infração", error);
    return { error: "Não foi possível apagar a infração." };
  }

  revalidateViolations(vehicleId);
  return {};
}
