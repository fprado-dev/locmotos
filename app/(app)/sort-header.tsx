import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { TableHead } from "@/components/ui/table";
import { cn } from "@/lib/utils";

export type SortDirection = "asc" | "desc";

/**
 * O cabeçalho de uma coluna, que também é o botão de ordenar por ela.
 *
 * A ordem vive na URL como os filtros: cada cabeçalho é um link, e a tela
 * ordenada pode ser recarregada, compartilhada e desfeita pelo botão voltar.
 *
 * `first` é a ordem do primeiro clique, e muda por coluna porque a pergunta
 * muda: a moto mais parada e a mais cara querem a maior primeiro; um nome
 * quer A–Z, e uma CNH quer a que venceu há mais tempo.
 */
export function SortHeader({
  column,
  label,
  sort,
  direction,
  first = "desc",
  href,
  className,
  align = "left",
}: {
  column: string;
  label: string;
  /** A coluna ordenada agora, já com o padrão da tela resolvido. */
  sort: string;
  direction: SortDirection;
  first?: SortDirection;
  href: (sort: string, direction: SortDirection) => string;
  className?: string;
  align?: "left" | "right";
}) {
  const active = sort === column;
  // Clicar de novo na mesma coluna inverte; coluna nova começa no `first`.
  const next = active && direction === first ? flip(first) : first;

  const Arrow = direction === "asc" ? ArrowUp : ArrowDown;
  const arrow = (
    <span className="inline-flex w-2.5 shrink-0">
      {active && <Arrow className="size-2.5" />}
    </span>
  );

  return (
    <TableHead
      aria-sort={
        active ? (direction === "asc" ? "ascending" : "descending") : "none"
      }
      className={cn(
        "sticky top-0 z-10 h-10 border-b border-border bg-surface-2 p-0",
        className,
      )}
    >
      {/* Base UI não deixa um Button virar link, e ordenar é navegar: a
          ordem vive na URL, então o cabeçalho é um `<a>` de verdade, com as
          classes do botão por cima. */}
      <Link
        href={href(column, next)}
        className={cn(
          buttonVariants({ variant: "ghost" }),
          "h-10 w-full gap-1 rounded-none px-3 text-xs font-medium hover:bg-transparent hover:text-foreground",
          align === "right" ? "justify-end" : "justify-start",
          active ? "text-foreground" : "text-muted-foreground",
        )}
      >
        {align === "right" && arrow}
        {label}
        {align === "left" && arrow}
      </Link>
    </TableHead>
  );
}

function flip(direction: SortDirection): SortDirection {
  return direction === "asc" ? "desc" : "asc";
}

/**
 * Um passo de página, para frente ou para trás.
 *
 * Com página para onde ir é link de verdade, e não um Button fingindo de link:
 * o gestor abre a página seguinte em outra aba se quiser. Sem para onde ir
 * volta a ser botão, porque só um botão pode estar desabilitado.
 */
export function PageStep({
  href: to,
  label,
  children,
}: {
  href: string | undefined;
  label: string;
  children: React.ReactNode;
}) {
  if (!to) {
    return (
      <Button variant="outline" size="icon-sm" aria-label={label} disabled>
        {children}
      </Button>
    );
  }

  return (
    <Link
      href={to}
      aria-label={label}
      className={buttonVariants({ variant: "outline", size: "icon-sm" })}
    >
      {children}
    </Link>
  );
}

/** O rodapé de uma lista paginada: onde ela está, e como andar. */
export function Pagination({
  page,
  pages,
  hasMore,
  href,
  children,
}: {
  page: number;
  pages: number;
  hasMore: boolean;
  href: (page: number) => string;
  /** O "1–20 de N" à esquerda, que cada lista escreve com o nome do que conta. */
  children: React.ReactNode;
}) {
  return (
    <footer className="flex h-12 shrink-0 items-center justify-between border-t border-border bg-surface-2 px-[18px] text-[12.5px] text-muted-foreground">
      <span>{children}</span>

      <span className="flex items-center gap-1.5">
        <PageStep
          href={page === 1 ? undefined : href(page - 1)}
          label="Página anterior"
        >
          <ChevronLeft />
        </PageStep>
        <span>
          Página {page} de {pages}
        </span>
        <PageStep
          href={hasMore ? href(page + 1) : undefined}
          label="Próxima página"
        >
          <ChevronRight />
        </PageStep>
      </span>
    </footer>
  );
}
