import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import { UserError } from "@/lib/user-error";
import { findVehicle, type VehicleStatus } from "@/modules/fleet";
import { findRenter } from "@/modules/renters";

/**
 * Por que uma moto que não está disponível não entra em locação.
 *
 * São frases de recusa, não os rótulos do select da Frota: aqui elas entram no
 * meio de uma sentença, e "Em manutenção" no lugar de "está em manutenção"
 * sairia truncado. `reserved` não está na lista porque tem recado próprio — o
 * de uma locação com data e placa.
 */
const NOT_AVAILABLE: Record<
  Exclude<VehicleStatus, "available" | "reserved">,
  string
> = {
  maintenance: "está em manutenção",
  unavailable: "está indisponível",
};

/**
 * Acordo pelo qual a locadora cede uma moto a um locatário.
 *
 * `endedOn` nulo é locação ativa: o encerramento é o fato, e a linha nunca é
 * apagada — ela é o histórico da moto e o do locatário.
 */
export type Rental = {
  id: string;
  tenantId: string;
  vehicleId: string;
  renterId: string;
  /**
   * O valor semanal acordado, registrado e não calculado.
   *
   * É cópia do valor da moto no momento da abertura. Mexer na tabela de preços
   * da frota não mexe no que já foi combinado com quem está na rua.
   */
  weeklyPrice: number;
  startedOn: string;
  /** Fidelidade em meses, quando foi acordada. */
  commitmentMonths: number | null;
  deposit: number | null;
  endedOn: string | null;
  createdAt: string;
  /** A moto, para a tela não precisar de uma segunda ida ao banco. */
  vehicle: { plate: string; brand: string; model: string } | null;
};

/**
 * O que o gestor preenche ao abrir a locação.
 *
 * `tenantId` fica de fora: quem carimba é o banco, a partir do JWT. A data de
 * início também é opcional — sem ela, o banco usa hoje.
 */
export type NewRental = {
  vehicleId: string;
  renterId: string;
  weeklyPrice: number;
  startedOn?: string | null;
  commitmentMonths?: number | null;
  deposit?: number | null;
};

/** A linha como o Postgres a devolve. Não sai do módulo. */
type RentalRow = {
  id: string;
  tenant_id: string;
  vehicle_id: string;
  renter_id: string;
  weekly_price: number | string;
  started_on: string;
  commitment_months: number | null;
  deposit: number | string | null;
  ended_on: string | null;
  created_at: string;
  vehicles: { plate: string; brand: string; model: string } | null;
};

const COLUMNS = "*, vehicles(plate, brand, model)";

// `numeric` chega como string em algumas versões do PostgREST e como número em
// outras; quem consome o módulo não deveria precisar saber disso.
function toAmount(value: number | string | null): number | null {
  return value === null ? null : Number(value);
}

// Quem chama o módulo fala o vocabulário do domínio, não o do banco.
function toRental(row: RentalRow): Rental {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    vehicleId: row.vehicle_id,
    renterId: row.renter_id,
    weeklyPrice: toAmount(row.weekly_price) ?? 0,
    startedOn: row.started_on,
    commitmentMonths: row.commitment_months,
    deposit: toAmount(row.deposit),
    endedOn: row.ended_on,
    createdAt: row.created_at,
    vehicle: row.vehicles,
  };
}

/** "2026-09-13" vira "13/09/2026" — dia de calendário, sem passar por fuso. */
function day(date: string): string {
  const [ano, mês, dia] = date.split("-");
  return `${dia}/${mês}/${ano}`;
}

/**
 * A locação ativa de uma moto, ou `null`.
 *
 * Existe para a recusa ter o que dizer: "esta moto já está alugada" sem dizer
 * desde quando deixa o gestor procurando na tela qual locação é.
 */
export async function activeRentalForVehicle(
  client: SupabaseClient,
  vehicleId: string,
): Promise<Rental | null> {
  const { data, error } = await client
    .from("rentals")
    .select(COLUMNS)
    .eq("vehicle_id", vehicleId)
    .is("ended_on", null)
    .maybeSingle();

  if (error) throw error;
  return data ? toRental(data as unknown as RentalRow) : null;
}

/**
 * A locação ativa de um locatário, ou `null`.
 *
 * Locação de outra locadora cai no mesmo `null` de locação inexistente: a RLS
 * filtra antes, então nem a existência do registro vaza.
 */
export async function activeRentalForRenter(
  client: SupabaseClient,
  renterId: string,
): Promise<Rental | null> {
  const { data, error } = await client
    .from("rentals")
    .select(COLUMNS)
    .eq("renter_id", renterId)
    .is("ended_on", null)
    .maybeSingle();

  if (error) throw error;
  return data ? toRental(data as unknown as RentalRow) : null;
}

