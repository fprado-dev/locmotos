import type { SupabaseClient } from "@supabase/supabase-js";
import { UserError } from "@/lib/user-error";

/**
 * A infração de trânsito, com a moto e com quem estava com ela.
 *
 * O verbete do `CONTEXT.md` é `TrafficViolation` — "infração", e nunca
 * "multa": multa neste domínio já é a que se cobra por atraso de pagamento.
 *
 * **A atribuição não é um campo, é uma resposta.** Nada aqui guarda o nome de
 * quem estava com a moto: a locação já diz de quando até quando, e gravar o
 * nome junto criaria duas verdades que divergem no dia em que alguém corrigir
 * a data de início de uma locação. Quem resolve é a view
 * `traffic_violation_details`, em hora de Brasília.
 */
export type TrafficViolation = {
  id: string;
  vehicleId: string;
  /** O número do auto, quando a notificação o trouxe legível. */
  noticeNumber: string | null;
  /** O instante da infração. Instante, e não dia: a hora decide a borda. */
  occurredAt: string;
  description: string;
  amount: number | null;
  /** A data limite de indicação do condutor, quando ela já veio. */
  dueOn: string | null;
  createdAt: string;
  vehicle: { plate: string; brand: string; model: string };
  /** Quantas locações continham o dia da infração. */
  rentalMatches: number;
  rentalId: string | null;
  renterId: string | null;
  renterName: string | null;
};

/** O que o gestor lê na notificação e digita. */
export type ViolationInput = {
  noticeNumber?: string | null;
  /** Data e hora, em ISO. */
  occurredAt: string;
  description: string;
  amount?: number | null;
  dueOn?: string | null;
};

/**
 * De quem é a infração.
 *
 * Três respostas, e a terceira é o ponto: locação tem data com granularidade
 * de **dia**, então moto devolvida de manhã e alugada de novo à tarde deixa o
 * dia com dois donos possíveis. É raro, e é exatamente o caso em que nomear
 * alguém com cara de certeza é pior que dizer que não dá para saber.
 */
export type ViolationBlame =
  | { kind: "renter"; rentalId: string; renterId: string; name: string }
  | { kind: "owner" }
  | { kind: "ambiguous"; matches: number };

export function violationBlame(violation: TrafficViolation): ViolationBlame {
  const { rentalMatches, rentalId, renterId, renterName } = violation;

  if (rentalMatches === 0) return { kind: "owner" };

  // A view só nomeia quando não há empate; o `if` acima e este são a mesma
  // decisão vista de dois lados, e o segundo é o que convence o TypeScript.
  if (rentalMatches > 1 || !rentalId || !renterId || !renterName) {
    return { kind: "ambiguous", matches: rentalMatches };
  }

  return { kind: "renter", rentalId, renterId, name: renterName };
}

type ViolationRow = {
  id: string;
  vehicle_id: string;
  notice_number: string | null;
  occurred_at: string;
  description: string;
  amount: string | number | null;
  due_on: string | null;
  created_at: string;
  plate: string;
  brand: string;
  model: string;
  rental_matches: string | number;
  rental_id: string | null;
  renter_id: string | null;
  renter_name: string | null;
};

function toViolation(row: ViolationRow): TrafficViolation {
  return {
    id: row.id,
    vehicleId: row.vehicle_id,
    noticeNumber: row.notice_number,
    occurredAt: row.occurred_at,
    description: row.description,
    amount: row.amount === null ? null : Number(row.amount),
    dueOn: row.due_on,
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
  "id, vehicle_id, notice_number, occurred_at, description, amount, due_on, created_at, plate, brand, model, rental_matches, rental_id, renter_id, renter_name";

/**
 * Registra uma infração numa moto.
 *
 * Quem recusa o quê: o banco garante que a descrição não é branco, que o valor
 * é positivo e que o número do auto não se repete na locadora; aqui ficam as
 * duas regras que precisam virar frase — infração no futuro e auto repetido.
 */
export async function recordViolation(
  client: SupabaseClient,
  vehicleId: string,
  input: ViolationInput,
): Promise<TrafficViolation> {
  const quando = new Date(input.occurredAt);

  if (Number.isNaN(quando.getTime())) {
    throw new UserError("Data e hora inválidas.", "occurredAt");
  }

  // A notificação conta o que já aconteceu. Data no futuro é dedo no teclado,
  // e ela é justamente o dado que decide de quem é a multa.
  if (quando.getTime() > Date.now()) {
    throw new UserError(
      "A infração não pode ter acontecido no futuro.",
      "occurredAt",
    );
  }

  if (!input.description.trim()) {
    throw new UserError("Diga o que foi a infração.", "description");
  }

  if (input.amount != null && input.amount <= 0) {
    throw new UserError(
      "O valor da infração precisa ser maior que zero.",
      "amount",
    );
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
    .from("traffic_violations")
    .insert({
      vehicle_id: vehicleId,
      notice_number: input.noticeNumber?.trim() || null,
      occurred_at: quando.toISOString(),
      description: input.description.trim(),
      amount: input.amount ?? null,
      due_on: input.dueOn || null,
    })
    .select("id")
    .single();

  // 23505 é o índice único do número do auto: o gestor está registrando de
  // novo um papel que já está no sistema, e o recado tem que dizer isso.
  if (error?.code === "23505") {
    throw new UserError(
      `O auto ${input.noticeNumber} já foi registrado nesta locadora.`,
      "noticeNumber",
    );
  }

  if (error) throw error;

  return findViolation(client, data.id as string);
}

/** Uma infração, já com a atribuição resolvida. */
async function findViolation(
  client: SupabaseClient,
  id: string,
): Promise<TrafficViolation> {
  const { data, error } = await client
    .from("traffic_violation_details")
    .select(COLUMNS)
    .eq("id", id)
    .single();

  if (error) throw error;
  return toViolation(data as ViolationRow);
}

/** As infrações de uma moto, da mais recente para a mais antiga. */
export async function vehicleViolations(
  client: SupabaseClient,
  vehicleId: string,
): Promise<TrafficViolation[]> {
  const { data, error } = await client
    .from("traffic_violation_details")
    .select(COLUMNS)
    .eq("vehicle_id", vehicleId)
    .order("occurred_at", { ascending: false });

  if (error) throw error;
  return (data as ViolationRow[]).map(toViolation);
}

/**
 * As infrações atribuídas a um locatário.
 *
 * Filtra por `renter_id`, que a view só preenche quando não há empate: com
 * duas locações no mesmo dia a infração não aparece na conta de ninguém, e é
 * assim que tem que ser — ela fica visível na ficha da moto, que é onde o
 * gestor vai resolver.
 */
export async function renterViolations(
  client: SupabaseClient,
  renterId: string,
): Promise<TrafficViolation[]> {
  const { data, error } = await client
    .from("traffic_violation_details")
    .select(COLUMNS)
    .eq("renter_id", renterId)
    .order("occurred_at", { ascending: false });

  if (error) throw error;
  return (data as ViolationRow[]).map(toViolation);
}

/**
 * Apaga uma infração.
 *
 * Aqui há apagar, ao contrário de cobrança, pagamento e vistoria: a linha
 * nasce de um papel digitado à mão, e digitar a placa errada é o erro que esta
 * tela convida a cometer. Uma infração na moto errada não é história — é lixo.
 */
export async function deleteViolation(
  client: SupabaseClient,
  id: string,
): Promise<void> {
  const { error } = await client
    .from("traffic_violations")
    .delete()
    .eq("id", id);

  if (error) throw error;
}
