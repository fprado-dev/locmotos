import { signOut } from "@/app/(auth)/actions";
import { initials } from "@/app/ui";
import { createClient } from "@/lib/supabase/server";
import { currentTenant } from "@/modules/tenants";
import { Nav } from "./nav";
import { ProfileMenu } from "./profile-menu";

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

        <div className="mt-auto p-3">
          <ProfileMenu
            name={tenant?.name ?? "Sem locadora"}
            initials={tenant ? initials(tenant.name) : "--"}
            signOut={signOut}
          />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {children}
      </div>
    </div>
  );
}
