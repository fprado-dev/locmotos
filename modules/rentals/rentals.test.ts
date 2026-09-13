import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createAdminClient,
  createAuthenticatedClient,
} from "@/tests/helpers/supabase";
import {
  createVehicle,
  findVehicle,
  setVehicleStatus,
  updateVehicle,
  type Vehicle,
} from "@/modules/fleet";
import {
  createRenter,
  listRenters,
  renterCounts,
  restrictRenters,
  type Renter,
} from "@/modules/renters";
import {
  activeRentalForRenter,
  findRental,
  listRentals,
  openRental,
  rentalCounts,
  type Rental,
} from "./index";

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
    // some, e leva frota, locatários e locações junto (on delete cascade).
    await admin.from("tenants").delete().eq("id", tenantId);
    await cleanup();
  });

  return { client, tenantId };
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

function novaMoto(client: SupabaseClient, weeklyPrice = 340): Promise<Vehicle> {
  return createVehicle(client, {
    plate: plate(),
    brand: "Honda",
    model: "CG 160",
    year: 2024,
    weeklyPrice,
  });
}

const ana = { name: "Ana Ribeiro", cpf: "529.982.247-25" };

/**
 * A locadora que três blocos deste arquivo dividem.
 *
 * Cada locadora nova custa um cadastro e um login no Auth do projeto, que tem
 * teto de requisições: só os blocos que precisam de carteira limpa — a
 * contagem dos chips — ou de duas locadoras — o isolamento — criam a sua.
 */
const compartilhado: { client: SupabaseClient } = { client: null! };

