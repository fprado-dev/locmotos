import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * A casca de uma tela de lista, enquanto o servidor ainda responde.
 *
 * As telas daqui são dinâmicas — leem o cookie de sessão —, e rota dinâmica
 * sem `loading` faz o Next segurar a navegação até a resposta chegar: o clique
 * não muda nada por meio segundo e parece que a tela recarregou. Com esta
 * casca a troca é imediata, e o que chega depois é só o conteúdo.
 *
 * É desenho de espera, não de dado: as medidas repetem as da tela real
 * (cabeçalho de 64px, cards, barra de 98px, linhas de 44px) para o conteúdo
 * entrar no lugar onde a mancha já estava.
 */
export function ListSkeleton({
  cards,
  columns,
  rows = 9,
}: {
  /** Quantos cards de resumo esta tela tem. */
  cards: number;
  /** A largura relativa de cada coluna da tabela, em frações. */
  columns: number[];
  rows?: number;
}) {
  return (
    <>
      <header className="flex h-16 shrink-0 items-center justify-between gap-4 px-8">
        <Skeleton className="h-6 w-[220px]" />
        <Skeleton className="h-9 w-[150px]" />
      </header>

      <div className="flex min-h-0 flex-1 flex-col px-8 pb-6">
        <section
          className="mt-1 mb-4 grid shrink-0 gap-3"
          style={{ gridTemplateColumns: `repeat(${cards}, minmax(0, 1fr))` }}
        >
          {Array.from({ length: cards }, (_, i) => (
            <Card
              key={i}
              className="gap-2 rounded-[10px] bg-card px-[18px] py-4 ring-1 ring-border"
            >
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-[26px] w-16" />
              <Skeleton className="h-3 w-28" />
            </Card>
          ))}
        </section>

        <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[10px] border border-border bg-card">
          <div className="flex h-[98px] shrink-0 items-center gap-2 border-b border-border px-4">
            <Skeleton className="h-9 w-[280px]" />
            <Skeleton className="h-9 w-[132px]" />
          </div>

          <div className="flex flex-col">
            {Array.from({ length: rows }, (_, linha) => (
              <div
                key={linha}
                className="flex h-11 shrink-0 items-center gap-3 border-b border-border px-[18px]"
              >
                {columns.map((fração, coluna) => (
                  <Skeleton
                    key={coluna}
                    className="h-3"
                    style={{ flex: fração }}
                  />
                ))}
              </div>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
