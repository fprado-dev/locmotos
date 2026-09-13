import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import {
  calendarDay,
  calendarDayOf,
  isoDay,
  isoMonthsAfter,
} from "@/lib/calendar";
import { UserError } from "@/lib/user-error";
import { findVehicle, type VehicleStatus } from "@/modules/fleet";
import { settleReturn } from "./charges";
import { recordInspection, type InspectionInput } from "./inspections";
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
  /**
   * A moto e o nome do locatário, resolvidos na leitura.
   *
   * Não são opcionais porque a view junta as duas pontas por dentro: uma
   * locação sem moto ou sem locatário não existe — o FK composto é `not null`
   * nos dois lados, e a baixa é soft delete, então a linha continua lá.
   */
  vehicle: { plate: string; brand: string; model: string };
  renterName: string;
  /**
   * O que esta locação deve hoje, somado pela view.
   *
   * Não é situação da locação — o `CONTEXT.md` é explícito que ativa e
   * inadimplente convivem. Zero e `null` são "em dia"; `delinquency()` traduz
   * o par em dias de atraso e valor.
   */
  overdueAmount: number;
  /** O vencimento da cobrança em aberto mais antiga, ou `null`. */
  overdueSince: string | null;
  /**
   * O encerramento foi antes do fim da fidelidade.
   *
   * Gravado e não derivado de `startedOn + commitmentMonths`: a fidelidade é
   * corrigível, e corrigi-la não pode fazer um encerramento do ano passado
   * deixar de ter sido antecipado.
   */
  endedEarly: boolean;
  /** Quantas semanas faltavam para o fim da fidelidade, quando foi antecipado. */
  weeksRemaining: number | null;
  /** O que o gestor cobrou pela rescisão, se cobrou. O sistema não calcula. */
  earlyTerminationFee: number | null;
  /** A conta da caução no encerramento: o que saiu, por quê, e o que voltou. */
  depositDiscount: number | null;
  depositDiscountReason: string | null;
  depositReturned: number | null;
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
  plate: string;
  brand: string;
  model: string;
  renter_name: string;
  overdue_amount: number | string;
  overdue_since: string | null;
  ended_early: boolean;
  weeks_remaining: number | null;
  early_termination_fee: number | string | null;
  deposit_discount: number | string | null;
  deposit_discount_reason: string | null;
  deposit_returned: number | string | null;
};

/**
 * De onde se lê uma locação, e onde se escreve nela.
 *
 * A leitura passa pela view `rental_details`, que é a locação com a moto e o
 * locatário já resolvidos. É o que permite buscar por placa **ou** por nome na
 * mesma caixa e ordenar por qualquer das duas: uma condição `or` entre colunas
 * de tabelas embutidas não existe no PostgREST.
 *
 * A escrita continua na tabela — view com junção não é atualizável — e a
 * abertura relê pela view antes de devolver, para quem chamou receber sempre a
 * mesma forma.
 */
const READ = "rental_details";
const WRITE = "rentals";

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
    vehicle: { plate: row.plate, brand: row.brand, model: row.model },
    renterName: row.renter_name,
    overdueAmount: toAmount(row.overdue_amount) ?? 0,
    overdueSince: row.overdue_since,
    endedEarly: row.ended_early,
    weeksRemaining: row.weeks_remaining,
    earlyTerminationFee: toAmount(row.early_termination_fee),
    depositDiscount: toAmount(row.deposit_discount),
    depositDiscountReason: row.deposit_discount_reason,
    depositReturned: toAmount(row.deposit_returned),
  };
}

/** "2026-09-13" vira "13/09/2026" — dia de calendário, sem passar por fuso. */
function day(date: string): string {
  const [ano, mês, dia] = date.split("-");
  return `${dia}/${mês}/${ano}`;
}

/**
 * Uma locação pelo id, ou `null`.
 *
 * Locação de outra locadora cai no mesmo `null` de locação inexistente: a RLS
 * filtra antes, então nem a existência do registro vaza.
 */
