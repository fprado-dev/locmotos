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
  rentalCounts,
  overdueCharges,
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
const compartilhado: { client: SupabaseClient; rentalId: string } = {
  client: null!,
  rentalId: "",
};

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
      .select("cycle_start, cycle_end, due_on, amount, paid_on")
      .eq("rental_id", locação.id)
      .order("cycle_start", { ascending: true });

    expect(data).toEqual([
      {
        cycle_start: diasAntes(hoje, 21),
        cycle_end: diasAntes(hoje, 15),
        due_on: diasAntes(hoje, 15),
        amount: 300,
        paid_on: null,
      },
      {
        cycle_start: diasAntes(hoje, 14),
        cycle_end: diasAntes(hoje, 8),
        due_on: diasAntes(hoje, 8),
        amount: 300,
        paid_on: null,
      },
      {
        cycle_start: diasAntes(hoje, 7),
        cycle_end: diasAntes(hoje, 1),
        due_on: diasAntes(hoje, 1),
        amount: 300,
        paid_on: null,
      },
      {
        cycle_start: hoje,
        cycle_end: diasAntes(hoje, -6),
        due_on: diasAntes(hoje, -6),
        amount: 300,
        paid_on: null,
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

  it("cobrança paga sai da conta", async () => {
    const [primeira] = await overdueCharges(gestor, compartilhado.rentalId);
    await gestor
      .from("charges")
      .update({ paid_on: hoje })
      .eq("id", primeira.id);

    const locação = await findRental(gestor, compartilhado.rentalId);
    expect(locação).toMatchObject({
      overdueAmount: 600,
      overdueSince: diasAntes(hoje, 8),
    });

    // Devolve o cenário para os blocos seguintes.
    await gestor
      .from("charges")
      .update({ paid_on: null })
      .eq("id", primeira.id);
  });

  it("locação aberta hoje não nasce devendo", async () => {
    const locação = await novaLocação(gestor, { cpf: "111.444.777-35" });

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

describe("isolamento entre locadoras", () => {
  it("cobrança de outra locadora não é lida", async () => {
    const outra = await createManager();

    // O gerador roda como quem chamou: a RLS o prende à locadora dele, então
    // ele não cria nada para a locação da vizinha nem a enxerga.
    expect(await generateCharges(outra)).toBe(0);

    const { data } = await outra.from("charges").select("id");
    expect(data).toEqual([]);

    expect(await overdueCharges(outra, compartilhado.rentalId)).toEqual([]);
    expect(await findRental(outra, compartilhado.rentalId)).toBeNull();
  });
});
