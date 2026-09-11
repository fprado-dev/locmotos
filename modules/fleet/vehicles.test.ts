import { afterEach, describe, expect, it } from "vitest";
import {
  createAdminClient,
  createAuthenticatedClient,
} from "../../tests/helpers/supabase";
import { createVehicle, findVehicle, listVehicles } from "./index";

const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
});

/**
 * Um gestor autenticado, com a locadora dele gravada no JWT.
 *
 * Duas chamadas produzem duas locadoras distintas — é assim que os testes de
 * isolamento rodam a mesma função como pessoas de locadoras diferentes.
 */
async function createManager() {
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
    // Os testes batem num projeto real (docs/adr/0006): a locadora criada aqui
    // some, e leva os veículos junto (on delete cascade).
    await admin.from("tenants").delete().eq("id", tenantId);
    await cleanup();
  });

  return { client, tenantId };
}

const cg160 = {
  plate: "ABC1D23",
  brand: "Honda",
  model: "CG 160",
  year: 2024,
};

const cg160Completa = {
  ...cg160,
  vin: "9C2KC1670NR000001",
  renavam: "12345678901",
  color: "Vermelha",
  mileage: 18400,
  licensingDueOn: "2026-11-30",
  fipeValue: 14500.5,
  weeklyRate: 320,
  purchaseValue: 13000,
  purchasedOn: "2025-02-10",
  notes: "Baú instalado pelo dono anterior.",
};

describe("cadastro completo", () => {
  it("devolve na leitura tudo o que o gestor preencheu", async () => {
    const manager = await createManager();

    const created = await createVehicle(manager.client, cg160Completa);
    const found = await findVehicle(manager.client, created.id);

    expect(found).toMatchObject(cg160Completa);
  });

  it("grava o veículo como moto, sem a interface escolher", async () => {
    const manager = await createManager();

    const created = await createVehicle(manager.client, cg160);

    expect(created.category).toBe("motorcycle");
  });

  it("recusa cadastro sem placa", async () => {
    const manager = await createManager();

    await expect(
      createVehicle(manager.client, { ...cg160, plate: "   " }),
    ).rejects.toThrow(/placa/i);
  });

  it("recusa a mesma placa duas vezes na mesma locadora", async () => {
    const manager = await createManager();
    await createVehicle(manager.client, cg160);

    await expect(
      // Caixa diferente é a mesma placa.
      createVehicle(manager.client, { ...cg160, plate: "abc1d23" }),
    ).rejects.toThrow(/ABC1D23/);
  });

  it("aceita a mesma placa em locadoras diferentes", async () => {
    const tenantA = await createManager();
    const tenantB = await createManager();
    await createVehicle(tenantA.client, cg160);

    const doTenantB = await createVehicle(tenantB.client, cg160);

    expect(doTenantB.plate).toBe(cg160.plate);
  });
});

describe("frota", () => {
  it("mostra na lista o veículo que o gestor cadastrou", async () => {
    const manager = await createManager();

    const created = await createVehicle(manager.client, cg160);
    const vehicles = await listVehicles(manager.client);

    expect(vehicles.map((vehicle) => vehicle.id)).toContain(created.id);
    expect(created.plate).toBe("ABC1D23");
  });

  it("carimba a locadora do gestor no veículo", async () => {
    const manager = await createManager();

    const created = await createVehicle(manager.client, cg160);

    expect(created.tenantId).toBe(manager.tenantId);
  });

  it("não lista veículo de outra locadora", async () => {
    const tenantA = await createManager();
    const tenantB = await createManager();
    await createVehicle(tenantA.client, cg160);

    const vehicles = await listVehicles(tenantB.client);

    expect(vehicles).toEqual([]);
  });

  it("não entrega veículo de outra locadora nem pelo id direto", async () => {
    const tenantA = await createManager();
    const tenantB = await createManager();
    const vehicleOfTenantA = await createVehicle(tenantA.client, cg160);

    const found = await findVehicle(tenantB.client, vehicleOfTenantA.id);

    expect(found).toBeNull();
  });
});