export async function findRental(
  client: SupabaseClient,
  id: string,
): Promise<Rental | null> {
  const { data, error } = await client
    .from(READ)
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  return data ? toRental(data as RentalRow) : null;
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
    .from(READ)
    .select("*")
    .eq("vehicle_id", vehicleId)
    .is("ended_on", null)
    .maybeSingle();

  if (error) throw error;
  return data ? toRental(data as RentalRow) : null;
}

/** A locação ativa de um locatário, ou `null`. */
export async function activeRentalForRenter(
  client: SupabaseClient,
  renterId: string,
): Promise<Rental | null> {
  const { data, error } = await client
    .from(READ)
    .select("*")
    .eq("renter_id", renterId)
    .is("ended_on", null)
    .maybeSingle();

  if (error) throw error;
  return data ? toRental(data as RentalRow) : null;
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
      `${renter.name} já está com a ${atual.vehicle.plate}. Encerre a locação atual primeiro.`,
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
    .from(WRITE)
    .insert({
      vehicle_id: rental.vehicleId,
      renter_id: rental.renterId,
      weekly_price: rental.weeklyPrice,
      // Ausente é hoje, e quem decide isso é o default da coluna.
      ...(rental.startedOn ? { started_on: rental.startedOn } : {}),
      commitment_months: rental.commitmentMonths ?? null,
      deposit: rental.deposit ?? null,
    })
    .select("id")
    .single();

  if (error) throw toDomainError(error);

  // Relê pela view: quem chamou recebe a locação na mesma forma que a lista e
  // o painel recebem, com moto e locatário resolvidos. A linha acabou de ser
  // gravada pela locadora de quem está logado, então ela está lá.
  const aberta = await findRental(client, (data as { id: string }).id);
  if (!aberta) throw new Error("Locação aberta não pôde ser lida de volta.");

  return aberta;
}

/**
 * Onde a fidelidade termina, e o que falta para lá.
 *
 * `null` quando a locação não tem fidelidade acordada: sem prazo combinado não
 * existe sair antes dele, e o `CONTEXT.md` proíbe inventar o número.
 *
 * O corte é o dia: encerrar **no** dia em que a fidelidade se cumpre não é
 * rescisão antecipada; um dia antes, é — e faltava uma semana.
 */
export type Commitment = {
  /** O dia em que a fidelidade se cumpre. */
  endsOn: string;
  /** Encerrar nesta data seria rescisão antecipada. */
  early: boolean;
  /** Quantas semanas faltavam. Zero quando já não faltava nenhuma. */
  weeksRemaining: number;
};

export function commitmentAt(
  rental: { startedOn: string; commitmentMonths: number | null },
  endedOn: string,
): Commitment | null {
  if (!rental.commitmentMonths) return null;

  const endsOn = isoMonthsAfter(rental.startedOn, rental.commitmentMonths);
  const faltando = calendarDayOf(endsOn) - calendarDayOf(endedOn);

  return {
    endsOn,
    early: faltando > 0,
    // Semana começada é semana que faltava: quem sai com três dias para o fim
    // saiu antes, e arredondar para baixo diria que não faltava nada.
    weeksRemaining: Math.max(0, Math.ceil(faltando / 7)),
  };
}

/**
 * Quantas semanas a locação durou — ou dura, se ainda está de pé.
 *
 * É a mesma conta que o gerador de ciclos faz: a semana começada conta
 * inteira, então o número bate com quantas cobranças a locação gerou. Duas
 * contas diferentes para "quantas semanas" acabariam divergindo na tela.
 */
export function rentalWeeks(
  rental: { startedOn: string; endedOn: string | null },
  today = new Date(),
): number {
  const fim = rental.endedOn
    ? calendarDayOf(rental.endedOn)
    : calendarDay(today);

  return Math.max(
    1,
    Math.ceil((fim - calendarDayOf(rental.startedOn) + 1) / 7),
  );
}

/**
 * O que o gestor decide no encerramento.
 *
 * Tudo opcional: encerrar hoje, sem desconto e sem cobrança de rescisão é o
 * caso comum — a moto voltou, a caução volta inteira.
 */
