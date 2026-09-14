"use server";

import { revalidatePath } from "next/cache";
import { managerLabel } from "@/app/ui";
import {
  MAX_AMOUNT,
  optionalField,
  optionalNumber,
  requiredField,
} from "@/lib/form";
import { createClient } from "@/lib/supabase/server";
import { UserError } from "@/lib/user-error";
import {
  MAINTENANCE_KINDS,
  openMaintenance,
  updateMaintenance,
  deleteMaintenance,
  type MaintenanceKind,
} from "@/modules/maintenance";
import { currentTenant } from "@/modules/tenants";

/** O teto do odômetro, que é o da coluna `integer` com folga de sobra. */
const MAX_ODOMETER = 999_999;

/** O que uma ordem de serviço tem a contar. */
export type MaintenanceState = {
  error?: string;
  field?: string;
  done?: string;
};

/** O tipo que veio do formulário, que veio do browser. */
function kind(formData: FormData): MaintenanceKind {
  const value = formData.get("kind");
  const known = MAINTENANCE_KINDS.find((conhecido) => conhecido === value);

  if (!known) throw new UserError("Escolha o tipo da manutenção.", "kind");
  return known;
}

/**
 * As três telas que uma manutenção mexe.
 *
 * A situação da moto é derivada dela, então abrir e fechar a ordem muda a
 * lista da Frota e os contadores dos chips — e o gestor pode ter chegado aqui
 * por qualquer uma das duas.
 */
function revalidateFleet(vehicleId: string) {
  revalidatePath(`/fleet/${vehicleId}`);
  revalidatePath("/fleet");
}

/** Manda a moto para a oficina. */
export async function startMaintenance(
  _state: MaintenanceState,
  formData: FormData,
): Promise<MaintenanceState> {
  const vehicleId = requiredField(formData, "vehicleId", "Moto");

  try {
    const client = await createClient();

    await openMaintenance(client, vehicleId, {
      kind: kind(formData),
      enteredOn: requiredField(formData, "enteredOn", "Entrada"),
      description: requiredField(formData, "description", "O que foi"),
      workshop: optionalField(formData, "workshop"),
      odometer: optionalNumber(formData, "odometer", "Quilometragem", {
        max: MAX_ODOMETER,
        integer: true,
      }),
      cost: optionalNumber(formData, "cost", "Custo", { max: MAX_AMOUNT }),
      // O nome é gravado como está agora: a locadora pode ser renomeada, e
      // quem abriu a ordem foi o nome de então.
      by: managerLabel((await currentTenant(client))?.name),
    });
  } catch (error) {
    if (error instanceof UserError) {
      return { error: error.message, field: error.field };
    }

    console.error("Falha ao abrir manutenção", error);
    return { error: "Não foi possível abrir a manutenção. Tente de novo." };
  }

  revalidateFleet(vehicleId);
  return { done: "A moto foi para a oficina." };
}

/**
 * Fecha — ou corrige — uma manutenção.
 *
 * Fechar e corrigir são o mesmo formulário porque são o mesmo ato para o
 * gestor: ele volta a esta tela quando a nota chega, e o que ele faz é
 * preencher o que faltava.
 */
export async function finishMaintenance(
  _state: MaintenanceState,
  formData: FormData,
): Promise<MaintenanceState> {
  const vehicleId = requiredField(formData, "vehicleId", "Moto");
  let voltou: boolean;

  try {
    const client = await createClient();
    const leftOn = optionalField(formData, "leftOn");

    await updateMaintenance(
      client,
      requiredField(formData, "id", "Manutenção"),
      {
        leftOn,
        description: requiredField(formData, "description", "O que foi"),
        workshop: optionalField(formData, "workshop"),
        odometer: optionalNumber(formData, "odometer", "Quilometragem", {
          max: MAX_ODOMETER,
          integer: true,
        }),
        cost: optionalNumber(formData, "cost", "Custo", { max: MAX_AMOUNT }),
      },
    );

    voltou = leftOn !== null;
  } catch (error) {
    if (error instanceof UserError) {
      return { error: error.message, field: error.field };
    }

    console.error("Falha ao atualizar manutenção", error);
    return { error: "Não foi possível salvar a manutenção. Tente de novo." };
  }

  revalidateFleet(vehicleId);
  return {
    done: voltou ? "A moto voltou para a frota." : "Manutenção atualizada.",
  };
}

/** Apaga uma manutenção — a ordem aberta na placa errada, normalmente. */
export async function removeMaintenance(
  id: string,
  vehicleId: string,
): Promise<{ error?: string }> {
  try {
    await deleteMaintenance(await createClient(), id);
  } catch (error) {
    console.error("Falha ao apagar manutenção", error);
    return { error: "Não foi possível apagar a manutenção." };
  }

  revalidateFleet(vehicleId);
  return {};
}
