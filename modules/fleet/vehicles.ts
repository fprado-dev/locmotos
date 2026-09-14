import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import { daysSinceDay, daysUntil } from "@/lib/calendar";
import { UserError } from "@/lib/user-error";

/**
 * Em que situação um veículo está.
 *
 * `reserved` não é mais escolha de ninguém: significa "tem locação ativa", e é
 * derivado na leitura, pela view `fleet`. As outras três continuam do gestor —
 * manutenção e indisponibilidade são decisões dele, não consequência de
 * locação.
 */
export const VEHICLE_STATUSES = [
  "available",
  "reserved",
  "maintenance",
  "unavailable",
] as const;

export type VehicleStatus = (typeof VEHICLE_STATUSES)[number];

/**
 * As situações que o gestor pode escolher à mão.
 *
 * `reserved` fica de fora porque quem a define é a locação, não o select: a
 * moto entra em reservada ao abrir uma locação e sai ao encerrá-la. Os selects
 * da tela oferecem esta lista e dizem por que a quarta não está lá.
 */
export const MANAGER_VEHICLE_STATUSES = VEHICLE_STATUSES.filter(
  (status) => status !== "reserved",
) as readonly Exclude<VehicleStatus, "reserved">[];

/** Os três anexos que um veículo tem: a foto e os dois documentos. */
export const VEHICLE_FILE_KINDS = ["photo", "crlv", "crv"] as const;

export type VehicleFileKind = (typeof VEHICLE_FILE_KINDS)[number];

/** Onde os arquivos de veículo moram. Bucket privado, sem URL pública. */
const FILES_BUCKET = "vehicle-files";

/**
 * A linha do veículo com o nome da locadora junto.
 *
 * Para o gestor é sempre a dele, e não aparece na tela. Para o operador do
 * SaaS, que enxerga a frota de todas, é o que distingue duas motos de placa
 * igual em locadoras diferentes — o que o banco permite de propósito.
 */
const COLUMNS = "*, tenants(name)";

/**
 * De onde se lê a frota, e onde se escreve nela.
 *
 * A leitura passa pela view `fleet`, que é a tabela com a situação já
 * derivada: moto com locação ativa lê `reserved` venha o que vier na coluna.
 * Filtrar, ordenar, paginar e contar por situação só é honesto assim — fora do
 * banco, "disponíveis" teria que excluir as alugadas em cada consulta, e a
 * ordenação por situação continuaria mentindo.
 *
 * A escrita continua na tabela: view com junção não é atualizável, e não
 * deveria ser. O que volta de um insert ou update é a linha da tabela, com a
 * situação guardada e não a derivada — por isso nenhuma escrita daqui devolve
 * veículo para a tela desenhar; quem desenha lê de novo.
 */
const READ = "fleet";
const WRITE = "vehicles";

/** Unidade alugável da frota de uma locadora. */
export type Vehicle = {
  id: string;
  tenantId: string;
  plate: string;
  brand: string;
  model: string;
  year: number;
  /** A v1 só opera motos, mas o modelo não presume isso. */
  category: string;
  status: VehicleStatus;
  chassis: string | null;
  renavam: string | null;
  color: string | null;
  mileage: number | null;
  licensingDueDate: string | null;
  fipeValue: number | null;
  weeklyPrice: number | null;
  purchaseValue: number | null;
  purchaseDate: string | null;
  notes: string | null;
  tenantName: string | null;
  /** Caminho no bucket privado, não URL: quem serve o arquivo é a URL assinada. */
  photoPath: string | null;
  crlvPath: string | null;
  crvPath: string | null;
  createdAt: string;
  /**
   * Desde quando esta moto está parada: a última devolução, ou o cadastro.
   *
   * Quem resolve o "ou" é a view `fleet` — moto que nunca foi alugada continua
   * contando do dia em que entrou na frota. É dia de calendário, não instante:
   * a pergunta é de folhinha.
   */
  idleSince: string;
};

/**
 * O que o gestor preenche ao cadastrar.
 *
 * `tenantId` fica de fora: quem carimba é o banco, a partir do JWT.
 * `category` é opcional — a v1 só oferece motos, mas quem fixa isso é a
 * interface, não o modelo.
 */
export type NewVehicle = Pick<Vehicle, "plate" | "brand" | "model" | "year"> &
  Partial<
    Pick<
      Vehicle,
      | "category"
      | "status"
      | "chassis"
      | "renavam"
      | "color"
      | "mileage"
      | "licensingDueDate"
      | "fipeValue"
      | "weeklyPrice"
      | "purchaseValue"
      | "purchaseDate"
      | "notes"
    >
  >;

