import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createAdminClient,
  createAuthenticatedClient,
} from "@/tests/helpers/supabase";
import {
  attachVehicleFile,
  createVehicle,
  findVehicle,
  fleetFilterOptions,
  fleetStatusCounts,
  fleetSummary,
  listVehicles,
  removeVehicle,
  removeVehicles,
  setVehicleStatus,
  setVehiclesStatus,
  signedFileUrl,
  updateVehicle,
  VEHICLE_SORTS,
  VEHICLES_PER_PAGE,
} from "./index";

const cleanups: Array<() => Promise<void>> = [];

// A limpeza é no fim do arquivo, não a cada teste: cada teste tem a própria
// locadora, e adiar deixa um fixture compartilhado (`beforeAll`) sobreviver
// aos testes que o usam.
afterAll(async () => {
  await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
});

/**
 * Apaga os arquivos que a locadora de teste subiu.
 *
 * O `on delete cascade` leva as linhas, não os objetos do Storage: sem isto o
 * bucket do projeto vai acumulando CRLV de teste para sempre.
 */
async function removeFilesOf(tenantId: string) {
  const bucket = createAdminClient().storage.from("vehicle-files");

  const { data: vehicles } = await bucket.list(tenantId);
  const paths = (
    await Promise.all(
      (vehicles ?? []).map(async (vehicle) => {
        const { data: files } = await bucket.list(
          `${tenantId}/${vehicle.name}`,
        );
        return (files ?? []).map(
          (file) => `${tenantId}/${vehicle.name}/${file.name}`,
        );
      }),
    )
  ).flat();

  if (paths.length > 0) await bucket.remove(paths);
}

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
    await removeFilesOf(tenantId);
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

const cg160Full = {
  ...cg160,
  chassis: "9C2KC1670NR000001",
  renavam: "12345678901",
  color: "Vermelha",
  mileage: 18400,
  licensingDueDate: "2026-11-30",
  fipeValue: 14500.5,
  weeklyPrice: 320,
  purchaseValue: 13000,
  purchaseDate: "2025-02-10",
  notes: "Baú instalado pelo dono anterior.",
};

describe("cadastro completo", () => {
  it("devolve na leitura tudo o que o gestor preencheu", async () => {
    const manager = await createManager();

    const created = await createVehicle(manager.client, cg160Full);
    const found = await findVehicle(manager.client, created.id);

    expect(found).toMatchObject(cg160Full);
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

    const vehicleOfTenantB = await createVehicle(tenantB.client, cg160);

    expect(vehicleOfTenantB.plate).toBe(cg160.plate);
  });
});

