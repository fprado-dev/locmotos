import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { isoDay } from "@/lib/calendar";
import { createVehicle } from "@/modules/fleet";
import { createRenter } from "@/modules/renters";
import {
  createAdminClient,
  createAuthenticatedClient,
} from "@/tests/helpers/supabase";
import {
  delinquency,
  findRental,
  generateCharges,
  listRentals,
  openRental,
  payCharge,
  rentalCounts,
  rentalPayments,
  overdueCharges,
  reversePayment,
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

/**
 * O dia de hoje como o **banco** o vê, e não como a máquina do teste o vê.
 *
 * O corte de ciclo é `today_br()`; uma suíte rodando em UTC depois das 21h
 * estaria um dia à frente, e a contagem de semanas sairia diferente da do
 * gerador. Perguntar ao banco tira a máquina da conta.
 */
async function hojeNoBanco(client: SupabaseClient): Promise<string> {
  const { data, error } = await client.rpc("today_br");
  if (error) throw error;
  return data as string;
}

/** "2026-09-13" menos N dias, sem passar por fuso. */
function diasAntes(hoje: string, dias: number): string {
  return isoDay(new Date(`${hoje}T12:00:00`), -dias);
}

/** Uma locação com moto e locatário próprios, começada há N dias. */
async function novaLocação(
  client: SupabaseClient,
  {
    cpf,
    startedOn,
    weeklyPrice = 300,
  }: {
    cpf: string;
    startedOn?: string;
    weeklyPrice?: number;
  },
) {
  const [moto, locatário] = await Promise.all([
    createVehicle(client, {
      plate: plate(),
      brand: "Honda",
      model: "CG 160",
      year: 2024,
      weeklyPrice,
    }),
    createRenter(client, { name: "Ana Ribeiro", cpf }),
  ]);

  return openRental(client, {
    vehicleId: moto.id,
    renterId: locatário.id,
    weeklyPrice,
    startedOn,
  });
}

/**
 * O corte de "vencido", com a data na mão.
 *
 * Sem banco: a regra é de dia de calendário, a mesma da CNH e do
 * licenciamento, e o que ela precisa provar é a virada — o dia do vencimento
 * ainda não é atraso, o dia seguinte já é um.
 */
describe("o corte de vencido", () => {
  const hoje = new Date(2026, 8, 13);

  it("não é inadimplência enquanto não há cobrança vencida", () => {
    expect(
      delinquency({ overdueAmount: 0, overdueSince: null }, hoje),
    ).toBeNull();
  });

  it("vence hoje ainda não é atraso", () => {
    // O corte de verdade é do banco — a view só soma o que já venceu. Se ela
    // não somou, aqui também não há atraso, por mais que a data seja hoje.
    expect(
      delinquency({ overdueAmount: 0, overdueSince: "2026-09-13" }, hoje),
    ).toBeNull();
  });

  it("venceu ontem é um dia de atraso", () => {
    expect(
      delinquency({ overdueAmount: 300, overdueSince: "2026-09-12" }, hoje),
    ).toEqual({ days: 1, amount: 300 });
  });

  it("conta os dias em folhinha, não em intervalos de 24 horas", () => {
    expect(
      delinquency(
        { overdueAmount: 900, overdueSince: "2026-08-14" },
        new Date(2026, 8, 13, 23, 59),
      ),
    ).toEqual({ days: 30, amount: 900 });
  });
});

/** A locadora que os dois primeiros blocos dividem — cada login tem cota. */
const compartilhado: {
  client: SupabaseClient;
  rentalId: string;
  /** A locação aberta hoje: a cobrança dela é a única que fica em aberto. */
  abertaHojeId: string;
} = { client: null!, rentalId: "", abertaHojeId: "" };

describe("ciclos e cobranças", () => {
  let gestor: SupabaseClient;
  let hoje: string;

  beforeAll(async () => {
    gestor = await createManager();
    compartilhado.client = gestor;
    hoje = await hojeNoBanco(gestor);
  });

  it("gera um ciclo por semana já começada, e cobra o valor da locação", async () => {
    const locação = await novaLocação(gestor, {
      cpf: "529.982.247-25",
      startedOn: diasAntes(hoje, 21),
      weeklyPrice: 300,
    });
    compartilhado.rentalId = locação.id;

    expect(await generateCharges(gestor)).toBe(4);

    const { data } = await gestor
      .from("charges")
      .select("cycle_start, cycle_end, due_on, amount")
      .eq("rental_id", locação.id)
      .order("cycle_start", { ascending: true });

    expect(data).toEqual([
      {
        cycle_start: diasAntes(hoje, 21),
        cycle_end: diasAntes(hoje, 15),
        due_on: diasAntes(hoje, 15),
        amount: 300,
      },
      {
        cycle_start: diasAntes(hoje, 14),
        cycle_end: diasAntes(hoje, 8),
        due_on: diasAntes(hoje, 8),
        amount: 300,
      },
      {
        cycle_start: diasAntes(hoje, 7),
        cycle_end: diasAntes(hoje, 1),
        due_on: diasAntes(hoje, 1),
        amount: 300,
      },
      {
        cycle_start: hoje,
        cycle_end: diasAntes(hoje, -6),
        due_on: diasAntes(hoje, -6),
        amount: 300,
      },
    ]);
  });

  it("rodar o gerador de novo não cobra duas vezes", async () => {
    expect(await generateCharges(gestor)).toBe(0);

    const { count } = await gestor
      .from("charges")
      .select("id", { count: "exact", head: true })
      .eq("rental_id", compartilhado.rentalId);

    expect(count).toBe(4);
  });

  it("soma o que está vencido e diz desde quando", async () => {
    const locação = await findRental(gestor, compartilhado.rentalId);

    // Três das quatro semanas já venceram; a que começou hoje vence daqui a
    // seis dias e não entra na conta.
    expect(locação).toMatchObject({
      overdueAmount: 900,
      overdueSince: diasAntes(hoje, 15),
    });
    expect(delinquency(locação!)).toEqual({ days: 15, amount: 900 });
  });

  it("lista as cobranças em aberto, da mais antiga para a mais nova", async () => {
    const abertas = await overdueCharges(gestor, compartilhado.rentalId);

    expect(abertas.map((charge) => charge.dueOn)).toEqual([
      diasAntes(hoje, 15),
      diasAntes(hoje, 8),
      diasAntes(hoje, 1),
    ]);
    expect(abertas.reduce((soma, charge) => soma + charge.amount, 0)).toBe(900);
  });

  it("locação aberta hoje não nasce devendo", async () => {
    const locação = await novaLocação(gestor, { cpf: "111.444.777-35" });
    compartilhado.abertaHojeId = locação.id;

    expect(await generateCharges(gestor)).toBe(1);

    const lida = await findRental(gestor, locação.id);
    expect(lida).toMatchObject({ overdueAmount: 0, overdueSince: null });
    expect(delinquency(lida!)).toBeNull();
  });

  it("o chip de inadimplência recorta quem deve, e o card soma", async () => {
    const { rentals } = await listRentals(gestor, { situation: "overdue" });
    expect(rentals.map((locação) => locação.id)).toEqual([
      compartilhado.rentalId,
    ]);

    expect(await rentalCounts(gestor)).toMatchObject({
      all: 2,
      active: 2,
      overdue: 1,
      overdueAmount: 900,
    });
  });
});

const GESTOR = "Gestor · Locadora de teste";

describe("registro de pagamento", () => {
  let gestor: SupabaseClient;
  let hoje: string;

  beforeAll(async () => {
    gestor = compartilhado.client;
    hoje = await hojeNoBanco(gestor);
  });

  it("a cobrança paga sai da conta, com quem registrou junto", async () => {
    const [primeira] = await overdueCharges(gestor, compartilhado.rentalId);

    const pagamento = await payCharge(gestor, primeira.id, {
      receivedOn: diasAntes(hoje, 2),
      by: GESTOR,
    });

    expect(pagamento).toMatchObject({
      chargeId: primeira.id,
      receivedOn: diasAntes(hoje, 2),
      by: GESTOR,
      cycle: { start: diasAntes(hoje, 21), amount: 300 },
    });

    expect(await findRental(gestor, compartilhado.rentalId)).toMatchObject({
      overdueAmount: 600,
      overdueSince: diasAntes(hoje, 8),
    });
  });

  it("pagar duas vezes a mesma cobrança é recusado", async () => {
    const [pagamento] = await rentalPayments(gestor, compartilhado.rentalId);

    await expect(
      payCharge(gestor, pagamento.chargeId, { by: GESTOR }),
    ).rejects.toThrow(/já foi paga/);
  });

  it("recebimento no futuro não é pagamento", async () => {
    const [aberta] = await overdueCharges(gestor, compartilhado.rentalId);

    await expect(
      payCharge(gestor, aberta.id, {
        receivedOn: diasAntes(hoje, -1),
        by: GESTOR,
      }),
    ).rejects.toThrow(/futuro/);
  });

  it("desfazer devolve a cobrança para o vermelho, e fica registrado", async () => {
    const [pagamento] = await rentalPayments(gestor, compartilhado.rentalId);

    expect(
      await reversePayment(gestor, pagamento.id, { by: GESTOR }),
    ).toMatchObject({ id: pagamento.id });

    // A linha continua lá; o que mudou é que ela não está mais de pé.
    const { data } = await gestor
      .from("payments")
      .select("id, reversed_by_name")
      .eq("id", pagamento.id);
    expect(data).toEqual([{ id: pagamento.id, reversed_by_name: GESTOR }]);

    expect(await rentalPayments(gestor, compartilhado.rentalId)).toEqual([]);
    expect(await findRental(gestor, compartilhado.rentalId)).toMatchObject({
      overdueAmount: 900,
      overdueSince: diasAntes(hoje, 15),
    });

    // E a cobrança pode ser paga de novo, que é o ponto de desfazer.
    expect(
      await reversePayment(gestor, pagamento.id, { by: GESTOR }),
    ).toBeNull();
  });

  it("pagar tudo o que venceu tira a locação do vermelho", async () => {
    for (const charge of await overdueCharges(gestor, compartilhado.rentalId)) {
      await payCharge(gestor, charge.id, { by: GESTOR });
    }

    const locação = await findRental(gestor, compartilhado.rentalId);
    expect(locação).toMatchObject({ overdueAmount: 0, overdueSince: null });
    expect(delinquency(locação!)).toBeNull();

    // E some do chip e do card, na mesma volta.
    expect(await listRentals(gestor, { situation: "overdue" })).toMatchObject({
      total: 0,
    });
    expect(await rentalCounts(gestor)).toMatchObject({
      overdue: 0,
      overdueAmount: 0,
    });
  });
});

describe("isolamento entre locadoras", () => {
  it("cobrança e pagamento de outra locadora não são lidos nem escritos", async () => {
    const outra = await createManager();

    // O gerador roda como quem chamou: a RLS o prende à locadora dele, então
    // ele não cria nada para a locação da vizinha nem a enxerga.
    expect(await generateCharges(outra)).toBe(0);

    const { data } = await outra.from("charges").select("id");
    expect(data).toEqual([]);

    expect(await overdueCharges(outra, compartilhado.rentalId)).toEqual([]);
    expect(await findRental(outra, compartilhado.rentalId)).toBeNull();

    // Cobrança da vizinha não é paga, e o recado não conta nada sobre ela: a
    // RLS a esconde da leitura, e o FK composto recusaria o insert de todo
    // jeito. A cobrança escolhida está em aberto de propósito — a recusa tem
    // que ser "não encontrada", nunca "já foi paga".
    const { data: emAberto } = await compartilhado.client
      .from("charges")
      .select("id")
      .eq("rental_id", compartilhado.abertaHojeId)
      .single();

    await expect(
      payCharge(outra, (emAberto as { id: string }).id, {
        by: "Gestor · Vizinha",
      }),
    ).rejects.toThrow(/não encontrada/i);

    // E o pagamento da vizinha não é desfeito por quem não é dela.
    const [pagamento] = await rentalPayments(
      compartilhado.client,
      compartilhado.rentalId,
    );
    expect(
      await reversePayment(outra, pagamento.id, { by: "Gestor · Vizinha" }),
    ).toBeNull();
    expect(await outra.from("payments").select("id")).toMatchObject({
      data: [],
    });
  });
});
