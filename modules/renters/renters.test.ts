import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createAdminClient,
  createAuthenticatedClient,
} from "@/tests/helpers/supabase";
import {
  createRenter,
  findRenter,
  liftRestriction,
  listRenters,
  removeRenter,
  renterCounts,
  restrictRenters,
  updateRenter,
  type Renter,
} from "./index";
import type { SupabaseClient } from "@supabase/supabase-js";

const cleanups: Array<() => Promise<void>> = [];

// A limpeza é no fim do arquivo, não a cada teste: cada bloco tem a própria
// locadora, e adiar deixa um fixture compartilhado (`beforeAll`) sobreviver
// aos testes que o usam.
afterAll(async () => {
  await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
});

/**
 * Um gestor autenticado, com a locadora dele gravada no JWT.
 *
 * Duas chamadas produzem duas locadoras distintas — é assim que os testes de
 * isolamento rodam a mesma função como pessoas de locadoras diferentes.
 *
 * Cada chamada custa um cadastro e um login no Auth do projeto, que tem teto
 * de requisições: os blocos abaixo compartilham o gestor de propósito, em vez
 * de criar um por teste.
 */
async function createManager(): Promise<{
  client: SupabaseClient;
  tenantId: string;
}> {
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
    // some, e leva locatários e restrições junto (on delete cascade).
    await admin.from("tenants").delete().eq("id", tenantId);
    await cleanup();
  });

  return { client, tenantId };
}

const ana = {
  name: "Ana Ribeiro",
  cpf: "529.982.247-25",
  whatsapp: "(11) 98231-0475",
  cnhCategory: "ab",
  cnhDueDate: "2026-07-15",
  notes: "Indicada pelo Bruno.",
};

const GESTOR = "Gestor · Locadora de teste";

describe("cadastro de locatário", () => {
  let gestor: SupabaseClient;

  beforeAll(async () => {
    gestor = (await createManager()).client;
  });

  it("devolve na leitura o que o gestor preencheu, já normalizado", async () => {
    const criado = await createRenter(gestor, ana);
    const achado = await findRenter(gestor, criado.id);

    expect(achado).toMatchObject({
      name: "Ana Ribeiro",
      // A pontuação é de tela: o que fica guardado são os dígitos, e é por
      // eles que a busca e a unicidade funcionam.
      cpf: "52998224725",
      whatsapp: "11982310475",
      cnhCategory: "AB",
      cnhDueDate: "2026-07-15",
      restriction: null,
    });
  });

  it("recusa um CPF com dígito trocado", async () => {
    await expect(
      createRenter(gestor, { ...ana, cpf: "52998224726" }),
    ).rejects.toThrow(/cpf/i);
  });

  it("recusa o mesmo CPF duas vezes na mesma locadora", async () => {
    await createRenter(gestor, { ...ana, cpf: "16899559706" });

    await expect(
      createRenter(gestor, {
        ...ana,
        name: "Outra pessoa",
        cpf: "168.995.597-06",
      }),
    ).rejects.toThrow(/já existe/i);
  });

  it("corrige o cadastro sem perder o que não foi tocado", async () => {
    const criado = await createRenter(gestor, { ...ana, cpf: "39053344705" });

    const corrigido = await updateRenter(gestor, criado.id, {
      ...ana,
      cpf: "39053344705",
      name: "Ana Ribeiro Souza",
      whatsapp: "(21) 99999-1234",
    });

    expect(corrigido).toMatchObject({
      id: criado.id,
      name: "Ana Ribeiro Souza",
      whatsapp: "21999991234",
      cnhCategory: "AB",
      restriction: null,
    });
  });

  it("libera o CPF de novo depois da baixa", async () => {
    // Dar baixa por engano não pode impedir o recadastro da mesma pessoa.
    const criado = await createRenter(gestor, { ...ana, cpf: "23100299981" });
    await removeRenter(gestor, criado.id);

    const recadastrado = await createRenter(gestor, {
      ...ana,
      cpf: "23100299981",
    });

    expect(recadastrado.id).not.toBe(criado.id);
  });
});

describe("isolamento entre locadoras", () => {
  let dona: SupabaseClient;
  let vizinha: SupabaseClient;
  let daDona: Renter;

  beforeAll(async () => {
    // As duas locadoras não dependem uma da outra: em série seriam seis idas
    // ao Auth esperando em fila.
    const [primeira, segunda] = await Promise.all([
      createManager(),
      createManager(),
    ]);
    dona = primeira.client;
    vizinha = segunda.client;

    daDona = await createRenter(dona, ana);
  });

  it("aceita o mesmo CPF em locadoras diferentes", async () => {
    // A mesma pessoa pode alugar de duas locadoras, e cada uma tem direito ao
    // cadastro dela.
    const daVizinha = await createRenter(vizinha, ana);

    expect(daVizinha.cpf).toBe(daDona.cpf);
    expect(daVizinha.id).not.toBe(daDona.id);
  });

  it("não lê o locatário de outra locadora", async () => {
    // O mesmo `null` de um id inventado: a RLS filtra antes, então nem a
    // existência do registro vaza.
    expect(await findRenter(vizinha, daDona.id)).toBeNull();

    const { renters } = await listRenters(vizinha);
    expect(renters.map((renter) => renter.id)).not.toContain(daDona.id);
  });

  it("não edita o locatário de outra locadora", async () => {
    expect(
      await updateRenter(vizinha, daDona.id, { ...ana, name: "Invadida" }),
    ).toBeNull();

    expect((await findRenter(dona, daDona.id))?.name).toBe("Ana Ribeiro");
  });

  it("não restringe o locatário de outra locadora", async () => {
    const restritos = await restrictRenters(vizinha, [daDona.id], {
      reason: "inadimplência acima de 30 dias",
      by: GESTOR,
    });

    expect(restritos).toEqual([]);
    expect((await findRenter(dona, daDona.id))?.restriction).toBeNull();
  });

  it("não dá baixa no locatário de outra locadora", async () => {
    expect(await removeRenter(vizinha, daDona.id)).toBeNull();
    expect(await findRenter(dona, daDona.id)).not.toBeNull();
  });
});

