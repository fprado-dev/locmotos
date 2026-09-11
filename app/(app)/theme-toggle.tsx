"use client";

import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Alterna claro e escuro.
 *
 * O rótulo diz para onde o clique leva, não onde se está. Ele só aparece
 * depois de montar: escrever "Tema claro" para quem já está no claro seria
 * pior que esperar um quadro.
 */
export function ThemeToggle() {
  // `resolvedTheme` só existe depois de montar: no servidor não há como saber
  // qual tema o navegador guardou.
  const { resolvedTheme, setTheme } = useTheme();
  const escuro = resolvedTheme === "dark";

  return (
    <Button
      variant="ghost"
      className="h-[34px] w-full justify-start gap-2.5 px-3 font-normal text-muted-foreground hover:text-foreground"
      onClick={() => setTheme(escuro ? "light" : "dark")}
    >
      {/* Anel no escuro, círculo cheio no claro: a forma diz qual é qual sem
          depender de cor. */}
      <span
        aria-hidden
        className={cn(
          "size-[13px] rounded-full border",
          escuro ? "border-current" : "border-current bg-current",
        )}
      />
      {resolvedTheme ? (escuro ? "Tema claro" : "Tema escuro") : "Tema"}
    </Button>
  );
}
