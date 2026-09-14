import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { isoDay } from "@/lib/calendar";
import { createVehicle } from "@/modules/fleet";
import {
  generateCharges,
  openRental,
  overdueCharges,
  payCharge,
  reversePayment,
} from "@/modules/rentals";
import { createRenter } from "@/modules/renters";
import {
  createAdminClient,
  createAuthenticatedClient,
} from "@/tests/helpers/supabase";
import {
  deleteExpense,
  isMonth,
  monthlyCash,
  monthRange,
  monthShift,
  recordExpense,
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

/** O dia de hoje como o banco o vê — `received_on` nasce de `today_br()`. */
async function hojeNoBanco(client: SupabaseClient): Promise<string> {
  const { data, error } = await client.rpc("today_br");
  if (error) throw error;
  return data as string;
}

function diasAntes(hoje: string, dias: number): string {
  return isoDay(new Date(`${hoje}T12:00:00`), -dias);
}

/**
 * As contas de mês, sem banco.
 *
 * O que elas precisam acertar é a virada: dezembro mais um é janeiro do ano
 * seguinte, e fevereiro tem 29 dias de quatro em quatro anos. Errar qualquer
 * das duas esconde um dia inteiro de caixa.
 */
describe("o mês do caixa", () => {
  it("reconhece um mês e recusa o resto", () => {
    expect(isMonth("2026-09")).toBe(true);
    expect(isMonth("2026-1")).toBe(false);
    expect(isMonth("2026-13")).toBe(false);
    expect(isMonth("2026-00")).toBe(false);
    expect(isMonth("setembro")).toBe(false);
    expect(isMonth("2026-09-14")).toBe(false);
  });

  it("acha o último dia do mês, inclusive em fevereiro", () => {
    expect(monthRange("2026-09")).toEqual({
      from: "2026-09-01",
      to: "2026-09-30",
    });
    expect(monthRange("2026-02")).toEqual({
      from: "2026-02-01",
      to: "2026-02-28",
    });
    // 2028 é bissexto, e o dia 29 é caixa que existe.
    expect(monthRange("2028-02")).toEqual({
      from: "2028-02-01",
      to: "2028-02-29",
    });
  });

  it("anda de mês em mês, atravessando o ano", () => {
    expect(monthShift("2026-09", -1)).toBe("2026-08");
    expect(monthShift("2026-01", -1)).toBe("2025-12");
    expect(monthShift("2026-12", 1)).toBe("2027-01");
  });
});

describe("caixa do mês", () => {
  let gestor: SupabaseClient;
  let hoje: string;
  let mês: string;
  let motoId: string;
  let chargeId: string;

  beforeAll(async () => {
    gestor = await createManager();
    hoje = await hojeNoBanco(gestor);
    mês = hoje.slice(0, 7);

    const [moto, ana] = await Promise.all([
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

    const locação = await openRental(gestor, {
      vehicleId: moto.id,
      renterId: ana.id,
      weeklyPrice: 300,
      startedOn: diasAntes(hoje, 21),
    });

    await generateCharges(gestor);
    const vencidas = await overdueCharges(gestor, locação.id);
    chargeId = vencidas[0].id;
  });

  it("começa com o caixa zerado", async () => {
    const caixa = await monthlyCash(gestor, mês);

    expect(caixa).toMatchObject({
      month: mês,
      income: 0,
      expense: 0,
      balance: 0,
      byCategory: [],
    });
    expect(caixa.entries).toEqual([]);
  });

  it("o pagamento recebido é a entrada, com a moto e a pessoa junto", async () => {
    await payCharge(gestor, chargeId, { by: "Gestor · Locadora de teste" });

    const caixa = await monthlyCash(gestor, mês);

    expect(caixa.income).toBe(300);
    expect(caixa.balance).toBe(300);
    expect(caixa.entries).toHaveLength(1);
    expect(caixa.entries[0]).toMatchObject({
      kind: "payment",
      amount: 300,
      category: "rent",
      renterName: "Ana Ribeiro",
      description: null,
    });
    // O ciclo vem junto: é ele que dá nome à entrada na tela.
    expect(caixa.entries[0].cycleStart).not.toBeNull();
  });

  it("a saída entra no mesmo extrato, e soma por categoria", async () => {
    await recordExpense(gestor, {
      spentOn: hoje,
      amount: 189.9,
      description: "Troca de óleo e filtro",
      category: "maintenance",
      vehicleId: motoId,
      by: "Gestor · Locadora de teste",
    });

    await recordExpense(gestor, {
      spentOn: hoje,
      amount: 60.1,
      description: "Gasolina do dia",
      category: "fuel",
      by: "Gestor · Locadora de teste",
    });

    const caixa = await monthlyCash(gestor, mês);

    expect(caixa.expense).toBe(250);
    expect(caixa.balance).toBe(50);
    // Da maior fatia para a menor: a pergunta é para onde foi o dinheiro.
    expect(caixa.byCategory).toEqual([
      { category: "maintenance", amount: 189.9 },
      { category: "fuel", amount: 60.1 },
    ]);
    expect(caixa.entries).toHaveLength(3);

    // A despesa sem moto não inventa uma: o galpão não é de ninguém.
    const gasolina = caixa.entries.find((e) => e.category === "fuel");
    expect(gasolina?.plate).toBeNull();
    const óleo = caixa.entries.find((e) => e.category === "maintenance");
    expect(óleo?.plate).toHaveLength(7);
  });

  it("recusa despesa que ainda não saiu", async () => {
    await expect(
      recordExpense(gestor, {
        spentOn: diasAntes(hoje, -1),
        amount: 50,
        description: "Ainda vou pagar",
        category: "other",
        by: "Gestor · Locadora de teste",
      }),
    ).rejects.toThrow(/futuro/);
  });

  it("recusa despesa sem valor e sem descrição", async () => {
    const base = {
      spentOn: hoje,
      category: "other" as const,
      by: "Gestor · Locadora de teste",
    };

    await expect(
      recordExpense(gestor, { ...base, amount: 0, description: "Nada" }),
    ).rejects.toThrow(/maior que zero/);

    await expect(
      recordExpense(gestor, { ...base, amount: 10, description: "   " }),
    ).rejects.toThrow(/o que foi/i);
  });

  it("pagamento estornado sai do caixa", async () => {
    const { data } = await gestor
      .from("payments")
      .select("id")
      .eq("charge_id", chargeId)
      .single();

    await reversePayment(gestor, data!.id as string, {
      by: "Gestor · Locadora de teste",
    });

    const caixa = await monthlyCash(gestor, mês);

    expect(caixa.income).toBe(0);
    expect(caixa.balance).toBe(-250);
    expect(caixa.entries.every((entry) => entry.kind === "expense")).toBe(true);
  });

  it("o mês anterior não tem nada disto", async () => {
    const anterior = await monthlyCash(gestor, monthShift(mês, -1));

    expect(anterior.entries).toEqual([]);
    expect(anterior.balance).toBe(0);
  });

  it("apagar a despesa digitada errada tira ela do caixa", async () => {
    const errada = await recordExpense(gestor, {
      spentOn: hoje,
      amount: 9999,
      description: "Valor digitado errado",
      category: "other",
      by: "Gestor · Locadora de teste",
    });

    await deleteExpense(gestor, errada.id);

    const caixa = await monthlyCash(gestor, mês);
    expect(caixa.expense).toBe(250);
  });

  it("a locadora de outro não enxerga o caixa desta", async () => {
    const outro = await createManager();
    const caixa = await monthlyCash(outro, mês);

    expect(caixa.entries).toEqual([]);
    expect(caixa.income).toBe(0);
  });
});
