import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { isoDay } from "@/lib/calendar";
import {
  createVehicle,
  daysWithoutRental,
  findVehicle,
  removeVehicle,
  removeVehicles,
} from "@/modules/fleet";
import { createRenter } from "@/modules/renters";
import {
  createAdminClient,
  createAuthenticatedClient,
} from "@/tests/helpers/supabase";
import {
  activeRentalForRenter,
  commitmentAt,
  endRental,
  findRental,
  generateCharges,
  kilometersRun,
  openRental,
  overdueCharges,
  payCharge,
  recordInspection,
  rentalCounts,
  rentalHistory,
  rentalInspections,
  rentalWeeks,
} from "./index";

const cleanups: Array<() => Promise<void>> = [];

afterAll(async () => {
  await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
});

/** Um gestor autenticado, com a locadora dele gravada no JWT. */
async function createManager(): Promise<SupabaseClient> {
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("tenants")
    .insert({ name: "Locadora de teste" })
    .select("id")
    .single();
  if (error) throw error;
  const tenantId = data.id as string;

  const { client, cleanup } = await createAuthenticatedClient({
    appMetadata: { tenant_id: tenantId },
  });

  cleanups.push(async () => {
    await admin.from("tenants").delete().eq("id", tenantId);
    await cleanup();
  });

  return client;
}

/** Uma placa que não colide com a de outro teste rodando no mesmo projeto. */
function plate(): string {
  const alfabeto = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const letras = Array.from(
    { length: 3 },
    () => alfabeto[Math.floor(Math.random() * alfabeto.length)],
  ).join("");

  return `${letras}${Math.floor(Math.random() * 9000 + 1000)}`;
}

/** O dia de hoje como o banco o vê — o corte de ciclo é `today_br()`. */
async function hojeNoBanco(client: SupabaseClient): Promise<string> {
  const { data, error } = await client.rpc("today_br");
  if (error) throw error;
  return data as string;
}

/** "2026-09-13" menos N dias, sem passar por fuso. */
function diasAntes(hoje: string, dias: number): string {
  return isoDay(new Date(`${hoje}T12:00:00`), -dias);
}

/**
 * O corte da fidelidade, com a data na mão.
 *
 * Sem banco: é conta de calendário, e o que ela precisa provar é a virada —
 * encerrar no dia em que a fidelidade se cumpre não é rescisão antecipada, e
 * um dia antes é.
 */
describe("o corte da fidelidade", () => {
  const locação = { startedOn: "2026-09-13", commitmentMonths: 12 };

  it("sem fidelidade acordada não existe sair antes dela", () => {
    expect(
      commitmentAt(
        { startedOn: "2026-09-13", commitmentMonths: null },
        "2026-09-20",
      ),
    ).toBeNull();
  });

  it("encerrar no último dia da fidelidade não é antecipado", () => {
    expect(commitmentAt(locação, "2027-09-13")).toEqual({
      endsOn: "2027-09-13",
      early: false,
      weeksRemaining: 0,
    });
  });

  it("encerrar no penúltimo dia é antecipado, e faltava uma semana", () => {
    expect(commitmentAt(locação, "2027-09-12")).toEqual({
      endsOn: "2027-09-13",
      early: true,
      weeksRemaining: 1,
    });
  });

  it("semana começada é semana que faltava", () => {
    // Oito dias antes do fim: uma semana cheia e um dia, que são duas.
    expect(commitmentAt(locação, "2027-09-05")).toMatchObject({
      early: true,
      weeksRemaining: 2,
    });
  });

  it("dia 31 mais um mês é o fim do mês seguinte, não o mês depois dele", () => {
    expect(
      commitmentAt(
        { startedOn: "2026-01-31", commitmentMonths: 1 },
        "2026-02-28",
      ),
    ).toEqual({ endsOn: "2026-02-28", early: false, weeksRemaining: 0 });
  });

  it("conta as semanas de uma locação como o gerador de ciclos conta", () => {
    // Vinte e um dias corridos são três ciclos: a semana começada conta
    // inteira nos dois lugares, ou a tela e a cobrança discordariam.
    expect(
      rentalWeeks({ startedOn: "2026-09-13", endedOn: "2026-10-03" }),
    ).toBe(3);
    expect(
      rentalWeeks({ startedOn: "2026-09-13", endedOn: "2026-09-13" }),
    ).toBe(1);
  });
});

