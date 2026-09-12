"use client";

import { useTransition } from "react";
import { LogOut } from "lucide-react";
import { useTheme } from "next-themes";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useResolvedTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

/**
 * O bloco da locadora, que também é o menu de quem está usando o sistema.
 *
 * Tema e sair eram dois botões soltos no rodapé da sidebar, disputando lugar
 * com a navegação. Nenhum dos dois é navegação: são ações de conta, e moram
 * atrás do bloco da locadora, que é onde se procura por elas.
 *
 * O rótulo do tema diz para onde o clique leva, não onde se está, e só aparece
 * depois de hidratar — o servidor não tem como saber o tema guardado.
 */
export function ProfileMenu({
  name,
  initials,
  signOut,
}: {
  name: string;
  initials: string;
  /** Sair é Server Action: o cookie da sessão só some no servidor. */
  signOut: () => Promise<void>;
}) {
  const { setTheme } = useTheme();
  const tema = useResolvedTheme();
  const escuro = tema === "dark";
  const [saindo, sair] = useTransition();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex w-full items-center gap-2.5 rounded-lg border border-border bg-surface-2 p-2.5 text-left transition-colors outline-none hover:border-input focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-chip text-[11px] font-semibold text-muted-foreground">
          {initials}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-medium">{name}</span>
          <span className="block text-[11px] text-muted-foreground">
            Locadora
          </span>
        </span>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" className="w-[208px]">
        <DropdownMenuItem
          closeOnClick={false}
          onClick={() => setTheme(escuro ? "light" : "dark")}
        >
          {/* Anel no escuro, círculo cheio no claro: a forma diz qual é qual
              sem depender de cor. */}
          <span
            aria-hidden
            className={cn(
              "size-[13px] rounded-full border border-current",
              tema === "light" && "bg-current",
            )}
          />
          {tema ? (escuro ? "Tema claro" : "Tema escuro") : "Tema"}
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuItem disabled={saindo} onClick={() => sair(signOut)}>
          <LogOut strokeWidth={1.5} />
          {saindo ? "Saindo…" : "Sair"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