/** A linha como o Postgres a devolve. Não sai do módulo. */
type VehicleRow = {
  id: string;
  tenant_id: string;
  plate: string;
  brand: string;
  model: string;
  year: number;
  category: string;
  status: VehicleStatus;
  chassis: string | null;
  renavam: string | null;
  color: string | null;
  mileage: number | null;
  licensing_due_date: string | null;
  fipe_value: number | string | null;
  weekly_price: number | string | null;
  purchase_value: number | string | null;
  purchase_date: string | null;
  notes: string | null;
  photo_path: string | null;
  crlv_path: string | null;
  crv_path: string | null;
  created_at: string;
  /** Só a view tem: a escrita devolve a linha da tabela. */
  idle_since?: string | null;
  tenants: { name: string } | null;
};

// `numeric` chega como string em algumas versões do PostgREST e como número em
// outras; quem consome o módulo não deveria precisar saber disso.
function toAmount(value: number | string | null): number | null {
  return value === null ? null : Number(value);
}

// Quem chama o módulo fala o vocabulário do domínio, não o do banco.
function toVehicle(row: VehicleRow): Vehicle {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    plate: row.plate,
    brand: row.brand,
    model: row.model,
    year: row.year,
    category: row.category,
    status: row.status,
    chassis: row.chassis,
    renavam: row.renavam,
    color: row.color,
    mileage: row.mileage,
    licensingDueDate: row.licensing_due_date,
    fipeValue: toAmount(row.fipe_value),
    weeklyPrice: toAmount(row.weekly_price),
    purchaseValue: toAmount(row.purchase_value),
    purchaseDate: row.purchase_date,
    notes: row.notes,
    tenantName: row.tenants?.name ?? null,
    photoPath: row.photo_path,
    crlvPath: row.crlv_path,
    crvPath: row.crv_path,
    createdAt: row.created_at,
    // A escrita devolve a linha da tabela, que não tem a coluna derivada — o
    // mesmo já vale para `status`, que só a view sabe calcular. O cadastro é o
    // fallback certo: uma moto que acabou de ser criada ou corrigida na tela
    // vai ser relida pela view no próximo carregamento.
    idleSince: row.idle_since ?? row.created_at.slice(0, 10),
  };
}

/**
 * Por que "Reservada" não se escolhe.
 *
 * Uma frase só, para a recusa ser a mesma no cadastro, na correção e no lote —
 * é a mesma regra, e três redações dela acabariam divergindo.
 */
const RESERVED_IS_DERIVED =
  "Reservada é consequência de locação ativa: abra uma locação para a moto ficar reservada.";

function toRow(vehicle: NewVehicle) {
  // A situação derivada não entra por escrita nenhuma. Sem esta guarda, um
  // POST fabricado gravaria `reserved` na coluna de uma moto sem locação, e a
  // frota passaria a mostrar reservada uma moto que ninguém alugou.
  if (vehicle.status === "reserved") {
    throw new UserError(RESERVED_IS_DERIVED, "status");
  }

  return {
    // A placa é a mesma escrita em qualquer caixa. Normalizar aqui mantém a
    // lista legível; a unicidade em si quem garante é o índice no banco.
    plate: vehicle.plate.trim().toUpperCase(),
    category: vehicle.category,
    brand: vehicle.brand,
    model: vehicle.model,
    year: vehicle.year,
    chassis: vehicle.chassis,
    renavam: vehicle.renavam,
    color: vehicle.color,
    mileage: vehicle.mileage,
    licensing_due_date: vehicle.licensingDueDate,
    fipe_value: vehicle.fipeValue,
    weekly_price: vehicle.weeklyPrice,
    purchase_value: vehicle.purchaseValue,
    purchase_date: vehicle.purchaseDate,
    notes: vehicle.notes,
    // Situação só entra quando a tela ofereceu o campo. Sem essa guarda,
    // salvar o cadastro na página de detalhe apagaria a situação que o select
    // da linha acabou de gravar — o formulário de lá não tem esse campo.
    ...(vehicle.status ? { status: vehicle.status } : {}),
  };
}

/**
 * Erro do Postgres virando recado para o gestor.
 *
 * As duas garantias que a tabela impõe — placa preenchida e placa única na
 * locadora — chegam aqui como código; quem preencheu o formulário precisa de
 * frase.
 */
