"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  MAX_AMOUNT,
  optionalField,
  optionalNumber,
  requiredField,
} from "@/lib/form";
import { createClient } from "@/lib/supabase/server";
import { UserError } from "@/lib/user-error";
import {
  createVehicle,
  removeVehicle,
  setVehicleStatus,
  updateVehicle,
  VEHICLE_STATUSES,
  type NewVehicle,
  type VehicleStatus,
} from "@/modules/fleet";

const CURRENT_YEAR = new Date().getFullYear();

export type FormState = { error?: string };

/**
 * Devolve o erro em vez de lançar.
 *
 * Erro lançado de Server Action chega ao browser como um digest opaco em
 * produção — o gestor veria "algo deu errado" no lugar de "já existe um
 * veículo com essa placa". Só mensagem marcada como `UserError` vai para a
 * tela; o resto vira recado genérico para não vazar o schema.
 */
/**
 * O cadastro como o formulário o entrega.
 *
 * Serve o cadastro novo e a correção do existente: é o mesmo formulário, e
 * duas leituras dele acabariam divergindo no primeiro campo que mudasse.
 */
function vehicleFromForm(formData: FormData): NewVehicle {
  // `year` é smallint no banco: sem faixa aqui, 99999 vira erro de overflow.
  const year = Number(requiredField(formData, "year", "Ano"));
  if (!Number.isInteger(year) || year < 1900 || year > CURRENT_YEAR + 1) {
    throw new UserError("Ano inválido");
  }

  return {
    plate: requiredField(formData, "plate", "Placa"),
    brand: requiredField(formData, "brand", "Marca"),
    model: requiredField(formData, "model", "Modelo"),
    year,
    category: requiredField(formData, "category", "Categoria"),
    chassis: optionalField(formData, "chassis"),
    renavam: optionalField(formData, "renavam"),
    color: optionalField(formData, "color"),
    mileage: optionalNumber(formData, "mileage", "Quilometragem", {
      // Nenhum veículo roda dez milhões de km, e `integer` estoura em 2 bi.
      max: 9_999_999,
      integer: true,
    }),
    licensingDueDate: optionalField(formData, "licensingDueDate"),
    fipeValue: optionalNumber(formData, "fipeValue", "Valor FIPE", {
      max: MAX_AMOUNT,
    }),
    weeklyPrice: optionalNumber(formData, "weeklyPrice", "Valor semanal", {
      max: MAX_AMOUNT,
    }),
    purchaseValue: optionalNumber(
      formData,
      "purchaseValue",
      "Valor de compra",
      {
        max: MAX_AMOUNT,
      },
    ),
    purchaseDate: optionalField(formData, "purchaseDate"),
    notes: optionalField(formData, "notes"),
  };
}

export async function addVehicle(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    const vehicle = vehicleFromForm(formData);

    // O client autenticado é argumento da função de domínio, nunca criado por
    // ela: é o que deixa o teste rodar a mesma função como outra locadora.
    const client = await createClient();

    await createVehicle(client, vehicle);
  } catch (error) {
    if (error instanceof UserError) return { error: error.message };

    console.error("Falha ao cadastrar veículo", error);
    return { error: "Não foi possível cadastrar o veículo. Tente de novo." };
  }

  revalidatePath("/fleet");
  return {};
}

/**
 * Altera a situação de um veículo da locadora de quem está logado.
 *
 * O `id` vem do formulário, ou seja, do browser: ninguém garante que é um
 * veículo da locadora certa. Quem garante é a RLS — se a linha não for dela, o
 * update não acha nada e o gestor recebe "veículo não encontrado", a mesma
 * resposta que receberia para um id inventado.
 */
export async function changeVehicleStatus(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    const status = requiredField(formData, "status", "Situação");
    if (!VEHICLE_STATUSES.includes(status as VehicleStatus)) {
      throw new UserError("Situação inválida");
    }

    const client = await createClient();
    const vehicle = await setVehicleStatus(
      client,
      requiredField(formData, "id", "Veículo"),
      status as VehicleStatus,
    );

    if (!vehicle) throw new UserError("Veículo não encontrado.");
  } catch (error) {
    if (error instanceof UserError) return { error: error.message };

    console.error("Falha ao alterar a situação do veículo", error);
    return { error: "Não foi possível alterar a situação. Tente de novo." };
  }

  revalidatePath("/fleet");
  return {};
}

/**
 * Corrige o cadastro de um veículo e volta para a frota.
 *
 * O `id` vem do formulário, ou seja, do browser. Quem garante que ele é da
 * locadora certa é a RLS: veículo de outra locadora não é achado pelo update,
 * e o gestor recebe o mesmo recado de id inventado.
 */
export async function editVehicle(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    const vehicle = vehicleFromForm(formData);
    const client = await createClient();

    const updated = await updateVehicle(
      client,
      requiredField(formData, "id", "Veículo"),
      vehicle,
    );

    if (!updated) throw new UserError("Veículo não encontrado.");
  } catch (error) {
    if (error instanceof UserError) return { error: error.message };

    console.error("Falha ao editar veículo", error);
    return { error: "Não foi possível salvar as alterações. Tente de novo." };
  }

  revalidatePath("/fleet");
  redirect("/fleet");
}

/** Dá baixa num veículo: ele sai da lista e a linha fica no banco. */
export async function discardVehicle(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    const client = await createClient();
    const removed = await removeVehicle(
      client,
      requiredField(formData, "id", "Veículo"),
    );

    if (!removed) throw new UserError("Veículo não encontrado.");
  } catch (error) {
    if (error instanceof UserError) return { error: error.message };

    console.error("Falha ao remover veículo", error);
    return { error: "Não foi possível remover o veículo. Tente de novo." };
  }

  revalidatePath("/fleet");
  redirect("/fleet");
}
