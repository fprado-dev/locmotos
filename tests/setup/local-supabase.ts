import { execFileSync } from "node:child_process";

/**
 * Carrega as credenciais da instância LOCAL do Supabase em `process.env`.
 *
 * Os testes rodam contra um Postgres de verdade, com RLS ligado — não contra um
 * client mockado. O comportamento mais crítico do sistema (isolamento por
 * locadora, `docs/adr/0001`) vive na policy do banco, e um mock devolveria o que
 * o próprio teste mandasse devolver.
 */
export default function setup() {
  let raw: string;

  try {
    raw = execFileSync("pnpm", ["exec", "supabase", "status", "-o", "env"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch {
    throw new Error(
      "Supabase local não está rodando. Rode `pnpm db:start` antes dos testes.",
    );
  }

  for (const line of raw.split("\n")) {
    const match = line.match(/^([A-Z_]+)="?([^"]*)"?$/);
    if (!match) continue;
    const [, key, value] = match;
    process.env[key] = value;
  }

  const required = ["API_URL", "SERVICE_ROLE_KEY", "ANON_KEY"];
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(
      `\`supabase status\` não devolveu: ${missing.join(", ")}. Supabase local está de pé?`,
    );
  }
}