function toDomainError(error: PostgrestError, plate: string): Error {
  if (error.code === "23505") {
    return new UserError(
      `Já existe um veículo com a placa ${plate} nesta locadora.`,
      "plate",
    );
  }

  if (error.code === "23514" && error.message.includes("plate_not_blank")) {
    return new UserError("Placa é obrigatória.", "plate");
  }

  return error;
}

/**
 * Cadastra um veículo na locadora de quem está logado.
 *
 * `tenantId` não é argumento de propósito: quem carimba a locadora é o
 * default da coluna, a partir do JWT. A aplicação não tem como escolher.
 */
export async function createVehicle(
  client: SupabaseClient,
  vehicle: NewVehicle,
): Promise<Vehicle> {
  const row = toRow(vehicle);

  const { data, error } = await client
    .from(WRITE)
    .insert(row)
    .select(COLUMNS)
    .single();

  if (error) throw toDomainError(error, row.plate);
  return toVehicle(data as VehicleRow);
}

/** Quantos veículos cabem numa página da lista. */
export const VEHICLES_PER_PAGE = 20;

/**
 * O que o gestor pediu para ver.
 *
 * Campo ausente não filtra. Placa, marca e modelo casam por pedaço — quem
 * procura no pátio lembra três letras da placa, não a placa inteira.
 */
export type VehicleFilters = {
  plate?: string;
  brand?: string;
  model?: string;
  year?: number;
  status?: VehicleStatus;
  /** Começa em 1. */
  page?: number;
  sort?: VehicleSort;
  direction?: SortDirection;
};

/**
 * Por qual coluna a lista vem ordenada — as oito que a tabela oferece.
 *
 * Duas não são colunas do banco. "Parada há" é a data de cadastro contada ao
 * contrário: quanto mais antiga a data, mais dias parada, e por isso ela vem
 * marcada como invertida. "Veículo" é marca e modelo, nessa ordem — sem o
 * modelo, duas Honda ficariam em ordem arbitrária entre si.
 */
const SORTS = {
  plate: { column: "plate" },
  vehicle: { column: "brand", secondary: "model" },
  year: { column: "year" },
  mileage: { column: "mileage" },
  weeklyPrice: { column: "weekly_price" },
  // O enum do Postgres ordena pela ordem em que foi declarado, que é a ordem
  // de operação: disponível, reservada, em manutenção, indisponível.
  status: { column: "status" },
  daysWithoutRental: { column: "idle_since", reversed: true },
  licensing: { column: "licensing_due_date" },
} as const satisfies Record<
  string,
  { column: string; secondary?: string; reversed?: boolean }
>;

/** As chaves de ordenação, para quem precisa validar o que veio da URL. */
export const VEHICLE_SORTS = Object.keys(SORTS) as VehicleSort[];

export type VehicleSort = keyof typeof SORTS;

export type SortDirection = "asc" | "desc";

/**
 * Como a lista chega quando ninguém pediu ordem.
 *
 * A moto mais parada primeiro: é a que está custando dinheiro, e é por ela que
 * o gestor abre a tela.
 */
export const DEFAULT_VEHICLE_SORT: {
  sort: VehicleSort;
  direction: SortDirection;
} = { sort: "daysWithoutRental", direction: "desc" };

// `%`, `_` e `*` são curinga para o PostgREST. O gestor está digitando uma
// placa ou escolhendo uma marca, não um padrão de busca: os curingas somem em
// vez de virar sintaxe.
function contains(term: string): string {
  return `%${exact(term)}%`;
}

// Sem curinga nenhum, `ilike` é igualdade que não liga para caixa — o que
// serve tanto para o que veio do select quanto para uma URL digitada à mão.
function exact(term: string): string {
  return term.trim().replace(/[%_*\\]/g, "");
}

/**
 * Os filtros da tela como uma lista de condições, sem consulta nenhuma.
 *
 * A lista e os contadores dos chips têm que concordar: um chip dizendo "9
 * disponíveis" sobre uma lista de 4 seria pior que não ter contador. Por isso
 * os dois montam o recorte daqui, e o chip só pede para ignorar a situação — o
 * contador dele é justamente "quantas seriam, se a situação fosse esta".
 *
 * São condições e não uma consulta pronta porque encarar o builder do
 * PostgREST por fora faz o TypeScript desistir: ele carrega o schema inteiro
 * em parâmetros de tipo, e uma função genérica em cima disso estoura o limite
 * de instanciação. Cada consulta aplica a lista sobre o próprio builder.
 *
 * Placa casa por pedaço, que é como se procura uma moto com a placa na mão.
 * Marca e modelo casam inteiros: as opções saem da própria frota, e "CG 160"
 * por pedaço traria "CG 160 Start" junto.
 */
