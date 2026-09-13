import type { SupabaseClient } from "@supabase/supabase-js";
import { daysUntil, isoDay } from "@/lib/calendar";

/**
 * O valor que o locatário deve por um ciclo — a semana de cobrança.
 *
 * Ciclo e cobrança moram na mesma linha porque na v1 um não existe sem o
 * outro: uma semana de locação que não gera valor devido não é nada que o
 * gestor precise ver. `docs/adr/0009` explica por que a linha existe em vez de
 * ser derivada da data de início.
 */
export type Charge = {
  id: string;
  rentalId: string;
  /** O período que esta cobrança cobre, as duas pontas inclusive. */
  cycleStart: string;
  cycleEnd: string;
  dueOn: string;
  amount: number;
  /** Nulo é cobrança em aberto. Quem preenche é o registro de pagamento. */
  paidOn: string | null;
};

/** A linha como o Postgres a devolve. Não sai do módulo. */
type ChargeRow = {
  id: string;
  rental_id: string;
  cycle_start: string;
  cycle_end: string;
  due_on: string;
  amount: number | string;
  paid_on: string | null;
};

function toCharge(row: ChargeRow): Charge {
  return {
    id: row.id,
    rentalId: row.rental_id,
    cycleStart: row.cycle_start,
    cycleEnd: row.cycle_end,
    dueOn: row.due_on,
    amount: Number(row.amount),
    paidOn: row.paid_on,
  };
}

/**
 * O que a locação deve, e há quanto tempo.
 *
 * Não é situação da locação: o `CONTEXT.md` é explícito que uma locação pode
 * estar ativa e inadimplente ao mesmo tempo. Por isso é um objeto à parte, e
 * `null` quando não há nada vencido — em dia não é um estado, é a ausência de
 * cobrança atrasada.
 */
export type Delinquency = {
  /** Dias de calendário desde o vencimento da cobrança mais antiga em aberto. */
  days: number;
  /** A soma das cobranças vencidas e não pagas. */
  amount: number;
};

/**
 * A inadimplência de uma locação, a partir do que a view já somou.
 *
 * Quem decide *o que* está vencido é o banco, na `rental_details`: a lista
 * filtra e conta por isso, e a conta precisa acontecer antes de paginar. Quem
 * conta os **dias** é aqui, com `lib/calendar.ts` — a mesma regra de dia de
 * calendário que a CNH e o licenciamento usam, e que um teste consegue fixar
 * passando o `today`.
 *
 * O `Math.max(1, …)` cobre a única discordância possível entre os dois lados:
 * o banco corta em dia de Brasília e o aplicativo no fuso de quem lê a tela.
 * Se a virada pegar os dois em dias diferentes, "Atrasado 0 d" não é resposta.
 */
export function delinquency(
  rental: { overdueAmount: number; overdueSince: string | null },
  today = new Date(),
): Delinquency | null {
  if (!rental.overdueSince || rental.overdueAmount <= 0) return null;

  return {
    days: Math.max(1, -daysUntil(rental.overdueSince, today)),
    amount: rental.overdueAmount,
  };
}

/**
 * As cobranças vencidas e não pagas de uma locação, da mais antiga para a mais
 * nova.
 *
 * É o bloco "Cobranças em aberto" dos painéis: uma linha por ciclo vencido,
 * com o período, o vencimento e o quanto. O corte de "vencido" vira data aqui
 * e não em SQL, como o da CNH e o do licenciamento — e por isso um teste
 * consegue fixá-lo passando o `today`.
 */
export async function overdueCharges(
  client: SupabaseClient,
  rentalId: string,
  today = new Date(),
): Promise<Charge[]> {
  const { data, error } = await client
    .from("charges")
    .select("*")
    .eq("rental_id", rentalId)
    .is("paid_on", null)
    .lt("due_on", isoDay(today))
    .order("due_on", { ascending: true });

  if (error) throw error;
  return (data as ChargeRow[]).map(toCharge);
}

/**
 * Roda o gerador de ciclos e devolve quantas cobranças nasceram.
 *
 * Quem chama de verdade é o agendamento do banco, todo dia às 3 da manhã. Está
 * exposto aqui porque idempotência é comportamento, e comportamento se testa:
 * rodar duas vezes tem que devolver zero na segunda.
 */
export async function generateCharges(client: SupabaseClient): Promise<number> {
  const { data, error } = await client.rpc("generate_charges");
  if (error) throw error;
  return data as number;
}
