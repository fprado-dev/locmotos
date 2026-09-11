import { createBrowserClient } from "@supabase/ssr";

/**
 * Client do Supabase para uso no browser.
 *
 * `createBrowserClient` é singleton: chamar várias vezes devolve a mesma instância.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
}
