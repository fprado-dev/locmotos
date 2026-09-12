"use client";

import { useSyncExternalStore } from "react";
import { useTheme } from "next-themes";

// Um "store" que nunca muda: `false` no servidor e durante a hidratação,
// `true` depois. É assim que se pergunta "já hidratou?" sem escrever estado
// dentro de um efeito.
const NEVER_CHANGES = () => () => {};
const HYDRATED = () => true;
const NOT_YET = () => false;

/**
 * O tema em vigor, `undefined` enquanto ninguém sabe qual é.
 *
 * O servidor não tem como saber qual tema o navegador guardou, e o primeiro
 * quadro do cliente precisa desenhar exatamente o HTML que veio pronto — senão
 * o React declara que a árvore não bate e remonta tudo do zero. `next-themes`
 * lê o `localStorage` já na inicialização do estado, o que faz o cliente
 * começar diferente do servidor: daí a espera pela hidratação.
 *
 * Quem desenha algo que depende do tema decide o que fazer com o `undefined`:
 * um rótulo neutro, ou o escuro que o script anti-flash já aplicou.
 */
export function useResolvedTheme(): "dark" | "light" | undefined {
  const { resolvedTheme } = useTheme();
  const hydrated = useSyncExternalStore(NEVER_CHANGES, HYDRATED, NOT_YET);

  if (!hydrated) return undefined;
  return resolvedTheme === "light" ? "light" : "dark";
}