describe("lista, busca e restrição", () => {
  let gestor: SupabaseClient;
  let ana2: Renter;
  let bruno: Renter;

  beforeAll(async () => {
    gestor = (await createManager()).client;

    [ana2, bruno] = await Promise.all([
      createRenter(gestor, ana),
      createRenter(gestor, {
        name: "Bruno Salles",
        cpf: "11144477735",
        cnhDueDate: "2030-01-01",
      }),
      createRenter(gestor, { name: "Carla Nunes", cpf: "39053344705" }),
    ]);
  });

  it("acha por pedaço do nome, sem ligar para a caixa", async () => {
    const { renters } = await listRenters(gestor, { q: "sall" });

    expect(renters.map((renter) => renter.name)).toEqual(["Bruno Salles"]);
  });

  it("acha por pedaço dos dígitos do CPF, com ou sem pontuação", async () => {
    const { renters } = await listRenters(gestor, { q: "982.247" });

    expect(renters.map((renter) => renter.id)).toEqual([ana2.id]);
  });

  it("vem em nome A–Z quando ninguém pediu ordem", async () => {
    const { renters, total } = await listRenters(gestor);

    expect(renters.map((renter) => renter.name)).toEqual([
      "Ana Ribeiro",
      "Bruno Salles",
      "Carla Nunes",
    ]);
    expect(total).toBe(3);
  });

  it("registra motivo e responsável ao restringir em lote", async () => {
    const restritos = await restrictRenters(gestor, [ana2.id, bruno.id], {
      reason: "inadimplência acima de 30 dias",
      by: GESTOR,
    });

    expect(restritos).toHaveLength(2);
    expect(restritos[0].restriction).toMatchObject({
      reason: "inadimplência acima de 30 dias",
      by: GESTOR,
    });
  });

  it("recusa motivo curto demais antes de chegar ao banco", async () => {
    await expect(
      restrictRenters(gestor, [ana2.id], { reason: "x", by: GESTOR }),
    ).rejects.toThrow(/4 caracteres/);
  });

  it("não dá segunda restrição a quem já tem uma", async () => {
    // A primeira é a que tem o motivo e a data que valem.
    const restritos = await restrictRenters(gestor, [ana2.id], {
      reason: "outro motivo qualquer",
      by: GESTOR,
    });

    expect(restritos).toEqual([]);
    expect((await findRenter(gestor, ana2.id))?.restriction?.reason).toBe(
      "inadimplência acima de 30 dias",
    );
  });

  it("o chip Com restrição devolve só quem está impedido", async () => {
    const { renters, total } = await listRenters(gestor, {
      situation: "restricted",
    });

    expect(renters.map((renter) => renter.id).sort()).toEqual(
      [ana2.id, bruno.id].sort(),
    );
    // O total é o do recorte, não o da carteira: é ele que escreve o "1–2 de
    // N" do rodapé, e um número da carteira inteira aqui inventaria páginas.
    expect(total).toBe(2);
  });

  it("o chip CNH vencida usa o mesmo corte de data que o aviso", async () => {
    // A conta de dia de calendário vira data dentro da consulta. Se o corte
    // aqui e o do badge divergirem, a lista promete uma coisa e mostra outra.
    const hoje = new Date("2026-09-12T12:00:00-03:00");

    const { renters } = await listRenters(
      gestor,
      { situation: "cnh-overdue" },
      hoje,
    );

    // Ana vence em 15/07/2026; Bruno em 2030; Carla não tem CNH registrada.
    expect(renters.map((renter) => renter.id)).toEqual([ana2.id]);
  });

  it("conta o que cada chip entregaria, com a busca de pé", async () => {
    const todos = await renterCounts(gestor);
    expect(todos).toMatchObject({ all: 3, restricted: 2 });

    // O contador responde "quantos sobrariam se eu clicasse aqui", não
    // "quantos existem": a busca tem que mexer nos números.
    const buscando = await renterCounts(gestor, { q: "ana" });
    expect(buscando).toMatchObject({ all: 1, restricted: 1 });
  });

  it("levantar a restrição libera o locatário e some do chip", async () => {
    const liberado = await liftRestriction(gestor, ana2.id);

    expect(liberado?.restriction).toBeNull();

    const { renters } = await listRenters(gestor, { situation: "restricted" });
    expect(renters.map((renter) => renter.id)).toEqual([bruno.id]);
  });
});
