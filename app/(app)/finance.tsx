import { formatInteger } from "@/app/ui";
import { Badge } from "@/components/ui/badge";
import { delinquency } from "@/modules/rentals";

/**
 * O que a linha da lista diz sobre o dinheiro desta locação.
 *
 * Três respostas, e nenhuma delas é uma cor sozinha: sem locação não há o que
 * cobrar e a célula fica vazia; em dia é um ponto verde com a palavra ao lado;
 * atrasado é um selo vermelho que diz **há quantos dias** — o número é a
 * informação, porque um dia de atraso e trinta pedem coisas diferentes do
 * gestor.
 *
 * Serve às duas listas, Locações e Locatários, pelo mesmo motivo que o
 * `CnhBadge` serve a três telas: o mesmo fato dito de dois jeitos vira dois
 * fatos na cabeça de quem lê.
 */
export function FinanceCell({
  rental,
}: {
  rental: { overdueAmount: number; overdueSince: string | null } | null;
}) {
  if (!rental) return <span className="text-subtle">—</span>;

  const atraso = delinquency(rental);

  if (!atraso) {
    return (
      <span className="flex items-center gap-2 text-muted-foreground">
        <span
          aria-hidden
          className="size-2.5 shrink-0 rounded-full"
          style={{ background: "var(--ok)" }}
        />
        Em dia
      </span>
    );
  }

  return (
    <Badge
      title={`R$ ${formatInteger(atraso.amount)} em aberto`}
      className="h-auto rounded-md bg-late px-[9px] py-1 text-xs font-semibold text-white"
    >
      Atrasado {atraso.days} d
    </Badge>
  );
}
