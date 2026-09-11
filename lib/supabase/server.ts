import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Client do Supabase para Server Components, Server Actions e Route Handlers.
 *
 * Precisa ser recriado a cada request: os cookies vêm da request corrente.
 * Nunca reaproveitar a instância entre requests.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Chamado de um Server Component, que não pode escrever cookies.
            // O refresh de sessão acontece no proxy, então isso é seguro ignorar.
          }
        },
      },
    },
  );
}
