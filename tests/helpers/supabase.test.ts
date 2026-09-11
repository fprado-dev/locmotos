import { describe, expect, it } from "vitest";
import { createAuthenticatedClient } from "./supabase";

describe("harness de teste", () => {
  it("cria um usuário autenticado contra o Supabase local", async () => {
    const { client, userId } = await createAuthenticatedClient();

    const { data } = await client.auth.getUser();

    expect(data.user?.id).toBe(userId);
  });

  it("cria usuários distintos a cada chamada", async () => {
    const first = await createAuthenticatedClient();
    const second = await createAuthenticatedClient();

    expect(first.userId).not.toBe(second.userId);
  });
});
