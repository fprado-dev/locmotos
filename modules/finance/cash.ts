import type { SupabaseClient } from "@supabase/supabase-js";
import { brasiliaDay } from "@/lib/calendar";
import { UserError } from "@/lib/user-error";

/**
 * Onde o dinheiro da locadora foi parar.
 *
 * Lista curta e fechada, e as duas coisas são decisão. Fechada porque é o que
 * faz a soma por categoria significar alguma coisa — com texto livre, "óleo",
 * "troca de óleo" e "Óleo" viram três linhas do gráfico. Curta porque uma
 * lista de vinte itens vira "outros" em toda linha, que é o mesmo que não ter
 * categoria nenhuma.
 */
export const EXPENSE_CATEGORIES = [
  "maintenance",
  "licensing",
  "insurance",
  "fine",
  "fuel",
  "other",
] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

/**
 * Uma linha do extrato — o que entrou ou o que saiu.
 *
 * `amount` é sempre **positivo**; quem diz a direção é `kind`. Guardar saída
 * como número negativo é convite a somar errado uma vez e não perceber.
 *
 * Nenhuma das três origens é tabela espelho. Entrada é o próprio pagamento —
 * todo dinheiro que entra na v1 entrou quitando uma cobrança. Saída é despesa
 * avulsa **ou** o custo de uma manutenção, lido de onde ele foi digitado:
 * copiá-lo para `expenses` criaria o segundo número que a tela existe para
 * evitar, e ele divergiria na primeira correção.
 *
 * `payment` é a única entrada; `expense` e `maintenance` são as duas saídas, e
 * a distinção entre elas é só de porta — a linha de manutenção se corrige na
 * ficha da moto, não aqui.
 */
export type CashEntry = {
  kind: "payment" | "expense" | "maintenance";
  id: string;
  /** O dia em que o dinheiro se mexeu, que não é o dia em que foi digitado. */
  happenedOn: string;
  amount: number;
  /** `rent` para entrada; uma das de despesa para saída. */
  category: ExpenseCategory | "rent";
  /** O que o gestor escreveu. Só despesa tem — a entrada se descreve sozinha. */
  description: string | null;
  /** O ciclo que o pagamento quitou. Só entrada tem. */
  cycleStart: string | null;
  cycleEnd: string | null;
  vehicleId: string | null;
  plate: string | null;
  renterId: string | null;
  renterName: string | null;
  by: string;
};

/** O fechamento de um mês: o que entrou, o que saiu, e para onde foi. */
export type MonthlyCash = {
  /** "2026-09" — o mês que a tela está mostrando. */
  month: string;
  income: number;
  expense: number;
  /** Subtração, não coluna. */
  balance: number;
  /** Quanto saiu em cada categoria, só as que tiveram alguma coisa. */
  byCategory: Array<{ category: ExpenseCategory; amount: number }>;
  entries: CashEntry[];
};

/** O que o gestor digita ao lançar uma saída. */
export type ExpenseInput = {
  spentOn: string;
  amount: number;
  description: string;
  category: ExpenseCategory;
  vehicleId?: string | null;
  by: string;
};

type EntryRow = {
  kind: "payment" | "expense" | "maintenance";
  id: string;
  happened_on: string;
  amount: string | number;
  category: ExpenseCategory | "rent";
  description: string | null;
  cycle_start: string | null;
  cycle_end: string | null;
  vehicle_id: string | null;
  plate: string | null;
  renter_id: string | null;
  renter_name: string | null;
  created_by_name: string;
};

function toEntry(row: EntryRow): CashEntry {
  return {
    kind: row.kind,
    id: row.id,
    happenedOn: row.happened_on,
    amount: Number(row.amount),
    category: row.category,
    description: row.description,
    cycleStart: row.cycle_start,
    cycleEnd: row.cycle_end,
    vehicleId: row.vehicle_id,
    plate: row.plate,
    renterId: row.renter_id,
    renterName: row.renter_name,
    by: row.created_by_name,
  };
}

/**
 * O mês corrente em Brasília.
 *
 * `new Date().getMonth()` daria o mês do relógio do servidor, que em produção
 * é UTC: às 21h do dia 30 o caixa pularia para o mês seguinte sozinho. É a
 * mesma correção que `public.today_br()` faz do lado do banco.
 */
export function currentMonth(now = new Date()): string {
  return brasiliaDay(now).slice(0, 7);
}

/** "2026-09" é um mês; qualquer outra coisa é URL digitada à mão. */
export function isMonth(value: string): boolean {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) return false;

  const ano = Number(value.slice(0, 4));
  return ano >= 2000 && ano <= 2999;
}

/** O primeiro e o último dia de "2026-09", como o Postgres os escreve. */
export function monthRange(month: string): { from: string; to: string } {
  const [ano, mês] = month.split("-").map(Number);
  // Dia 0 do mês seguinte é o último dia deste — e fevereiro se resolve
  // sozinho, inclusive em ano bissexto.
  const último = new Date(Date.UTC(ano, mês, 0)).getUTCDate();

  return { from: `${month}-01`, to: `${month}-${último}` };
}

