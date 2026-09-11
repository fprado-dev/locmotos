import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import { UserError } from "@/lib/user-error";

/**
 * Em que situação um veículo está.
 *
 * Nesta fatia quem define é o gestor. Quando existir o módulo de Locações,
 * `reserved` passa a ser derivado de locação ativa.
 */
export const VEHICLE_STATUSES = [
  "available",
  "reserved",
  "maintenance",
  "unavailable",
] as const;

export type VehicleStatus = (typeof VEHICLE_STATUSES)[number];

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
  createdAt: string;
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
  created_at: string;
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
    createdAt: row.created_at,
  };
}

function toRow(vehicle: NewVehicle) {
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
    );
  }

  if (error.code === "23514" && error.message.includes("plate_not_blank")) {
    return new UserError("Placa é obrigatória.");
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
    .from("vehicles")
    .insert(row)
    .select()
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
};

// `%`, `_` e `*` são curinga para o PostgREST. O gestor está digitando uma
// placa, não um padrão de busca: os curingas somem em vez de virar sintaxe.
function contains(term: string): string {
  return `%${term.trim().replace(/[%_*\\]/g, "")}%`;
}

/**
 * Os veículos da locadora de quem está logado, do mais novo para o mais antigo.
 *
 * `hasMore` diz se existe página seguinte. Ele sai de uma linha a mais pedida
 * ao banco — mais barato que um `count` exato, que varreria a frota inteira a
 * cada busca só para escrever um número na tela.
 *
 * ponytail: busca por pedaço de placa é varredura dentro da locadora; índice
 * trigram (`pg_trgm`) quando uma frota passar de alguns milhares de motos.
 */
export async function listVehicles(
  client: SupabaseClient,
  filters: VehicleFilters = {},
): Promise<{ vehicles: Vehicle[]; hasMore: boolean }> {
  // Veículo com baixa não está mais na frota. O filtro vive aqui, e não numa
  // policy, porque a policy de update precisa continuar alcançando a linha
  // para dar a baixa.
  let query = client.from("vehicles").select().is("deleted_at", null);

  if (filters.plate) query = query.ilike("plate", contains(filters.plate));
  if (filters.brand) query = query.ilike("brand", contains(filters.brand));
  if (filters.model) query = query.ilike("model", contains(filters.model));
  if (filters.year) query = query.eq("year", filters.year);
  if (filters.status) query = query.eq("status", filters.status);

  const from = (Math.max(1, filters.page ?? 1) - 1) * VEHICLES_PER_PAGE;

  const { data, error } = await query
    .order("created_at", { ascending: false })
    // `range` é inclusivo nas duas pontas: isto pede VEHICLES_PER_PAGE + 1.
    .range(from, from + VEHICLES_PER_PAGE);

  if (error) throw error;

  const rows = data as VehicleRow[];
  return {
    vehicles: rows.slice(0, VEHICLES_PER_PAGE).map(toVehicle),
    hasMore: rows.length > VEHICLES_PER_PAGE,
  };
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
    .from("vehicles")
    .select()
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) throw error;
  return data ? toVehicle(data as VehicleRow) : null;
}

/**
 * Altera a situação de um veículo.
 *
 * Devolve `null` quando nenhuma linha era do gestor: a RLS filtra antes do
 * update, então veículo de outra locadora não é recusado com erro — ele
 * simplesmente não existe para quem pediu, igual em `findVehicle`.
 */
export async function setVehicleStatus(
  client: SupabaseClient,
  id: string,
  status: VehicleStatus,
): Promise<Vehicle | null> {
  const { data, error } = await client
    .from("vehicles")
    .update({ status })
    .eq("id", id)
    .is("deleted_at", null)
    .select()
    .maybeSingle();

  if (error) throw error;
  return data ? toVehicle(data as VehicleRow) : null;
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
    .from("vehicles")
    .update(row)
    .eq("id", id)
    .is("deleted_at", null)
    .select()
    .maybeSingle();

  if (error) throw toDomainError(error, row.plate);
  return data ? toVehicle(data as VehicleRow) : null;
}

/**
 * Dá baixa num veículo: ele sai da frota e a linha fica.
 *
 * A baixa é um `update`, não um `delete` — quem já podia alterar o veículo
 * pode dar baixa nele, e a policy que existe basta. O `is("deleted_at", null)`
 * antes do update faz a segunda baixa devolver `null` em vez de mexer na data
 * da primeira.
 */
export async function removeVehicle(
  client: SupabaseClient,
  id: string,
): Promise<Vehicle | null> {
  const { data, error } = await client
    .from("vehicles")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .is("deleted_at", null)
    .select()
    .maybeSingle();

  if (error) throw error;
  return data ? toVehicle(data as VehicleRow) : null;
}
