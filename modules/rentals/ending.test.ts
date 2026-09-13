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
  openRental,
  overdueCharges,
  rentalCounts,
  rentalHistory,
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