type Condition = { op: "ilike" | "eq"; column: string; value: string | number };

function conditions(
  filters: VehicleFilters,
  { skipStatus = false } = {},
): Condition[] {
  const list: Condition[] = [];

  if (filters.plate) {
    list.push({ op: "ilike", column: "plate", value: contains(filters.plate) });
  }
  if (filters.brand) {
    list.push({ op: "ilike", column: "brand", value: exact(filters.brand) });
  }
  if (filters.model) {
    list.push({ op: "ilike", column: "model", value: exact(filters.model) });
  }
  if (filters.year) {
    list.push({ op: "eq", column: "year", value: filters.year });
  }
  if (filters.status && !skipStatus) {
    list.push({ op: "eq", column: "status", value: filters.status });
  }

  return list;
}

/**
 * Uma página de veículos da locadora de quem está logado.
 *
 * `total` é quantos veículos passaram pelo filtro, não quantos vieram na
 * página: é o N do "1–20 de N" no rodapé da lista. Ele custa um `count` exato
 * por busca — dentro de uma locadora isso é contar dezenas de linhas, e é o
 * que permite ao gestor saber em quantas páginas o filtro caiu.
 *
 * ponytail: busca por pedaço de placa é varredura dentro da locadora; índice
 * trigram (`pg_trgm`) quando uma frota passar de alguns milhares de motos.
 */
export async function listVehicles(
  client: SupabaseClient,
  filters: VehicleFilters = {},
): Promise<{ vehicles: Vehicle[]; hasMore: boolean; total: number }> {
  // O mesmo recorte responde às duas perguntas da tela: quais veículos entram
  // nesta página, e quantos passaram pelo filtro.
  function scoped(count?: { count: "exact"; head: true }) {
    // Veículo com baixa não está mais na frota. O filtro vive aqui, e não numa
    // policy, porque a policy de update precisa continuar alcançando a linha
    // para dar a baixa.
    let query = client.from(READ).select(COLUMNS, count).is("deleted_at", null);

    for (const { op, column, value } of conditions(filters)) {
      query =
        op === "ilike"
          ? query.ilike(column, value as string)
          : query.eq(column, value);
    }

    return query;
  }

  let query = scoped();

  const order = SORTS[filters.sort ?? DEFAULT_VEHICLE_SORT.sort];
  const direction = filters.direction ?? DEFAULT_VEHICLE_SORT.direction;
  const ascending =
    "reversed" in order ? direction === "desc" : direction === "asc";

  // Data ausente não é urgência: veículo sem licenciamento cai no fim da lista
  // nos dois sentidos, e não na frente de quem já venceu.
  query = query.order(order.column, { ascending, nullsFirst: false });
  if ("secondary" in order) {
    query = query.order(order.secondary, { ascending, nullsFirst: false });
  }

  // Desempate por placa, sempre. Sem ele, duas linhas de mesmo valor podem
  // trocar de lugar entre uma página e a seguinte — e aí a paginação repete
  // uma moto e esconde outra.
  query = query.order("plate", { ascending: true });

  const from = (Math.max(1, filters.page ?? 1) - 1) * VEHICLES_PER_PAGE;

  // A contagem vai numa consulta à parte, e não junto com as linhas, porque
  // PostgREST recusa com 416 o `range` que começa além do fim — e a página
  // vive na URL, onde qualquer número cabe.
  const [page, counted] = await Promise.all([
    // `range` é inclusivo nas duas pontas.
    query.range(from, from + VEHICLES_PER_PAGE - 1),
    scoped({ count: "exact", head: true }),
  ]);

  if (page.error) throw page.error;
  if (counted.error) throw counted.error;

  const rows = page.data as VehicleRow[];
  const total = counted.count ?? rows.length;
  return {
    vehicles: rows.map(toVehicle),
    hasMore: from + rows.length < total,
    total,
  };
}

/**
 * Os números do topo da lista.
 *
 * São da frota inteira da locadora, não da página nem do filtro: o gestor abre
 * a tela para saber quantas motos tem e quantas estão paradas, e essa resposta
 * não pode mudar porque ele digitou três letras de uma placa.
 *
 * ponytail: soma no aplicativo, sobre uma leitura da frota inteira — as regras
 * de dia de calendário e de prazo já vivem aqui, e repeti-las em SQL seria a
 * mesma conta em dois lugares. Vira view agregada quando uma locadora passar
 * de alguns milhares de motos.
 */
