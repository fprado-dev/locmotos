import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { isoDay } from "@/lib/calendar";
import {
  createVehicle,
  findVehicle,
  MANAGER_VEHICLE_STATUSES,
  setVehicleStatus,
} from "@/modules/fleet";
import { monthlyCash } from "@/modules/finance";
import { createRenter } from "@/modules/renters";
import { endRental, openRental } from "@/modules/rentals";
import {
  createAdminClient,
  createAuthenticatedClient,
} from "@/tests/helpers/supabase";
import {
  daysInWorkshop,
  deleteMaintenance,
  openMaintenance,
  openMaintenanceFor,
  updateMaintenance,
  vehicleMaintenances,
  workshopDays,
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

async function hojeNoBanco(client: SupabaseClient): Promise<string> {
  const { data, error } = await client.rpc("today_br");
  if (error) throw error;
  return data as string;
}

function diasAntes(hoje: string, dias: number): string {
  return isoDay(new Date(`${hoje}T12:00:00`), -dias);
}

async function novaMoto(client: SupabaseClient) {
  return createVehicle(client, {
    plate: plate(),
    brand: "Honda",
    model: "CG 160",
    year: 2024,
    weeklyPrice: 300,
  });
}

/**
 * As duas contas de dia, sem banco.
 *
 * "Há quantos dias parada" só existe enquanto a moto está lá; a duração só
 * existe depois que ela saiu. Trocar uma pela outra faria a tela dizer que uma
 * manutenção fechada ontem está em aberto há trinta dias.
 */
describe("os dias na oficina", () => {
  const base = {
    id: "m1",
    vehicleId: "v1",
    kind: "corrective" as const,
    description: "Troca de embreagem",
    workshop: null,
    odometer: null,
    cost: null,
    by: "Gestor",
    createdAt: "2026-09-01T00:00:00.000Z",
  };

  const hoje = new Date("2026-09-14T12:00:00");

  it("conta os dias enquanto a moto está lá", () => {
    expect(
      daysInWorkshop({ ...base, enteredOn: "2026-09-10", leftOn: null }, hoje),
    ).toBe(4);
    // Entrou hoje é zero dia parada, e não um.
    expect(
      daysInWorkshop({ ...base, enteredOn: "2026-09-14", leftOn: null }, hoje),
    ).toBe(0);
  });

  it("não conta dias de manutenção já fechada", () => {
    expect(
      daysInWorkshop(
        { ...base, enteredOn: "2026-09-10", leftOn: "2026-09-12" },
        hoje,
      ),
    ).toBeNull();
  });

  it("a duração conta os dois extremos, e só existe depois da saída", () => {
    expect(
      workshopDays({ ...base, enteredOn: "2026-09-10", leftOn: "2026-09-12" }),
    ).toBe(3);
    expect(
      workshopDays({ ...base, enteredOn: "2026-09-10", leftOn: "2026-09-10" }),
    ).toBe(1);
    expect(
      workshopDays({ ...base, enteredOn: "2026-09-10", leftOn: null }),
    ).toBeNull();
  });
});

describe("a situação da moto é consequência da ordem de serviço", () => {
  it("em manutenção deixou de ser uma opção do select", () => {
    expect(MANAGER_VEHICLE_STATUSES).not.toContain("maintenance");
    expect(MANAGER_VEHICLE_STATUSES).not.toContain("reserved");
    expect(MANAGER_VEHICLE_STATUSES).toContain("available");
    expect(MANAGER_VEHICLE_STATUSES).toContain("unavailable");
  });
});

describe("manutenção", () => {
  let gestor: SupabaseClient;
  let hoje: string;

  beforeAll(async () => {
    gestor = await createManager();
    hoje = await hojeNoBanco(gestor);
  });

  it("abrir a ordem de serviço tira a moto da frota, e fechar a devolve", async () => {
    const moto = await novaMoto(gestor);
    expect(moto.status).toBe("available");

    const ordem = await openMaintenance(gestor, moto.id, {
      kind: "preventive",
      enteredOn: diasAntes(hoje, 3),
      description: "Revisão dos 10.000",
      workshop: "Oficina do Zé",
      odometer: 10_240,
      by: "Gestor · Locadora de teste",
    });

    expect((await findVehicle(gestor, moto.id))?.status).toBe("maintenance");
    expect(daysInWorkshop(ordem)).toBe(3);

    await updateMaintenance(gestor, ordem.id, { leftOn: hoje, cost: 320.5 });

    expect((await findVehicle(gestor, moto.id))?.status).toBe("available");
    const fechada = (await vehicleMaintenances(gestor, moto.id))[0];
    expect(fechada.cost).toBe(320.5);
    expect(workshopDays(fechada)).toBe(4);
  });

  it("não manda para a oficina uma moto que está na rua", async () => {
    const moto = await novaMoto(gestor);
    const locatária = await createRenter(gestor, {
      name: "Ana Ribeiro",
      cpf: "529.982.247-25",
    });

    const locação = await openRental(gestor, {
      vehicleId: moto.id,
      renterId: locatária.id,
      weeklyPrice: 300,
      startedOn: diasAntes(hoje, 5),
    });

    await expect(
      openMaintenance(gestor, moto.id, {
        kind: "corrective",
        enteredOn: hoje,
        description: "Quebrou na rua",
        by: "Gestor · Locadora de teste",
      }),
    ).rejects.toThrow(/Encerre a locação/);

    // Encerrada, o caminho abre.
    await endRental(gestor, locação.id, { endedOn: hoje });
    const ordem = await openMaintenance(gestor, moto.id, {
      kind: "corrective",
      enteredOn: hoje,
      description: "Quebrou na rua",
      by: "Gestor · Locadora de teste",
    });

    expect(ordem.id).toBeTruthy();
    expect((await findVehicle(gestor, moto.id))?.status).toBe("maintenance");
  });

  it("não aluga a moto que está na oficina", async () => {
    // O contrário do teste acima, e o lado que a Locação enxerga: "em
    // manutenção" chega lá pela `fleet`, derivada da ordem aberta, e não de
    // alguém ter escolhido a situação no select.
    const moto = await novaMoto(gestor);
    const locatária = await createRenter(gestor, {
      name: "Bia Ramos",
      cpf: "111.444.777-35",
    });
    await openMaintenance(gestor, moto.id, {
      kind: "preventive",
      enteredOn: hoje,
      description: "Troca de óleo",
      by: "Gestor · Locadora de teste",
    });

    await expect(
      openRental(gestor, {
        vehicleId: moto.id,
        renterId: locatária.id,
        weeklyPrice: 300,
      }),
    ).rejects.toThrow(/está em manutenção/);
  });

  it("uma manutenção em aberto por moto", async () => {
    const moto = await novaMoto(gestor);

    await openMaintenance(gestor, moto.id, {
      kind: "corrective",
      enteredOn: hoje,
      description: "Freio",
      by: "Gestor · Locadora de teste",
    });

    await expect(
      openMaintenance(gestor, moto.id, {
        kind: "corrective",
        enteredOn: hoje,
        description: "Pneu",
        by: "Gestor · Locadora de teste",
      }),
    ).rejects.toThrow(/já está na oficina/);

    expect(await openMaintenanceFor(gestor, moto.id)).toMatchObject({
      description: "Freio",
    });
  });

  it("o select não consegue mais pôr nem tirar a moto da manutenção", async () => {
    const moto = await novaMoto(gestor);

    await expect(
      setVehicleStatus(gestor, moto.id, "maintenance"),
    ).rejects.toThrow(/ordem de serviço/);

    await openMaintenance(gestor, moto.id, {
      kind: "corrective",
      enteredOn: hoje,
      description: "Freio",
      by: "Gestor · Locadora de teste",
    });

    // Marcar como disponível não devolve a moto: quem a devolve é fechar a
    // ordem de serviço. O lote a ignora em vez de mentir.
    expect(await setVehicleStatus(gestor, moto.id, "available")).toBeNull();
    expect((await findVehicle(gestor, moto.id))?.status).toBe("maintenance");
  });

  it("recusa saída anterior à entrada e manutenção sem dizer o que foi", async () => {
    const moto = await novaMoto(gestor);

    await expect(
      openMaintenance(gestor, moto.id, {
        kind: "corrective",
        enteredOn: hoje,
        description: "   ",
        by: "Gestor · Locadora de teste",
      }),
    ).rejects.toThrow(/o que a moto foi fazer/i);

    const ordem = await openMaintenance(gestor, moto.id, {
      kind: "corrective",
      enteredOn: hoje,
      description: "Freio",
      by: "Gestor · Locadora de teste",
    });

    await expect(
      updateMaintenance(gestor, ordem.id, { leftOn: diasAntes(hoje, 1) }),
    ).rejects.toThrow(/antes de entrar/);
  });

  it("o custo da manutenção é a linha do caixa, e não uma segunda digitação", async () => {
    // Não há despesa espelho: o extrato lê o custo de onde ele foi digitado.
    // É o que garante que corrigir num lugar corrija no outro — copiar o
    // número para `expenses` seria criar a segunda verdade.
    // Locadora só desta conta: o caixa soma o mês inteiro, e os outros testes
    // deste arquivo já deixaram manutenção paga na locadora compartilhada.
    const sozinha = await createManager();
    const moto = await novaMoto(sozinha);
    const mês = hoje.slice(0, 7);

    const semCusto = await openMaintenance(sozinha, moto.id, {
      kind: "corrective",
      enteredOn: hoje,
      description: "Embreagem",
      by: "Gestor · Locadora de teste",
    });

    // Nota que ainda não chegou não é despesa.
    expect((await monthlyCash(sozinha, mês)).entries).toEqual([]);

    await updateMaintenance(sozinha, semCusto.id, { leftOn: hoje, cost: 350 });

    const comCusto = await monthlyCash(sozinha, mês);
    expect(comCusto.entries).toMatchObject([
      {
        id: semCusto.id,
        amount: 350,
        category: "maintenance",
        description: "Embreagem",
        happenedOn: hoje,
        vehicleId: moto.id,
      },
    ]);
    expect(comCusto.expense).toBe(350);
    expect(
      comCusto.byCategory.find((c) => c.category === "maintenance")?.amount,
    ).toBe(350);

    // Corrigir o custo corrige o extrato, e não lança uma segunda linha.
    await updateMaintenance(sozinha, semCusto.id, { cost: 400 });
    const corrigido = await monthlyCash(sozinha, mês);
    expect(corrigido.entries).toHaveLength(1);
    expect(corrigido.expense).toBe(400);

    // E apagar a ordem tira a linha do caixa junto.
    await deleteMaintenance(sozinha, semCusto.id);
    expect((await monthlyCash(sozinha, mês)).entries).toEqual([]);
  });

  it("apagar a ordem aberta na placa errada devolve a moto na hora", async () => {
    const moto = await novaMoto(gestor);

    const ordem = await openMaintenance(gestor, moto.id, {
      kind: "corrective",
      enteredOn: hoje,
      description: "Ordem na placa errada",
      by: "Gestor · Locadora de teste",
    });

    expect((await findVehicle(gestor, moto.id))?.status).toBe("maintenance");

    await deleteMaintenance(gestor, ordem.id);

    expect((await findVehicle(gestor, moto.id))?.status).toBe("available");
    expect(await vehicleMaintenances(gestor, moto.id)).toEqual([]);
  });

  it("a locadora de outro não enxerga nem mexe", async () => {
    const moto = await novaMoto(gestor);
    await openMaintenance(gestor, moto.id, {
      kind: "corrective",
      enteredOn: hoje,
      description: "Freio",
      by: "Gestor · Locadora de teste",
    });

    const outro = await createManager();

    expect(await vehicleMaintenances(outro, moto.id)).toEqual([]);
    await expect(
      openMaintenance(outro, moto.id, {
        kind: "corrective",
        enteredOn: hoje,
        description: "Da moto alheia",
        by: "Gestor · Outra",
      }),
    ).rejects.toThrow(/não encontrada/i);
  });
});