/** O mês vizinho: `-1` é o anterior, `1` é o seguinte. */
export function monthShift(month: string, by: number): string {
  const [ano, mês] = month.split("-").map(Number);
  const alvo = new Date(Date.UTC(ano, mês - 1 + by, 1));

  return `${alvo.getUTCFullYear()}-${String(alvo.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * O caixa de um mês.
 *
 * Uma consulta só, e não uma por card: os totais são somas do extrato, e
 * pedi-los ao banco em separado abriria a porta para a soma da tela e a da
 * lista discordarem por uma linha.
 *
 * O mês inteiro vem de uma vez, sem paginação — uma locadora com cem motos faz
 * algumas centenas de linhas por mês, e o gestor rola o extrato como rolaria um
 * extrato de banco. Paginar isso seria esconder a única tela em que ver tudo
 * junto é o ponto.
 */
export async function monthlyCash(
  client: SupabaseClient,
  month: string,
): Promise<MonthlyCash> {
  const { from, to } = monthRange(month);

  const { data, error } = await client
    .from("cash_entries")
    .select("*")
    .gte("happened_on", from)
    .lte("happened_on", to)
    // Do fim do mês para o começo, como extrato de banco: o que aconteceu
    // ontem é o que se procura primeiro.
    .order("happened_on", { ascending: false });

  if (error) throw error;

  const entries = (data as EntryRow[]).map(toEntry);

  let income = 0;
  let expense = 0;
  const porCategoria = new Map<ExpenseCategory, number>();

  for (const entry of entries) {
    if (entry.kind === "payment") {
      income += entry.amount;
      continue;
    }

    expense += entry.amount;
    const categoria = entry.category as ExpenseCategory;
    porCategoria.set(
      categoria,
      (porCategoria.get(categoria) ?? 0) + entry.amount,
    );
  }

  return {
    month,
    // Centavos somados em ponto flutuante rendem 0.30000000000000004; o
    // arredondamento acontece uma vez, no fim, e não a cada parcela.
    income: round(income),
    expense: round(expense),
    balance: round(income - expense),
    byCategory: [...porCategoria.entries()]
      .map(([category, amount]) => ({ category, amount: round(amount) }))
      // Do maior para o menor: a pergunta é "para onde foi o dinheiro", e a
      // resposta começa pela maior fatia.
      .sort((a, b) => b.amount - a.amount),
    entries,
  };
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Lança uma saída de caixa. */
export async function recordExpense(
  client: SupabaseClient,
  input: ExpenseInput,
): Promise<CashEntry> {
  if (!input.description.trim()) {
    throw new UserError("Diga o que foi a despesa.", "description");
  }

  if (!(input.amount > 0)) {
    throw new UserError("O valor precisa ser maior que zero.", "amount");
  }

  if (!EXPENSE_CATEGORIES.includes(input.category)) {
    throw new UserError("Categoria inválida.", "category");
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.spentOn)) {
    throw new UserError("Data inválida.", "spentOn");
  }

  // Dinheiro que ainda não saiu não é despesa. O `max` do campo já segura o
  // caso normal; aqui é o que vale para quem não passa pelo formulário — e o
  // "hoje" é o de Brasília, não o do relógio do servidor.
  if (input.spentOn > brasiliaDay()) {
    throw new UserError("A despesa não pode ter saído no futuro.", "spentOn");
  }

  const { data, error } = await client
    .from("expenses")
    .insert({
      spent_on: input.spentOn,
      amount: input.amount,
      description: input.description.trim(),
      category: input.category,
      vehicle_id: input.vehicleId || null,
      created_by_name: input.by,
    })
    .select("id")
    .single();

  // A moto de outra locadora esbarra no FK composto. Chega aqui como erro de
  // banco, e o gestor não deve receber nome de constraint na tela.
  if (error?.code === "23503") {
    throw new UserError("Moto não encontrada.", "vehicleId");
  }

  if (error) throw error;

  const { data: linha, error: leitura } = await client
    .from("cash_entries")
    .select("*")
    .eq("kind", "expense")
    .eq("id", data.id as string)
    .single();

  if (leitura) throw leitura;
  return toEntry(linha as EntryRow);
}

/**
 * Apaga uma despesa.
 *
 * Existe pelo mesmo motivo que na infração: a linha nasce de alguém digitando
 * um número, e valor errado em caixa é lixo, não história. Entrada não tem o
 * equivalente — desfazer um pagamento é estorná-lo, que já existe e **registra**
 * o desfazimento.
 */
export async function deleteExpense(
  client: SupabaseClient,
  id: string,
): Promise<void> {
  const { error } = await client.from("expenses").delete().eq("id", id);
  if (error) throw error;
}
