import { randomUUID } from "node:crypto";
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
  const tenantId = randomUUID();
  const { client, cleanup } = await createAuthenticatedClient({
    appMetadata: { tenant_id: tenantId },
  });

  const admin = createAdminClient();
  cleanups.push(async () => {
    // Os testes batem num projeto real (docs/adr/0006): o veículo criado aqui
    // some junto com o usuário.
    await admin.from("vehicles").delete().eq("tenant_id", tenantId);
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

    expect(created.tenant_id).toBe(manager.tenantId);
  });

  it("não lista veículo de outra locadora", async () => {
    const locadoraA = await createManager();
    const locadoraB = await createManager();
    await createVehicle(locadoraA.client, cg160);

    const vehicles = await listVehicles(locadoraB.client);

    expect(vehicles).toEqual([]);
  });

  it("não entrega veículo de outra locadora nem pelo id direto", async () => {
    const locadoraA = await createManager();
    const locadoraB = await createManager();
    const doLocadoraA = await createVehicle(locadoraA.client, cg160);

    const found = await findVehicle(locadoraB.client, doLocadoraA.id);

    expect(found).toBeNull();
  });
});
