import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { brasiliaMoment, isoDay } from "@/lib/calendar";
import { createVehicle, findVehicle, removeVehicle } from "@/modules/fleet";
import { createRenter } from "@/modules/renters";
import {
  createAdminClient,
  createAuthenticatedClient,
} from "@/tests/helpers/supabase";
import {
  deleteIncident,
  endRental,
  openRental,
  recordIncident,
  renterIncidents,
  vehicleIncidents,
  whoHadIt,
  type Incident,
} from "./index";

const cleanups: Array<() => Promise<void>> = [];

afterAll(async () => {
  await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
});

/** Um gestor autenticado, com a locadora dele gravada no JWT. */
async function createManager(): Promise<SupabaseClient> {
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
    await admin.from("tenants").delete().eq("id", tenantId);
    await cleanup();
  });

  return client;
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

/** O dia de hoje como o banco o vê — a atribuição é em dia de Brasília. */
async function hojeNoBanco(client: SupabaseClient): Promise<string> {
  const { data, error } = await client.rpc("today_br");
  if (error) throw error;
  return data as string;
}

function diasAntes(hoje: string, dias: number): string {
  return isoDay(new Date(`${hoje}T12:00:00`), -dias);
}

/** Um instante daquele dia, no fuso de Brasília — o mesmo caminho da tela. */
function emBrasilia(dia: string, hora: string): string {
  return brasiliaMoment(`${dia}T${hora}`);
}

/** Quem estava com a moto, em uma palavra. */
function quem(incident: Incident): string {
  const resposta = whoHadIt(incident);
  return resposta.kind === "renter" ? resposta.name : resposta.kind;
}

async function novaMoto(client: SupabaseClient) {
  return createVehicle(client, {
    plate: plate(),
    brand: "Honda",
    model: "CG 160",
    year: 2024,
    weeklyPrice: 300,
  });
}

const POR = "Gestor · Locadora de teste";

