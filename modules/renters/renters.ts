import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import { daysUntil, isoDay } from "@/lib/calendar";
import { UserError } from "@/lib/user-error";

/**
 * A marca que impede um locatário de abrir nova locação.
 *
 * É entidade própria, e não um campo ligado e desligado no locatário, porque o
 * glossário exige motivo e responsável registrados: é o que a locadora tem
 * para mostrar quando a pessoa perguntar por que foi impedida. Um `boolean`
 * não guarda nada disso, e a segunda restrição apagaria a primeira.
 */
export type Restriction = {
  id: string;
  reason: string;
  /** Quem aplicou, como estava escrito na hora. */
  by: string;
  at: string;
};

/** Pessoa que aluga a moto e a pilota. */
export type Renter = {
  id: string;
  tenantId: string;
  name: string;
  /** Só os onze dígitos. A pontuação é de tela. */
  cpf: string;
  whatsapp: string | null;
  cnhCategory: string | null;
  cnhDueDate: string | null;
  notes: string | null;
  tenantName: string | null;
  createdAt: string;
  /** A restrição em vigor, quando há uma. */
  restriction: Restriction | null;
};

/**
 * O que o gestor preenche ao cadastrar.
 *
 * `tenantId` fica de fora: quem carimba é o banco, a partir do JWT.
 */
export type NewRenter = Pick<Renter, "name" | "cpf"> &
  Partial<Pick<Renter, "whatsapp" | "cnhCategory" | "cnhDueDate" | "notes">>;

/** A linha como o Postgres a devolve. Não sai do módulo. */
type RenterRow = {
  id: string;
  tenant_id: string;
  name: string;
  cpf: string;
  whatsapp: string | null;
  cnh_category: string | null;
  cnh_due_date: string | null;
  notes: string | null;
  created_at: string;
  tenants: { name: string } | null;
  restrictions: {
    id: string;
    reason: string;
    created_by_name: string;
    created_at: string;
  }[];
};

/**
 * As colunas de uma leitura de locatário.
 *
 * A restrição vem embutida e filtrada pela vigência — o `is("restrictions
 * .lifted_at", null)` de cada consulta. Com `!inner` ela deixa de ser enfeite
 * e passa a recortar: só volta quem está restrito, que é o chip da tela.
 */
function columns(restrictedOnly = false): string {
  const junção = restrictedOnly ? "!inner" : "";
  return `*, tenants(name), restrictions${junção}(id, reason, created_by_name, created_at)`;
}

// Quem chama o módulo fala o vocabulário do domínio, não o do banco.
function toRenter(row: RenterRow): Renter {
  const [restriction] = row.restrictions ?? [];

  return {
    id: row.id,
    tenantId: row.tenant_id,
    name: row.name,
    cpf: row.cpf,
    whatsapp: row.whatsapp,
    cnhCategory: row.cnh_category,
    cnhDueDate: row.cnh_due_date,
    notes: row.notes,
    tenantName: row.tenants?.name ?? null,
    createdAt: row.created_at,
    restriction: restriction
      ? {
          id: restriction.id,
          reason: restriction.reason,
          by: restriction.created_by_name,
          at: restriction.created_at,
        }
      : null,
  };
}

function toRow(renter: NewRenter) {
  const cpf = onlyDigits(renter.cpf);
  if (!isCpf(cpf)) throw new UserError("CPF inválido", "cpf");

  return {
    name: renter.name.trim(),
    cpf,
    // O WhatsApp também vira dígitos: é assim que ele entra no link do wa.me,
    // e guardar "(11) 98231-0475" faria a tela desmontar o número toda vez.
    whatsapp: renter.whatsapp ? onlyDigits(renter.whatsapp) || null : null,
    cnh_category: renter.cnhCategory?.trim().toUpperCase() || null,
    cnh_due_date: renter.cnhDueDate || null,
    notes: renter.notes ?? null,
  };
}

/**
 * Erro do Postgres virando recado para o gestor.
 *
 * As garantias que a tabela impõe chegam aqui como código; quem preencheu o
 * formulário precisa de frase.
 */
function toDomainError(error: PostgrestError, cpf: string): Error {
  if (error.code === "23505") {
    return new UserError(
      `Já existe um locatário com o CPF ${formatCpf(cpf)} nesta locadora.`,
      "cpf",
    );
  }

  if (error.code === "23514") {
    if (error.message.includes("name_not_blank")) {
      return new UserError("Nome é obrigatório.", "name");
    }
    if (error.message.includes("cpf_digits")) {
      return new UserError("CPF inválido", "cpf");
    }
  }

  return error;
}

