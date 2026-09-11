import { config } from "dotenv";

/**
 * Carrega `.env.local` para os testes.
 *
 * Decisão (ver `docs/adr/0006`): os testes rodam contra um projeto Supabase
 * REAL, não contra uma instância local. Isso significa que criar usuário e
 * semear dados de teste escreve num projeto de verdade — use um branch do
 * Supabase, nunca o projeto de produção.
 */
export default function setup() {
  config({ path: ".env.local", quiet: true });

  const required = [
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    // Só os testes usam: cria usuário e prepara cenário, ignorando RLS.
    // Nunca chega ao browser — não tem prefixo NEXT_PUBLIC_.
    "SUPABASE_SERVICE_ROLE_KEY",
  ];

  const missing = required.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(
      `Faltam variáveis em .env.local: ${missing.join(", ")}.\n` +
        `Pegue em https://supabase.com/dashboard/project/_/settings/api-keys`,
    );
  }
}
