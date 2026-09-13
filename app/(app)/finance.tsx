import { formatDay, formatInteger } from "@/app/ui";
import { Badge } from "@/components/ui/badge";
import { delinquency, type Charge } from "@/modules/rentals";

/** "2026-09-19" vira "19/09" — a coluna é estreita e o ano é o corrente. */
function shortDay(date: string): string {
  const [, mês, dia] = date.split("-");
  return `${dia}/${mês}`;
}

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

/**
 * As cobranças vencidas de uma locação, uma por linha, e o total embaixo.
 *
 * Uma linha por ciclo em vez de um número só porque cobrar é conversa: o
 * gestor liga e diz "estão em aberto as semanas de 1º e de 8", não "você me
 * deve seiscentos". O total no rodapé é para quando a conversa chega ao fim.
 *
 * Não renderiza nada quando não há o que cobrar — um bloco vazio dizendo
 * "nenhuma" ocupa a mesma altura e não responde nada.
 */
export function OverdueCharges({
  charges,
  today = new Date(),
}: {
  charges: Charge[];
  today?: Date;
}) {
  if (charges.length === 0) return null;

  const total = charges.reduce((soma, charge) => soma + charge.amount, 0);

  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-xs font-medium tracking-[0.05em] text-muted-foreground uppercase">
        Cobranças em aberto
      </h3>

      <div className="overflow-hidden rounded-lg border border-border">
        {charges.map((charge) => {
          const dias = delinquency(
            { overdueAmount: charge.amount, overdueSince: charge.dueOn },
            today,
          );

          return (
            <div
              key={charge.id}
              className="flex items-center gap-3 border-b border-border px-4 py-2.5 text-[13px] last:border-b-0"
            >
              <span className="shrink-0 tabular-nums">
                {shortDay(charge.cycleStart)} – {shortDay(charge.cycleEnd)}
              </span>
              <span className="truncate text-xs text-muted-foreground">
                venceu {formatDay(charge.dueOn)}
              </span>
              <span className="ml-auto shrink-0 text-xs tabular-nums text-late">
                {dias?.days} d
              </span>
              <span className="w-[74px] shrink-0 text-right tabular-nums">
                R$ {formatInteger(charge.amount)}
              </span>
            </div>
          );
        })}

        <div className="flex items-center gap-3 bg-surface-2 px-4 py-2.5 text-[13px]">
          <span className="text-muted-foreground">Total em aberto</span>
          <span className="ml-auto font-medium tabular-nums">
            R$ {formatInteger(total)}
          </span>
        </div>
      </div>
    </section>
  );
}