/** A locadora que os dois blocos de banco dividem — cada login tem cota. */
const compartilhado: {
  client: SupabaseClient;
  rentalId: string;
  /** A locação que a moto liberada recebeu — a baixa esbarra nela. */
  novaId: string;
  vehicleId: string;
} = { client: null!, rentalId: "", novaId: "", vehicleId: "" };

describe("encerrar locação", () => {
  let gestor: SupabaseClient;
  let hoje: string;
  let motoId: string;
  let locatáriaId: string;

  beforeAll(async () => {
    gestor = await createManager();
    compartilhado.client = gestor;
    hoje = await hojeNoBanco(gestor);

    const [moto, locatária] = await Promise.all([
      createVehicle(gestor, {
        plate: plate(),
        brand: "Honda",
        model: "CG 160",
        year: 2024,
        weeklyPrice: 300,
      }),
      createRenter(gestor, { name: "Ana Ribeiro", cpf: "529.982.247-25" }),
    ]);

    motoId = moto.id;
    compartilhado.vehicleId = moto.id;
    locatáriaId = locatária.id;

    const locação = await openRental(gestor, {
      vehicleId: moto.id,
      renterId: locatária.id,
      weeklyPrice: 300,
      startedOn: diasAntes(hoje, 21),
      commitmentMonths: 12,
      deposit: 500,
    });

    compartilhado.rentalId = locação.id;
    await generateCharges(gestor);
  });

  it("não encerra numa data que a locação ainda não tinha começado", async () => {
    await expect(
      endRental(gestor, compartilhado.rentalId, {
        endedOn: diasAntes(hoje, 30),
      }),
    ).rejects.toThrow(/não pode ser encerrada antes/);
  });

  it("não encerra no futuro", async () => {
    await expect(
      endRental(gestor, compartilhado.rentalId, {
        endedOn: diasAntes(hoje, -1),
      }),
    ).rejects.toThrow(/futuro/);
  });

  it("desconto na caução sem motivo é recusado", async () => {
    await expect(
      endRental(gestor, compartilhado.rentalId, { depositDiscount: 120 }),
    ).rejects.toThrow(/motivo/i);
  });

  it("desconto maior que a caução é recusado", async () => {
    await expect(
      endRental(gestor, compartilhado.rentalId, {
        depositDiscount: 900,
        depositDiscountReason: "Retrovisor quebrado",
      }),
    ).rejects.toThrow(/não pode passar da caução/);
  });

  it("encerra com a conta da caução, e registra que foi antecipada", async () => {
    const encerrada = await endRental(gestor, compartilhado.rentalId, {
      depositDiscount: 120,
      depositDiscountReason: "Retrovisor quebrado",
      earlyTerminationFee: 200,
    });

    expect(encerrada).toMatchObject({
      endedOn: hoje,
      endedEarly: true,
      depositDiscount: 120,
      depositDiscountReason: "Retrovisor quebrado",
      // A caução volta descontada a avaria, e o sistema não inventa o resto.
      depositReturned: 380,
      earlyTerminationFee: 200,
    });

    // Faltava quase o ano inteiro: o número exato depende do calendário, e
    // quem o pina é o teste do corte, lá em cima.
    expect(encerrada.weeksRemaining).toBeGreaterThan(40);
  });

  it("a mesma locação não é encerrada duas vezes", async () => {
    await expect(endRental(gestor, compartilhado.rentalId)).rejects.toThrow(
      /já foi encerrada/,
    );
  });

  it("encerrar não apaga cobrança vencida: ela continua devida", async () => {
    const abertas = await overdueCharges(gestor, compartilhado.rentalId);
    expect(abertas).toHaveLength(3);

    expect(await findRental(gestor, compartilhado.rentalId)).toMatchObject({
      overdueAmount: 900,
    });

    // E continua no card e no chip, que é o que faz o gestor ir atrás.
    expect(await rentalCounts(gestor)).toMatchObject({
      active: 0,
      ended: 1,
      overdue: 1,
      overdueAmount: 900,
    });
  });

  it("a moto volta para a frota, e passa a contar dias parada da devolução", async () => {
    const moto = await findVehicle(gestor, motoId);

    // Ninguém tocou no select: "reservada" era derivada de locação ativa, e a
    // locação deixou de ser ativa.
    expect(moto).toMatchObject({ status: "available", idleSince: hoje });
    expect(daysWithoutRental(moto!.idleSince)).toBe(0);
  });

  it("o locatário fica livre, e a locação vira histórico", async () => {
    expect(await activeRentalForRenter(gestor, locatáriaId)).toBeNull();

    const histórico = await rentalHistory(gestor, locatáriaId);
    expect(histórico.map((locação) => locação.id)).toEqual([
      compartilhado.rentalId,
    ]);
    expect(rentalWeeks(histórico[0])).toBe(4);
  });

  it("a moto liberada entra numa locação nova", async () => {
    const outro = await createRenter(gestor, {
      name: "Bruno Salles",
      cpf: "111.444.777-35",
    });

    const nova = await openRental(gestor, {
      vehicleId: motoId,
      renterId: outro.id,
      weeklyPrice: 300,
    });

    compartilhado.novaId = nova.id;
    expect(nova).toMatchObject({ vehicleId: motoId, endedOn: null });
  });
});