export type FleetSummary = {
  total: number;
  available: number;
  reserved: number;
  maintenance: number;
  unavailable: number;
  /** Licenciamento vencendo dentro de `LICENSING_WARNING_DAYS`. */
  licensingDueSoon: number;
  licensingOverdue: number;
  /** Soma do valor semanal das disponíveis: o que a frota rende se alugar tudo. */
  availableWeeklyPrice: number;
};

export async function fleetSummary(
  client: SupabaseClient,
  today = new Date(),
): Promise<FleetSummary> {
  const { data, error } = await client
    .from(READ)
    .select("status, licensing_due_date, weekly_price")
    .is("deleted_at", null);

  if (error) throw error;

  const rows = data as Pick<
    VehicleRow,
    "status" | "licensing_due_date" | "weekly_price"
  >[];

  const summary: FleetSummary = {
    total: rows.length,
    available: 0,
    reserved: 0,
    maintenance: 0,
    unavailable: 0,
    licensingDueSoon: 0,
    licensingOverdue: 0,
    availableWeeklyPrice: 0,
  };

  for (const row of rows) {
    summary[row.status] += 1;

    if (row.status === "available") {
      summary.availableWeeklyPrice += toAmount(row.weekly_price) ?? 0;
    }

    const alert = licensingAlert(row.licensing_due_date, today);
    if (alert === "overdue") summary.licensingOverdue += 1;
    if (alert === "due-soon") summary.licensingDueSoon += 1;
  }

  return summary;
}

/**
 * O que a frota da locadora tem a oferecer aos selects do filtro.
 *
 * Marca, modelo e ano viram lista fechada em vez de campo de texto, e a lista
 * é a da própria frota: não adianta oferecer Yamaha a quem só tem Honda. Vem
 * da frota inteira e não do filtro corrente — um select que só oferece o que
 * já está selecionado não deixa o gestor trocar de ideia.
 *
 * ponytail: distintos calculados no aplicativo sobre uma leitura da frota
 * inteira, como em `fleetSummary`. Vira `select distinct` quando uma locadora
 * passar de alguns milhares de motos.
 */
export type FleetFilterOptions = {
  brands: string[];
  models: string[];
  years: number[];
};

export async function fleetFilterOptions(
  client: SupabaseClient,
): Promise<FleetFilterOptions> {
  const { data, error } = await client
    .from(READ)
    .select("brand, model, year")
    .is("deleted_at", null);

  if (error) throw error;

  const rows = data as Pick<VehicleRow, "brand" | "model" | "year">[];
  const brands = new Set<string>();
  const models = new Set<string>();
  const years = new Set<number>();

  for (const row of rows) {
    brands.add(row.brand);
    models.add(row.model);
    years.add(row.year);
  }

  return {
    brands: [...brands].sort((a, b) => a.localeCompare(b, "pt-BR")),
    models: [...models].sort((a, b) => a.localeCompare(b, "pt-BR")),
    // Ano mais novo primeiro: é por ele que se procura uma moto recente.
    years: [...years].sort((a, b) => b - a),
  };
}

/** Uma moto como o seletor de abertura de locação a mostra. */
export type AvailableVehicle = {
  id: string;
  plate: string;
  brand: string;
  model: string;
  /** O valor semanal da tabela, que a locação copia e passa a ter como seu. */
  weeklyPrice: number | null;
};

/**
 * Só a placa de cada moto da frota, para um seletor.
 *
 * Todas, e não só as disponíveis: a moto que ganha despesa é justamente a que
 * está em manutenção. Fora ficam as que levaram baixa — despesa de moto
 * vendida não se lança hoje.
 */
export async function vehiclePlates(
  client: SupabaseClient,
): Promise<Array<{ id: string; plate: string; model: string }>> {
  const { data, error } = await client
    .from(READ)
    .select("id, plate, brand, model")
    .is("deleted_at", null)
    .order("plate", { ascending: true });

  if (error) throw error;

  return (data as Pick<VehicleRow, "id" | "plate" | "brand" | "model">[]).map(
    (row) => ({
      id: row.id,
      plate: row.plate,
      model: `${row.brand} ${row.model}`,
    }),
  );
}