export type Ending = {
  /** Quando a moto voltou. Ausente é hoje. */
  endedOn?: string | null;
  depositDiscount?: number | null;
  depositDiscountReason?: string | null;
  /** O que foi cobrado pela rescisão. Digitado, nunca calculado. */
  earlyTerminationFee?: number | null;
  /**
   * A vistoria de devolução, se o gestor conferiu a moto.
   *
   * Opcional como a vistoria inteira é opcional (issue #47): a maioria das
   * devoluções não vai ter uma, e exigi-la faria o encerramento parar por uma
   * anotação que ninguém tem.
   */
  inspection?: InspectionInput;
};

/**
 * Encerra uma locação: a moto volta para a frota e o locatário fica livre.
 *
 * Quase nada disso é escrito aqui, e é esse o ponto. A moto volta a
 * `available` porque "reservada" é derivada de locação ativa desde a #35; o
 * locatário fica livre porque o índice único de locação ativa passa a não
 * pegá-lo; a lista de ativas encolhe porque "ativa" é `ended_on is null`.
 * Encerrar é gravar uma data — o resto é consequência de leitura.
 *
 * O que **não** acontece: cobrança vencida e não paga não é apagada. Ela
 * continua devida depois da devolução da moto, e quem avisa antes de confirmar
 * é a tela.
 *
 * O que acontece com o dinheiro é uma coisa só: o ciclo em curso é rateado por
 * dia (issue #46). Quem devolve na quarta paga três dias da semana, não sete —
 * e quem já tinha pago a semana adiantada continua com ela inteira, porque
 * crédito a devolver é coisa que a v1 não sabe guardar.
 *
 * A rescisão antecipada é **registrada, não calculada**. Quanto paga quem sai
 * antes do fim da fidelidade é a lacuna nº 2 do `CONTEXT.md`, e só o dono da
 * locadora responde. Aqui fica gravado que foi antecipada e quantas semanas
 * faltavam — o dado de que a regra vai precisar no dia em que existir.
 */
export async function endRental(
  client: SupabaseClient,
  id: string,
  ending: Ending = {},
  today = new Date(),
): Promise<Rental> {
  const atual = await findRental(client, id);
  if (!atual) throw new UserError("Locação não encontrada.");

  if (atual.endedOn) {
    throw new UserError(
      `Esta locação já foi encerrada em ${day(atual.endedOn)}.`,
    );
  }

  const hoje = isoDay(today);
  const endedOn = ending.endedOn || hoje;

  if (endedOn > hoje) {
    throw new UserError(
      "A data de encerramento não pode estar no futuro.",
      "endedOn",
    );
  }

  if (endedOn < atual.startedOn) {
    throw new UserError(
      `A locação começou em ${day(atual.startedOn)} e não pode ser encerrada antes disso.`,
      "endedOn",
    );
  }

  const caução = atual.deposit;
  const desconto = ending.depositDiscount ?? 0;
  const motivo = ending.depositDiscountReason?.trim() || null;

  if (desconto > 0 && !motivo) {
    throw new UserError(
      "Informe o motivo do desconto na caução.",
      "depositDiscountReason",
    );
  }

  if (desconto > (caução ?? 0)) {
    throw new UserError(
      caução
        ? `O desconto não pode passar da caução de R$ ${caução.toFixed(2)}.`
        : "Esta locação não tem caução para descontar.",
      "depositDiscount",
    );
  }

  const fidelidade = commitmentAt(atual, endedOn);

  // Antes do `update` porque vistoria também tem recusa — odômetro menor que o
  // da entrega —, e uma recusa depois de encerrar chegaria tarde demais: a
  // locação já estaria fechada quando o recado aparecesse.
  //
  // Se o `update` abaixo perder a corrida, a vistoria já gravada continua
  // válida: quem ganhou encerrou a mesma locação, e a moto voltou do mesmo
  // jeito.
  if (ending.inspection) {
    await recordInspection(client, id, "return", ending.inspection);
  }

  const { data, error } = await client
    .from(WRITE)
    .update({
      ended_on: endedOn,
      ended_early: fidelidade?.early ?? false,
      weeks_remaining: fidelidade?.early ? fidelidade.weeksRemaining : null,
      early_termination_fee: ending.earlyTerminationFee ?? null,
      // Sem caução não há conta de caução: as três colunas ficam nulas em vez
      // de gravar zeros que pareceriam uma devolução que nunca houve.
      deposit_discount: caução === null ? null : desconto,
      deposit_discount_reason: caução === null ? null : motivo,
      deposit_returned: caução === null ? null : caução - desconto,
    })
    .eq("id", id)
    // A corrida: duas telas encerrando a mesma locação. A segunda não acha
    // linha para atualizar, e recebe recado em vez de sobrescrever a conta da
    // primeira.
    .is("ended_on", null)
    .select("id")
    .maybeSingle();

  if (error) throw error;
  if (!data) {
    throw new UserError(
      "Esta locação acabou de ser encerrada em outra tela. Recarregue.",
    );
  }

  // A conta fecha junto com a locação: o ciclo em curso deixa de valer a
  // semana cheia e passa a valer os dias andados, e as semanas que começam
  // depois da devolução — que existem quando o encerramento é retroativo — vão
  // embora. Quem sabe as duas regras é o banco, que precisa da mesma conta no
  // gerador de ciclos.
  //
  // Depois do `update` de propósito: as duas dependem de `ended_on` já gravado,
  // e quem perdeu a corrida acima nem chega aqui.
  await settleReturn(client, id);

  const encerrada = await findRental(client, id);
  if (!encerrada)
    throw new Error("Locação encerrada não pôde ser lida de volta.");

  return encerrada;
}

