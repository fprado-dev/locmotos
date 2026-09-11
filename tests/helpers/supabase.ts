import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

/**
 * Client com service-role: ignora RLS.
 *
 * **Só para preparar cenário de teste** — criar usuário, semear dados. Nunca
 * para exercitar o comportamento sob teste: um teste que passa por aqui não
 * prova nada sobre isolamento.
 */
export function createAdminClient(): SupabaseClient {
  return createClient(process.env.API_URL!, process.env.SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * Cria um usuário e devolve um client autenticado como ele.
 *
 * É a peça que torna o seam testável: as funções de `modules/` recebem o client
 * como argumento, então o teste roda a mesma função como pessoas diferentes.
 */
export async function createAuthenticatedClient(options?: {
  appMetadata?: Record<string, unknown>;
}): Promise<{ client: SupabaseClient; userId: string; email: string }> {
  const admin = createAdminClient();
  const email = `test-${randomUUID()}@locmotos.test`;
  const password = randomUUID();

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    // Dados de autorização vão em app_metadata, nunca em user_metadata:
    // user_metadata é editável pelo próprio usuário e não serve para RLS.
    app_metadata: options?.appMetadata,
  });
  if (error) throw error;

  const client = createClient(process.env.API_URL!, process.env.ANON_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { error: signInError } = await client.auth.signInWithPassword({
    email,
    password,
  });
  if (signInError) throw signInError;

  return { client, userId: data.user.id, email };
}
