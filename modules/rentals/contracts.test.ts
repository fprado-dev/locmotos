import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { isoDay } from "@/lib/calendar";
import { createVehicle } from "@/modules/fleet";
import { createRenter } from "@/modules/renters";
import {
  createAdminClient,
  createAuthenticatedClient,
} from "@/tests/helpers/supabase";
import {
  attachContract,
  contractFileUrl,
  endRental,
  findContract,
  listRentals,
  openRental,
  rentalCounts,
} from "./index";

const cleanups: Array<() => Promise<void>> = [];

afterAll(async () => {
  await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
});

type Manager = { client: SupabaseClient; tenantId: string };

/** Um gestor autenticado, com a locadora dele gravada no JWT. */
async function createManager(): Promise<Manager> {
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
    // O bucket é privado e os arquivos não caem junto com a locadora: o que o
    // teste sobe, o teste apaga.
    const { data: pastas } = await admin.storage
      .from("rental-files")
      .list(tenantId);
    for (const pasta of pastas ?? []) {
      const { data: arquivos } = await admin.storage
        .from("rental-files")
        .list(`${tenantId}/${pasta.name}`);
      await admin.storage
        .from("rental-files")
        .remove(
          (arquivos ?? []).map((a) => `${tenantId}/${pasta.name}/${a.name}`),
        );
    }

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

/**
 * Um CPF válido e diferente a cada chamada.
 *
 * Uma locatária não pode ter duas locações abertas, então cada locação deste
 * arquivo precisa da sua — e `createRenter` confere o dígito verificador.
 */
function cpf(): string {
  const base = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10));

  const dígito = (números: number[]) => {
    const peso = números.length + 1;
    const soma = números.reduce((total, n, i) => total + n * (peso - i), 0);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };

  const primeiro = dígito(base);
  return [...base, primeiro, dígito([...base, primeiro])].join("");
}

/** Uma locação ativa, do jeito que a tela abre. */
async function novaLocação(client: SupabaseClient) {
  const moto = await createVehicle(client, {
    plate: plate(),
    brand: "Honda",
    model: "CG 160",
    year: 2024,
    weeklyPrice: 300,
  });

  const locatária = await createRenter(client, {
    name: "Ana Souza",
    cpf: cpf(),
    whatsapp: "21999990000",
  });

  return openRental(client, {
    renterId: locatária.id,
    vehicleId: moto.id,
    weeklyPrice: 300,
  });
}

/** O PDF mais curto que ainda é um PDF, para o teste não carregar arquivo. */
function pdf(name = "contrato.pdf") {
  return new File([Uint8Array.from([0x25, 0x50, 0x44, 0x46, 0x2d])], name, {
    type: "application/pdf",
  });
}

function foto(name = "contrato.jpg") {
  return new File([Uint8Array.from([0xff, 0xd8, 0xff, 0xdb])], name, {
    type: "image/jpeg",
  });
}

async function hojeNoBanco(client: SupabaseClient): Promise<string> {
  const { data, error } = await client.rpc("today_br");
  if (error) throw error;
  return data as string;
}

const POR = "Gestor · Locadora de teste";

