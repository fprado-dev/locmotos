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
  attachVehicleFile,
  createVehicle,
  removeVehicle,
  removeVehicles,
  setVehicleStatus,
  setVehiclesStatus,
  updateVehicle,
  VEHICLE_FILE_KINDS,
  VEHICLE_STATUSES,
  type NewVehicle,
  type VehicleStatus,
} from "@/modules/fleet";

const CURRENT_YEAR = new Date().getFullYear();

/**
 * O que uma ação de formulário tem a contar.
 *
 * `field` é o campo que o erro acusa, quando há um: é o que deixa a mensagem
 * encostar no campo em vez de ficar solta no topo do painel. `created` diz que
 * um cadastro novo entrou — sem ele o painel não teria como distinguir
 * "acabou de salvar" de "ainda não tentou", que são o mesmo `{}`.
 */
export type FormState = {
  error?: string;
  field?: string;
  created?: { plate: string };
};

/** O recado de um `UserError`, com o campo que ele acusa. */
function userError(error: unknown): FormState | null {
  return error instanceof UserError
    ? { error: error.message, field: error.field }
    : null;
}

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
    throw new UserError("Ano inválido", "year");
  }

  // Só o painel de cadastro oferece a situação. Ausente, ela não entra no
  // update: a página de detalhe não tem o campo, e escrever `undefined` lá
  // apagaria o que o select da linha gravou.
  const status = formData.get("status");
  if (status !== null && !VEHICLE_STATUSES.includes(status as VehicleStatus)) {
    throw new UserError("Situação inválida", "status");
  }

  return {
    plate: requiredField(formData, "plate", "Placa"),
    brand: requiredField(formData, "brand", "Marca"),
    model: requiredField(formData, "model", "Modelo"),
    year,
    status: (status as VehicleStatus | null) ?? undefined,
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

/**
 * O recado do bucket, em português.
 *
 * O Storage recusa tipo fora da lista e arquivo acima de 10 MB, e responde em
 * inglês falando de mime type. O gestor precisa de frase, e das duas telas que
 * sobem arquivo — o painel de cadastro e a página do veículo — sai a mesma.
 */
function fileErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "";

  if (/mime type|not supported/i.test(message)) {
    return "Formato não aceito. Envie imagem (JPG, PNG, WEBP) ou PDF.";
  }
  if (/maximum allowed size|too large|entity too large/i.test(message)) {
    return "Arquivo grande demais. O limite é 10 MB.";
  }

  return "Não foi possível anexar o arquivo. Tente de novo.";
}

/**
 * Cadastra o veículo e, se veio um CRLV junto, anexa na mesma ida.
 *
 * O painel pede o documento no mesmo formulário do cadastro, e o anexo precisa
 * do id que só existe depois do insert. Fazer os dois aqui evita devolver o id
 * ao browser só para ele pedir a segunda coisa — e evita a moto ficar
 * cadastrada sem o documento porque a segunda chamada não saiu.
 *
 * O anexo falhando não desfaz o cadastro: a moto já está na frota, e o gestor
 * reenvia o documento pela página dela. O recado diz exatamente isso.
 */
export async function addVehicle(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  let plate: string;

  try {
    const vehicle = vehicleFromForm(formData);

    // O client autenticado é argumento da função de domínio, nunca criado por
    // ela: é o que deixa o teste rodar a mesma função como outra locadora.
    const client = await createClient();

    const created = await createVehicle(client, vehicle);
    plate = created.plate;

    const crlv = formData.get("crlv");
    if (crlv instanceof File && crlv.size > 0) {
      try {
        await attachVehicleFile(client, created.id, "crlv", crlv);
      } catch (error) {
        revalidatePath("/fleet");
        return {
          error: `${plate} foi cadastrada, mas o CRLV não subiu: ${fileErrorMessage(error)}`,
          field: "crlv",
        };
      }
    }
  } catch (error) {
    const recado = userError(error);
    if (recado) return recado;

    console.error("Falha ao cadastrar veículo", error);
    return { error: "Não foi possível cadastrar o veículo. Tente de novo." };
  }

  revalidatePath("/fleet");
  return { created: { plate } };
}

/**
 * Altera a situação de um veículo da locadora de quem está logado.
 *
 * O `id` vem do browser: ninguém garante que é um veículo da locadora certa.
 * Quem garante é a RLS — se a linha não for dela, o update não acha nada e o
 * gestor recebe "veículo não encontrado", a mesma resposta que receberia para
 * um id inventado.
 */
