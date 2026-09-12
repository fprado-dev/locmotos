import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createAdminClient,
  createAuthenticatedClient,
} from "@/tests/helpers/supabase";

// A Server Action só depende do Next em dois pontos; os dois viram stub aqui,
// e o que sobra é o que interessa: validação, módulo e mensagem de volta.
const { supabaseClient } = vi.hoisted(() => ({
  supabaseClient: { current: null as unknown },
}));

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => supabaseClient.current,
}));

const { addVehicle } = await import("./actions");

const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
});

async function signedInManager() {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("tenants")
    .insert({ name: "Locadora de teste" })
    .select("id")
    .single();
  if (error) throw error;

  const { client, cleanup } = await createAuthenticatedClient({
    appMetadata: { tenant_id: data.id },
  });

  cleanups.push(async () => {
    await admin.from("tenants").delete().eq("id", data.id);
    await cleanup();
  });

  supabaseClient.current = client;
}

function form(fields: Record<string, string>) {
  const formData = new FormData();
  formData.set("brand", "Honda");
  formData.set("model", "CG 160");
  formData.set("year", "2024");
  formData.set("category", "motorcycle");
  for (const [name, value] of Object.entries(fields)) formData.set(name, value);

  return formData;
}

describe("cadastrar veículo pela tela", () => {
  it("cadastra e avisa qual placa entrou", async () => {
    await signedInManager();

    // A placa volta porque o painel fecha no sucesso: o toast que anuncia o
    // cadastro é escrito depois que o formulário já saiu da tela. O id volta
    // porque é ele que leva a lista até a linha nova, para realçá-la.
    const state = await addVehicle({}, form({ plate: "ABC1D23" }));

    expect(state.error).toBeUndefined();
    expect(state.created).toMatchObject({ plate: "ABC1D23" });
    expect(state.created?.id).toEqual(expect.any(String));
  });

  it("explica que a placa já existe, em vez de vazar o erro do Postgres", async () => {
    await signedInManager();
    await addVehicle({}, form({ plate: "ABC1D23" }));

    // Caixa diferente é a mesma placa.
    const state = await addVehicle({}, form({ plate: "abc1d23" }));

    expect(state.error).toBe(
      "Já existe um veículo com a placa ABC1D23 nesta locadora.",
    );
    // O painel tem treze campos: sem dizer qual deles, o recado manda o gestor
    // procurar.
    expect(state.field).toBe("plate");
  });

  it("cobra a placa quando ela vem em branco", async () => {
    await signedInManager();

    const state = await addVehicle({}, form({ plate: "   " }));

    expect(state).toMatchObject({
      error: "Campo obrigatório: Placa",
      field: "plate",
    });
  });

  it("recusa quilometragem quebrada antes de o banco arredondar", async () => {
    await signedInManager();

    const state = await addVehicle(
      {},
      form({ plate: "ABC1D23", mileage: "1.5" }),
    );

    expect(state.error).toBe("Quilometragem: valor inválido");
  });

  it("recusa valor que não cabe na coluna", async () => {
    await signedInManager();

    const state = await addVehicle(
      {},
      form({ plate: "ABC1D23", fipeValue: "999999999" }),
    );

    expect(state.error).toBe("Valor FIPE: valor inválido");
  });
});
