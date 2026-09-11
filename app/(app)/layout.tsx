import { LogOut } from "lucide-react";
import { signOut } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { currentTenant } from "@/modules/tenants";
import { Nav } from "./nav";
import { ThemeToggle } from "./theme-toggle";

/** As iniciais da locadora, para o bloco do rodapé da sidebar. */
function iniciais(nome: string): string {
  return nome
    .split(/\s+/)
    .slice(0, 2)
    .map((palavra) => palavra[0] ?? "")
    .join("")
    .toUpperCase();
}

/**
 * A casca das telas de quem está logado.
 *
 * Sidebar fixa à esquerda e conteúdo ocupando o resto da largura, sem coluna
 * centralizada: a tarefa aqui é comparar linhas de uma tabela, e espaço vazio
 * nas laterais é linha que o gestor não vê.
 */
export default async function AppLayout({ children }: LayoutProps<"/">) {
  const client = await createClient();
  const tenant = await currentTenant(client);

  return (
    <div className="flex h-screen w-full overflow-hidden">
      <aside className="flex w-[232px] shrink-0 flex-col border-r border-border bg-sidebar">
        <div className="flex h-16 items-center gap-2.5 px-4">
          <span className="flex size-6 items-center justify-center rounded-md bg-primary font-mono text-[12px] text-primary-foreground">
            lm
          </span>
          <span className="text-[15px] font-semibold">locmotos</span>
        </div>

        <Nav />

        <div className="mt-auto flex flex-col gap-2 p-3">
          <div className="flex items-center gap-2.5 rounded-lg border border-border bg-surface-2 p-2.5">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-chip text-[11px] font-semibold text-muted-foreground">
              {tenant ? iniciais(tenant.name) : "--"}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-[13px] font-medium">
                {tenant?.name ?? "Sem locadora"}
              </span>
              <span className="block text-[11px] text-muted-foreground">
                Locadora
              </span>
            </span>
          </div>

          <ThemeToggle />

          <form action={signOut}>
            <Button
              type="submit"
              variant="ghost"
              className="h-[34px] w-full justify-start gap-2.5 px-3 font-normal text-muted-foreground hover:text-foreground"
            >
              <LogOut className="size-[13px]" strokeWidth={1.5} />
              Sair
            </Button>
          </form>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {children}
      </div>
    </div>
  );
}
