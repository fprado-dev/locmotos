import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

const url = () => process.env.NEXT_PUBLIC_SUPABASE_URL!;
const publishableKey = () => process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const serviceRoleKey = () => process.env.SUPABASE_SERVICE_ROLE_KEY!;

/**
 * Client com service-role: ignora RLS.
 *
 * **Só para preparar cenário de teste** — criar usuário, semear dados. Nunca
 * para exercitar o comportamento sob teste: um teste que passa por aqui não
 * prova nada sobre isolamento entre locadoras.
 */
export function createAdminClient(): SupabaseClient {
  return createClient(url(), serviceRoleKey(), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * Cria um usuário e devolve um client autenticado como ele.
 *
 * É a peça que torna o seam testável: as funções de `modules/` recebem o client
 * como argumento, então o teste roda a mesma função como pessoas diferentes e
 * prova o isolamento por RLS (`docs/adr/0001`).
 */
export async function createAuthenticatedClient(options?: {
  appMetadata?: Record<string, unknown>;
  userMetadata?: Record<string, unknown>;
}): Promise<{
  client: SupabaseClient;
  userId: string;
  email: string;
  cleanup: () => Promise<void>;
}> {
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
    // O que a pessoa digitou no cadastro — é daqui que o trigger de
    // provisionamento lê o nome da locadora.
    user_metadata: options?.userMetadata,
  });
  if (error) throw error;

  const client = createClient(url(), publishableKey(), {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { error: signInError } = await client.auth.signInWithPassword({
    email,
    password,
  });
  if (signInError) throw signInError;

  return {
    client,
    userId: data.user.id,
    email,
    // Os testes batem num projeto real: o que o teste cria, o teste apaga.
    cleanup: async () => {
      await admin.auth.admin.deleteUser(data.user.id);
    },
  };
}