/**
 * A baixa é da Frota, mas a regra só existe porque Locações existe: uma moto
 * que está na rua com alguém volta antes de sair da frota. O cenário já está
 * montado aqui — a moto do bloco de cima acabou de entrar numa locação nova —,
 * e cada locadora nova custa um login no Auth do projeto (`docs/adr/0006`).
 */
describe("baixa de moto alugada", () => {
  let gestor: SupabaseClient;

  beforeAll(() => {
    gestor = compartilhado.client;
  });

  it("é recusada enquanto a locação está de pé", async () => {
    expect(await removeVehicle(gestor, compartilhado.vehicleId)).toBeNull();

    // E a moto continua na frota, não numa baixa pela metade.
    expect(await findVehicle(gestor, compartilhado.vehicleId)).toMatchObject({
      status: "reserved",
    });
  });

  it("no lote, a alugada fica de fora e as outras passam", async () => {
    const livre = await createVehicle(gestor, {
      plate: plate(),
      brand: "Yamaha",
      model: "Factor 150",
      year: 2023,
      weeklyPrice: 280,
    });

    const baixadas = await removeVehicles(gestor, [
      compartilhado.vehicleId,
      livre.id,
    ]);

    expect(baixadas.map((moto) => moto.id)).toEqual([livre.id]);
  });

  it("encerrada a locação, a baixa passa", async () => {
    await endRental(gestor, compartilhado.novaId);

    expect(await removeVehicle(gestor, compartilhado.vehicleId)).toMatchObject({
      id: compartilhado.vehicleId,
    });
    expect(await findVehicle(gestor, compartilhado.vehicleId)).toBeNull();
  });
});

describe("isolamento entre locadoras", () => {
  it("locação de outra locadora não é encerrada", async () => {
    const outra = await createManager();

    await expect(endRental(outra, compartilhado.rentalId)).rejects.toThrow(
      /não encontrada/i,
    );

    // E a locação da vizinha continua como estava.
    expect(
      await findRental(compartilhado.client, compartilhado.rentalId),
    ).toMatchObject({ endedEarly: true, depositReturned: 380 });
  });
});

/**
 * O rateio da última semana (issue #46).
 *
 * A regra mora em SQL — o gerador de ciclos e o encerramento precisam da mesma
 * conta —, então o que se prova aqui é o resultado nas duas portas: a semana
 * que já existia inteira quando a moto voltou, e a que só nasceu depois.
 *
 * Reusa o gestor do bloco de cima: cada locadora nova custa um login no Auth
 * do projeto (`docs/adr/0006`).
 */
