import type { SupabaseClient } from "@supabase/supabase-js";

/** A locadora de quem está logado. */
export type Tenant = {
  id: string;
  name: string;
};

/**
 * A locadora da sessão corrente, ou `null`.
 *
 * A RLS já limita a tabela à locadora do JWT, então não há o que filtrar aqui:
 * o gestor enxerga uma linha, e é a dele. O operador do SaaS enxerga todas —
 * daí o `maybeSingle` não servir, e a ordem existir só para ser determinística.
 */
export async function currentTenant(
  client: SupabaseClient,
): Promise<Tenant | null> {
  const { data, error } = await client
    .from("tenants")
    .select("id, name")
    .order("created_at")
    .limit(1);

  if (error) throw error;
  return (data?.[0] as Tenant) ?? null;
}
