import type { SupabaseClient } from "@supabase/supabase-js";

/** Unidade alugável da frota de uma locadora. */
export type Vehicle = {
  id: string;
  tenantId: string;
  plate: string;
  brand: string;
  model: string;
  year: number;
  createdAt: string;
};

export type NewVehicle = Pick<Vehicle, "plate" | "brand" | "model" | "year">;

/** A linha como o Postgres a devolve. Não sai do módulo. */
type VehicleRow = {
  id: string;
  tenant_id: string;
  plate: string;
  brand: string;
  model: string;
  year: number;
  created_at: string;
};

// Quem chama o módulo fala o vocabulário do domínio, não o do banco.
function toVehicle(row: VehicleRow): Vehicle {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    plate: row.plate,
    brand: row.brand,
    model: row.model,
    year: row.year,
    createdAt: row.created_at,
  };
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
  const { data, error } = await client
    .from("vehicles")
    .insert(vehicle)
    .select()
    .single();

  if (error) throw error;
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