/**
 * As motos que estão livres para entrar numa locação agora.
 *
 * Vem inteira e sem paginar, ao contrário de `listVehicles`: é uma lista para
 * escolher de dentro de um formulário, e um seletor que mostrasse as vinte
 * primeiras esconderia motos disponíveis de quem tem frota grande.
 *
 * "Disponível" aqui já é a situação derivada — moto com locação ativa lê
 * `reserved` e não aparece, sem ninguém precisar lembrar de excluí-la.
 *
 * ponytail: lista inteira da locadora numa consulta só. Vira busca paginada
 * dentro do seletor quando uma frota passar de algumas centenas de motos
 * disponíveis ao mesmo tempo.
 */
export async function availableVehicles(
  client: SupabaseClient,
): Promise<AvailableVehicle[]> {
  const { data, error } = await client
    .from(READ)
    .select("id, plate, brand, model, weekly_price")
    .eq("status", "available")
    .is("deleted_at", null)
    .order("plate", { ascending: true });

  if (error) throw error;

  return (
    data as Pick<
      VehicleRow,
      "id" | "plate" | "brand" | "model" | "weekly_price"
    >[]
  ).map((row) => ({
    id: row.id,
    plate: row.plate,
    brand: row.brand,
    model: row.model,
    weeklyPrice: toAmount(row.weekly_price),
  }));
}

/**
 * Quantas motos cada chip de situação mostraria, com os outros filtros de pé.
 *
 * O contador do chip responde "quantas sobrariam se eu clicasse aqui", não
 * "quantas existem": filtrar por Honda tem que mexer nos números, senão o chip
 * promete 9 disponíveis e entrega 4. Daí a situação corrente ser ignorada no
 * recorte — os outros filtros, não.
 */
export type FleetStatusCounts = Record<VehicleStatus | "all", number>;

export async function fleetStatusCounts(
  client: SupabaseClient,
  filters: VehicleFilters = {},
): Promise<FleetStatusCounts> {
  let query = client.from(READ).select("status").is("deleted_at", null);

  for (const { op, column, value } of conditions(filters, {
    skipStatus: true,
  })) {
    query =
      op === "ilike"
        ? query.ilike(column, value as string)
        : query.eq(column, value);
  }

  const { data, error } = await query;

  if (error) throw error;

  const rows = data as Pick<VehicleRow, "status">[];
  const counts: FleetStatusCounts = {
    all: rows.length,
    available: 0,
    reserved: 0,
    maintenance: 0,
    unavailable: 0,
  };

  for (const row of rows) counts[row.status] += 1;

  return counts;
}

/**
 * Um veículo pelo id, ou `null`.
 *
 * Veículo de outra locadora cai no mesmo `null` de veículo inexistente: a RLS
 * filtra antes, então nem a existência do registro vaza.
 */
export async function findVehicle(
  client: SupabaseClient,
  id: string,
): Promise<Vehicle | null> {
  const { data, error } = await client
    .from(READ)
    .select(COLUMNS)
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) throw error;
  return data ? toVehicle(data as VehicleRow) : null;
}

/**
 * Altera a situação de um lote de veículos.
 *
 * Devolve os que mudaram, que não são necessariamente os que foram pedidos: os
 * ids vêm do browser, e a RLS filtra antes do update. Veículo de outra
 * locadora não é recusado com erro — ele simplesmente não está na resposta,
 * como se não existisse, que é o que `findVehicle` também faz. Quem chamou
 * compara o tamanho e conta ao gestor o que de fato aconteceu.
 *
 * Um update só para o lote inteiro, e não um por id: o lote é uma decisão do
 * gestor, e meia dúzia de updates soltos poderia deixar metade aplicada.
 *
 * Duas situações não se alteram daqui, e as duas pelo mesmo motivo — quem as
 * decide é a locação, não o select: `reserved` não é um valor a escolher, e
 * moto que já está reservada só volta a mudar de situação quando a locação
 * dela for encerrada. Ela fica de fora do lote em vez de derrubá-lo inteiro, e
 * quem chamou conta ao gestor o que de fato mudou.
 */
export async function setVehiclesStatus(
  client: SupabaseClient,
  ids: string[],
  status: VehicleStatus,
): Promise<Vehicle[]> {
  if (ids.length === 0) return [];

  if (status === "reserved") throw new UserError(RESERVED_IS_DERIVED, "status");

  // A situação derivada vem da view; a alugada é a que sai do lote.
  const { data: atuais, error: readError } = await client
    .from(READ)
    .select("id, status")
    .in("id", ids)
    .is("deleted_at", null);

  if (readError) throw readError;

  const livres = (atuais as Pick<VehicleRow, "id" | "status">[])
    .filter((row) => row.status !== "reserved")
    .map((row) => row.id);

  if (livres.length === 0) return [];

  const { data, error } = await client
    .from(WRITE)
    .update({ status })
    .in("id", livres)
    .is("deleted_at", null)
    .select(COLUMNS);

  if (error) throw error;
  return (data as VehicleRow[]).map(toVehicle);
}

