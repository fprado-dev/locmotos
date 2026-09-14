import type { SupabaseClient } from "@supabase/supabase-js";
import { UserError } from "@/lib/user-error";

/**
 * O papel assinado que dá evidência jurídica a uma locação.
 *
 * Uma por locação, e o índice único no banco é quem garante isso — dois
 * contratos na mesma locação não teriam qual vale. Trocar o arquivo
 * **substitui** o que existe, e quem substitui passa a assinar o registro:
 * contrato reassinado por erro de cláusula precisa de conserto.
 *
 * `signedOn` é a data da assinatura, e **não** a do upload: o papel costuma
 * ser digitalizado dias depois, e é a assinatura que vale numa discussão.
 */
export type Contract = {
  id: string;
  rentalId: string;
  /** Caminho no bucket privado, não URL: quem serve é a URL assinada. */
  filePath: string;
  signedOn: string;
  by: string;
  createdAt: string;
};

/** O bucket privado dos arquivos de locação. */
const FILES_BUCKET = "rental-files";

type ContractRow = {
  id: string;
  rental_id: string;
  file_path: string;
  signed_on: string;
  created_by_name: string;
  created_at: string;
};

function toContract(row: ContractRow): Contract {
  return {
    id: row.id,
    rentalId: row.rental_id,
    filePath: row.file_path,
    signedOn: row.signed_on,
    by: row.created_by_name,
    createdAt: row.created_at,
  };
}

const COLUMNS =
  "id, rental_id, file_path, signed_on, created_by_name, created_at";

/** A extensão do arquivo que o gestor escolheu, para o download sair com nome. */
function extension(fileName: string): string {
  const parts = fileName.toLowerCase().split(".");
  return parts.length > 1 ? `.${parts.pop()!.replace(/[^a-z0-9]/g, "")}` : "";
}

/**
 * Anexa — ou substitui — o contrato de uma locação.
 *
 * O caminho começa pela locadora, `<locadora>/<locação>/contrato.<ext>`, que é
 * a primeira pasta que a policy do Storage compara com o JWT. A aplicação
 * monta o caminho; quem recusa o caminho errado é o banco.
 *
 * Substituir um PDF por uma foto muda a extensão, e o arquivo antigo ficaria
 * no bucket sem ninguém apontando para ele — por isso o anterior é removido
 * depois que o novo já está gravado, e não antes.
 */
export async function attachContract(
  client: SupabaseClient,
  rentalId: string,
  file: File,
  { signedOn, by }: { signedOn: string; by: string },
): Promise<Contract> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(signedOn)) {
    throw new UserError("Data de assinatura inválida.", "signedOn");
  }

  if (!file || file.size === 0) {
    throw new UserError("Escolha o arquivo do contrato.", "file");
  }

  // A locação existe e é desta locadora — ou a RLS não teria devolvido nada.
  // Sem esta leitura, a locação alheia esbarraria no FK composto e voltaria
  // como erro de banco em vez de frase.
  const { data: locação, error: leitura } = await client
    .from("rentals")
    .select("id, tenant_id, started_on")
    .eq("id", rentalId)
    .maybeSingle();

  if (leitura) throw leitura;
  if (!locação) throw new UserError("Locação não encontrada.");

  const { tenant_id: tenantId, started_on: início } = locação as {
    tenant_id: string;
    started_on: string;
  };

  // Assinar antes de a locação começar é data digitada errado. O papel pode
  // ser assinado no dia ou depois — nunca antes de existir o que assinar.
  if (signedOn < início) {
    throw new UserError(
      `O contrato não pode ter sido assinado antes de a locação começar, em ${day(início)}.`,
      "signedOn",
    );
  }

  const anterior = await findContract(client, rentalId);
  const path = `${tenantId}/${rentalId}/contrato${extension(file.name)}`;

  const { error: uploadError } = await client.storage
    .from(FILES_BUCKET)
    .upload(path, file, { upsert: true, contentType: file.type });

  if (uploadError) throw uploadError;

  const { data, error } = await client
    .from("contracts")
    // `upsert` pelo índice único da locação: anexar de novo é substituir, e
    // não empilhar um segundo contrato na mesma locação.
    .upsert(
      {
        rental_id: rentalId,
        file_path: path,
        signed_on: signedOn,
        created_by_name: by,
        // Quem substitui passa a assinar o registro, e a data de então é a
        // desta versão — a anterior não é história que o produto guarde.
        created_at: new Date().toISOString(),
      },
      { onConflict: "rental_id" },
    )
    .select(COLUMNS)
    .single();

  if (error) throw error;

  if (anterior && anterior.filePath !== path) {
    await client.storage.from(FILES_BUCKET).remove([anterior.filePath]);
  }

  return toContract(data as ContractRow);
}

/** "2026-09-14" vira "14/09/2026" — o recado é para o gestor ler. */
function day(date: string): string {
  const [ano, mês, dia] = date.split("-");
  return `${dia}/${mês}/${ano}`;
}

/** O contrato de uma locação, quando ela tem um. */
export async function findContract(
  client: SupabaseClient,
  rentalId: string,
): Promise<Contract | null> {
  const { data, error } = await client
    .from("contracts")
    .select(COLUMNS)
    .eq("rental_id", rentalId)
    .maybeSingle();

  if (error) throw error;
  return data ? toContract(data as ContractRow) : null;
}

/**
 * Quanto vale uma URL assinada, e se ela abre ou baixa.
 *
 * O mesmo par dos documentos da moto: ver na tela e guardar no computador são
 * dois pedidos diferentes, e quem separa os dois é o cabeçalho que o Storage
 * devolve — assinado junto com a URL.
 */
export type SignedUrlOptions = { seconds?: number; download?: string | false };

export async function contractFileUrl(
  client: SupabaseClient,
  path: string,
  { seconds = 60, download = false }: SignedUrlOptions = {},
): Promise<string | null> {
  const { data, error } = await client.storage
    .from(FILES_BUCKET)
    .createSignedUrl(path, seconds, download ? { download } : undefined);

  if (error) throw error;
  return data?.signedUrl ?? null;
}