export async function changeVehicleStatus(
  id: string,
  status: VehicleStatus,
): Promise<FormState> {
  try {
    if (!VEHICLE_STATUSES.includes(status)) {
      throw new UserError("Situação inválida");
    }

    const client = await createClient();
    const vehicle = await setVehicleStatus(client, id, status);

    if (!vehicle) throw new UserError("Veículo não encontrado.");
  } catch (error) {
    const recado = userError(error);
    if (recado) return recado;

    console.error("Falha ao alterar a situação do veículo", error);
    return { error: "Não foi possível alterar a situação. Tente de novo." };
  }

  revalidatePath("/fleet");
  return {};
}

/**
 * O que uma ação em lote tem a contar: o que deu errado, ou quantas mudaram.
 *
 * O número não é decoração. O gestor marcou cinco linhas; se voltaram três,
 * duas não eram da locadora dele — e ele precisa saber disso antes de fechar a
 * tela achando que aplicou em todas.
 */
export type BatchState = { error?: string; changed?: number };

/** Os ids vêm do browser como qualquer coisa; só passa lista de texto. */
function vehicleIds(ids: unknown): string[] {
  if (!Array.isArray(ids) || ids.length === 0) {
    throw new UserError("Nenhum veículo selecionado.");
  }

  const clean = ids.filter(
    (id): id is string => typeof id === "string" && id.trim() !== "",
  );
  if (clean.length === 0) throw new UserError("Nenhum veículo selecionado.");

  return clean;
}

/**
 * Altera de uma vez a situação das motos que o gestor marcou.
 *
 * Quem decide o que é dele é a RLS, como em toda escrita daqui: id de outra
 * locadora não é recusado com erro, simplesmente não entra na conta que volta.
 */
export async function changeVehiclesStatus(
  ids: string[],
  status: VehicleStatus,
): Promise<BatchState> {
  let changed: number;

  try {
    if (!VEHICLE_STATUSES.includes(status)) {
      throw new UserError("Situação inválida");
    }

    const client = await createClient();
    changed = (await setVehiclesStatus(client, vehicleIds(ids), status)).length;

    if (changed === 0) throw new UserError("Nenhum veículo foi alterado.");
  } catch (error) {
    const recado = userError(error);
    if (recado) return recado;

    console.error("Falha ao alterar a situação em lote", error);
    return { error: "Não foi possível alterar a situação. Tente de novo." };
  }

  revalidatePath("/fleet");
  return { changed };
}

/** Dá baixa de uma vez nas motos marcadas. Elas saem da lista, as linhas ficam. */
export async function discardVehicles(ids: string[]): Promise<BatchState> {
  let changed: number;

  try {
    const client = await createClient();
    changed = (await removeVehicles(client, vehicleIds(ids))).length;

    if (changed === 0) throw new UserError("Nenhum veículo foi removido.");
  } catch (error) {
    const recado = userError(error);
    if (recado) return recado;

    console.error("Falha ao remover veículos em lote", error);
    return { error: "Não foi possível remover os veículos. Tente de novo." };
  }

  revalidatePath("/fleet");
  return { changed };
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
    const recado = userError(error);
    if (recado) return recado;

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
    const recado = userError(error);
    if (recado) return recado;

    console.error("Falha ao remover veículo", error);
    return { error: "Não foi possível remover o veículo. Tente de novo." };
  }

  revalidatePath("/fleet");
  redirect("/fleet");
}

/**
 * Anexa a foto e os documentos que vieram preenchidos.
 *
 * O gestor manda o que tem à mão: um formulário com três campos de arquivo,
 * dos quais normalmente só um foi escolhido. Campo vazio chega como arquivo de
 * tamanho zero e é ignorado.
 */
export async function attachVehicleFiles(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    const id = requiredField(formData, "id", "Veículo");
    const client = await createClient();

    const chosen = VEHICLE_FILE_KINDS.filter((kind) => {
      const file = formData.get(kind);
      return file instanceof File && file.size > 0;
    });

    if (chosen.length === 0)
      throw new UserError("Escolha ao menos um arquivo.");

    for (const kind of chosen) {
      const attached = await attachVehicleFile(
        client,
        id,
        kind,
        formData.get(kind) as File,
      );

      if (!attached) throw new UserError("Veículo não encontrado.");
    }
  } catch (error) {
    const recado = userError(error);
    if (recado) return recado;

    console.error("Falha ao anexar arquivo", error);
    return { error: fileErrorMessage(error) };
  }

  revalidatePath("/fleet");
  return {};
}