describe("sinistro", () => {
  let gestor: SupabaseClient;
  let hoje: string;

  beforeAll(async () => {
    gestor = await createManager();
    hoje = await hojeNoBanco(gestor);
  });

  it("guarda o que aconteceu, e não mexe na situação da moto", async () => {
    const moto = await novaMoto(gestor);

    const sinistro = await recordIncident(gestor, moto.id, {
      kind: "damage",
      occurredAt: emBrasilia(diasAntes(hoje, 2), "14:30"),
      description: "Colisão traseira na Av. Brasil, sem vítimas",
      policeReport: "2026.123456",
      insurer: "Porto Seguro",
      insurerNotifiedOn: diasAntes(hoje, 1),
      by: POR,
    });

    expect(sinistro).toMatchObject({
      kind: "damage",
      policeReport: "2026.123456",
      insurer: "Porto Seguro",
      by: POR,
      vehicle: { plate: moto.plate },
    });

    // Batida pode significar oficina, baixa ou nada. Adivinhar por quem sabe
    // faria a frota mentir — quem decide é o gestor, num ato separado.
    expect((await findVehicle(gestor, moto.id))?.status).toBe("available");
  });

  it("recusa sinistro no futuro, sem tipo válido e sem dizer o que foi", async () => {
    const moto = await novaMoto(gestor);
    const amanhã = isoDay(new Date(`${hoje}T12:00:00`), 1);

    await expect(
      recordIncident(gestor, moto.id, {
        kind: "damage",
        occurredAt: emBrasilia(amanhã, "10:00"),
        description: "Caiu",
        by: POR,
      }),
    ).rejects.toThrow(/futuro/);

    await expect(
      recordIncident(gestor, moto.id, {
        kind: "crash" as never,
        occurredAt: emBrasilia(hoje, "10:00"),
        description: "Caiu",
        by: POR,
      }),
    ).rejects.toThrow(/Tipo de sinistro/);

    await expect(
      recordIncident(gestor, moto.id, {
        kind: "damage",
        occurredAt: emBrasilia(hoje, "10:00"),
        description: "   ",
        by: POR,
      }),
    ).rejects.toThrow(/o que aconteceu/i);
  });

  it("recusa aviso à seguradora anterior ao sinistro", async () => {
    const moto = await novaMoto(gestor);

    await expect(
      recordIncident(gestor, moto.id, {
        kind: "robbery",
        occurredAt: emBrasilia(hoje, "10:00"),
        description: "Abordagem no semáforo",
        insurer: "Porto Seguro",
        insurerNotifiedOn: diasAntes(hoje, 3),
        by: POR,
      }),
    ).rejects.toThrow(/anterior ao sinistro/);
  });

  it("diz quem estava com a moto, e diz quando não havia ninguém", async () => {
    const moto = await novaMoto(gestor);
    const pessoa = await createRenter(gestor, {
      name: "Ana Ribeiro",
      cpf: "529.982.247-25",
    });

    // Antes da locação: a moto estava no pátio.
    const noPátio = await recordIncident(gestor, moto.id, {
      kind: "damage",
      occurredAt: emBrasilia(diasAntes(hoje, 10), "09:00"),
      description: "Queda no pátio durante manobra",
      by: POR,
    });
    expect(quem(noPátio)).toBe("owner");

    const locação = await openRental(gestor, {
      vehicleId: moto.id,
      renterId: pessoa.id,
      weeklyPrice: 300,
      startedOn: diasAntes(hoje, 5),
    });

    const naRua = await recordIncident(gestor, moto.id, {
      kind: "damage",
      occurredAt: emBrasilia(diasAntes(hoje, 3), "18:20"),
      description: "Colisão lateral",
      by: POR,
    });
    expect(quem(naRua)).toBe("Ana Ribeiro");
    expect(naRua.rentalId).toBe(locação.id);
    expect(naRua.renterId).toBe(pessoa.id);

    // O painel do locatário lê a mesma resposta.
    const dela = await renterIncidents(gestor, pessoa.id);
    expect(dela.map((linha) => linha.id)).toEqual([naRua.id]);

    // E a ficha da moto lista os dois, do mais recente para o mais antigo.
    expect((await vehicleIncidents(gestor, moto.id)).map((l) => l.id)).toEqual([
      naRua.id,
      noPátio.id,
    ]);

    await endRental(gestor, locação.id, { endedOn: diasAntes(hoje, 2) });
  });

  it("não escolhe quando duas locações contêm o dia", async () => {
    // Data de locação tem granularidade de dia: devolvida de manhã e alugada
    // de novo à tarde deixa o dia com dois donos possíveis. Nomear um dos dois
    // com cara de certeza é pior que dizer que não dá para saber.
    const moto = await novaMoto(gestor);
    const dia = diasAntes(hoje, 4);

    const primeira = await createRenter(gestor, {
      name: "Bia Ramos",
      cpf: "111.444.777-35",
    });
    const segunda = await createRenter(gestor, {
      name: "Caio Lima",
      cpf: "153.509.460-56",
    });

    const manhã = await openRental(gestor, {
      vehicleId: moto.id,
      renterId: primeira.id,
      weeklyPrice: 300,
      startedOn: diasAntes(hoje, 12),
    });
    await endRental(gestor, manhã.id, { endedOn: dia });

    const tarde = await openRental(gestor, {
      vehicleId: moto.id,
      renterId: segunda.id,
      weeklyPrice: 300,
      startedOn: dia,
    });

    const empate = await recordIncident(gestor, moto.id, {
      kind: "damage",
      occurredAt: emBrasilia(dia, "13:00"),
      description: "Retrovisor quebrado",
      by: POR,
    });

    expect(quem(empate)).toBe("ambiguous");
    expect(empate.rentalMatches).toBe(2);
    expect(empate.renterName).toBeNull();

    // E não entra na conta de ninguém: fica visível na ficha da moto, que é
    // onde o gestor vai resolver.
    expect(await renterIncidents(gestor, primeira.id)).toEqual([]);
    expect(await renterIncidents(gestor, segunda.id)).toEqual([]);

    await endRental(gestor, tarde.id, { endedOn: diasAntes(hoje, 1) });
  });

  it("a locadora vizinha não enxerga nem mexe", async () => {
    const vizinha = await createManager();
    const moto = await novaMoto(gestor);

    const meu = await recordIncident(gestor, moto.id, {
      kind: "theft",
      occurredAt: emBrasilia(hoje, "08:00"),
      description: "Furto na garagem",
      by: POR,
    });

    expect(await vehicleIncidents(vizinha, moto.id)).toEqual([]);

    // A moto da outra locadora não é achada, e o recado é frase e não código
    // de constraint.
    await expect(
      recordIncident(vizinha, moto.id, {
        kind: "damage",
        occurredAt: emBrasilia(hoje, "09:00"),
        description: "Tentativa de registrar na moto alheia",
        by: "Gestor · Vizinha",
      }),
    ).rejects.toThrow(/não encontrada/i);

    // O delete da vizinha não alcança a linha: a RLS filtra antes.
    await deleteIncident(vizinha, meu.id);
    expect((await vehicleIncidents(gestor, moto.id))[0].id).toBe(meu.id);
  });
});