describe("abertura de locação", () => {
  let gestor: SupabaseClient;
  let locatária: Renter;

  beforeAll(async () => {
    compartilhado.client = (await createManager()).client;
    gestor = compartilhado.client;
    locatária = await createRenter(gestor, ana);
  });

  it("abre com o valor da moto e devolve a placa junto", async () => {
    const moto = await novaMoto(gestor, 340);

    const locação = await openRental(gestor, {
      renterId: locatária.id,
      vehicleId: moto.id,
      weeklyPrice: 340,
      commitmentMonths: 12,
      deposit: 500,
    });

    expect(locação).toMatchObject({
      vehicleId: moto.id,
      renterId: locatária.id,
      weeklyPrice: 340,
      commitmentMonths: 12,
      deposit: 500,
      endedOn: null,
    });
    expect(locação.vehicle.plate).toBe(moto.plate);
  });

  it("deixa a moto reservada na leitura da frota, sem ninguém tocar no select", async () => {
    const moto = await novaMoto(gestor);
    const outra = await createRenter(gestor, { ...ana, cpf: "11144477735" });

    expect((await findVehicle(gestor, moto.id))?.status).toBe("available");

    await openRental(gestor, {
      renterId: outra.id,
      vehicleId: moto.id,
      weeklyPrice: 300,
    });

    // A situação é derivada: ninguém gravou "reserved" em coluna nenhuma.
    expect((await findVehicle(gestor, moto.id))?.status).toBe("reserved");
  });

  it("recusa a segunda locação na mesma moto, e diz desde quando ela está ocupada", async () => {
    const moto = await novaMoto(gestor);
    const primeira = await createRenter(gestor, { ...ana, cpf: "39053344705" });
    const segunda = await createRenter(gestor, { ...ana, cpf: "23100299981" });

    await openRental(gestor, {
      renterId: primeira.id,
      vehicleId: moto.id,
      weeklyPrice: 300,
      startedOn: "2026-09-01",
    });

    await expect(
      openRental(gestor, {
        renterId: segunda.id,
        vehicleId: moto.id,
        weeklyPrice: 300,
      }),
    ).rejects.toThrow(/locação aberta desde 01\/09\/2026/);
  });

  it("a segunda locação na mesma moto é barrada pelo banco, não por um `if`", async () => {
    const moto = await novaMoto(gestor);
    const pessoa = await createRenter(gestor, { ...ana, cpf: "16899559706" });

    await openRental(gestor, {
      renterId: pessoa.id,
      vehicleId: moto.id,
      weeklyPrice: 300,
    });

    // Insert cru, como faria um bug no código ou um POST fabricado: passa
    // pela policy (o tenant confere) e morre no índice único parcial.
    const { error } = await gestor.from("rentals").insert({
      vehicle_id: moto.id,
      renter_id: pessoa.id,
      weekly_price: 300,
    });

    expect(error?.code).toBe("23505");
  });

  it("recusa locatário com restrição, carregando o motivo registrado", async () => {
    const moto = await novaMoto(gestor);
    const restrita = await createRenter(gestor, { ...ana, cpf: "65456770040" });

    await restrictRenters(gestor, [restrita.id], {
      reason: "inadimplência acima de 30 dias",
      by: "Gestor · Locadora de teste",
    });

    await expect(
      openRental(gestor, {
        renterId: restrita.id,
        vehicleId: moto.id,
        weeklyPrice: 300,
      }),
    ).rejects.toThrow(/inadimplência acima de 30 dias/);
  });

  it("recusa moto em manutenção, dizendo em que situação ela está", async () => {
    const moto = await novaMoto(gestor);
    const pessoa = await createRenter(gestor, { ...ana, cpf: "84699641008" });
    await setVehicleStatus(gestor, moto.id, "maintenance");

    await expect(
      openRental(gestor, {
        renterId: pessoa.id,
        vehicleId: moto.id,
        weeklyPrice: 300,
      }),
    ).rejects.toThrow(/em manutenção/);
  });

  it("recusa a segunda moto para quem já está com uma", async () => {
    // A tela fala de "locação atual" no singular: uma pessoa, uma moto.
    const primeira = await novaMoto(gestor);
    const segunda = await novaMoto(gestor);
    const pessoa = await createRenter(gestor, { ...ana, cpf: "70830792007" });

    await openRental(gestor, {
      renterId: pessoa.id,
      vehicleId: primeira.id,
      weeklyPrice: 300,
    });

    await expect(
      openRental(gestor, {
        renterId: pessoa.id,
        vehicleId: segunda.id,
        weeklyPrice: 300,
      }),
    ).rejects.toThrow(new RegExp(`já está com a ${primeira.plate}`));

    // E o índice único do banco atrás da recusa, para o insert cru também
    // morrer aqui.
    const { error } = await gestor.from("rentals").insert({
      vehicle_id: segunda.id,
      renter_id: pessoa.id,
      weekly_price: 300,
    });

    expect(error?.code).toBe("23505");
  });

  it("recusa locação sem valor semanal: acordo sem preço não é acordo", async () => {
    const moto = await novaMoto(gestor, 0);
    const pessoa = await createRenter(gestor, { ...ana, cpf: "22233344405" });

    await expect(
      openRental(gestor, {
        renterId: pessoa.id,
        vehicleId: moto.id,
        weeklyPrice: 0,
      }),
    ).rejects.toThrow(/valor semanal/i);
  });
});

describe("o valor semanal é registrado, não calculado", () => {
  it("não muda quando o da moto muda depois", async () => {
    const gestor = compartilhado.client;
    const moto = await novaMoto(gestor, 340);
    const pessoa = await createRenter(gestor, { ...ana, cpf: "45317828791" });

    const locação = await openRental(gestor, {
      renterId: pessoa.id,
      vehicleId: moto.id,
      weeklyPrice: 340,
    });

    // A locadora reajusta a tabela de preços da frota.
    await updateVehicle(gestor, moto.id, {
      plate: moto.plate,
      brand: moto.brand,
      model: moto.model,
      year: moto.year,
      weeklyPrice: 420,
    });

    expect((await findVehicle(gestor, moto.id))?.weeklyPrice).toBe(420);
    // Quem já está na rua continua pagando o que foi combinado.
    expect((await activeRentalForRenter(gestor, pessoa.id))?.weeklyPrice).toBe(
      340,
    );
    expect(locação.weeklyPrice).toBe(340);
  });
});

