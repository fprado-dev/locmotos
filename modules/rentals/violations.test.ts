import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { brasiliaMoment, isoDay } from "@/lib/calendar";
import { createVehicle } from "@/modules/fleet";
import { createRenter } from "@/modules/renters";
import {
  createAdminClient,
  createAuthenticatedClient,
} from "@/tests/helpers/supabase";
import {
  deleteViolation,
  endRental,
  openRental,
  recordViolation,
  renterViolations,
  vehicleViolations,
  whoHadIt,
  type TrafficViolation,
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

/** O dia de hoje como o banco o vê — a atribuição é em dia de Brasília. */
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
 * Um instante daquele dia, no fuso de Brasília.
 *
 * Passa pela mesma função que a tela usa para ler o `datetime-local` do
 * gestor: se ela lesse o horário errado, o erro apareceria aqui como multa
 * mudando de dono, que é o sintoma que o gestor veria.
 */
function emBrasilia(dia: string, hora: string): string {
  return brasiliaMoment(`${dia}T${hora}`);
}

/**
 * De quem é a multa, em uma palavra.
 *
 * O que importa é o desfecho, e não a forma do objeto: é isto que os testes de
 * borda comparam.
 */
function culpa(violation: TrafficViolation): string {
  const blame = whoHadIt(violation);
  return blame.kind === "renter" ? blame.name : blame.kind;
}

/**
 * A leitura de `whoHadIt`, sem banco.
 *
 * A view é quem decide; esta função só traduz o que ela devolveu. O que aqui
 * se prova é que nenhuma das três saídas cai na do lado.
 */
describe("de quem é a infração", () => {
  const base = {
    id: "v1",
    vehicleId: "m1",
    noticeNumber: null,
    occurredAt: "2026-09-14T20:00:00.000Z",
    description: "Excesso de velocidade",
    amount: null,
    dueOn: null,
    createdAt: "2026-09-14T20:00:00.000Z",
    vehicle: { plate: "ABC1234", brand: "Honda", model: "CG 160" },
  };

  it("sem locação no dia, a multa é da locadora", () => {
    expect(
      whoHadIt({
        ...base,
        rentalMatches: 0,
        rentalId: null,
        renterId: null,
        renterName: null,
      }),
    ).toEqual({ kind: "owner" });
  });

  it("com uma locação, é de quem estava com a moto", () => {
    expect(
      whoHadIt({
        ...base,
        rentalMatches: 1,
        rentalId: "l1",
        renterId: "p1",
        renterName: "Ana Ribeiro",
      }),
    ).toEqual({
      kind: "renter",
      rentalId: "l1",
      renterId: "p1",
      name: "Ana Ribeiro",
    });
  });

  it("com duas locações no mesmo dia, não nomeia ninguém", () => {
    expect(
      whoHadIt({
        ...base,
        rentalMatches: 2,
        rentalId: null,
        renterId: null,
        renterName: null,
      }),
    ).toEqual({ kind: "ambiguous", matches: 2 });
  });
});

describe("infração de trânsito", () => {
  let gestor: SupabaseClient;
  let hoje: string;
  let motoId: string;
  let anaId: string;

  beforeAll(async () => {
    gestor = await createManager();
    hoje = await hojeNoBanco(gestor);

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
    anaId = ana.id;

    // A moto ficou com a Ana de 30 a 20 dias atrás, e voltou para o pátio.
    const locação = await openRental(gestor, {
      vehicleId: moto.id,
      renterId: ana.id,
      weeklyPrice: 300,
      startedOn: diasAntes(hoje, 30),
    });

    await endRental(gestor, locação.id, { endedOn: diasAntes(hoje, 20) });
  });

  it("lê o que foi digitado como hora de Brasília, e não como UTC", () => {
    // O `datetime-local` não manda fuso. Lido cru pelo servidor, "23:00" de um
    // 14 de setembro viraria 20h do mesmo dia em Brasília — e, perto da
    // meia-noite, o dia inteiro escorrega.
    expect(brasiliaMoment("2026-09-14T23:00")).toBe("2026-09-15T02:00:00.000Z");
    expect(brasiliaMoment("2026-09-14T23:00:00")).toBe(
      "2026-09-15T02:00:00.000Z",
    );
    expect(() => brasiliaMoment("catorze de setembro")).toThrow(RangeError);
  });

  it("recusa infração no futuro", async () => {
    await expect(
      recordViolation(gestor, motoId, {
        occurredAt: emBrasilia(diasAntes(hoje, -1), "10:00:00"),
        description: "Excesso de velocidade",
      }),
    ).rejects.toThrow(/futuro/);
  });

  it("recusa infração sem dizer o que foi", async () => {
    await expect(
      recordViolation(gestor, motoId, {
        occurredAt: emBrasilia(diasAntes(hoje, 25), "10:00:00"),
        description: "   ",
      }),
    ).rejects.toThrow(/o que foi/i);
  });

  it("atribui a quem estava com a moto no dia", async () => {
    const infração = await recordViolation(gestor, motoId, {
      noticeNumber: `AUTO-${Date.now()}`,
      occurredAt: emBrasilia(diasAntes(hoje, 25), "14:30:00"),
      description: "Avanço de sinal vermelho",
      amount: 293.47,
    });

    expect(culpa(infração)).toBe("Ana Ribeiro");
    expect(infração.amount).toBe(293.47);
    expect(infração.vehicle.plate).toHaveLength(7);
  });

  it("sem locação no dia, a multa fica com a locadora", async () => {
    const infração = await recordViolation(gestor, motoId, {
      occurredAt: emBrasilia(diasAntes(hoje, 5), "09:00:00"),
      description: "Estacionar em local proibido",
    });

    expect(culpa(infração)).toBe("owner");
  });

  it("o dia é o de Brasília, e não o de Greenwich", async () => {
    // 23h de Brasília no último dia da locação é 02h do dia seguinte em UTC.
    // Convertido errado, o dia cairia fora da locação e a multa mudaria de
    // dono — é exatamente a borda que a issue #53 chama de "não pode mentir".
    const dentro = await recordViolation(gestor, motoId, {
      occurredAt: emBrasilia(diasAntes(hoje, 20), "23:00:00"),
      description: "Excesso de velocidade na devolução",
    });

    expect(culpa(dentro)).toBe("Ana Ribeiro");

    // Uma hora depois já é o dia seguinte em Brasília, e aí a moto era da
    // locadora.
    const fora = await recordViolation(gestor, motoId, {
      occurredAt: emBrasilia(diasAntes(hoje, 19), "00:30:00"),
      description: "Excesso de velocidade no dia seguinte",
    });

    expect(culpa(fora)).toBe("owner");
  });

  it("dois autos com o mesmo número não convivem", async () => {
    const auto = `AUTO-REPETIDO-${Date.now()}`;

    await recordViolation(gestor, motoId, {
      noticeNumber: auto,
      occurredAt: emBrasilia(diasAntes(hoje, 24), "08:00:00"),
      description: "Excesso de velocidade",
    });

    await expect(
      recordViolation(gestor, motoId, {
        noticeNumber: auto,
        occurredAt: emBrasilia(diasAntes(hoje, 23), "08:00:00"),
        description: "Excesso de velocidade",
      }),
    ).rejects.toThrow(/já foi registrado/);
  });

  it("a ficha da moto lista da mais recente para a mais antiga", async () => {
    const lista = await vehicleViolations(gestor, motoId);

    expect(lista.length).toBeGreaterThanOrEqual(5);
    const instantes = lista.map((linha) => linha.occurredAt);
    expect([...instantes].sort().reverse()).toEqual(instantes);
  });

  it("o painel do locatário só traz as dele", async () => {
    const dela = await renterViolations(gestor, anaId);

    expect(dela.length).toBeGreaterThanOrEqual(2);
    expect(dela.every((linha) => linha.renterId === anaId)).toBe(true);
    // A que aconteceu com a moto no pátio não é dela.
    expect(
      dela.some((linha) => linha.description.includes("local proibido")),
    ).toBe(false);
  });

  it("apagar a infração da placa errada é caminho aberto", async () => {
    const errada = await recordViolation(gestor, motoId, {
      occurredAt: emBrasilia(diasAntes(hoje, 3), "11:00:00"),
      description: "Digitada na moto errada",
    });

    await deleteViolation(gestor, errada.id);

    const lista = await vehicleViolations(gestor, motoId);
    expect(lista.some((linha) => linha.id === errada.id)).toBe(false);
  });

  it("a locadora de outro não enxerga nem apaga", async () => {
    const outro = await createManager();

    expect(await vehicleViolations(outro, motoId)).toEqual([]);

    const antes = await vehicleViolations(gestor, motoId);
    await deleteViolation(outro, antes[0].id);
    expect(await vehicleViolations(gestor, motoId)).toHaveLength(antes.length);
  });
});