describe("frota", () => {
  it("mostra na lista o veículo que o gestor cadastrou", async () => {
    const manager = await createManager();

    const created = await createVehicle(manager.client, cg160);
    const { vehicles } = await listVehicles(manager.client);

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

    const { vehicles } = await listVehicles(tenantB.client);

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

describe("situação do veículo", () => {
  it("nasce na situação que o painel escolheu, e a correção não a apaga", async () => {
    const manager = await createManager();

    const moto = await createVehicle(manager.client, {
      ...cg160,
      plate: "STA0A01",
      status: "maintenance",
    });
    expect(moto.status).toBe("maintenance");

    // A página de detalhe não tem campo de situação: quem a muda lá é o select
    // do cabeçalho. Salvar o cadastro sem esse campo não pode desfazer isso.
    const corrigida = await updateVehicle(manager.client, moto.id, {
      ...cg160,
      plate: "STA0A01",
      mileage: 999,
    });

    expect(corrigida).toMatchObject({ status: "maintenance", mileage: 999 });
  });

  it("nasce disponível, sem o gestor marcar nada", async () => {
    const manager = await createManager();

    const created = await createVehicle(manager.client, cg160);

    expect(created.status).toBe("available");
  });

  it("guarda a situação que o gestor escolheu", async () => {
    const manager = await createManager();
    const created = await createVehicle(manager.client, cg160);

    await setVehicleStatus(manager.client, created.id, "maintenance");

    expect(await findVehicle(manager.client, created.id)).toMatchObject({
      status: "maintenance",
    });
  });

  it("recusa alterar a situação de veículo de outra locadora", async () => {
    const tenantA = await createManager();
    const tenantB = await createManager();
    const vehicleOfTenantA = await createVehicle(tenantA.client, cg160);

    const updated = await setVehicleStatus(
      tenantB.client,
      vehicleOfTenantA.id,
      "unavailable",
    );

    expect(updated).toBeNull();
    // E não é só o retorno: a moto do vizinho continua como estava.
    expect(
      await findVehicle(tenantA.client, vehicleOfTenantA.id),
    ).toMatchObject({ status: "available" });
  });
});

describe("busca e filtros", () => {
  /**
   * Uma frota pequena e variada, criada uma vez para o bloco inteiro.
   *
   * Não é economia de digitação: cada gestor custa um login, e o projeto
   * Supabase limita logins por janela de tempo (`docs/adr/0006`). Os testes
   * daqui só leem, então dividir a mesma frota não os acopla.
   */
  async function fleetOfThree() {
    const manager = await createManager();

    const cg = await createVehicle(manager.client, cg160);
    const factor = await createVehicle(manager.client, {
      plate: "XYZ9W88",
      brand: "Yamaha",
      model: "Factor 150",
      year: 2024,
    });
    const biz = await createVehicle(manager.client, {
      plate: "QRS4T55",
      brand: "Honda",
      model: "Biz 125",
      year: 2022,
    });
    await setVehicleStatus(manager.client, factor.id, "maintenance");

    return { ...manager, cg, factor, biz };
  }

  let fleet: Awaited<ReturnType<typeof fleetOfThree>>;
  let outsider: Awaited<ReturnType<typeof createManager>>;

  beforeAll(async () => {
    fleet = await fleetOfThree();
    outsider = await createManager();
  });

  it("acha o veículo por um pedaço da placa", async () => {
    // Três letras do meio, em minúscula: é o que o gestor lembra no pátio.
    const { vehicles } = await listVehicles(fleet.client, { plate: "c1d" });

    expect(vehicles.map((vehicle) => vehicle.id)).toEqual([fleet.cg.id]);
  });

  it("devolve só a situação pedida", async () => {
    const { vehicles } = await listVehicles(fleet.client, {
      status: "maintenance",
    });

    expect(vehicles.map((vehicle) => vehicle.id)).toEqual([fleet.factor.id]);
  });

  it("combina os filtros em vez de escolher um", async () => {
    // Cada filtro sozinho devolveria duas motos: são duas Honda na frota e
    // dois veículos 2024. Juntos, sobra uma.
    const { vehicles } = await listVehicles(fleet.client, {
      brand: "honda",
      year: 2024,
    });

    expect(vehicles.map((vehicle) => vehicle.id)).toEqual([fleet.cg.id]);
  });

  it("não deixa o filtro atravessar a fronteira da locadora", async () => {
    const { vehicles } = await listVehicles(outsider.client, {
      plate: fleet.cg.plate,
    });

    expect(vehicles).toEqual([]);
  });

  it("quebra a lista em páginas e avisa que há mais", async () => {
    const manager = await createManager();
    await Promise.all(
      Array.from({ length: VEHICLES_PER_PAGE + 1 }, (_, index) =>
        createVehicle(manager.client, {
          ...cg160,
          plate: `PAG${String(index).padStart(4, "0")}`,
        }),
      ),
    );

    const first = await listVehicles(manager.client);
    const second = await listVehicles(manager.client, { page: 2 });
    // Página que não existe é lista vazia, não erro: a página vive na URL, e
    // qualquer número cabe lá.
    const nowhere = await listVehicles(manager.client, { page: 99 });

    expect(first.vehicles).toHaveLength(VEHICLES_PER_PAGE);
    expect(first.hasMore).toBe(true);
    expect(first.total).toBe(VEHICLES_PER_PAGE + 1);
    expect(second.vehicles).toHaveLength(1);
    expect(second.hasMore).toBe(false);
    expect(nowhere.vehicles).toEqual([]);
    // A página 2 continua de onde a 1 parou, sem repetir nem pular ninguém.
    const ids = [...first.vehicles, ...second.vehicles].map((v) => v.id);
    expect(new Set(ids).size).toBe(VEHICLES_PER_PAGE + 1);
  });
});

describe("correção e baixa", () => {
  /**
   * Um gestor e um vizinho, para o bloco inteiro.
   *
   * Cada gestor custa um login, e o projeto Supabase limita logins por janela
   * (`docs/adr/0006`). Os testes daqui convivem na mesma locadora porque cada
   * um usa a própria placa — o que os isolaria é a placa, não o tenant.
   */
  let owner: Awaited<ReturnType<typeof createManager>>;
  let outsider: Awaited<ReturnType<typeof createManager>>;

  beforeAll(async () => {
    owner = await createManager();
    outsider = await createManager();
  });

  it("guarda a correção que o gestor fez", async () => {
    const moto = { ...cg160Full, plate: "EDT1A01" };
    const created = await createVehicle(owner.client, moto);

    await updateVehicle(owner.client, created.id, {
      ...moto,
      color: "Preta",
      notes: "Baú removido.",
    });

    expect(await findVehicle(owner.client, created.id)).toMatchObject({
      color: "Preta",
      notes: "Baú removido.",
      plate: moto.plate,
    });
  });

  it("atualiza a quilometragem sem mexer no resto", async () => {
    const moto = { ...cg160Full, plate: "EDT1A02" };
    const created = await createVehicle(owner.client, moto);

    // É o que acontece na devolução: o gestor mexe num campo só.
    await updateVehicle(owner.client, created.id, { ...moto, mileage: 21_500 });

    expect(await findVehicle(owner.client, created.id)).toMatchObject({
      ...moto,
      mileage: 21_500,
    });
  });

  it("tira da lista o veículo que recebeu baixa", async () => {
    const created = await createVehicle(owner.client, {
      ...cg160,
      plate: "EDT1A03",
    });

    await removeVehicle(owner.client, created.id);

    const { vehicles } = await listVehicles(owner.client);
    expect(vehicles.map((vehicle) => vehicle.id)).not.toContain(created.id);
    expect(await findVehicle(owner.client, created.id)).toBeNull();
  });

  it("mantém no banco a linha do veículo que saiu da frota", async () => {
    const created = await createVehicle(owner.client, {
      ...cg160,
      plate: "EDT1A04",
    });

    await removeVehicle(owner.client, created.id);

    // Pelo client do gestor a moto sumiu; a linha continua lá, e é isso que
    // Locações e Finanças vão referenciar depois.
    const { data } = await createAdminClient()
      .from("vehicles")
      .select("id, deleted_at")
      .eq("id", created.id)
      .single();

    expect(data?.deleted_at).not.toBeNull();
  });

  it("libera a placa depois da baixa", async () => {
    const moto = { ...cg160, plate: "EDT1A05" };
    const created = await createVehicle(owner.client, moto);
    await removeVehicle(owner.client, created.id);

    // A moto foi dada como baixa por engano e volta para a frota.
    const again = await createVehicle(owner.client, moto);

    expect(again.plate).toBe(moto.plate);
  });

  it("recusa corrigir veículo do vizinho", async () => {
    const moto = { ...cg160, plate: "EDT1A06" };
    const mine = await createVehicle(owner.client, moto);

    const updated = await updateVehicle(outsider.client, mine.id, {
      ...moto,
      brand: "Roubada",
    });

    expect(updated).toBeNull();
    expect(await findVehicle(owner.client, mine.id)).toMatchObject({
      brand: "Honda",
    });
  });

  it("recusa dar baixa em veículo do vizinho", async () => {
    const mine = await createVehicle(owner.client, {
      ...cg160,
      plate: "EDT1A07",
    });

    const removed = await removeVehicle(outsider.client, mine.id);

    expect(removed).toBeNull();
    // A moto continua na frota de quem é dela.
    expect(await findVehicle(owner.client, mine.id)).not.toBeNull();
  });
});

describe("foto e documentos", () => {
  /** Um PDF minúsculo, mas PDF de verdade: o bucket confere o tipo. */
  function crlv(name = "crlv.pdf") {
    return new File([Uint8Array.from([0x25, 0x50, 0x44, 0x46, 0x2d])], name, {
      type: "application/pdf",
    });
  }

  let owner: Awaited<ReturnType<typeof createManager>>;
  let outsider: Awaited<ReturnType<typeof createManager>>;

  beforeAll(async () => {
    owner = await createManager();
    outsider = await createManager();
  });

  it("guarda o caminho do documento no cadastro", async () => {
    const moto = { ...cg160, plate: "DOC1A01" };
    const created = await createVehicle(owner.client, moto);

    const withFile = await attachVehicleFile(
      owner.client,
      created.id,
      "crlv",
      crlv(),
    );

    // O caminho começa pela locadora: é a primeira pasta que a policy do
    // Storage compara com o JWT.
    expect(withFile?.crlvPath).toBe(`${owner.tenantId}/${created.id}/crlv.pdf`);
  });

  it("abre o arquivo por URL assinada", async () => {
    const created = await createVehicle(owner.client, {
      ...cg160,
      plate: "DOC1A02",
    });
    const withFile = await attachVehicleFile(
      owner.client,
      created.id,
      "crlv",
      crlv(),
    );

    const url = await signedFileUrl(owner.client, withFile!.crlvPath!);
    const response = await fetch(url!);

    expect(response.status).toBe(200);
  });

  it("não serve o arquivo pela URL pública do bucket", async () => {
    const created = await createVehicle(owner.client, {
      ...cg160,
      plate: "DOC1A03",
    });
    const withFile = await attachVehicleFile(
      owner.client,
      created.id,
      "crlv",
      crlv(),
    );

    // O mesmo caminho, sem assinatura: é o que alguém tentaria montar na mão.
    const response = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/vehicle-files/${withFile!.crlvPath}`,
    );

    expect(response.ok).toBe(false);
  });

  it("não deixa o vizinho ler o arquivo da minha locadora", async () => {
    const created = await createVehicle(owner.client, {
      ...cg160,
      plate: "DOC1A04",
    });
    const withFile = await attachVehicleFile(
      owner.client,
      created.id,
      "crlv",
      crlv(),
    );

    // O vizinho sabe o caminho — e mesmo assim não consegue assinar nem baixar.
    await expect(
      signedFileUrl(outsider.client, withFile!.crlvPath!),
    ).rejects.toThrow();

    const { error } = await outsider.client.storage
      .from("vehicle-files")
      .download(withFile!.crlvPath!);
    expect(error).not.toBeNull();
  });

  it("recusa anexar em veículo do vizinho, sem subir nada", async () => {
    const mine = await createVehicle(owner.client, {
      ...cg160,
      plate: "DOC1A05",
    });

    const attached = await attachVehicleFile(
      outsider.client,
      mine.id,
      "crlv",
      crlv(),
    );

    expect(attached).toBeNull();
    expect(await findVehicle(owner.client, mine.id)).toMatchObject({
      crlvPath: null,
    });
  });
});

describe("operador do SaaS", () => {
  /**
   * Quem opera o produto, e não uma locadora.
   *
   * Sem `tenant_id` no JWT de propósito: o que ele enxerga não vem de pertencer
   * a uma locadora, vem da policy de operador.
   */
  async function createOperator() {
    const { client, cleanup } = await createAuthenticatedClient({
      appMetadata: { is_operator: true },
    });
    cleanups.push(cleanup);

    return client;
  }

  it("enxerga a frota de mais de uma locadora, e o gestor continua na dele", async () => {
    const zé = await createManager();
    const maria = await createManager();
    const motoDoZé = await createVehicle(zé.client, {
      ...cg160,
      plate: "OPR1A01",
    });
    const motoDaMaria = await createVehicle(maria.client, {
      ...cg160,
      plate: "OPR1A02",
    });

    const operator = await createOperator();
    // A frota do projeto inteiro passa por aqui, inclusive de outros testes:
    // o que importa é que as duas locadoras aparecem para o operador.
    const { vehicles } = await listVehicles(operator, { plate: "OPR1A0" });

    expect(vehicles.map((vehicle) => vehicle.id).sort()).toEqual(
      [motoDoZé.id, motoDaMaria.id].sort(),
    );
    // E dá para dizer de quem é cada uma: duas locadoras podem ter a mesma
    // placa, então sem o nome a lista do operador seria ambígua.
    expect(vehicles.every((vehicle) => vehicle.tenantName)).toBe(true);

    // E a policy nova não afrouxou nada para quem é gestor.
    expect(await findVehicle(zé.client, motoDaMaria.id)).toBeNull();
    expect(await findVehicle(maria.client, motoDoZé.id)).toBeNull();
  });

  it("lê a frota alheia, mas não escreve nela", async () => {
    const manager = await createManager();
    const moto = await createVehicle(manager.client, {
      ...cg160,
      plate: "OPR1A03",
    });

    const operator = await createOperator();

    // Enxerga.
    expect(await findVehicle(operator, moto.id)).toMatchObject({
      plate: "OPR1A03",
    });

    // E só. O acesso ampliado é de leitura: as policies de escrita continuam
    // exigindo a locadora do JWT, e o operador não tem nenhuma.
    expect(await setVehicleStatus(operator, moto.id, "maintenance")).toBeNull();
    expect(
      await updateVehicle(operator, moto.id, { ...cg160, brand: "Trocada" }),
    ).toBeNull();
    expect(await removeVehicle(operator, moto.id)).toBeNull();

    expect(await findVehicle(manager.client, moto.id)).toMatchObject({
      status: "available",
      brand: "Honda",
    });
  });
});

describe("ordenação", () => {
  /**
   * Uma frota onde "parada há" é diferente em cada moto.
   *
   * A data de cadastro é o relógio de "parada há", e ela nasce em `now()`:
   * para ter uma moto parada há meses o teste precisa recuar a data pelo
   * admin, que é preparação de cenário, não o comportamento sob teste.
   */
  async function fleetWithHistory() {
    const manager = await createManager();
    const admin = createAdminClient();
    // Um relógio só para a frota toda: duas motos com o mesmo "parada há"
    // precisam ter a MESMA data, senão o que ordena é o milissegundo de
    // diferença entre dois inserts e o desempate por placa nunca acontece.
    const clock = Date.now();

    const vehicles = await Promise.all(
      [
        // Duas paradas há o mesmo tanto, cadastradas fora de ordem de placa:
        // é nelas que o desempate aparece.
        { plate: "SRT0B02", days: 50 },
        { plate: "SRT0A01", days: 50 },
        { plate: "SRT0C03", days: 10 },
      ].map(async ({ plate, days }) => {
        const vehicle = await createVehicle(manager.client, {
          ...cg160,
          plate,
        });
        const createdAt = new Date(clock - days * 86_400_000);
        await admin
          .from("vehicles")
          .update({ created_at: createdAt.toISOString() })
          .eq("id", vehicle.id);

        return { ...vehicle, plate, days };
      }),
    );

    return { ...manager, vehicles };
  }

  let fleet: Awaited<ReturnType<typeof fleetWithHistory>>;

  beforeAll(async () => {
    fleet = await fleetWithHistory();
  });

  it("põe a moto mais parada na frente, e desempata por placa", async () => {
    const { vehicles } = await listVehicles(fleet.client, {
      sort: "daysWithoutRental",
      direction: "desc",
    });

    // As duas de 50 dias primeiro, em ordem de placa; a de 10 por último.
    expect(vehicles.map((vehicle) => vehicle.plate)).toEqual([
      "SRT0A01",
      "SRT0B02",
      "SRT0C03",
    ]);
  });

  it("inverte quando o gestor pede a ordem contrária", async () => {
    const { vehicles } = await listVehicles(fleet.client, {
      sort: "daysWithoutRental",
      direction: "asc",
    });

    expect(vehicles.map((vehicle) => vehicle.plate)).toEqual([
      "SRT0C03",
      "SRT0A01",
      "SRT0B02",
    ]);
  });

  it("é a ordem de quem não pediu ordem nenhuma", async () => {
    const { vehicles } = await listVehicles(fleet.client);

    expect(vehicles.map((vehicle) => vehicle.plate)).toEqual([
      "SRT0A01",
      "SRT0B02",
      "SRT0C03",
    ]);
  });

  it("ordena por qualquer uma das colunas da tabela", async () => {
    const ordered = await Promise.all(
      VEHICLE_SORTS.map(async (sort) => {
        const { vehicles } = await listVehicles(fleet.client, { sort });
        return vehicles.length;
      }),
    );

    expect(ordered).toEqual(VEHICLE_SORTS.map(() => 3));
  });
});

describe("os números da frota", () => {
  it("conta a frota inteira, não a página nem o filtro", async () => {
    const manager = await createManager();
    const hoje = new Date("2026-09-11T12:00:00Z");

    // Uma disponível com preço, outra disponível sem preço, e uma de cada
    // situação restante: o card de receita soma só as disponíveis.
    await createVehicle(manager.client, {
      ...cg160,
      plate: "SUM0A01",
      weeklyPrice: 320,
      // Vencido: ainda conta, e conta como vencido, não como vencendo.
      licensingDueDate: "2026-02-01",
    });
    await createVehicle(manager.client, {
      ...cg160,
      plate: "SUM0A02",
      weeklyPrice: null,
      licensingDueDate: "2026-10-01",
    });
    const reservada = await createVehicle(manager.client, {
      ...cg160,
      plate: "SUM0A03",
      weeklyPrice: 500,
      // Fora da janela de aviso: não entra em nenhum dos dois contadores.
      licensingDueDate: "2027-08-01",
    });
    const manutenção = await createVehicle(manager.client, {
      ...cg160,
      plate: "SUM0A04",
      weeklyPrice: 500,
    });
    const indisponível = await createVehicle(manager.client, {
      ...cg160,
      plate: "SUM0A05",
    });
    await setVehicleStatus(manager.client, reservada.id, "reserved");
    await setVehicleStatus(manager.client, manutenção.id, "maintenance");
    await setVehicleStatus(manager.client, indisponível.id, "unavailable");

    // Moto com baixa saiu da frota: não conta em lugar nenhum.
    const baixada = await createVehicle(manager.client, {
      ...cg160,
      plate: "SUM0A06",
      weeklyPrice: 999,
    });
    await removeVehicle(manager.client, baixada.id);

    expect(await fleetSummary(manager.client, hoje)).toEqual({
      total: 5,
      available: 2,
      reserved: 1,
      maintenance: 1,
      unavailable: 1,
      licensingDueSoon: 1,
      licensingOverdue: 1,
      availableWeeklyPrice: 320,
    });
  });

  it("não enxerga a frota de outra locadora", async () => {
    const vizinha = await createManager();
    const recémChegada = await createManager();
    await createVehicle(vizinha.client, { ...cg160, plate: "SUM0B01" });

    expect(await fleetSummary(recémChegada.client)).toMatchObject({
      total: 0,
      available: 0,
      availableWeeklyPrice: 0,
    });
  });
});

describe("as opções do filtro", () => {
  it("oferecem só o que a frota da locadora tem", async () => {
    const manager = await createManager();
    const vizinha = await createManager();

    await createVehicle(manager.client, {
      ...cg160,
      plate: "OPT0A01",
      brand: "Honda",
      model: "CG 160",
      year: 2024,
    });
    await createVehicle(manager.client, {
      ...cg160,
      plate: "OPT0A02",
      brand: "Honda",
      model: "Biz 125",
      year: 2021,
    });
    // Mesma marca e modelo repetidos não viram duas opções.
    await createVehicle(manager.client, {
      ...cg160,
      plate: "OPT0A03",
      brand: "Honda",
      model: "CG 160",
      year: 2024,
    });
    // A moto da vizinha não pode aparecer no select de ninguém: seria o
    // vazamento mais silencioso possível, um nome de marca num dropdown.
    await createVehicle(vizinha.client, {
      ...cg160,
      plate: "OPT0B01",
      brand: "Yamaha",
      model: "Factor 150",
      year: 2019,
    });

    expect(await fleetFilterOptions(manager.client)).toEqual({
      brands: ["Honda"],
      models: ["Biz 125", "CG 160"],
      // Mais nova primeiro: é por ela que se procura.
      years: [2024, 2021],
    });
  });
});

describe("os contadores dos chips de situação", () => {
  it("mudam quando outro filtro entra", async () => {
    const manager = await createManager();

    const honda = await createVehicle(manager.client, {
      ...cg160,
      plate: "CHP0A01",
      brand: "Honda",
    });
    await createVehicle(manager.client, {
      ...cg160,
      plate: "CHP0A02",
      brand: "Honda",
    });
    const yamaha = await createVehicle(manager.client, {
      ...cg160,
      plate: "CHP0A03",
      brand: "Yamaha",
    });
    await setVehicleStatus(manager.client, honda.id, "maintenance");
    await setVehicleStatus(manager.client, yamaha.id, "maintenance");

    // Sem filtro: a frota inteira.
    expect(await fleetStatusCounts(manager.client)).toEqual({
      all: 3,
      available: 1,
      reserved: 0,
      maintenance: 2,
      unavailable: 0,
    });

    // Com a marca escolhida, o chip promete o que vai entregar.
    expect(await fleetStatusCounts(manager.client, { brand: "Honda" })).toEqual(
      {
        all: 2,
        available: 1,
        reserved: 0,
        maintenance: 1,
        unavailable: 0,
      },
    );

    // E a situação já escolhida é a única que o recorte ignora: com "Em
    // manutenção" ativo, o chip "Disponível" continua sabendo dizer quantas
    // são, senão o gestor não teria como voltar atrás.
    expect(
      await fleetStatusCounts(manager.client, { status: "maintenance" }),
    ).toEqual({
      all: 3,
      available: 1,
      reserved: 0,
      maintenance: 2,
      unavailable: 0,
    });
  });
});

describe("ações em lote", () => {
  it("não tocam no veículo de outra locadora que veio no meio do lote", async () => {
    const manager = await createManager();
    const vizinha = await createManager();

    const minha = await createVehicle(manager.client, {
      ...cg160,
      plate: "LOT0B01",
    });
    // O id vem do browser: nada impede alguém de colar o id da moto alheia no
    // meio dos seus. Quem recusa é a RLS, não uma conferência no aplicativo.
    const alheia = await createVehicle(vizinha.client, {
      ...cg160,
      plate: "LOT0B02",
    });

    const alteradas = await setVehiclesStatus(
      manager.client,
      [minha.id, alheia.id],
      "unavailable",
    );

    expect(alteradas.map((v) => v.id)).toEqual([minha.id]);
    expect(await findVehicle(vizinha.client, alheia.id)).toMatchObject({
      status: "available",
    });

    // A baixa em lote passa pela mesma peneira, e é a que dói se falhar.
    const baixadas = await removeVehicles(manager.client, [
      minha.id,
      alheia.id,
    ]);

    expect(baixadas.map((v) => v.id)).toEqual([minha.id]);
    expect(await findVehicle(manager.client, minha.id)).toBeNull();
    expect(await findVehicle(vizinha.client, alheia.id)).not.toBeNull();

    // Lote vazio não vira consulta: `in.()` sem nada dentro é sintaxe que o
    // PostgREST recusa, e "nada selecionado" não é erro do gestor.
    expect(await setVehiclesStatus(manager.client, [], "maintenance")).toEqual(
      [],
    );
    expect(await removeVehicles(manager.client, [])).toEqual([]);
  });
});