/**
 * As locações encerradas de um locatário, da mais recente para a mais antiga.
 *
 * É o bloco "Histórico de locações" do painel: com que motos a pessoa já
 * andou, por quanto tempo, e como cada uma terminou. A locação em pé fica de
 * fora — ela já tem o cartão dela logo acima.
 */
export async function rentalHistory(
  client: SupabaseClient,
  renterId: string,
  limit = 10,
): Promise<Rental[]> {
  const { data, error } = await client
    .from(READ)
    .select("*")
    .eq("renter_id", renterId)
    .not("ended_on", "is", null)
    .order("ended_on", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data as RentalRow[]).map(toRental);
}

/** Quantas locações cabem numa página da lista. */
export const RENTALS_PER_PAGE = 20;

/**
 * O recorte que os chips da tela oferecem.
 *
 * "Todas" é a ausência de recorte, como nas outras telas.
 *
 * "Inadimplentes" está entre elas sendo de outra natureza: ativa e encerrada
 * são fases da vida da locação, inadimplência não é fase nenhuma — uma locação
 * pode estar ativa e devendo ao mesmo tempo. Continua sendo chip porque chip
 * aqui é recorte, não estado: o gestor pergunta "me mostra quem deve", e a
 * resposta cruza as duas outras.
 */
export const RENTAL_SITUATIONS = ["active", "ended", "overdue"] as const;

export type RentalSituation = (typeof RENTAL_SITUATIONS)[number];

/**
 * O que o gestor pediu para ver.
 *
 * `q` procura por placa ou por nome do locatário numa busca só — o gestor tem
 * a moto na frente ou a pessoa no telefone, e não sabe de antemão por qual dos
 * dois vai procurar.
 */
export type RentalFilters = {
  q?: string;
  situation?: RentalSituation;
  /** Começa em 1. */
  page?: number;
  sort?: RentalSort;
  direction?: SortDirection;
};

/**
 * Por qual coluna a lista vem ordenada.
 *
 * Situação não está aqui de propósito: ela virou chip, e com um filtro de
 * "Ativas" ao lado, ordenar por ela responderia a mesma pergunta duas vezes —
 * a mesma escolha que a coluna Restrição de Locatários.
 */
