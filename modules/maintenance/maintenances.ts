import type { SupabaseClient } from "@supabase/supabase-js";
import { daysSinceDay } from "@/lib/calendar";
import { UserError } from "@/lib/user-error";
import { findVehicle } from "@/modules/fleet";
import { activeRentalForVehicle } from "@/modules/rentals";

/**
 * Preventiva ou corretiva, e não há terceira.
 *
 * A distinção não é burocracia: revisão programada e conserto de quebra
 * respondem perguntas diferentes — a primeira diz se a locadora está cuidando
 * da frota, a segunda diz quanto essa moto dá trabalho.
 */
export const MAINTENANCE_KINDS = ["preventive", "corrective"] as const;

export type MaintenanceKind = (typeof MAINTENANCE_KINDS)[number];

/**
 * Uma passagem da moto pela oficina.
 *
 * `leftOn` vazio **é** o estado: a moto está lá agora, e é isso — e só isso —
 * que faz a frota mostrá-la como "Em manutenção". A situação deixou de ser um
 * select: ela é consequência desta linha, do mesmo jeito que "Alugada" é
 * consequência de haver locação em pé.
 */
export type Maintenance = {
  id: string;
  vehicleId: string;
  kind: MaintenanceKind;
  enteredOn: string;
  /** `null` enquanto a moto está na oficina. */
  leftOn: string | null;
  description: string;
  workshop: string | null;
  /** A quilometragem na entrada, que é o que dá sentido a "revisão dos 10.000". */
  odometer: number | null;
  cost: number | null;
  by: string;
  createdAt: string;
};

/** O que o gestor anota ao mandar a moto para a oficina. */
export type MaintenanceInput = {
  kind: MaintenanceKind;
  enteredOn: string;
  description: string;
  workshop?: string | null;
  odometer?: number | null;
  cost?: number | null;
  by: string;
};

/** O que muda ao fechar — ou ao corrigir — uma manutenção. */
export type MaintenanceChanges = {
  leftOn?: string | null;
  description?: string;
  workshop?: string | null;
  odometer?: number | null;
  cost?: number | null;
};

type MaintenanceRow = {
  id: string;
  vehicle_id: string;
  kind: MaintenanceKind;
  entered_on: string;
  left_on: string | null;
  description: string;
  workshop: string | null;
  odometer: number | null;
  cost: string | number | null;
  created_by_name: string;
  created_at: string;
};

function toMaintenance(row: MaintenanceRow): Maintenance {
  return {
    id: row.id,
    vehicleId: row.vehicle_id,
    kind: row.kind,
    enteredOn: row.entered_on,
    leftOn: row.left_on,
    description: row.description,
    workshop: row.workshop,
    odometer: row.odometer,
    cost: row.cost === null ? null : Number(row.cost),
    by: row.created_by_name,
    createdAt: row.created_at,
  };
}

const COLUMNS =
  "id, vehicle_id, kind, entered_on, left_on, description, workshop, odometer, cost, created_by_name, created_at";

/**
 * Há quantos dias a moto está parada nesta manutenção.
 *
 * `null` quando ela já voltou: o número só quer dizer alguma coisa enquanto a
 * moto está lá, e mostrá-lo numa manutenção fechada o faria parecer duração —
 * que é outra conta, entre entrada e saída.
 */
export function daysInWorkshop(
  maintenance: Maintenance,
  today = new Date(),
): number | null {
  if (maintenance.leftOn !== null) return null;
  return Math.max(daysSinceDay(maintenance.enteredOn, today), 0);
}

/** Quantos dias a moto passou na oficina, de entrada a saída. */
export function workshopDays(maintenance: Maintenance): number | null {
  if (maintenance.leftOn === null) return null;
  return (
    daysSinceDay(
      maintenance.enteredOn,
      new Date(`${maintenance.leftOn}T12:00:00`),
    ) + 1
  );
}

function checkDates(enteredOn: string, leftOn?: string | null) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(enteredOn)) {
    throw new UserError("Data de entrada inválida.", "enteredOn");
  }

  if (leftOn && leftOn < enteredOn) {
    throw new UserError("A moto não pode ter saído antes de entrar.", "leftOn");
  }
}

/**
 * Manda a moto para a oficina.
 *
 * **Abrir a ordem de serviço é o que tira a moto da frota.** Não há um passo
 * seguinte de trocar a situação: ela é derivada desta linha pela view `fleet`,
 * e o select da tela nem oferece mais "Em manutenção".
 *
 * Moto alugada é recusada com a data da locação junto: ela está na rua com o
 * locatário, e se quebrou lá o caminho é encerrar a locação ou registrar um
 * sinistro — não fingir que ela está na oficina.
 */
