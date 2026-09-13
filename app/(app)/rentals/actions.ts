"use server";

import { revalidatePath } from "next/cache";
import { managerLabel } from "@/app/ui";
import { MAX_AMOUNT, optionalField, optionalNumber } from "@/lib/form";
import { createClient } from "@/lib/supabase/server";
import { UserError } from "@/lib/user-error";
import {
  endRental,
  recordInspection,
  type InspectionInput,
} from "@/modules/rentals";
import { currentTenant } from "@/modules/tenants";

/** O teto do odômetro, que é o da coluna `integer` com folga de sobra. */
const MAX_ODOMETER = 999_999;

/**
 * O que o gestor anotou olhando a moto.
 *
 * Os três campos são os mesmos nas duas pontas, e por isso a leitura do
 * formulário é uma só — quem decide o que fazer com um formulário em branco é
 * quem chama.
 */
async function inspectionFrom(
  formData: FormData,
  client: Awaited<ReturnType<typeof createClient>>,
): Promise<InspectionInput> {
  return {
    odometer: optionalNumber(formData, "odometer", "Quilometragem", {
      max: MAX_ODOMETER,
      integer: true,
    }),
    fuel: optionalNumber(formData, "fuel", "Combustível", {
      max: 4,
      integer: true,
    }),
    damages: optionalField(formData, "damages"),
    // O nome é gravado como está agora: a locadora pode ser renomeada, e quem
    // vistoriou foi o nome de então. É o mesmo que o pagamento faz.
    by: managerLabel((await currentTenant(client))?.name),
  };
}

/** O id da locação que veio do formulário, que veio do browser. */
function rentalId(formData: FormData): string {
  const id = formData.get("id");
  if (typeof id !== "string" || !id) {
    throw new UserError("Locação não encontrada.");
  }

  return id;
}

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
    const id = rentalId(formData);
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
      // Em branco não é erro: a vistoria de devolução é opcional, e o módulo
      // devolve `null` sem escrever linha nenhuma.
      inspection: await inspectionFrom(formData, client),
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

/**
 * Registra — ou corrige — a vistoria de entrega.
 *
 * Formulário em branco **é** erro aqui, ao contrário do encerramento: quem
 * abriu este diálogo veio registrar alguma coisa, e fechar em silêncio pareceu
 * ter salvado.
 */
export async function saveHandoverInspection(
  _state: EndingState,
  formData: FormData,
): Promise<EndingState> {
  try {
    const id = rentalId(formData);
    const client = await createClient();

    const vistoria = await recordInspection(
      client,
      id,
      "handover",
      await inspectionFrom(formData, client),
    );

    if (!vistoria) {
      throw new UserError(
        "Anote ao menos a quilometragem, o combustível ou uma avaria.",
      );
    }
  } catch (error) {
    if (error instanceof UserError) {
      return { error: error.message, field: error.field };
    }

    console.error("Falha ao registrar vistoria", error);
    return { error: "Não foi possível salvar a vistoria. Tente de novo." };
  }

  revalidatePath("/rentals");
  return { done: "Vistoria de entrega registrada." };
}
