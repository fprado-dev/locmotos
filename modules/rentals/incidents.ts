import type { SupabaseClient } from "@supabase/supabase-js";
import { UserError } from "@/lib/user-error";
import type { AttributionReading } from "./attribution";

/**
 * O que pode ter acontecido com a moto, e não há quinto.
 *
 * Furto e roubo separados porque a locadora e a seguradora os tratam
 * diferente: um é sem violência, o outro é com, e a apólice sabe a diferença.
 * Perda total é a que tira a moto da frota para sempre — e é a única que
 * oferece a baixa no mesmo ato.
 */
export const INCIDENT_KINDS = [
  "damage",
  "theft",
  "robbery",
  "total_loss",
] as const;

export type IncidentKind = (typeof INCIDENT_KINDS)[number];

/**
 * O evento externo que tira a moto de operação.
 *
 * O verbete do `CONTEXT.md` é `Incident` — "sinistro", e nunca "ocorrência"
 * nem "acidente". **Sinistro não é manutenção com outro nome**: manutenção é
 * intervenção planejada ou conserto de desgaste; sinistro é fato externo, com
 * data, boletim e muitas vezes seguradora.
 *
 * **De quem era a moto não é um campo, é uma consulta** — a mesma da infração,
 * resolvida por `public.rental_at` em dia de Brasília.
 */
export type Incident = {
  id: string;
  vehicleId: string;
  kind: IncidentKind;
  /** O instante do sinistro. Instante, e não dia: a hora decide a borda. */
  occurredAt: string;
  description: string;
  /** O número do B.O., quando houve um e quando ele já chegou. */
  policeReport: string | null;
  insurer: string | null;
  insurerNotifiedOn: string | null;
  by: string;
  createdAt: string;
  vehicle: { plate: string; brand: string; model: string };
} & AttributionReading;

/** O que o gestor digita ao registrar o que aconteceu. */
export type IncidentInput = {
  kind: IncidentKind;
  /** Data e hora, em ISO. */
  occurredAt: string;
  description: string;
  policeReport?: string | null;
  insurer?: string | null;
  insurerNotifiedOn?: string | null;
  by: string;
};

type IncidentRow = {
  id: string;
  vehicle_id: string;
  kind: IncidentKind;
  occurred_at: string;
  description: string;
  police_report: string | null;
  insurer: string | null;
  insurer_notified_on: string | null;
  created_by_name: string;
  created_at: string;
  plate: string;
  brand: string;
  model: string;
  rental_matches: string | number;
  rental_id: string | null;
  renter_id: string | null;
  renter_name: string | null;
};

function toIncident(row: IncidentRow): Incident {
  return {
    id: row.id,
    vehicleId: row.vehicle_id,
    kind: row.kind,
    occurredAt: row.occurred_at,
    description: row.description,
    policeReport: row.police_report,
    insurer: row.insurer,
    insurerNotifiedOn: row.insurer_notified_on,
    by: row.created_by_name,
    createdAt: row.created_at,
    vehicle: { plate: row.plate, brand: row.brand, model: row.model },
    // `count(*)` é `bigint`, e o PostgREST manda bigint como texto para não
    // perder precisão em JavaScript.
    rentalMatches: Number(row.rental_matches),
    rentalId: row.rental_id,
    renterId: row.renter_id,
    renterName: row.renter_name,
  };
}

const COLUMNS =
  "id, vehicle_id, kind, occurred_at, description, police_report, insurer, insurer_notified_on, created_by_name, created_at, plate, brand, model, rental_matches, rental_id, renter_id, renter_name";

/**
 * Registra um sinistro numa moto.
 *
 * Quem recusa o quê: o banco garante o tipo válido, a descrição não branca e o
 * aviso à seguradora não anterior ao fato; aqui ficam as regras que precisam
 * virar frase.
 *
 * **Não mexe na situação da moto.** Uma batida pode significar oficina, baixa
 * ou nada — quem decide é o gestor, e adivinhar por ele faria a frota mentir.
 */