const SORTS = {
  vehicle: { column: "plate" },
  renter: { column: "renter_name" },
  weeklyPrice: { column: "weekly_price" },
  startedOn: { column: "started_on" },
  commitment: { column: "commitment_months" },
  // Ordena por *desde quando* se deve, que é a ordem de quem cobra: a mais
  // antiga em aberto primeiro. O chip diz quem deve, a coluna diz há quanto
  // tempo — perguntas diferentes.
  finance: { column: "overdue_since" },
} as const satisfies Record<string, { column: string }>;

/** As chaves de ordenação, para quem precisa validar o que veio da URL. */
export const RENTAL_SORTS = Object.keys(SORTS) as RentalSort[];

export type RentalSort = keyof typeof SORTS;

export type SortDirection = "asc" | "desc";

/**
 * Como a lista chega quando ninguém pediu ordem: a locação mais recente
 * primeiro — é a que o gestor acabou de abrir, e é por ela que ele volta.
 */
export const DEFAULT_RENTAL_SORT: {
  sort: RentalSort;
  direction: SortDirection;
} = { sort: "startedOn", direction: "desc" };

/**
 * A busca da tela como uma condição do PostgREST, ou nada.
 *
 * Placa e nome por pedaço, na mesma caixa. A vírgula separa as alternativas na
 * sintaxe do `or`, então ela — e os curingas — saem do termo antes de virar
 * sintaxe em vez de busca.
 */
