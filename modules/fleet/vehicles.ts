import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import { UserError } from "@/lib/user-error";

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

/** Os veículos da locadora de quem está logado, do mais novo para o mais antigo. */
export async function listVehicles(client: SupabaseClient): Promise<Vehicle[]> {
  const { data, error } = await client
    .from("vehicles")
    .select()
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data as VehicleRow[]).map(toVehicle);
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
    .maybeSingle();

  if (error) throw error;
  return data ? toVehicle(data as VehicleRow) : null;
}