describe("contrato da locação", () => {
  let gestor: Manager;
  let hoje: string;

  beforeAll(async () => {
    gestor = await createManager();
    hoje = await hojeNoBanco(gestor.client);
  });

  it("guarda o papel assinado sob a pasta da locadora", async () => {
    const locação = await novaLocação(gestor.client);

    const contrato = await attachContract(gestor.client, locação.id, pdf(), {
      signedOn: hoje,
      by: POR,
    });

    expect(contrato).toMatchObject({
      rentalId: locação.id,
      signedOn: hoje,
      by: POR,
    });
    // O caminho começa pela locadora: é a primeira pasta que a policy do
    // Storage compara com o JWT.
    expect(contrato.filePath).toBe(
      `${gestor.tenantId}/${locação.id}/contrato.pdf`,
    );

    const url = await contractFileUrl(gestor.client, contrato.filePath);
    expect((await fetch(url!)).status).toBe(200);
  });

  it("anexar de novo substitui, e não empilha um segundo contrato", async () => {
    const locação = await novaLocação(gestor.client);

    const primeiro = await attachContract(gestor.client, locação.id, pdf(), {
      signedOn: hoje,
      by: POR,
    });
    // Trocar o PDF por uma foto muda a extensão — é o caso em que o arquivo
    // antigo ficaria no bucket sem ninguém apontando para ele.
    const segundo = await attachContract(gestor.client, locação.id, foto(), {
      signedOn: hoje,
      by: "Gestor · outro dia",
    });

    expect(segundo.id).toBe(primeiro.id);
    expect(segundo.filePath).toBe(
      `${gestor.tenantId}/${locação.id}/contrato.jpg`,
    );
    expect(segundo.by).toBe("Gestor · outro dia");
    expect((await findContract(gestor.client, locação.id))?.filePath).toBe(
      segundo.filePath,
    );

    // O arquivo anterior saiu do bucket junto.
    await expect(
      contractFileUrl(gestor.client, primeiro.filePath),
    ).rejects.toThrow();
  });

  it("recusa assinatura anterior ao começo da locação", async () => {
    const locação = await novaLocação(gestor.client);

    await expect(
      attachContract(gestor.client, locação.id, pdf(), {
        signedOn: isoDay(new Date(`${hoje}T12:00:00`), -1),
        by: POR,
      }),
    ).rejects.toThrow(/antes de a locação começar/);

    expect(await findContract(gestor.client, locação.id)).toBeNull();
  });

  it('"sem contrato" é a ausência do papel, e só conta locação ativa', async () => {
    // Locadora própria: o recorte é um contador da lista inteira, e as
    // locações dos outros testes deste arquivo entrariam na conta.
    const sozinha = await createManager();
    const hojeDela = await hojeNoBanco(sozinha.client);

    const semPapel = await novaLocação(sozinha.client);
    const comPapel = await novaLocação(sozinha.client);
    const encerrada = await novaLocação(sozinha.client);

    await attachContract(sozinha.client, comPapel.id, pdf(), {
      signedOn: hojeDela,
      by: POR,
    });
    await endRental(sozinha.client, encerrada.id, { endedOn: hojeDela });

    expect((await rentalCounts(sozinha.client))["no-contract"]).toBe(1);

    const { rentals } = await listRentals(sozinha.client, {
      situation: "no-contract",
    });
    expect(rentals.map((r) => r.id)).toEqual([semPapel.id]);

    // E a data assinada chega junto da locação, para o painel dizer quando.
    const { rentals: todas } = await listRentals(sozinha.client);
    expect(todas.find((r) => r.id === comPapel.id)?.contractSignedOn).toBe(
      hojeDela,
    );
  });

  it("não deixa o vizinho ler nem trocar o contrato da minha locadora", async () => {
    const vizinho = await createManager();
    const locação = await novaLocação(gestor.client);

    const meu = await attachContract(gestor.client, locação.id, pdf(), {
      signedOn: hoje,
      by: POR,
    });

    // O vizinho sabe o caminho, e mesmo assim não assina URL nem baixa.
    await expect(
      contractFileUrl(vizinho.client, meu.filePath),
    ).rejects.toThrow();

    const { error } = await vizinho.client.storage
      .from("rental-files")
      .download(meu.filePath);
    expect(error).not.toBeNull();

    // E a locação alheia volta como frase, não como erro de banco.
    await expect(
      attachContract(vizinho.client, locação.id, foto(), {
        signedOn: hoje,
        by: "Gestor · vizinho",
      }),
    ).rejects.toThrow(/Locação não encontrada/);

    expect((await findContract(gestor.client, locação.id))?.filePath).toBe(
      meu.filePath,
    );
    expect(await findContract(vizinho.client, locação.id)).toBeNull();
  });
});