/** A mesma alteração, para uma moto só. Devolve `null` se não era dela. */
export async function setVehicleStatus(
  client: SupabaseClient,
  id: string,
  status: VehicleStatus,
): Promise<Vehicle | null> {
  const [vehicle] = await setVehiclesStatus(client, [id], status);
  return vehicle ?? null;
}

/**
 * Corrige o cadastro de um veículo.
 *
 * Recebe o cadastro inteiro, não um pedaço: o formulário devolve todos os
 * campos, e mandar tudo evita a pergunta "campo ausente é apagar ou manter?".
 * Quem quiser mudar só a quilometragem manda o resto igual.
 *
 * Devolve `null` quando o veículo não é de quem pediu — ou já saiu da frota.
 */
export async function updateVehicle(
  client: SupabaseClient,
  id: string,
  vehicle: NewVehicle,
): Promise<Vehicle | null> {
  const row = toRow(vehicle);

  const { data, error } = await client
    .from(WRITE)
    .update(row)
    .eq("id", id)
    .is("deleted_at", null)
    .select(COLUMNS)
    .maybeSingle();

  if (error) throw toDomainError(error, row.plate);
  return data ? toVehicle(data as VehicleRow) : null;
}

/**
 * Dá baixa num lote de veículos: eles saem da frota e as linhas ficam.
 *
 * A baixa é um `update`, não um `delete` — quem já podia alterar o veículo
 * pode dar baixa nele, e a policy que existe basta. O `is("deleted_at", null)`
 * antes do update deixa a segunda baixa de fora da resposta em vez de mexer na
 * data da primeira.
 *
 * **Moto alugada não sai da frota.** Não é erro de conta, é erro de ordem: uma
 * moto que está na rua com alguém volta antes de ser baixada. Sem esta recusa
 * o cadastro some, a locação continua de pé, e o card "Motos alugadas" passa a
 * poder marcar mais de 100% — porque `fleetSummary` não conta moto baixada.
 *
 * Ela fica de fora do lote em vez de derrubá-lo inteiro, como já acontece em
 * `setVehiclesStatus`: quem chamou compara o tamanho e conta ao gestor o que
 * de fato aconteceu. Quem dá nome ao ocupante é a camada de cima — Frota não
 * lê Locações, e é o `dependency-cruiser` quem faz essa conta.
 */
export async function removeVehicles(
  client: SupabaseClient,
  ids: string[],
): Promise<Vehicle[]> {
  if (ids.length === 0) return [];

  // A situação derivada vem da view: `reserved` é "tem locação ativa".
  const { data: atuais, error: readError } = await client
    .from(READ)
    .select("id, status")
    .in("id", ids)
    .is("deleted_at", null);

  if (readError) throw readError;

  const livres = (atuais as Pick<VehicleRow, "id" | "status">[])
    .filter((row) => row.status !== "reserved")
    .map((row) => row.id);

  if (livres.length === 0) return [];

  const { data, error } = await client
    .from(WRITE)
    .update({ deleted_at: new Date().toISOString() })
    .in("id", livres)
    .is("deleted_at", null)
    .select(COLUMNS);

  if (error) throw error;
  return (data as VehicleRow[]).map(toVehicle);
}

/** A mesma baixa, para uma moto só. Devolve `null` se não era dela. */
export async function removeVehicle(
  client: SupabaseClient,
  id: string,
): Promise<Vehicle | null> {
  const [vehicle] = await removeVehicles(client, [id]);
  return vehicle ?? null;
}

/** A coluna onde o caminho de cada anexo é guardado. */
const FILE_COLUMNS: Record<
  VehicleFileKind,
  "photo_path" | "crlv_path" | "crv_path"
> = {
  photo: "photo_path",
  crlv: "crlv_path",
  crv: "crv_path",
};

/** A extensão do arquivo que o gestor escolheu, para o download sair com nome. */
function extension(fileName: string): string {
  const parts = fileName.toLowerCase().split(".");
  return parts.length > 1 ? `.${parts.pop()!.replace(/[^a-z0-9]/g, "")}` : "";
}

