"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { managerLabel } from "@/app/ui";
import {
  MAX_AMOUNT,
  optionalField,
  optionalNumber,
  requiredField,
} from "@/lib/form";
import { createClient } from "@/lib/supabase/server";
import { UserError } from "@/lib/user-error";
import { openRental } from "@/modules/rentals";
import {
  createRenter,
  formatCpf,
  formatWhatsapp,
  liftRestriction,
  removeRenters,
  rentersByIds,
  restrictRenters,
  updateRenter,
  type NewRenter,
} from "@/modules/renters";
import { currentTenant } from "@/modules/tenants";

/**
 * O que uma ação de formulário tem a contar.
 *
 * `field` é o campo que o erro acusa, quando há um: é o que leva o foco ao
 * campo errado em vez de deixar o gestor procurar. `created` diz que um
 * cadastro novo entrou — sem ele o painel não teria como distinguir "acabou de
 * salvar" de "ainda não tentou", que são o mesmo `{}`.
 */
export type FormState = {
  error?: string;
  field?: string;
  created?: { id: string; name: string };
};

/**
 * O recado de um `UserError`, com o campo que ele acusa.
 *
 * O tipo é só o recado, e não um `FormState` inteiro, porque as ações desta
 * tela devolvem estados diferentes — o cadastro tem `created` com nome, a
 * locação com placa — e todos cabem num erro sem `created`.
 */
function userError(error: unknown): { error: string; field?: string } | null {
  return error instanceof UserError
    ? { error: error.message, field: error.field }
    : null;
}

/**
 * O cadastro como o formulário o entrega.
 *
 * Serve o cadastro novo e a correção do existente: é o mesmo formulário, e
 * duas leituras dele acabariam divergindo no primeiro campo que mudasse.
 */
function renterFromForm(formData: FormData): NewRenter {
  return {
    name: requiredField(formData, "name", "Nome"),
    cpf: requiredField(formData, "cpf", "CPF"),
    whatsapp: optionalField(formData, "whatsapp"),
    cnhCategory: optionalField(formData, "cnhCategory"),
    cnhDueDate: optionalField(formData, "cnhDueDate"),
    notes: optionalField(formData, "notes"),
  };
}

/** Cadastra um locatário na locadora de quem está logado. */
export async function addRenter(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  let novo: { id: string; name: string };

  try {
    const renter = renterFromForm(formData);

    // O client autenticado é argumento da função de domínio, nunca criado por
    // ela: é o que deixa o teste rodar a mesma função como outra locadora.
    const client = await createClient();
    const created = await createRenter(client, renter);
    novo = { id: created.id, name: created.name };
  } catch (error) {
    const recado = userError(error);
    if (recado) return recado;

    console.error("Falha ao cadastrar locatário", error);
    return { error: "Não foi possível cadastrar o locatário. Tente de novo." };
  }

  revalidatePath("/renters");
  return { created: novo };
}

/** Corrige o cadastro de um locatário. */
export async function editRenter(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const id = formData.get("id");

  try {
    if (typeof id !== "string" || !id) {
      throw new UserError("Locatário não encontrado.");
    }

    const client = await createClient();
    const renter = await updateRenter(client, id, renterFromForm(formData));

    if (!renter) throw new UserError("Locatário não encontrado.");
  } catch (error) {
    const recado = userError(error);
    if (recado) return recado;

    console.error("Falha ao corrigir o cadastro do locatário", error);
    return { error: "Não foi possível salvar o cadastro. Tente de novo." };
  }

  revalidatePath("/renters");
  // Salvou: a tela volta sem o painel aberto, com a lista já atualizada.
  redirect("/renters");
}

/**
 * O que a abertura de locação tem a contar.
 *
 * `created` traz a placa porque é o que o aviso de sucesso diz — "Ana está com
 * a ABC1D23" é a frase que o gestor confere contra a moto que ele acabou de
 * entregar. O nome quem já tem é a tela que abriu o painel.
 */
export type RentalFormState = {
  error?: string;
  field?: string;
  created?: { id: string; plate: string };
};

/**
 * Abre uma locação para um locatário.
 *
 * O quanto é validado aqui é pouco de propósito: faixa e formato do que veio
 * do formulário, e nada mais. Quem recusa locatário restrito, moto que não
 * está disponível e segunda locação na mesma moto é o módulo — e, no caso da
 * segunda locação, o índice único do banco atrás dele.
 */
export async function openNewRental(
  _state: RentalFormState,
  formData: FormData,
): Promise<RentalFormState> {
  let nova: { id: string; plate: string };

  try {
    const client = await createClient();

    const rental = await openRental(client, {
      renterId: requiredField(formData, "renterId", "Locatário"),
      vehicleId: requiredField(formData, "vehicleId", "Moto"),
      // Ausente vira 0 e o módulo recusa com a frase dele: o valor semanal é
      // obrigatório, e a regra mora num lugar só.
      weeklyPrice:
        optionalNumber(formData, "weeklyPrice", "Valor semanal", {
          max: MAX_AMOUNT,
        }) ?? 0,
      startedOn: optionalField(formData, "startedOn"),
      // Dezenove anos de fidelidade não é fidelidade, é erro de digitação — e
      // `smallint` estoura no banco antes de virar recado.
      commitmentMonths: optionalNumber(
        formData,
        "commitmentMonths",
        "Fidelidade",
        { max: 240, integer: true },
      ),
      deposit: optionalNumber(formData, "deposit", "Caução", {
        max: MAX_AMOUNT,
      }),
    });

    nova = { id: rental.id, plate: rental.vehicle.plate };
  } catch (error) {
    const recado = userError(error);
    if (recado) return recado;

    console.error("Falha ao abrir locação", error);
    return { error: "Não foi possível abrir a locação. Tente de novo." };
  }

  revalidatePath("/renters");
  revalidatePath("/fleet");
  return { created: nova };
}

