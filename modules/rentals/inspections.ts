import type { SupabaseClient } from "@supabase/supabase-js";
import { UserError } from "@/lib/user-error";

/**
 * As duas pontas de uma locação, e não há terceira.
 *
 * A vistoria da devolução só diz alguma coisa comparada com a da entrega —
 * "1.200 km rodados, tanque na metade, um risco novo na carenagem" é uma
 * subtração, não uma leitura isolada.
 */
export const INSPECTION_MOMENTS = ["handover", "return"] as const;

export type InspectionMoment = (typeof INSPECTION_MOMENTS)[number];

/**
 * O estado da moto numa das pontas da locação.
 *
 * Os três dados são opcionais porque a vistoria inteira é opcional (issue
 * #47): o gestor anota o que conferiu, e metade das locações não vai ter a da
 * entrega. O que não existe é vistoria vazia — o banco recusa a linha que não
 * diz nenhuma das três coisas.
 *
 * **Avaria é texto livre**, não lista de itens com estado. Uma lista é melhor
 * de comparar entre as duas pontas, e é exatamente o que faria esta issue
 * triplicar de tamanho; texto livre é o que o gestor já escreve hoje no motivo
 * do desconto da caução, e a vistoria só dá a ele um lugar com data.
 */
export type Inspection = {
  id: string;
  rentalId: string;
  moment: InspectionMoment;
  /** Quilometragem no odômetro. */
  odometer: number | null;
  /** O ponteiro do tanque em quartos: 0 é vazio, 4 é cheio. */
  fuel: number | null;
  damages: string | null;
  /** Quem vistoriou, como estava escrito na hora. */
  by: string;
  at: string;
};

/** As duas vistorias de uma locação, cada uma podendo não existir. */
export type Inspections = {
  handover: Inspection | null;
  return: Inspection | null;
};

/** O que o gestor anotou. Tudo opcional menos quem estava olhando a moto. */
export type InspectionInput = {
  odometer?: number | null;
  fuel?: number | null;
  damages?: string | null;
  by: string;
};

type InspectionRow = {
  id: string;
  rental_id: string;
  moment: InspectionMoment;
  odometer: number | null;
  fuel_quarters: number | null;
  damages: string | null;
  created_by_name: string;
  created_at: string;
};

function toInspection(row: InspectionRow): Inspection {
  return {
    id: row.id,
    rentalId: row.rental_id,
    moment: row.moment,
    odometer: row.odometer,
    fuel: row.fuel_quarters,
    damages: row.damages,
    by: row.created_by_name,
    at: row.created_at,
  };
}

/** Uma vistoria que não diz nenhuma das três coisas não é vistoria. */
export function isBlankInspection(input: InspectionInput): boolean {
  return input.odometer == null && input.fuel == null && !input.damages?.trim();
}

/**
 * Registra — ou corrige — a vistoria de uma das pontas da locação.
 *
 * Devolve `null` quando não havia o que registrar. É de propósito que isso não
 * seja erro: no encerramento, não preencher a vistoria é o caso comum, e
 * obrigar o chamador a um `if` antes de cada chamada espalharia a mesma
 * decisão por duas telas.
 *
 * Registrar de novo **corrige** a vistoria que existe, em vez de criar uma
 * segunda: quilometragem digitada errada tem que ter conserto, e o índice
 * único é quem garante que não existem duas entregas contando histórias
 * diferentes. Quem corrige passa a ser quem assina.
 *
 * A leitura de cima existe para o recado ser certo: sem ela, vistoriar a
 * locação de outra locadora esbarraria no FK composto e voltaria como erro de
 * banco, não como frase.
 */
export async function recordInspection(
  client: SupabaseClient,
  rentalId: string,
  moment: InspectionMoment,
  input: InspectionInput,
): Promise<Inspection | null> {
  if (isBlankInspection(input)) return null;

  const { odometer, fuel } = input;

  if (odometer != null && (!Number.isInteger(odometer) || odometer < 0)) {
    throw new UserError("Quilometragem inválida.", "odometer");
  }

  if (fuel != null && (!Number.isInteger(fuel) || fuel < 0 || fuel > 4)) {
    throw new UserError("Nível de combustível inválido.", "fuel");
  }

  // A locação existe e é desta locadora — ou a RLS não teria devolvido nada.
  const { data: locação, error: leitura } = await client
    .from("rentals")
    .select("id")
    .eq("id", rentalId)
    .maybeSingle();

  if (leitura) throw leitura;
  if (!locação) throw new UserError("Locação não encontrada.");

  // Odômetro não anda para trás. É o erro de digitação que mais custa caro:
  // os quilômetros rodados saem daqui, e um número menor que o da entrega
  // viraria uma subtração negativa na tela do encerramento.
  if (moment === "return" && odometer != null) {
    const entrega = (await rentalInspections(client, rentalId)).handover
      ?.odometer;

    if (entrega != null && odometer < entrega) {
      throw new UserError(
        `A moto saiu com ${entrega.toLocaleString("pt-BR")} km: a devolução não pode ter menos.`,
        "odometer",
      );
    }
  }

  const { data, error } = await client
    .from("inspections")
    .upsert(
      {
        rental_id: rentalId,
        moment,
        odometer: odometer ?? null,
        fuel_quarters: fuel ?? null,
        damages: input.damages?.trim() || null,
        created_by_name: input.by,
        // Corrigir reescreve também quem assinou e quando: a linha diz o que
        // se sabe hoje sobre a moto, não o que se achava na primeira tentativa.
        created_at: new Date().toISOString(),
      },
      { onConflict: "rental_id,moment" },
    )
    .select("*")
    .single();

  if (error) throw error;
  return toInspection(data as InspectionRow);
}

/** As duas vistorias de uma locação, para a tela pôr uma ao lado da outra. */
export async function rentalInspections(
  client: SupabaseClient,
  rentalId: string,
): Promise<Inspections> {
  const { data, error } = await client
    .from("inspections")
    .select("*")
    .eq("rental_id", rentalId);

  if (error) throw error;

  const linhas = (data as InspectionRow[]).map(toInspection);

  return {
    handover: linhas.find((linha) => linha.moment === "handover") ?? null,
    return: linhas.find((linha) => linha.moment === "return") ?? null,
  };
}

/**
 * Quantos quilômetros a moto rodou na locação.
 *
 * `null` quando falta odômetro em alguma das pontas: sem os dois números não
 * existe subtração, e mostrar o número de uma ponta sozinho convidaria a lê-lo
 * como se fosse a rodagem.
 */
export function kilometersRun({ handover, return: devolução }: Inspections) {
  if (handover?.odometer == null || devolução?.odometer == null) return null;

  return devolução.odometer - handover.odometer;
}
