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