describe("a baixa com motivo", () => {
  let gestor: SupabaseClient;
  let hoje: string;

  beforeAll(async () => {
    gestor = await createManager();
    hoje = await hojeNoBanco(gestor);
  });

  it("perda total dá baixa apontando para o sinistro", async () => {
    const moto = await novaMoto(gestor);

    const perda = await recordIncident(gestor, moto.id, {
      kind: "total_loss",
      occurredAt: emBrasilia(diasAntes(hoje, 1), "16:00"),
      description: "Capotamento — laudo de perda total",
      policeReport: "2026.999888",
      by: POR,
    });

    const baixada = await removeVehicle(gestor, moto.id, {
      reason: "total_loss",
      incidentId: perda.id,
    });

    expect(baixada).toMatchObject({
      discardReason: "total_loss",
      discardIncidentId: perda.id,
    });

    // Some da frota, e a ficha continua alcançável para dizer por quê.
    expect(await findVehicle(gestor, moto.id)).toBeNull();
    expect(
      await findVehicle(gestor, moto.id, { discarded: true }),
    ).toMatchObject({
      discardReason: "total_loss",
      discardIncidentId: perda.id,
    });
  });

  it("apagar o sinistro deixa a baixa de pé, sem o link", async () => {
    const moto = await novaMoto(gestor);

    const perda = await recordIncident(gestor, moto.id, {
      kind: "total_loss",
      occurredAt: emBrasilia(hoje, "07:00"),
      description: "Perda total lançada na placa errada",
      by: POR,
    });
    await removeVehicle(gestor, moto.id, {
      reason: "total_loss",
      incidentId: perda.id,
    });

    await deleteIncident(gestor, perda.id);

    // `on delete set null`: corrigir uma digitação não pode ressuscitar a moto
    // nem derrubar a linha dela. Desfazer a baixa é outro ato.
    const depois = await findVehicle(gestor, moto.id, { discarded: true });
    expect(depois).toMatchObject({
      discardReason: "total_loss",
      discardIncidentId: null,
    });
  });

  it("recusa motivo que não está na lista", async () => {
    const moto = await novaMoto(gestor);

    await expect(
      removeVehicle(gestor, moto.id, { reason: "roubada" as never }),
    ).rejects.toThrow(/Motivo de baixa/);

    // E a moto continua na frota: a recusa acontece antes do update.
    expect(await findVehicle(gestor, moto.id)).not.toBeNull();
  });

  it("baixa sem motivo continua sendo baixa", async () => {
    // O botão antigo não pedia motivo, e as baixas que ele fez continuam
    // válidas: a coluna nasce nula, e inventar um motivo agora seria
    // reescrever o passado com palpite.
    const moto = await novaMoto(gestor);

    await removeVehicle(gestor, moto.id);

    expect(
      await findVehicle(gestor, moto.id, { discarded: true }),
    ).toMatchObject({ discardReason: null, discardIncidentId: null });
  });
});
