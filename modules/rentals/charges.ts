import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import { daysUntil, isoDay } from "@/lib/calendar";
import { UserError } from "@/lib/user-error";

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
};

/** A linha como o Postgres a devolve. Não sai do módulo. */
type ChargeRow = {
  id: string;
  rental_id: string;
  cycle_start: string;
  cycle_end: string;
  due_on: string;
  amount: number | string;
};

function toCharge(row: ChargeRow): Charge {
  return {
    id: row.id,
    rentalId: row.rental_id,
    cycleStart: row.cycle_start,
    cycleEnd: row.cycle_end,
    dueOn: row.due_on,
    amount: Number(row.amount),
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
 * As cobranças vencidas e ainda em aberto de uma locação, da mais antiga para
 * a mais nova.
 *
 * É o bloco "Cobranças em aberto" dos painéis: uma linha por ciclo vencido,
 * com o período, o vencimento e o quanto. O corte de "vencido" vira data aqui
 * e não em SQL, como o da CNH e o do licenciamento — e por isso um teste
 * consegue fixá-lo passando o `today`.
 *
 * "Em aberto" é a **ausência** de pagamento em pé, não uma coluna: o embed
 * vem recortado por `reversed_at is null` e a linha só passa quando ele volta
 * vazio. Desfazer um pagamento devolve a cobrança a esta lista sem ninguém
 * corrigir estado nenhum.
 */
export async function overdueCharges(
  client: SupabaseClient,
  rentalId: string,
  today = new Date(),
): Promise<Charge[]> {
  const { data, error } = await client
    .from("charges")
    .select("*, payments!left(id)")
    .eq("rental_id", rentalId)
    .is("payments.reversed_at", null)
    .is("payments", null)
    .lt("due_on", isoDay(today))
    .order("due_on", { ascending: true });

  if (error) throw error;
  return (data as ChargeRow[]).map(toCharge);
}

/**
 * O registro de que uma cobrança foi quitada.
 *
 * Guarda **quando** o dinheiro entrou e **quem** registrou, como a restrição
 * guarda motivo e responsável: é o mesmo tipo de fato, e vai ser perguntado do
 * mesmo jeito seis meses depois.
 */
export type Payment = {
  id: string;
  chargeId: string;
  /** Quando o dinheiro entrou, que não é quando o gestor digitou. */
  receivedOn: string;
  /** Quem registrou, como estava escrito na hora. */
  by: string;
  at: string;
  /** O ciclo que ele quitou — é assim que a tela nomeia o pagamento. */
  cycle: { start: string; end: string; amount: number };
};

type PaymentRow = {
  id: string;
  charge_id: string;
  received_on: string;
  created_by_name: string;
  created_at: string;
  charges: {
    cycle_start: string;
    cycle_end: string;
    amount: number | string;
  } | null;
};

/** As colunas de uma leitura de pagamento: o registro e o ciclo que ele quita. */
const PAYMENT_COLUMNS =
  "id, charge_id, received_on, created_by_name, created_at, " +
  "charges!inner(cycle_start, cycle_end, amount)";

function toPayment(row: PaymentRow): Payment {
  return {
    id: row.id,
    chargeId: row.charge_id,
    receivedOn: row.received_on,
    by: row.created_by_name,
    at: row.created_at,
    cycle: {
      // A junção é interna e o FK é `not null`: o ciclo de um pagamento existe.
      start: row.charges!.cycle_start,
      end: row.charges!.cycle_end,
      amount: Number(row.charges!.amount),
    },
  };
}

/**
 * Erro do Postgres virando recado para o gestor.
 *
 * O índice único parcial é o que de fato impede o segundo pagamento — a
 * checagem lá em cima existe para o recado ser bom, não para ser a garantia.
 */
function toDomainError(error: PostgrestError): Error {
  if (error.code === "23505") {
    return new UserError("Esta cobrança já foi paga. Recarregue a tela.");
  }

  // FK composto: o id veio do browser e aponta para fora desta locadora.
  if (error.code === "23503") {
    return new UserError("Cobrança não encontrada.");
  }

  return error;
}

/**
 * Registra que uma cobrança foi paga.
 *
 * O recebimento é datado pelo gestor, não pelo relógio: ele lança na segunda o
 * que recebeu no sábado. O que não se aceita é data no futuro — dinheiro que
 * ainda não entrou não é pagamento, é promessa.
 *
 * Pagamento parcial está fora de escopo por decisão da issue: uma cobrança é
 * paga ou não é. O que fazer com a outra metade é regra que ninguém decidiu.
 *
 * A leitura de cima existe para o recado ser certo, e não para ser a garantia:
 * sem ela, tentar pagar a cobrança de outra locadora esbarraria primeiro no
 * índice único — que é global — e o recado diria "já foi paga", contando a
 * quem não é dela que ela existe e que está quitada.
 */
export async function payCharge(
  client: SupabaseClient,
  chargeId: string,
  { receivedOn, by }: { receivedOn?: string | null; by: string },
  today = new Date(),
): Promise<Payment> {
  const hoje = isoDay(today);

  if (receivedOn && receivedOn > hoje) {
    throw new UserError(
      "A data de recebimento não pode estar no futuro.",
      "receivedOn",
    );
  }

  const { data: cobrança, error: readError } = await client
    .from("charges")
    .select("id")
    .eq("id", chargeId)
    .maybeSingle();

  if (readError) throw readError;
  if (!cobrança) throw new UserError("Cobrança não encontrada.");

  const { data, error } = await client
    .from("payments")
    .insert({
      charge_id: chargeId,
      // Ausente é hoje, e quem decide isso é o default da coluna — em dia de
      // Brasília, como o resto das datas de cobrança.
      ...(receivedOn ? { received_on: receivedOn } : {}),
      created_by_name: by,
    })
    .select(PAYMENT_COLUMNS)
    .single();

  if (error) throw toDomainError(error);
  return toPayment(data as unknown as PaymentRow);
}

/**
 * Desfaz um pagamento lançado errado.
 *
 * `reversed_at` em vez de `delete`: ter registrado e ter desfeito são dois
 * fatos, e o segundo não apaga o primeiro — é a mesma escolha que
 * `lifted_at` faz com a restrição. A cobrança volta para "em aberto" sozinha,
 * porque em aberto é a ausência de pagamento em pé e não um estado gravado.
 *
 * Devolve `null` quando não havia o que desfazer: pagamento de outra locadora,
 * id inventado, ou um desfazimento que já tinha acontecido.
 */
export async function reversePayment(
  client: SupabaseClient,
  paymentId: string,
  { by }: { by: string },
): Promise<Payment | null> {
  const { data, error } = await client
    .from("payments")
    .update({ reversed_at: new Date().toISOString(), reversed_by_name: by })
    .eq("id", paymentId)
    .is("reversed_at", null)
    .select(PAYMENT_COLUMNS)
    .maybeSingle();

  if (error) throw error;
  return data ? toPayment(data as unknown as PaymentRow) : null;
}

/**
 * Os pagamentos em pé de uma locação, do mais recente para o mais antigo.
 *
 * Existe para o desfazimento ter de onde partir: quitada a cobrança, ela sai
 * de "Cobranças em aberto", e sem esta lista um lançamento errado não teria
 * mais tela nenhuma. Os desfeitos não voltam — quem quiser a história inteira
 * lê a tabela.
 */
export async function rentalPayments(
  client: SupabaseClient,
  rentalId: string,
  limit = 5,
): Promise<Payment[]> {
  const { data, error } = await client
    .from("payments")
    .select(PAYMENT_COLUMNS)
    .eq("charges.rental_id", rentalId)
    .is("reversed_at", null)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data as unknown as PaymentRow[]).map(toPayment);
}

/**
 * Rateia por dia o ciclo que estava em curso quando a moto voltou.
 *
 * A regra mora no banco (`public.settle_last_cycle`) e não aqui porque o
 * gerador de ciclos precisa exatamente da mesma conta para a semana parcial
 * que ele cria depois do encerramento. Escrita dos dois lados, ela divergiria
 * no primeiro arredondamento — e divergência em dinheiro aparece na tela do
 * locatário.
 *
 * Devolve o novo valor, ou `null` quando não havia o que ratear: a locação
 * acabou no último dia de um ciclo, ou o ciclo em curso já estava pago.
 */
export async function settleLastCycle(
  client: SupabaseClient,
  rentalId: string,
): Promise<number | null> {
  const { data, error } = await client.rpc("settle_last_cycle", {
    p_rental_id: rentalId,
  });

  if (error) throw error;
  return data === null ? null : Number(data);
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
