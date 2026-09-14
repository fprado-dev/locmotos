import { expect, it } from "vitest";
import { cn } from "@/lib/utils";
import { SHEET_BASE } from "./sheet";

/**
 * A largura que a gaveta pede tem que ganhar das classes do primitivo.
 *
 * O teto padrão já foi escrito como `data-[side=right]:sm:max-w-sm`, que ganha
 * por especificidade de qualquer `sm:max-w-[560px]` de quem chama — e o
 * `tailwind-merge` não descarta nenhum dos dois, porque as variantes são
 * diferentes. O resultado era silencioso: toda gaveta do app abria com 384px.
 */
it("o teto padrão da gaveta cede para a largura de quem chama", () => {
  const gaveta = cn(SHEET_BASE, "w-[560px] gap-0 sm:max-w-[560px]");

  expect(gaveta).toContain("sm:max-w-[560px]");
  expect(gaveta).not.toMatch(/(^|\s|:)sm:max-w-sm(\s|$)/);
});