/**
 * O que uma ação em lote tem a contar: o que deu errado, ou quantos mudaram.
 *
 * O número não é decoração. O gestor marcou cinco linhas; se voltaram três,
 * duas não eram da locadora dele — ou já estavam restritas — e ele precisa
 * saber disso antes de fechar a tela achando que aplicou em todas.
 */
export type BatchState = { error?: string; changed?: number };

/** Os ids vêm do browser como qualquer coisa; só passa lista de texto. */
function renterIds(ids: unknown): string[] {
  if (!Array.isArray(ids) || ids.length === 0) {
    throw new UserError("Nenhum locatário selecionado.");
  }

  const limpos = ids.filter(
    (id): id is string => typeof id === "string" && id.trim() !== "",
  );
  if (limpos.length === 0) throw new UserError("Nenhum locatário selecionado.");

  return limpos;
}

/**
 * Quem fica registrado como responsável pela restrição.
 *
 * O nome é gravado como está agora: a locadora pode ser renomeada, e o que
 * valeu foi o nome de então. A frase em si vem de `managerLabel`, a mesma que
 * o modal mostra antes de aplicar.
 */
async function responsible(client: Awaited<ReturnType<typeof createClient>>) {
  return managerLabel((await currentTenant(client))?.name);
}

/**
 * Impede de abrir nova locação os locatários que o gestor marcou.
 *
 * Quem decide o que é dele é a RLS, como em toda escrita daqui: id de outra
 * locadora não é recusado com erro, simplesmente não entra na conta que volta.
 */
export async function restrictSelected(
  ids: string[],
  reason: string,
): Promise<BatchState> {
  let changed: number;

  try {
    const client = await createClient();
    const restritos = await restrictRenters(client, renterIds(ids), {
      reason: typeof reason === "string" ? reason : "",
      by: await responsible(client),
    });

    changed = restritos.length;
    if (changed === 0) {
      throw new UserError(
        "Ninguém foi restrito. Quem você marcou já está impedido de abrir nova locação.",
      );
    }
  } catch (error) {
    const recado = userError(error);
    if (recado) return recado;

    console.error("Falha ao aplicar restrição em lote", error);
    return { error: "Não foi possível aplicar a restrição. Tente de novo." };
  }

  revalidatePath("/renters");
  return { changed };
}

/** Levanta a restrição de um locatário: ele volta a poder abrir locação. */
export async function liftRenterRestriction(id: string): Promise<BatchState> {
  try {
    const client = await createClient();
    const renter = await liftRestriction(client, id);

    if (!renter) throw new UserError("Locatário não encontrado.");
    if (renter.restriction) {
      throw new UserError("A restrição continua de pé. Tente de novo.");
    }
  } catch (error) {
    const recado = userError(error);
    if (recado) return recado;

    console.error("Falha ao remover restrição", error);
    return { error: "Não foi possível remover a restrição. Tente de novo." };
  }

  revalidatePath("/renters");
  return { changed: 1 };
}

/** Dá baixa nos locatários marcados. Eles saem da lista, as linhas ficam. */
export async function discardRenters(ids: string[]): Promise<BatchState> {
  let changed: number;

  try {
    const client = await createClient();
    changed = (await removeRenters(client, renterIds(ids))).length;

    if (changed === 0) throw new UserError("Nenhum locatário foi removido.");
  } catch (error) {
    const recado = userError(error);
    if (recado) return recado;

    console.error("Falha ao remover locatários em lote", error);
    return { error: "Não foi possível remover os locatários. Tente de novo." };
  }

  revalidatePath("/renters");
  return { changed };
}

/** Uma célula de CSV: aspas dobradas, e tudo entre aspas. */
function cell(value: string | null): string {
  return `"${(value ?? "").replace(/"/g, '""')}"`;
}

/**
 * Os locatários marcados, como planilha.
 *
 * O CPF sai inteiro, e não mascarado como na lista: a exportação existe para o
 * gestor preencher contrato e consultar em órgão, e um CPF pela metade não
 * serve para nada disso. É um arquivo que ele pediu, com dados que já são da
 * locadora dele.
 *
 * `;` e BOM porque quem abre isso abre no Excel em pt-BR, onde a vírgula é
 * separador decimal e o UTF-8 sem marca vira acento quebrado.
 */
export async function exportRenters(
  ids: string[],
): Promise<{ error?: string; csv?: string }> {
  try {
    const client = await createClient();
    const renters = await rentersByIds(client, renterIds(ids));

    if (renters.length === 0) {
      throw new UserError("Nenhum locatário para exportar.");
    }

    const linhas = [
      ["Nome", "CPF", "WhatsApp", "CNH", "Validade CNH", "Restrição", "Desde"],
      ...renters.map((renter) => [
        renter.name,
        formatCpf(renter.cpf),
        formatWhatsapp(renter.whatsapp) ?? "",
        renter.cnhCategory ?? "",
        renter.cnhDueDate ?? "",
        renter.restriction?.reason ?? "",
        renter.createdAt.slice(0, 10),
      ]),
    ];

    return {
      csv: `﻿${linhas.map((linha) => linha.map(cell).join(";")).join("\r\n")}`,
    };
  } catch (error) {
    const recado = userError(error);
    if (recado) return { error: recado.error };

    console.error("Falha ao exportar locatários", error);
    return { error: "Não foi possível exportar. Tente de novo." };
  }
}