/**
 * Erro do Postgres virando recado para o gestor.
 *
 * As garantias que a tabela impõe chegam aqui como código; quem preencheu o
 * formulário precisa de frase. O índice único é o que de fato impede a segunda
 * locação na mesma moto — a checagem lá em cima existe para o recado ser bom,
 * não para ser a garantia.
 */
function toDomainError(error: PostgrestError): Error {
  if (error.code === "23505") {
    // Os dois índices únicos parciais — um por moto, um por locatário — caem
    // aqui. Chegar até o banco significa que alguém abriu a outra locação
    // entre a leitura de cima e este insert.
    return new UserError(
      "A moto ou o locatário acabou de entrar em outra locação. Recarregue a tela.",
      "vehicleId",
    );
  }

  // FK composto: o id veio do browser e aponta para fora desta locadora.
  if (error.code === "23503") {
    return new UserError("Veículo ou locatário não encontrado.", "vehicleId");
  }

  if (error.code === "23514") {
    if (error.message.includes("weekly_price")) {
      return new UserError("Valor semanal inválido.", "weeklyPrice");
    }
    if (error.message.includes("commitment_months")) {
      return new UserError("Fidelidade inválida.", "commitmentMonths");
    }
    if (error.message.includes("deposit")) {
      return new UserError("Caução inválida.", "deposit");
    }
  }

  return error;
}

/**
 * Abre uma locação: a moto sai da frota disponível e o locatário passa a pagar.
 *
 * As recusas são do negócio, e cada uma diz por quê:
 *
 * - **locatário com restrição** não abre locação, e o recado carrega o motivo
 *   registrado — é exatamente para isso que a restrição existe;
 * - **moto que não está disponível** não abre locação, e quando a razão é já
 *   estar alugada, o recado diz desde quando;
 * - **locatário que já está com uma moto** não abre a segunda: a tela fala de
 *   "locação atual" no singular, e o índice único do banco garante que ela
 *   possa. Se a locadora passar a alugar duas motos para a mesma pessoa, some
 *   o índice e esta recusa junto.
 *
 * E uma que não é recusa: **CNH vencida não impede.** Entregar moto a quem
 * está com a habilitação vencida é risco da locadora, mas transformar isso em
 * bloqueio é regra que ninguém decidiu — o aviso fica na tela e a decisão é de
 * quem opera.
 */
export async function openRental(
  client: SupabaseClient,
  rental: NewRental,
): Promise<Rental> {
  if (!(rental.weeklyPrice > 0)) {
    throw new UserError("Informe o valor semanal da locação.", "weeklyPrice");
  }

  // Os dois ids vêm do browser. Quem decide o que é desta locadora é a RLS:
  // moto ou locatário de outra caem no mesmo `null` de id inventado. As três
  // leituras vão juntas porque nenhuma depende da outra.
  const [renter, vehicle, atual] = await Promise.all([
    findRenter(client, rental.renterId),
    findVehicle(client, rental.vehicleId),
    activeRentalForRenter(client, rental.renterId),
  ]);

  if (!renter) throw new UserError("Locatário não encontrado.", "renterId");
  if (!vehicle) throw new UserError("Veículo não encontrado.", "vehicleId");

  if (renter.restriction) {
    throw new UserError(
      `${renter.name} está com restrição e não pode abrir nova locação: ${renter.restriction.reason}`,
      "renterId",
    );
  }

  if (atual) {
    throw new UserError(
      `${renter.name} já está com a ${atual.vehicle?.plate ?? "moto"}. Encerre a locação atual primeiro.`,
      "renterId",
    );
  }

  if (vehicle.status === "reserved") {
    // "Reservada" é a situação derivada de locação ativa: aqui ela ganha data
    // e placa, que é o que o gestor precisa para achar a locação que ocupa a
    // moto em vez de sair procurando.
    const ocupando = await activeRentalForVehicle(client, vehicle.id);

    throw new UserError(
      ocupando
        ? `A ${vehicle.plate} está em locação aberta desde ${day(ocupando.startedOn)}.`
        : `A ${vehicle.plate} já está alugada.`,
      "vehicleId",
    );
  }

  if (vehicle.status !== "available") {
    throw new UserError(
      `A ${vehicle.plate} ${NOT_AVAILABLE[vehicle.status]} e não pode ser alugada.`,
      "vehicleId",
    );
  }

  const { data, error } = await client
    .from("rentals")
    .insert({
      vehicle_id: rental.vehicleId,
      renter_id: rental.renterId,
      weekly_price: rental.weeklyPrice,
      // Ausente é hoje, e quem decide isso é o default da coluna.
      ...(rental.startedOn ? { started_on: rental.startedOn } : {}),
      commitment_months: rental.commitmentMonths ?? null,
      deposit: rental.deposit ?? null,
    })
    .select(COLUMNS)
    .single();

  if (error) throw toDomainError(error);
  return toRental(data as unknown as RentalRow);
}