function searchClause(q: string | undefined): string | null {
  const termo = q?.trim().replace(/[,()%*\\"]/g, "");
  if (!termo) return null;

  return [`plate.ilike.*${termo}*`, `renter_name.ilike.*${termo}*`].join(",");
}

/**
 * Os filtros da tela aplicados sobre uma consulta já começada.
 *
 * Recebe e devolve o builder em vez de montar a consulta inteira porque a
 * lista e os contadores começam de selects diferentes e terminam no mesmo
 * recorte. `skipSituation` é o que faz o contador do chip responder "quantas
 * sobrariam se eu clicasse aqui" em vez de "quantas existem".
 *
 * O tipo do builder do PostgREST carrega o schema inteiro em parâmetros, e
 * anotá-lo por fora estoura o limite de instanciação do TypeScript; daí o
 * genérico solto, preso só ao que é usado aqui dentro.
 */
type Filterable = {
  or: (filter: string) => Filterable;
  is: (column: string, value: null) => Filterable;
  not: (column: string, operator: string, value: null) => Filterable;
  gt: (column: string, value: number) => Filterable;
};

function filtered<T extends Filterable>(
  query: T,
  filters: RentalFilters,
  { skipSituation = false } = {},
): T {
  let atual: Filterable = query;

  const busca = searchClause(filters.q);
  if (busca) atual = atual.or(busca);

  if (!skipSituation) {
    // Ativa é a que não tem data de encerramento. A situação não é coluna
    // própria porque o fato é o encerramento, não o rótulo.
    if (filters.situation === "active") atual = atual.is("ended_on", null);
    if (filters.situation === "ended") {
      atual = atual.not("ended_on", "is", null);
    }
    // Quem tem cobrança vencida e não paga. A soma já veio da view: fora do
    // banco, excluir os adimplentes depois de paginar faria a paginação
    // mentir sobre quantos são.
    if (filters.situation === "overdue") atual = atual.gt("overdue_amount", 0);
  }

  return atual as T;
}

/**
 * Uma página de locações da locadora de quem está logado.
 *
 * `total` é quantas passaram pelo filtro, não quantas vieram na página: é o N
 * do "1–20 de N" no rodapé.
 *
 * ponytail: busca por pedaço de placa e de nome é varredura dentro da
 * locadora; índice trigram (`pg_trgm`) quando uma locadora passar de alguns
 * milhares de locações.
 */
export async function listRentals(
  client: SupabaseClient,
  filters: RentalFilters = {},
): Promise<{ rentals: Rental[]; hasMore: boolean; total: number }> {
  // O mesmo recorte responde às duas perguntas da tela: quais locações entram
  // nesta página, e quantas passaram pelo filtro.
  function scoped(count?: { count: "exact"; head: true }) {
    return filtered(client.from(READ).select("*", count), filters);
  }

  let query = scoped();

  const order = SORTS[filters.sort ?? DEFAULT_RENTAL_SORT.sort];
  const ascending =
    (filters.direction ?? DEFAULT_RENTAL_SORT.direction) === "asc";

  // Valor ausente não é urgência: locação sem fidelidade acordada cai no fim
  // da lista nos dois sentidos.
  query = query.order(order.column, { ascending, nullsFirst: false });

  // Desempate pela abertura, sempre. Sem ele, duas linhas de mesmo valor podem
  // trocar de lugar entre uma página e a seguinte — e aí a paginação repete
  // uma locação e esconde outra. É também o que põe na frente a que o gestor
  // acabou de abrir, quando duas começam no mesmo dia.
  query = query.order("created_at", { ascending: false });

  const from = (Math.max(1, filters.page ?? 1) - 1) * RENTALS_PER_PAGE;

  // A contagem vai numa consulta à parte, e não junto com as linhas, porque
  // PostgREST recusa com 416 o `range` que começa além do fim — e a página
  // vive na URL, onde qualquer número cabe.
  const [page, counted] = await Promise.all([
    // `range` é inclusivo nas duas pontas.
    query.range(from, from + RENTALS_PER_PAGE - 1),
    scoped({ count: "exact", head: true }),
  ]);

  if (page.error) throw page.error;
  if (counted.error) throw counted.error;

  const rows = page.data as RentalRow[];
  const total = counted.count ?? rows.length;

  return {
    rentals: rows.map(toRental),
    hasMore: from + rows.length < total,
    total,
  };
}

/**
 * Os números do topo da tela, e os contadores dos chips.
 *
 * Chamada sem filtro, é o que os cards mostram: quantas locações estão de pé e
 * quanto elas somam por semana. Com a busca, vira o contador de cada chip —
 * "quantas sobrariam se eu clicasse aqui", que é o que faz do chip uma
 * pergunta já respondida.
 *
 * `activeWeeklyPrice` é a receita **contratada**, não a recebida: é a soma do
 * que foi acordado. Quem paga e quem não paga são os outros dois números:
 * `overdue` conta as locações com cobrança vencida em aberto, e
 * `overdueAmount` soma o que elas devem.
 *
 * ponytail: soma no aplicativo sobre uma leitura das locações da locadora,
 * como em `fleetSummary`. Vira view agregada quando uma locadora passar de
 * alguns milhares de locações.
 */
export type RentalCounts = {
  all: number;
  active: number;
  ended: number;
  overdue: number;
  activeWeeklyPrice: number;
  overdueAmount: number;
};

export async function rentalCounts(
  client: SupabaseClient,
  filters: RentalFilters = {},
): Promise<RentalCounts> {
  const query = client
    .from(READ)
    .select("ended_on, weekly_price, overdue_amount");

  const { data, error } = await filtered(query, filters, {
    skipSituation: true,
  });

  if (error) throw error;

  const rows = data as Pick<
    RentalRow,
    "ended_on" | "weekly_price" | "overdue_amount"
  >[];
  const counts: RentalCounts = {
    all: rows.length,
    active: 0,
    ended: 0,
    overdue: 0,
    activeWeeklyPrice: 0,
    overdueAmount: 0,
  };

  for (const row of rows) {
    if (row.ended_on === null) {
      counts.active += 1;
      counts.activeWeeklyPrice += toAmount(row.weekly_price) ?? 0;
    } else {
      counts.ended += 1;
    }

    // Encerrada também conta: quem devolveu a moto devendo continua devendo.
    const devendo = toAmount(row.overdue_amount) ?? 0;
    if (devendo > 0) {
      counts.overdue += 1;
      counts.overdueAmount += devendo;
    }
  }

  return counts;
}