export async function openMaintenance(
  client: SupabaseClient,
  vehicleId: string,
  input: MaintenanceInput,
): Promise<Maintenance> {
  if (!MAINTENANCE_KINDS.includes(input.kind)) {
    throw new UserError("Tipo de manutenção inválido.", "kind");
  }

  if (!input.description.trim()) {
    throw new UserError(
      "Diga o que a moto foi fazer na oficina.",
      "description",
    );
  }

  checkDates(input.enteredOn);

  // A moto existe e é desta locadora — ou a RLS não teria devolvido nada. E a
  // situação vem da view, já com locação e manutenção resolvidas.
  const moto = await findVehicle(client, vehicleId);
  if (!moto) throw new UserError("Moto não encontrada.");

  if (moto.status === "reserved") {
    const ocupando = await activeRentalForVehicle(client, vehicleId);

    throw new UserError(
      ocupando
        ? `A ${moto.plate} está alugada desde ${day(ocupando.startedOn)}. Encerre a locação antes de mandá-la para a oficina.`
        : `A ${moto.plate} está alugada. Encerre a locação antes de mandá-la para a oficina.`,
      "vehicleId",
    );
  }

  const { data, error } = await client
    .from("maintenances")
    .insert({
      vehicle_id: vehicleId,
      kind: input.kind,
      entered_on: input.enteredOn,
      description: input.description.trim(),
      workshop: input.workshop?.trim() || null,
      odometer: input.odometer ?? null,
      cost: input.cost ?? null,
      created_by_name: input.by,
    })
    .select(COLUMNS)
    .single();

  // 23505 é o índice único parcial: já existe uma manutenção em aberto nesta
  // moto, e o gestor está abrindo a segunda sem ter fechado a primeira.
  if (error?.code === "23505") {
    throw new UserError(
      `A ${moto.plate} já está na oficina. Feche a manutenção em aberto antes de abrir outra.`,
    );
  }

  if (error) throw error;
  return toMaintenance(data as MaintenanceRow);
}

/** "2026-09-14" vira "14/09/2026" — o recado é para o gestor ler. */
function day(date: string): string {
  const [ano, mês, dia] = date.split("-");
  return `${dia}/${mês}/${ano}`;
}

/**
 * Fecha — ou corrige — uma manutenção.
 *
 * **Preencher a saída é o que devolve a moto à frota.** Ela volta para a
 * situação que estava gravada antes (normalmente disponível), porque a
 * derivação simplesmente para de valer.
 *
 * Corrigir o custo depois é o caso comum e não o excepcional: a nota chega
 * dias depois do serviço, e é por isso que `cost` nasce vazio.
 */
export async function updateMaintenance(
  client: SupabaseClient,
  id: string,
  changes: MaintenanceChanges,
): Promise<Maintenance> {
  const atual = await findMaintenance(client, id);
  if (!atual) throw new UserError("Manutenção não encontrada.");

  checkDates(atual.enteredOn, changes.leftOn);

  if (changes.description !== undefined && !changes.description.trim()) {
    throw new UserError(
      "Diga o que a moto foi fazer na oficina.",
      "description",
    );
  }

  if (changes.cost != null && !(changes.cost > 0)) {
    throw new UserError("O custo precisa ser maior que zero.", "cost");
  }

  const patch: Record<string, unknown> = {};
  if (changes.leftOn !== undefined) patch.left_on = changes.leftOn || null;
  if (changes.description !== undefined) {
    patch.description = changes.description.trim();
  }
  if (changes.workshop !== undefined) {
    patch.workshop = changes.workshop?.trim() || null;
  }
  if (changes.odometer !== undefined) patch.odometer = changes.odometer;
  if (changes.cost !== undefined) patch.cost = changes.cost;

  const { data, error } = await client
    .from("maintenances")
    .update(patch)
    .eq("id", id)
    .select(COLUMNS)
    .single();

  if (error) throw error;
  return toMaintenance(data as MaintenanceRow);
}

/** Uma manutenção, quando ela é de quem perguntou. */
export async function findMaintenance(
  client: SupabaseClient,
  id: string,
): Promise<Maintenance | null> {
  const { data, error } = await client
    .from("maintenances")
    .select(COLUMNS)
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  return data ? toMaintenance(data as MaintenanceRow) : null;
}

/**
 * As manutenções de uma moto, da mais recente para a mais antiga.
 *
 * A em aberto vem primeiro de qualquer jeito: ela é a que está acontecendo, e
 * é a única sobre a qual há o que fazer.
 */
export async function vehicleMaintenances(
  client: SupabaseClient,
  vehicleId: string,
): Promise<Maintenance[]> {
  const { data, error } = await client
    .from("maintenances")
    .select(COLUMNS)
    .eq("vehicle_id", vehicleId)
    .order("left_on", { ascending: false, nullsFirst: true })
    .order("entered_on", { ascending: false });

  if (error) throw error;
  return (data as MaintenanceRow[]).map(toMaintenance);
}

/** A manutenção em aberto de uma moto, quando há uma. */
export async function openMaintenanceFor(
  client: SupabaseClient,
  vehicleId: string,
): Promise<Maintenance | null> {
  const { data, error } = await client
    .from("maintenances")
    .select(COLUMNS)
    .eq("vehicle_id", vehicleId)
    .is("left_on", null)
    .maybeSingle();

  if (error) throw error;
  return data ? toMaintenance(data as MaintenanceRow) : null;
}

/**
 * Apaga uma manutenção.
 *
 * Existe pelo mesmo motivo que na infração e na despesa: a linha nasce de
 * alguém digitando, e manutenção lançada na moto errada é lixo. Apagar a que
 * está em aberto devolve a moto à frota na mesma hora — que é o conserto certo
 * para quem abriu ordem de serviço na placa errada.
 */
export async function deleteMaintenance(
  client: SupabaseClient,
  id: string,
): Promise<void> {
  const { error } = await client.from("maintenances").delete().eq("id", id);
  if (error) throw error;
}