export async function recordIncident(
  client: SupabaseClient,
  vehicleId: string,
  input: IncidentInput,
): Promise<Incident> {
  if (!INCIDENT_KINDS.includes(input.kind)) {
    throw new UserError("Tipo de sinistro inválido.", "kind");
  }

  const quando = new Date(input.occurredAt);

  if (Number.isNaN(quando.getTime())) {
    throw new UserError("Data e hora inválidas.", "occurredAt");
  }

  // O sinistro é o que já aconteceu. Data no futuro é dedo no teclado, e ela é
  // justamente o dado que decide quem estava com a moto.
  if (quando.getTime() > Date.now()) {
    throw new UserError(
      "O sinistro não pode ter acontecido no futuro.",
      "occurredAt",
    );
  }

  if (!input.description.trim()) {
    throw new UserError("Diga o que aconteceu.", "description");
  }

  // A moto existe e é desta locadora — ou a RLS não teria devolvido nada. Sem
  // esta leitura, a placa de outra locadora esbarraria no FK composto e
  // voltaria como erro de banco em vez de frase.
  const { data: moto, error: leitura } = await client
    .from("vehicles")
    .select("id")
    .eq("id", vehicleId)
    .maybeSingle();

  if (leitura) throw leitura;
  if (!moto) throw new UserError("Moto não encontrada.");

  const { data, error } = await client
    .from("incidents")
    .insert({
      vehicle_id: vehicleId,
      kind: input.kind,
      occurred_at: quando.toISOString(),
      description: input.description.trim(),
      police_report: input.policeReport?.trim() || null,
      insurer: input.insurer?.trim() || null,
      insurer_notified_on: input.insurerNotifiedOn || null,
      created_by_name: input.by,
    })
    .select("id")
    .single();

  // 23514 é o check do aviso à seguradora: a data digitada é anterior ao
  // sinistro, e o gestor não deve receber nome de constraint na tela.
  if (error?.code === "23514" && error.message.includes("notified_after")) {
    throw new UserError(
      "O aviso à seguradora não pode ser anterior ao sinistro.",
      "insurerNotifiedOn",
    );
  }

  if (error) throw error;
  return findIncident(client, data.id as string);
}

/** Um sinistro, já com a atribuição resolvida. */
export async function findIncident(
  client: SupabaseClient,
  id: string,
): Promise<Incident> {
  const { data, error } = await client
    .from("incident_details")
    .select(COLUMNS)
    .eq("id", id)
    .single();

  if (error) throw error;
  return toIncident(data as IncidentRow);
}

/** Os sinistros de uma moto, do mais recente para o mais antigo. */
export async function vehicleIncidents(
  client: SupabaseClient,
  vehicleId: string,
): Promise<Incident[]> {
  const { data, error } = await client
    .from("incident_details")
    .select(COLUMNS)
    .eq("vehicle_id", vehicleId)
    .order("occurred_at", { ascending: false });

  if (error) throw error;
  return (data as IncidentRow[]).map(toIncident);
}

/**
 * Os sinistros atribuídos a um locatário.
 *
 * É o que o gestor olha antes de decidir sobre caução e sobre alugar de novo
 * para essa pessoa. Filtra por `renter_id`, que a view só preenche quando não
 * há empate: com duas locações no mesmo dia o sinistro não entra na conta de
 * ninguém, e fica visível na ficha da moto, que é onde se resolve.
 */
export async function renterIncidents(
  client: SupabaseClient,
  renterId: string,
): Promise<Incident[]> {
  const { data, error } = await client
    .from("incident_details")
    .select(COLUMNS)
    .eq("renter_id", renterId)
    .order("occurred_at", { ascending: false });

  if (error) throw error;
  return (data as IncidentRow[]).map(toIncident);
}

/**
 * Apaga um sinistro.
 *
 * Pelo mesmo motivo da infração: a linha nasce de alguém digitando, e sinistro
 * na placa errada é lixo, não história. Se a baixa da moto apontava para ele,
 * o `on delete set null` deixa a baixa de pé e sem o link — desfazer a baixa é
 * outro ato, e não um efeito colateral de corrigir uma digitação.
 */
export async function deleteIncident(
  client: SupabaseClient,
  id: string,
): Promise<void> {
  const { error } = await client.from("incidents").delete().eq("id", id);
  if (error) throw error;
}
