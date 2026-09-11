"use server";

import { revalidatePath } from "next/cache";
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
  setVehicleStatus,
  VEHICLE_STATUSES,
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
export async function addVehicle(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    // `year` é smallint no banco: sem faixa aqui, 99999 vira erro de overflow.
    const year = Number(requiredField(formData, "year", "Ano"));
    if (!Number.isInteger(year) || year < 1900 || year > CURRENT_YEAR + 1) {
      throw new UserError("Ano inválido");
    }

    // O client autenticado é argumento da função de domínio, nunca criado por
    // ela: é o que deixa o teste rodar a mesma função como outra locadora.
    const client = await createClient();

    await createVehicle(client, {
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
        { max: MAX_AMOUNT },
      ),
      purchaseDate: optionalField(formData, "purchaseDate"),
      notes: optionalField(formData, "notes"),
    });
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
