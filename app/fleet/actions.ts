"use server";

import { revalidatePath } from "next/cache";
import { optionalField, optionalNumber, requiredField } from "@/lib/form";
import { createClient } from "@/lib/supabase/server";
import { createVehicle } from "@/modules/fleet";

const CURRENT_YEAR = new Date().getFullYear();

export async function addVehicle(formData: FormData) {
  // `year` é smallint no banco: sem faixa aqui, 99999 vira erro 500 de overflow.
  const year = Number(requiredField(formData, "year", "Ano"));
  if (!Number.isInteger(year) || year < 1900 || year > CURRENT_YEAR + 1) {
    throw new Error("Ano inválido");
  }

  // O client autenticado é argumento da função de domínio, nunca criado por
  // ela: é o que deixa o teste rodar a mesma função como outra locadora.
  const client = await createClient();

  await createVehicle(client, {
    plate: requiredField(formData, "plate", "Placa"),
    brand: requiredField(formData, "brand", "Marca"),
    model: requiredField(formData, "model", "Modelo"),
    year,
    vin: optionalField(formData, "vin"),
    renavam: optionalField(formData, "renavam"),
    color: optionalField(formData, "color"),
    mileage: optionalNumber(formData, "mileage", "Quilometragem"),
    licensingDueOn: optionalField(formData, "licensingDueOn"),
    fipeValue: optionalNumber(formData, "fipeValue", "Valor FIPE"),
    weeklyRate: optionalNumber(formData, "weeklyRate", "Valor semanal"),
    purchaseValue: optionalNumber(formData, "purchaseValue", "Valor de compra"),
    purchasedOn: optionalField(formData, "purchasedOn"),
    notes: optionalField(formData, "notes"),
  });

  revalidatePath("/fleet");
}
