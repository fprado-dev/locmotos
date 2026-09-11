import { afterEach, describe, expect, it } from "vitest";
import {
  createAdminClient,
  createAuthenticatedClient,
} from "@/tests/helpers/supabase";
import { createVehicle, listVehicles } from "@/modules/fleet";

const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
});

/**
 * O que o formulário de cadastro faz: cria o usuário com o nome da locadora.
 *
 * Nada aqui escolhe `tenant_id` — quem decide isso é o trigger no banco, e é
 * exatamente o que estes testes verificam.
 */
async function signUp(tenantName: string) {
  const { client, cleanup } = await createAuthenticatedClient({
    userMetadata: { tenant_name: tenantName },
  });

  const { data } = await client.auth.getUser();
  const tenantId = data.user?.app_metadata.tenant_id as string | undefined;

  const admin = createAdminClient();
  cleanups.push(async () => {
    // A locadora leva os veículos junto (on delete cascade).
    if (tenantId) await admin.from("tenants").delete().eq("id", tenantId);
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

describe("cadastro de locadora", () => {
  it("cria a locadora e carimba o gestor nela", async () => {
    const { tenantId } = await signUp("Motos do Zé");

    expect(tenantId).toBeDefined();

    const { data } = await createAdminClient()
      .from("tenants")
      .select("name")
      .eq("id", tenantId)
      .single();

    expect(data?.name).toBe("Motos do Zé");
  });

  it("deixa o gestor recém-cadastrado usar a própria frota", async () => {
    const manager = await signUp("Motos do Zé");

    const vehicle = await createVehicle(manager.client, cg160);
    const { vehicles } = await listVehicles(manager.client);

    expect(vehicle.tenantId).toBe(manager.tenantId);
    expect(vehicles.map((each) => each.id)).toEqual([vehicle.id]);
  });

  it("não mistura a frota de duas locadoras cadastradas separadamente", async () => {
    const zé = await signUp("Motos do Zé");
    const maria = await signUp("Motos da Maria");
    await createVehicle(zé.client, cg160);

    expect((await listVehicles(maria.client)).vehicles).toEqual([]);
    expect(zé.tenantId).not.toBe(maria.tenantId);
  });
});
