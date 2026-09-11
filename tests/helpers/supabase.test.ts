import { afterEach, describe, expect, it } from "vitest";
import { createAuthenticatedClient } from "./supabase";

const created: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(created.splice(0).map((cleanup) => cleanup()));
});

describe("harness de teste", () => {
  it("cria um usuário autenticado contra o projeto Supabase", async () => {
    const { client, userId, cleanup } = await createAuthenticatedClient();
    created.push(cleanup);

    const { data } = await client.auth.getUser();

    expect(data.user?.id).toBe(userId);
  });

  it("cria usuários distintos a cada chamada", async () => {
    const first = await createAuthenticatedClient();
    const second = await createAuthenticatedClient();
    created.push(first.cleanup, second.cleanup);

    expect(first.userId).not.toBe(second.userId);
  });
});