describe("rateio da última semana", () => {
  let gestor: SupabaseClient;
  let hoje: string;

  beforeAll(async () => {
    gestor = compartilhado.client;
    hoje = await hojeNoBanco(gestor);
  });

  /** Uma locação nova, com moto e locatário só dela. */
  async function locação(startedOn: string, cpf: string): Promise<string> {
    const [moto, pessoa] = await Promise.all([
      createVehicle(gestor, {
        plate: plate(),
        brand: "Honda",
        model: "Biz 125",
        year: 2024,
        weeklyPrice: 300,
      }),
      createRenter(gestor, { name: "Locatário do rateio", cpf }),
    ]);

    const nova = await openRental(gestor, {
      vehicleId: moto.id,
      renterId: pessoa.id,
      weeklyPrice: 300,
      startedOn,
    });

    return nova.id;
  }

  /** Os ciclos de uma locação, do mais antigo para o mais novo. */
  async function ciclos(rentalId: string) {
    const { data, error } = await gestor
      .from("charges")
      .select("id, cycle_start, cycle_end, due_on, amount")
      .eq("rental_id", rentalId)
      .order("cycle_start", { ascending: true });

    if (error) throw error;
    return data as Array<{
      id: string;
      cycle_start: string;
      cycle_end: string;
      due_on: string;
      amount: number;
    }>;
  }

  it("devolver no meio da semana paga os dias andados, não a semana", async () => {
    const id = await locação(diasAntes(hoje, 10), "168.995.597-06");
    await generateCharges(gestor);

    await endRental(gestor, id, { endedOn: diasAntes(hoje, 1) });

    const [primeira, última] = await ciclos(id);

    // A semana inteira que ela andou não é tocada: cobrança é fato consumado.
    expect(primeira).toMatchObject({
      cycle_start: diasAntes(hoje, 10),
      cycle_end: diasAntes(hoje, 4),
      amount: 300,
    });

    // Três dias de sete: 300 ÷ 7 × 3, ao centavo. E o período encolhe junto,
    // senão a tela mostraria R$ 128,57 rotulado como uma semana.
    expect(última).toMatchObject({
      cycle_start: diasAntes(hoje, 3),
      cycle_end: diasAntes(hoje, 1),
      due_on: diasAntes(hoje, 1),
      amount: 128.57,
    });
  });

  it("devolver no último dia do ciclo não rateia nada", async () => {
    const id = await locação(diasAntes(hoje, 6), "231.002.999-81");
    await generateCharges(gestor);

    await endRental(gestor, id);

    // O ciclo acabou no dia em que a moto voltou: sete dias de sete.
    expect(await ciclos(id)).toMatchObject([
      { cycle_start: diasAntes(hoje, 6), cycle_end: hoje, amount: 300 },
    ]);
  });

  it("ciclo já pago fica inteiro: a v1 não sabe guardar crédito", async () => {
    const id = await locação(diasAntes(hoje, 10), "390.533.447-05");
    await generateCharges(gestor);

    const [, emCurso] = await ciclos(id);
    await payCharge(gestor, emCurso.id, { by: "Gestor" });

    await endRental(gestor, id, { endedOn: diasAntes(hoje, 1) });

    expect((await ciclos(id))[1]).toMatchObject({
      cycle_start: diasAntes(hoje, 3),
      // O ciclo inteiro, sobrando três dias depois da devolução.
      cycle_end: diasAntes(hoje, -3),
      amount: 300,
    });
  });

  it("a semana que nasce depois do encerramento já nasce rateada", async () => {
    // Aberta e encerrada antes de o gerador rodar: no encerramento não há
    // ciclo nenhum para ratear, e quem acerta a conta é o gerador de amanhã.
    const id = await locação(diasAntes(hoje, 3), "453.178.287-91");
    await endRental(gestor, id, { endedOn: diasAntes(hoje, 1) });

    expect(await ciclos(id)).toEqual([]);

    await generateCharges(gestor);
    expect(await ciclos(id)).toMatchObject([
      {
        cycle_start: diasAntes(hoje, 3),
        cycle_end: diasAntes(hoje, 1),
        amount: 128.57,
      },
    ]);

    // E rodar de novo não cria a semana cheia por cima nem duplica a parcial.
    expect(await generateCharges(gestor)).toBe(0);
    expect(await ciclos(id)).toHaveLength(1);
  });
});

/**
 * A vistoria (issue #47).
 *
 * Reusa o gestor dos blocos de cima: cada locadora nova custa um login no Auth
 * do projeto (`docs/adr/0006`).
 */