describe("a situação reservada não se digita", () => {
  // O mesmo gestor da abertura: cada locadora nova custa um cadastro e um
  // login no Auth do projeto, que tem teto de requisições.
  let gestor: SupabaseClient;

  beforeAll(async () => {
    gestor = compartilhado.client;
  });

  it("recusa `reserved` no cadastro", async () => {
    await expect(
      createVehicle(gestor, {
        plate: plate(),
        brand: "Honda",
        model: "Biz 125",
        year: 2024,
        status: "reserved",
      }),
    ).rejects.toThrow(/locação ativa/);
  });

  it("não troca à mão a situação de uma moto alugada", async () => {
    const moto = await novaMoto(gestor);
    const pessoa = await createRenter(gestor, { ...ana, cpf: "37151090099" });

    await openRental(gestor, {
      renterId: pessoa.id,
      vehicleId: moto.id,
      weeklyPrice: 300,
    });

    // Sai do lote em silêncio, como a moto de outra locadora: quem chamou
    // compara o tamanho e conta ao gestor o que de fato mudou.
    expect(await setVehicleStatus(gestor, moto.id, "maintenance")).toBeNull();
    expect((await findVehicle(gestor, moto.id))?.status).toBe("reserved");
  });
});

/**
 * Uma locadora inteira só para as contagens.
 *
 * Lista, chips e cards respondem sobre a locadora toda, então o bloco precisa
 * de uma carteira e de uma frota que ninguém mais mexeu.
 */
describe("a lista de Locações e os chips de Locatários", () => {
  let gestor: SupabaseClient;
  let comMoto: Renter;
  let outroComMoto: Renter;
  let semMoto: Renter;
  let moto: Vehicle;
  let outraMoto: Vehicle;
  let primeira: Rental;
  let segunda: Rental;

  beforeAll(async () => {
    gestor = (await createManager()).client;

    [comMoto, outroComMoto, semMoto, moto, outraMoto] = await Promise.all([
      createRenter(gestor, ana),
      createRenter(gestor, { name: "Bruno Salles", cpf: "11144477735" }),
      createRenter(gestor, { name: "Carla Nunes", cpf: "39053344705" }),
      novaMoto(gestor, 300),
      novaMoto(gestor, 420),
    ]);

    // Em série, e não em paralelo: a ordem padrão da lista é a mais recente
    // primeiro, e duas aberturas simultâneas não têm ordem para provar.
    primeira = await openRental(gestor, {
      renterId: comMoto.id,
      vehicleId: moto.id,
      weeklyPrice: 300,
      startedOn: "2026-08-01",
    });
    segunda = await openRental(gestor, {
      renterId: outroComMoto.id,
      vehicleId: outraMoto.id,
      weeklyPrice: 420,
      startedOn: "2026-09-01",
    });
  });

  it("vem com a locação mais recente primeiro quando ninguém pediu ordem", async () => {
    const { rentals, total } = await listRentals(gestor);

    expect(rentals.map((rental) => rental.id)).toEqual([
      segunda.id,
      primeira.id,
    ]);
    expect(total).toBe(2);
  });

  it("traz a moto e o nome do locatário resolvidos, sem segunda ida", async () => {
    const { rentals } = await listRentals(gestor);

    expect(rentals[0]).toMatchObject({
      renterName: "Bruno Salles",
      weeklyPrice: 420,
      endedOn: null,
    });
    expect(rentals[0].vehicle.plate).toBe(outraMoto.plate);
  });

  it("acha pela placa e pelo nome do locatário, na mesma caixa", async () => {
    const porPlaca = await listRentals(gestor, { q: moto.plate });
    expect(porPlaca.rentals.map((rental) => rental.id)).toEqual([primeira.id]);

    const porNome = await listRentals(gestor, { q: "salles" });
    expect(porNome.rentals.map((rental) => rental.id)).toEqual([segunda.id]);
  });

  it("conta os chips e a receita semanal contratada", async () => {
    expect(await rentalCounts(gestor)).toEqual({
      all: 2,
      active: 2,
      ended: 0,
      activeWeeklyPrice: 720,
    });
  });

  it("o contador do chip acompanha a busca", async () => {
    // "quantas sobrariam se eu clicasse aqui", não "quantas existem".
    expect(await rentalCounts(gestor, { q: "salles" })).toMatchObject({
      all: 1,
      active: 1,
      activeWeeklyPrice: 420,
    });
  });

  it("o chip Ativas devolve as que estão de pé, e Encerradas nenhuma ainda", async () => {
    const ativas = await listRentals(gestor, { situation: "active" });
    expect(ativas.total).toBe(2);

    const encerradas = await listRentals(gestor, { situation: "ended" });
    expect(encerradas.total).toBe(0);
  });

  it("carrega a placa da locação atual na lista de Locatários", async () => {
    const { renters } = await listRenters(gestor);
    const achada = renters.find((renter) => renter.id === comMoto.id);

    expect(achada?.rental).toMatchObject({
      id: primeira.id,
      plate: moto.plate,
    });
    expect(
      renters.find((renter) => renter.id === semMoto.id)?.rental,
    ).toBeNull();
  });

  it("o chip Com locação devolve só quem está com moto", async () => {
    const { renters, total } = await listRenters(gestor, {
      situation: "with-rental",
    });

    expect(renters.map((renter) => renter.id).sort()).toEqual(
      [comMoto.id, outroComMoto.id].sort(),
    );
    expect(total).toBe(2);
  });

  it("o chip Sem locação devolve o complemento, não a carteira inteira", async () => {
    const { renters, total } = await listRenters(gestor, {
      situation: "without-rental",
    });

    expect(renters.map((renter) => renter.id)).toEqual([semMoto.id]);
    expect(total).toBe(1);
  });

  it("conta os dois chips, e a busca mexe nos números", async () => {
    expect(await renterCounts(gestor)).toMatchObject({
      all: 3,
      "with-rental": 2,
      "without-rental": 1,
    });

    // "quantos sobrariam se eu clicasse aqui", não "quantos existem".
    expect(await renterCounts(gestor, { q: "ana" })).toMatchObject({
      all: 1,
      "with-rental": 1,
      "without-rental": 0,
    });
  });
});