/**
 * Anexa foto ou documento a um veículo.
 *
 * O caminho começa pela locadora — `<tenant>/<veículo>/<tipo>` — porque é a
 * primeira pasta que a policy do Storage compara com o JWT. A aplicação monta
 * o caminho, mas quem recusa o caminho errado é o banco.
 *
 * Devolve `null` para veículo que não é de quem pediu: a busca acontece antes
 * do upload, então arquivo de ninguém sobra no bucket.
 */
export async function attachVehicleFile(
  client: SupabaseClient,
  id: string,
  kind: VehicleFileKind,
  file: File,
): Promise<Vehicle | null> {
  const vehicle = await findVehicle(client, id);
  if (!vehicle) return null;

  const path = `${vehicle.tenantId}/${vehicle.id}/${kind}${extension(file.name)}`;

  const { error: uploadError } = await client.storage
    .from(FILES_BUCKET)
    .upload(path, file, { upsert: true, contentType: file.type });

  if (uploadError) throw uploadError;

  const { data, error } = await client
    .from(WRITE)
    .update({ [FILE_COLUMNS[kind]]: path })
    .eq("id", id)
    .is("deleted_at", null)
    .select(COLUMNS)
    .maybeSingle();

  if (error) throw error;

  // Trocar um PDF por uma foto muda a extensão, e o arquivo antigo ficaria no
  // bucket sem ninguém apontando para ele.
  const previous = vehicle[`${kind}Path`];
  if (previous && previous !== path) {
    await client.storage.from(FILES_BUCKET).remove([previous]);
  }

  return data ? toVehicle(data as VehicleRow) : null;
}

/**
 * URL de vida curta para abrir um anexo.
 *
 * O bucket é privado: sem assinatura não há leitura, e a assinatura vence.
 * Um link que vazasse do celular do gestor deixa de servir em um minuto.
 */
export async function signedFileUrl(
  client: SupabaseClient,
  path: string,
  { seconds = 60, download = false }: SignedUrlOptions = {},
): Promise<string | null> {
  const { data, error } = await client.storage
    .from(FILES_BUCKET)
    .createSignedUrl(path, seconds, download ? { download } : undefined);

  if (error) throw error;
  return data?.signedUrl ?? null;
}

/**
 * `download` pede ao Storage que a resposta venha como anexo, com este nome.
 *
 * Sem isso o arquivo abre na aba em vez de baixar: o atributo `download` do
 * `<a>` é ignorado quando o arquivo vem de outra origem, e o bucket é outra
 * origem. Quem decide é o cabeçalho que o Storage devolve, e ele é assinado
 * junto com a URL.
 */
export type SignedUrlOptions = { seconds?: number; download?: string | false };

/** Quantos dias antes do vencimento o licenciamento começa a incomodar. */
export const LICENSING_WARNING_DAYS = 60;

/**
 * Há quantos dias o veículo está sem locação.
 *
 * Derivado em leitura, sem coluna: um contador materializado desincroniza e
 * mente justamente no dia em que o gestor confia nele.
 *
 * `since` é o `idleSince` da moto: a data da última devolução, ou a do
 * cadastro para quem nunca foi alugada. Quem escolhe entre as duas é a view
 * `fleet`; aqui só se conta.
 */
export function daysWithoutRental(since: string, today = new Date()): number {
  return daysSinceDay(since, today);
}

/**
 * A partir de quantos dias parada uma moto merece destaque na lista.
 *
 * Trinta dias é onde a locadora perde um ciclo inteiro de cobrança. O número é
 * de regra, não de arte: mexer nele muda o que a tela grita.
 */
export const LONG_STOP_DAYS = 30;

/** Vencido, vencendo, ou nada a dizer. */
export type LicensingAlert = "overdue" | "due-soon";

/**
 * O que a lista precisa gritar sobre o licenciamento deste veículo.
 *
 * Vencido é mais urgente que vencendo, e os dois aparecem: multa não deixa de
 * existir por o prazo já ter passado.
 */
export function licensingAlert(
  dueDate: string | null,
  today = new Date(),
): LicensingAlert | null {
  if (!dueDate) return null;

  const days = daysUntil(dueDate, today);
  if (days < 0) return "overdue";

  return days <= LICENSING_WARNING_DAYS ? "due-soon" : null;
}

/** Quantos dias faltam para o licenciamento vencer. Negativo já venceu. */
export function daysUntilLicensing(
  dueDate: string,
  today = new Date(),
): number {
  return daysUntil(dueDate, today);
}