/** Cadastra um locatário na locadora de quem está logado. */
export async function createRenter(
  client: SupabaseClient,
  renter: NewRenter,
): Promise<Renter> {
  const row = toRow(renter);

  const { data, error } = await client
    .from("renters")
    .insert(row)
    .select(columns())
    .single();

  if (error) throw toDomainError(error, row.cpf);
  return toRenter(data as unknown as RenterRow);
}

/**
 * Corrige o cadastro de um locatário.
 *
 * Recebe o cadastro inteiro, não um pedaço: o formulário devolve todos os
 * campos, e mandar tudo evita a pergunta "campo ausente é apagar ou manter?".
 *
 * Devolve `null` quando o locatário não é de quem pediu — ou já saiu da lista.
 */
export async function updateRenter(
  client: SupabaseClient,
  id: string,
  renter: NewRenter,
): Promise<Renter | null> {
  const row = toRow(renter);

  const { data, error } = await client
    .from("renters")
    .update(row)
    .eq("id", id)
    .is("deleted_at", null)
    .select(columns())
    .is("restrictions.lifted_at", null)
    .maybeSingle();

  if (error) throw toDomainError(error, row.cpf);
  return data ? toRenter(data as unknown as RenterRow) : null;
}

/**
 * Um locatário pelo id, ou `null`.
 *
 * Locatário de outra locadora cai no mesmo `null` de locatário inexistente: a
 * RLS filtra antes, então nem a existência do registro vaza.
 */
export async function findRenter(
  client: SupabaseClient,
  id: string,
): Promise<Renter | null> {
  const { data, error } = await client
    .from("renters")
    .select(columns())
    .eq("id", id)
    .is("deleted_at", null)
    .is("restrictions.lifted_at", null)
    .maybeSingle();

  if (error) throw error;
  return data ? toRenter(data as unknown as RenterRow) : null;
}

/** Quantos locatários cabem numa página da lista. */
export const RENTERS_PER_PAGE = 20;

/**
 * O recorte que os chips da tela oferecem.
 *
 * São os três que podem ser verdade hoje. "Com locação" e "Sem locação", que o
 * desenho pede, dependem do módulo de Locações e entram quando ele existir.
 */
export const RENTER_SITUATIONS = [
  "restricted",
  "cnh-overdue",
  "cnh-due-soon",
] as const;

export type RenterSituation = (typeof RENTER_SITUATIONS)[number];

/**
 * O que o gestor pediu para ver.
 *
 * `q` procura por nome ou por dígitos do CPF numa busca só — quem tem a pessoa
 * na frente não sabe de antemão qual dos dois vai digitar.
 */
export type RenterFilters = {
  q?: string;
  situation?: RenterSituation;
  /** Começa em 1. */
  page?: number;
  sort?: RenterSort;
  direction?: SortDirection;
};

/**
 * Por qual coluna a lista vem ordenada.
 *
 * As três que existem hoje. A coluna Restrição, que o desenho marca como
 * ordenável, virou chip: com um filtro de "Com restrição" ao lado, ordenar por
 * ela responderia a mesma pergunta duas vezes.
 */
const SORTS = {
  name: { column: "name" },
  cnh: { column: "cnh_due_date" },
  createdAt: { column: "created_at" },
} as const satisfies Record<string, { column: string }>;

/** As chaves de ordenação, para quem precisa validar o que veio da URL. */
export const RENTER_SORTS = Object.keys(SORTS) as RenterSort[];

export type RenterSort = keyof typeof SORTS;

export type SortDirection = "asc" | "desc";

/** Como a lista chega quando ninguém pediu ordem: nome A–Z, como uma agenda. */
export const DEFAULT_RENTER_SORT: {
  sort: RenterSort;
  direction: SortDirection;
} = { sort: "name", direction: "asc" };

/** Só os dígitos: é assim que CPF e telefone são guardados e comparados. */
export function onlyDigits(value: string): string {
  return value.replace(/\D/g, "");
}

/**
 * O CPF é este mesmo, ou alguém errou de tecla.
 *
 * Os dois dígitos verificadores existem para pegar exatamente o erro que mais
 * acontece aqui — trocar um número ao copiar do documento. Sem esta conta, uma
 * restrição pode acabar registrada no CPF de outra pessoa.
 */