describe("isolamento entre locadoras", () => {
  let dona: SupabaseClient;
  let vizinha: SupabaseClient;
  let motoDaDona: Vehicle;
  let locatáriaDaDona: Renter;
  let locatáriaDaVizinha: Renter;

  beforeAll(async () => {
    // As duas locadoras não dependem uma da outra: em série seriam seis idas
    // ao Auth esperando em fila.
    const [primeira, segunda] = await Promise.all([
      createManager(),
      createManager(),
    ]);
    dona = primeira.client;
    vizinha = segunda.client;

    [motoDaDona, locatáriaDaDona, locatáriaDaVizinha] = await Promise.all([
      novaMoto(dona),
      createRenter(dona, ana),
      createRenter(vizinha, ana),
    ]);
  });

  it("não abre locação com a moto de outra locadora", async () => {
    await expect(
      openRental(vizinha, {
        renterId: locatáriaDaVizinha.id,
        vehicleId: motoDaDona.id,
        weeklyPrice: 300,
      }),
    ).rejects.toThrow(/não encontrado/i);
  });

  it("o FK composto recusa a moto de outra locadora mesmo por insert cru", async () => {
    // A policy de insert só olha o `tenant_id` da própria linha, e ele confere:
    // é a vizinha gravando na locadora dela. O que impede a moto alheia de
    // entrar é o FK (vehicle_id, tenant_id) — sem ele, isto passaria.
    const { error } = await vizinha.from("rentals").insert({
      vehicle_id: motoDaDona.id,
      renter_id: locatáriaDaVizinha.id,
      weekly_price: 300,
    });

    expect(error?.code).toBe("23503");
  });

  it("não lê a locação de outra locadora, nem pelo id, nem pela lista", async () => {
    const daDona = await openRental(dona, {
      renterId: locatáriaDaDona.id,
      vehicleId: motoDaDona.id,
      weeklyPrice: 300,
    });

    expect(
      await activeRentalForRenter(dona, locatáriaDaDona.id),
    ).not.toBeNull();
    expect(await findRental(dona, daDona.id)).not.toBeNull();

    // O mesmo `null` de um id inventado: a RLS filtra antes, então nem a
    // existência do registro vaza. E a lista da vizinha nem chega perto.
    expect(await activeRentalForRenter(vizinha, locatáriaDaDona.id)).toBeNull();
    expect(await findRental(vizinha, daDona.id)).toBeNull();

    const { rentals, total } = await listRentals(vizinha);
    expect(rentals.map((rental) => rental.id)).not.toContain(daDona.id);
    expect(total).toBe(0);
  });

  it("não enxerga a moto da vizinha como reservada", async () => {
    expect(await findVehicle(vizinha, motoDaDona.id)).toBeNull();
  });
});
