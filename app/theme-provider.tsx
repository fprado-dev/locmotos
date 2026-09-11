"use client";

import { ThemeProvider as NextThemes } from "next-themes";

/**
 * O tema escolhido pelo gestor, guardado no navegador dele.
 *
 * `enableSystem` desligado de propósito: o padrão é escuro porque a tela é de
 * operação e fica aberta o dia inteiro, não porque o sistema operacional disse.
 * Quem quiser claro clica no botão, e a escolha sobrevive ao recarregamento.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemes
      attribute="class"
      defaultTheme="dark"
      enableSystem={false}
      disableTransitionOnChange
    >
      {children}
    </NextThemes>
  );
}