export function isCpf(value: string): boolean {
  const cpf = onlyDigits(value);
  if (cpf.length !== 11) return false;
  // Onze dígitos iguais passam na conta dos verificadores e não são CPF.
  if (/^(\d)\1{10}$/.test(cpf)) return false;

  for (const tamanho of [9, 10]) {
    let soma = 0;
    for (let i = 0; i < tamanho; i += 1) {
      soma += Number(cpf[i]) * (tamanho + 1 - i);
    }

    const resto = (soma * 10) % 11;
    if ((resto === 10 ? 0 : resto) !== Number(cpf[tamanho])) return false;
  }

  return true;
}

/** 12345678901 → 123.456.789-01 */
export function formatCpf(cpf: string): string {
  const d = onlyDigits(cpf);
  if (d.length !== 11) return cpf;

  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

/**
 * O CPF como a lista o mostra: 123.456.789-01 vira •••.456.789-01.
 *
 * Esconder o começo é o que a LGPD pede de uma tela que fica aberta o dia
 * inteiro, e o que sobra ainda é suficiente para o gestor reconhecer de quem se
 * trata. O número inteiro está a um clique, no painel de detalhe.
 */
export function maskedCpf(cpf: string): string {
  const formatado = formatCpf(cpf);
  return formatado.length === 14 ? `•••${formatado.slice(3)}` : formatado;
}

/** (11) 98231-0475 — e "—" quando não há número. */
export function formatWhatsapp(whatsapp: string | null): string | null {
  if (!whatsapp) return null;
  const d = onlyDigits(whatsapp);
  if (d.length < 10 || d.length > 11) return whatsapp;

  const meio = d.length === 11 ? 7 : 6;
  return `(${d.slice(0, 2)}) ${d.slice(2, meio)}-${d.slice(meio)}`;
}

/** Quantos dias antes do vencimento a CNH começa a incomodar. */
export const CNH_WARNING_DAYS = 60;

/** Vencida, vencendo, ou nada a dizer. */
export type CnhAlert = "overdue" | "due-soon";

/**
 * O que a lista precisa gritar sobre a CNH deste locatário.
 *
 * Vencida é mais urgente que vencendo, e as duas aparecem: entregar moto a
 * quem está com a habilitação vencida é problema da locadora também.
 */
export function cnhAlert(
  dueDate: string | null,
  today = new Date(),
): CnhAlert | null {
  if (!dueDate) return null;

  const days = daysUntil(dueDate, today);
  if (days < 0) return "overdue";

  return days <= CNH_WARNING_DAYS ? "due-soon" : null;
}

/** Quantos dias faltam para a CNH vencer. Negativo já venceu. */
export function daysUntilCnh(dueDate: string, today = new Date()): number {
  return daysUntil(dueDate, today);
}

/**
 * A busca da tela como uma condição do PostgREST, ou nada.
 *
 * Nome por pedaço e CPF por pedaço de dígito, na mesma caixa: o gestor tem a
 * pessoa na frente e digita o que lembra. A vírgula separa as alternativas na
 * sintaxe do `or`, então ela — e os curingas — saem do termo antes de virar
 * sintaxe em vez de busca.
 */
function searchClause(q: string | undefined): string | null {
  const termo = q?.trim().replace(/[,()%*\\"]/g, "");
  if (!termo) return null;

  const dígitos = onlyDigits(termo);
  const alternativas = [`name.ilike.*${termo}*`];
  if (dígitos) alternativas.push(`cpf.like.*${dígitos}*`);

  return alternativas.join(",");
}

/**
 * Os filtros da tela aplicados sobre uma consulta já começada.
 *
 * Recebe e devolve o builder em vez de montar a consulta inteira porque a
 * lista, a contagem e os chips começam de selects diferentes e terminam no
 * mesmo recorte. `skipSituation` é o que faz o contador do chip responder
 * "quantos sobrariam se eu clicasse aqui" em vez de "quantos existem".
 *
 * O tipo do builder do PostgREST carrega o schema inteiro em parâmetros, e
 * anotá-lo por fora estoura o limite de instanciação do TypeScript; daí o
 * genérico solto, preso só ao que é usado aqui dentro.
 */
type Filterable = {
  or: (filter: string) => Filterable;
  lt: (column: string, value: string) => Filterable;
  gte: (column: string, value: string) => Filterable;
  lte: (column: string, value: string) => Filterable;
};

function filtered<T extends Filterable>(
  query: T,
  filters: RenterFilters,
  { skipSituation = false, today = new Date() } = {},
): T {
  let atual: Filterable = query;

  const busca = searchClause(filters.q);
  if (busca) atual = atual.or(busca);

  if (!skipSituation) {
    // O corte de prazo vira data aqui e não em SQL: quem sabe o que é "vence
    // em 60 dias" é o módulo, e a lista e o badge têm que concordar.
    const hoje = isoDay(today);

    if (filters.situation === "cnh-overdue") {
      atual = atual.lt("cnh_due_date", hoje);
    }
    if (filters.situation === "cnh-due-soon") {
      atual = atual
        .gte("cnh_due_date", hoje)
        .lte("cnh_due_date", isoDay(today, CNH_WARNING_DAYS));
    }
    // "restricted" não é condição: é o `!inner` da restrição embutida.
  }

  return atual as T;
}

/**
 * Uma página de locatários da locadora de quem está logado.
 *
 * `total` é quantos passaram pelo filtro, não quantos vieram na página: é o N
 * do "1–20 de N" no rodapé.
 *
 * ponytail: busca por pedaço de nome é varredura dentro da locadora; índice
 * trigram (`pg_trgm`) quando uma carteira passar de alguns milhares de pessoas.
 */
export async function listRenters(
  client: SupabaseClient,
  filters: RenterFilters = {},
  today = new Date(),
): Promise<{ renters: Renter[]; hasMore: boolean; total: number }> {
  const restritos = filters.situation === "restricted";

  // O mesmo recorte responde às duas perguntas da tela: quem entra nesta
  // página, e quantos passaram pelo filtro.
  function scoped(count?: { count: "exact"; head: true }) {
    // Locatário com baixa saiu da lista. O filtro vive aqui, e não numa
    // policy, porque a policy de update precisa continuar alcançando a linha
    // para dar a baixa.
    const query = client
      .from("renters")
      .select(columns(restritos), count)
      .is("deleted_at", null)
      .is("restrictions.lifted_at", null);

    return filtered(query, filters, { today });
  }

  let query = scoped();

  const order = SORTS[filters.sort ?? DEFAULT_RENTER_SORT.sort];
  const ascending =
    (filters.direction ?? DEFAULT_RENTER_SORT.direction) === "asc";

  // Data ausente não é urgência: CNH sem vencimento registrado cai no fim da
  // lista nos dois sentidos, e não na frente de quem já venceu.
  query = query.order(order.column, { ascending, nullsFirst: false });

  // Desempate por nome, sempre. Sem ele, duas linhas de mesmo valor podem
  // trocar de lugar entre uma página e a seguinte — e aí a paginação repete
  // uma pessoa e esconde outra.
  query = query.order("name", { ascending: true });

  const from = (Math.max(1, filters.page ?? 1) - 1) * RENTERS_PER_PAGE;

  // A contagem vai numa consulta à parte, e não junto com as linhas, porque
  // PostgREST recusa com 416 o `range` que começa além do fim — e a página
  // vive na URL, onde qualquer número cabe.
  const [page, counted] = await Promise.all([
    // `range` é inclusivo nas duas pontas.
    query.range(from, from + RENTERS_PER_PAGE - 1),
    scoped({ count: "exact", head: true }),
  ]);

  if (page.error) throw page.error;
  if (counted.error) throw counted.error;

  const rows = page.data as unknown as RenterRow[];
  const total = counted.count ?? rows.length;

  return {
    renters: rows.map(toRenter),
    hasMore: from + rows.length < total,
    total,
  };
}

/**
 * Quantos locatários cada chip mostraria, com a busca de pé.
 *
 * É a mesma função que alimenta os cards do topo — chamada sem filtro nenhum,
 * `all` é o total da locadora e os outros três são os números dos cards. Com a
 * busca, viram os contadores dos chips: "quantos sobrariam se eu clicasse
 * aqui", que é o que faz do chip uma pergunta já respondida.
 *
 * ponytail: conta no aplicativo sobre uma leitura da carteira inteira, como em
 * `fleetSummary` — as regras de dia de calendário já vivem aqui, e repeti-las
 * em SQL seria a mesma conta em dois lugares. Vira view agregada quando uma
 * locadora passar de alguns milhares de locatários.
 */
export type RenterCounts = Record<RenterSituation | "all", number>;

export async function renterCounts(
  client: SupabaseClient,
  filters: RenterFilters = {},
  today = new Date(),
): Promise<RenterCounts> {
  const query = client
    .from("renters")
    .select("cnh_due_date, restrictions(id)")
    .is("deleted_at", null)
    .is("restrictions.lifted_at", null);

  const { data, error } = await filtered(query, filters, {
    skipSituation: true,
    today,
  });

  if (error) throw error;

  const rows = data as unknown as Pick<
    RenterRow,
    "cnh_due_date" | "restrictions"
  >[];

  const counts: RenterCounts = {
    all: rows.length,
    restricted: 0,
    "cnh-overdue": 0,
    "cnh-due-soon": 0,
  };

  for (const row of rows) {
    if (row.restrictions?.length) counts.restricted += 1;

    const alert = cnhAlert(row.cnh_due_date, today);
    if (alert === "overdue") counts["cnh-overdue"] += 1;
    if (alert === "due-soon") counts["cnh-due-soon"] += 1;
  }

  return counts;
}

/** Os locatários marcados, na ordem do nome — é o que vai para o CSV. */
export async function rentersByIds(
  client: SupabaseClient,
  ids: string[],
): Promise<Renter[]> {
  if (ids.length === 0) return [];

  const { data, error } = await client
    .from("renters")
    .select(columns())
    .in("id", ids)
    .is("deleted_at", null)
    .is("restrictions.lifted_at", null)
    .order("name", { ascending: true });

  if (error) throw error;
  return (data as unknown as RenterRow[]).map(toRenter);
}

/**
 * Impede um lote de locatários de abrir nova locação.
 *
 * Quem já está restrito fica de fora em vez de ganhar uma segunda restrição: a
 * primeira é a que tem o motivo e a data que valem, e sobrescrevê-la apagaria
 * o registro que a restrição existe para guardar. O índice único parcial no
 * banco garante isso mesmo se dois cliques chegarem juntos.
 *
 * Devolve só os que passaram a estar restritos agora — id de outra locadora
 * nem chega ao insert, porque a leitura de cima já o deixou de fora.
 */
export async function restrictRenters(
  client: SupabaseClient,
  ids: string[],
  restriction: { reason: string; by: string },
): Promise<Renter[]> {
  if (ids.length === 0) return [];

  const reason = restriction.reason.trim();
  // O mesmo corte do `check` no banco, em forma de frase: o gestor precisa
  // saber que o motivo é curto demais antes de o Postgres recusar.
  if (reason.length < 4) {
    throw new UserError("O motivo precisa de ao menos 4 caracteres.", "reason");
  }

  const { data: atuais, error: readError } = await client
    .from("renters")
    .select("id, restrictions(id)")
    .in("id", ids)
    .is("deleted_at", null)
    .is("restrictions.lifted_at", null);

  if (readError) throw readError;

  const livres = (atuais as unknown as Pick<RenterRow, "id" | "restrictions">[])
    .filter((row) => !row.restrictions?.length)
    .map((row) => row.id);

  if (livres.length === 0) return [];

  const { error } = await client.from("restrictions").insert(
    livres.map((renter_id) => ({
      renter_id,
      reason,
      created_by_name: restriction.by,
    })),
  );

  if (error) throw error;
  return rentersByIds(client, livres);
}

/**
 * Levanta a restrição de um locatário.
 *
 * `lifted_at` em vez de `delete`: a tela promete "até ser removida", e a
 * remoção também é história — a locadora precisa poder dizer quando e por
 * quanto tempo a pessoa esteve impedida.
 */
export async function liftRestriction(
  client: SupabaseClient,
  renterId: string,
): Promise<Renter | null> {
  const { error } = await client
    .from("restrictions")
    .update({ lifted_at: new Date().toISOString() })
    .eq("renter_id", renterId)
    .is("lifted_at", null);

  if (error) throw error;
  return findRenter(client, renterId);
}

/**
 * Dá baixa num lote de locatários: eles saem da lista e as linhas ficam.
 *
 * A baixa é um `update`, não um `delete` — as locações e cobranças ligadas a
 * eles continuam apontando para cá, e apagar a linha levaria o histórico
 * junto. O `is("deleted_at", null)` antes do update deixa a segunda baixa de
 * fora da resposta em vez de mexer na data da primeira.
 */
export async function removeRenters(
  client: SupabaseClient,
  ids: string[],
): Promise<Renter[]> {
  if (ids.length === 0) return [];

  const { data, error } = await client
    .from("renters")
    .update({ deleted_at: new Date().toISOString() })
    .in("id", ids)
    .is("deleted_at", null)
    .select(columns())
    .is("restrictions.lifted_at", null);

  if (error) throw error;
  return (data as unknown as RenterRow[]).map(toRenter);
}

/** A mesma baixa, para uma pessoa só. Devolve `null` se não era desta locadora. */
export async function removeRenter(
  client: SupabaseClient,
  id: string,
): Promise<Renter | null> {
  const [renter] = await removeRenters(client, [id]);
  return renter ?? null;
}
