"use server";

import { revalidatePath } from "next/cache";
import { brasiliaMoment } from "@/lib/calendar";
import { optionalField, requiredField } from "@/lib/form";
import { createClient } from "@/lib/supabase/server";
import { UserError } from "@/lib/user-error";
import { managerLabel } from "@/app/ui";
import { currentTenant } from "@/modules/tenants";
import {
  deleteIncident,
  recordIncident,
  INCIDENT_KINDS,
  type IncidentKind,
} from "@/modules/rentals";

/**
 * O que o registro de um sinistro tem a contar.
 *
 * `done` traz a frase pronta com a atribuição dentro: registrar o sinistro e
 * descobrir quem estava com a moto são o mesmo ato para o gestor. `discardable`
 * é o id do sinistro quando ele foi de perda total — a tela **oferece** a baixa
 * em seguida, e não a faz sozinha.
 */
export type IncidentState = {
  error?: string;
  field?: string;
  done?: string;
  discardable?: { incidentId: string; plate: string };
};

/**
 * As telas que um sinistro mexe.
 *
 * A ficha da moto é onde ele nasce; o painel do locatário é onde ele vira
 * conversa sobre caução e sobre alugar de novo.
 */
function revalidateIncidents(vehicleId: string) {
  revalidatePath(`/fleet/${vehicleId}`);
  revalidatePath("/fleet");
  revalidatePath("/renters");
}

/** Registra um sinistro numa moto, e diz quem estava com ela. */
export async function saveIncident(
  _state: IncidentState,
  formData: FormData,
): Promise<IncidentState> {
  const vehicleId = requiredField(formData, "vehicleId", "Moto");
  let resultado: IncidentState;

  try {
    const kind = requiredField(formData, "kind", "Tipo") as IncidentKind;
    if (!INCIDENT_KINDS.includes(kind)) {
      throw new UserError("Tipo de sinistro inválido.", "kind");
    }

    const client = await createClient();

    const sinistro = await recordIncident(client, vehicleId, {
      kind,
      // O que foi digitado é hora de Brasília, que é a mesma que o banco usa
      // para decidir quem estava com a moto.
      occurredAt: brasiliaMoment(
        requiredField(formData, "occurredAt", "Data e hora"),
      ),
      description: requiredField(formData, "description", "O que aconteceu"),
      policeReport: optionalField(formData, "policeReport"),
      insurer: optionalField(formData, "insurer"),
      insurerNotifiedOn: optionalField(formData, "insurerNotifiedOn"),
      // Quem registrou não vem do formulário: campo escondido é campo que o
      // browser pode reescrever, e o nome gravado responde por uma decisão.
      by: managerLabel((await currentTenant(client))?.name),
    });

    resultado = {
      done:
        sinistro.renterName === null
          ? "Sinistro registrado."
          : `Sinistro registrado — a moto estava com ${sinistro.renterName}.`,
      // Perda total tira a moto da frota para sempre, mas quem sabe que o
      // laudo da seguradora já saiu é o gestor. O sistema oferece; não decide.
      ...(sinistro.kind === "total_loss"
        ? {
            discardable: {
              incidentId: sinistro.id,
              plate: sinistro.vehicle.plate,
            },
          }
        : {}),
    };
  } catch (error) {
    if (error instanceof UserError) {
      return { error: error.message, field: error.field };
    }

    // `brasiliaMoment` recusa o que não é instante; o resto é erro de verdade.
    if (error instanceof RangeError) {
      return { error: "Data e hora inválidas.", field: "occurredAt" };
    }

    console.error("Falha ao registrar sinistro", error);
    return { error: "Não foi possível registrar o sinistro. Tente de novo." };
  }

  revalidateIncidents(vehicleId);
  return resultado;
}

/**
 * Apaga um sinistro.
 *
 * Como na infração: a linha nasce de alguém digitando, e a placa errada é o
 * engano que esta tela convida a cometer. A baixa que apontava para ele fica
 * de pé e sem o link — desfazer uma baixa é outro ato.
 */
export async function removeIncident(
  id: string,
  vehicleId: string,
): Promise<{ error?: string }> {
  try {
    await deleteIncident(await createClient(), id);
  } catch (error) {
    console.error("Falha ao apagar sinistro", error);
    return { error: "Não foi possível apagar o sinistro." };
  }

  revalidateIncidents(vehicleId);
  return {};
}