describe("vistoria", () => {
  let gestor: SupabaseClient;
  let hoje: string;

  beforeAll(async () => {
    gestor = compartilhado.client;
    hoje = await hojeNoBanco(gestor);
  });

  /** Uma locação nova, com moto e locatário só dela. */
  async function locação(cpf: string): Promise<string> {
    const [moto, pessoa] = await Promise.all([
      createVehicle(gestor, {
        plate: plate(),
        brand: "Honda",
        model: "Pop 110",
        year: 2023,
        weeklyPrice: 210,
      }),
      createRenter(gestor, { name: "Locatário da vistoria", cpf }),
    ]);

    const nova = await openRental(gestor, {
      vehicleId: moto.id,
      renterId: pessoa.id,
      weeklyPrice: 210,
      startedOn: diasAntes(hoje, 8),
    });

    return nova.id;
  }

  it("vistoria em branco não grava linha nenhuma", async () => {
    const id = await locação("516.879.548-01");

    expect(
      await recordInspection(gestor, id, "handover", { by: "Gestor" }),
    ).toBeNull();

    expect(await rentalInspections(gestor, id)).toEqual({
      handover: null,
      return: null,
    });
  });

  it("só avaria já é vistoria: os três campos são independentes", async () => {
    const id = await locação("669.060.104-84");

    const vistoria = await recordInspection(gestor, id, "handover", {
      damages: "  Risco na carenagem direita  ",
      by: "Gestor",
    });

    expect(vistoria).toMatchObject({
      moment: "handover",
      odometer: null,
      fuel: null,
      // O espaço em volta não entra: o que fica é o que se lê.
      damages: "Risco na carenagem direita",
      by: "Gestor",
    });
  });

  it("registrar de novo corrige a que existe, e não cria uma segunda", async () => {
    const id = await locação("780.596.338-05");

    await recordInspection(gestor, id, "handover", {
      odometer: 12300,
      fuel: 2,
      by: "Gestor",
    });
    await recordInspection(gestor, id, "handover", {
      odometer: 12400,
      fuel: 2,
      by: "Quem conferiu depois",
    });

    const { handover } = await rentalInspections(gestor, id);
    expect(handover).toMatchObject({
      odometer: 12400,
      by: "Quem conferiu depois",
    });

    // Uma entrega, não duas contando histórias diferentes.
    const { count } = await gestor
      .from("inspections")
      .select("id", { count: "exact", head: true })
      .eq("rental_id", id);
    expect(count).toBe(1);
  });

  it("odômetro da devolução menor que o da entrega é recusado", async () => {
    const id = await locação("857.308.559-23");
    await recordInspection(gestor, id, "handover", {
      odometer: 12400,
      by: "Gestor",
    });

    await expect(
      endRental(gestor, id, {
        inspection: { odometer: 12399, by: "Gestor" },
      }),
    ).rejects.toThrow(/saiu com 12\.400 km/);

    // E a locação continua de pé: a recusa vem antes de encerrar.
    expect(await findRental(gestor, id)).toMatchObject({ endedOn: null });
  });

  it("encerrar com vistoria grava a devolução, e a rodagem é a subtração", async () => {
    const id = await locação("589.330.251-62");
    await recordInspection(gestor, id, "handover", {
      odometer: 12400,
      fuel: 4,
      by: "Gestor",
    });

    await endRental(gestor, id, {
      inspection: {
        odometer: 13600,
        fuel: 1,
        damages: "Retrovisor esquerdo folgado",
        by: "Gestor",
      },
    });

    const vistorias = await rentalInspections(gestor, id);
    expect(vistorias.return).toMatchObject({
      moment: "return",
      odometer: 13600,
      fuel: 1,
      damages: "Retrovisor esquerdo folgado",
    });
    expect(kilometersRun(vistorias)).toBe(1200);
  });

  it("sem odômetro nas duas pontas não existe rodagem", async () => {
    const id = await locação("596.884.135-42");
    await recordInspection(gestor, id, "handover", { fuel: 4, by: "Gestor" });
    await endRental(gestor, id, {
      inspection: { odometer: 13600, by: "Gestor" },
    });

    expect(kilometersRun(await rentalInspections(gestor, id))).toBeNull();
  });

  it("encerrar sem vistoria continua sendo o caso comum", async () => {
    const id = await locação("371.695.438-18");
    await endRental(gestor, id);

    expect(await rentalInspections(gestor, id)).toEqual({
      handover: null,
      return: null,
    });
  });
});

describe("isolamento das vistorias", () => {
  it("vistoria de locação de outra locadora não é registrada", async () => {
    const outra = await createManager();

    await expect(
      recordInspection(outra, compartilhado.rentalId, "handover", {
        odometer: 999,
        by: "Vizinha",
      }),
    ).rejects.toThrow(/não encontrada/i);
  });
});
