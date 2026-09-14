import Link from "next/link";
import { redirect } from "next/navigation";
import { EXPENSE_LABELS, formatMonth, formatMoney } from "@/app/ui";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { brasiliaDay } from "@/lib/calendar";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { vehiclePlates } from "@/modules/fleet";
import {
  currentMonth,
  isMonth,
  monthlyCash,
  monthShift,
  type ExpenseCategory,
} from "@/modules/finance";
import { NewExpense, Statement } from "./statement";

/** Um número grande com rótulo em cima e uma nota embaixo. */
function SummaryCard({
  label,
  value,
  note,
  tone,
}: {
  label: string;
  value: string;
  note: string;
  /** O saldo muda de cor com o sinal; entrou e saiu não. */
  tone?: "ok" | "late";
}) {
  return (
    <Card className="gap-2 rounded-[10px] bg-card px-[18px] py-4 ring-1 ring-border">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span
        className={cn(
          "flex items-baseline gap-2.5 text-[26px] leading-none font-medium tracking-[-0.02em] tabular-nums",
          tone === "ok" && "text-ok",
          tone === "late" && "text-late",
        )}
      >
        <span className="text-[15px] font-normal text-muted-foreground">
          R$
        </span>
        {value}
      </span>
      <span className="text-xs text-muted-foreground">{note}</span>
    </Card>
  );
}

/**
 * O caixa de um mês: o que entrou, o que saiu e para onde foi.
 *
 * O mês vive na URL, como todo recorte deste sistema: dá para recarregar,
 * mandar para o contador e voltar no histórico. Sem `?month=`, é o mês
 * corrente **em Brasília** — o servidor roda em UTC, onde às 21h do dia 30 já
 * é o mês seguinte.
 */
export default async function FinancePage({
  searchParams,
}: PageProps<"/finance">) {
  const params = await searchParams;
  const pedido = Array.isArray(params.month) ? params.month[0] : params.month;
  const hoje = currentMonth();

  // Mês que não existe é URL digitada à mão: em vez de uma tela vazia, o
  // gestor cai no mês corrente.
  if (pedido && !isMonth(pedido)) redirect("/finance");

  const month = pedido ?? hoje;

  const client = await createClient();
  const [caixa, motos] = await Promise.all([
    monthlyCash(client, month),
    // O seletor de moto do diálogo. Todas, e não só as disponíveis: a que
    // ganha despesa costuma ser justamente a que está em manutenção.
    vehiclePlates(client),
  ]);

  const anterior = monthShift(month, -1);
  const seguinte = monthShift(month, 1);
  // Não há caixa do mês que vem: o botão existe, desabilitado, para o gestor
  // ver que chegou ao presente em vez de achar que a navegação quebrou.
  const noPresente = month >= hoje;

  const seta = cn(
    buttonVariants({ variant: "outline", size: "sm" }),
    "w-9 px-0 font-mono",
  );

  return (
    <>
      <header className="flex h-16 shrink-0 items-center justify-between gap-4 px-8">
        <h1 className="flex items-baseline gap-2.5 text-xl font-semibold tracking-[-0.02em]">
          Financeiro
          <span className="text-sm font-normal text-muted-foreground capitalize">
            {formatMonth(month)}
          </span>
        </h1>

        <div className="flex items-center gap-2">
          <Link
            href={`/finance?month=${anterior}`}
            aria-label={`Mês anterior: ${formatMonth(anterior)}`}
            className={seta}
          >
            ‹
          </Link>
          {noPresente ? (
            <span
              aria-disabled
              className={cn(seta, "pointer-events-none opacity-40")}
              title="O mês que vem ainda não aconteceu"
            >
              ›
            </span>
          ) : (
            <Link
              href={`/finance?month=${seguinte}`}
              aria-label={`Mês seguinte: ${formatMonth(seguinte)}`}
              className={seta}
            >
              ›
            </Link>
          )}

          <NewExpense vehicles={motos} today={brasiliaDay()} />
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-8 pb-6">
        <section className="mt-1 grid shrink-0 grid-cols-3 gap-3">
          <SummaryCard
            label="Entrou"
            value={formatMoney(caixa.income)}
            note="Pagamentos recebidos no mês"
          />
          <SummaryCard
            label="Saiu"
            value={formatMoney(caixa.expense)}
            note="Despesas lançadas no mês"
          />
          <SummaryCard
            label="Saldo"
            value={formatMoney(caixa.balance)}
            note={
              caixa.balance < 0
                ? "O mês fechou no vermelho"
                : "Entrou menos saiu"
            }
            tone={caixa.balance < 0 ? "late" : "ok"}
          />
        </section>

        {/* Para onde foi o dinheiro, sem ler linha por linha. Só as categorias
            que tiveram alguma coisa: uma barra em zero não informa nada. */}
        {caixa.byCategory.length > 0 && (
          <section className="flex flex-col gap-3 rounded-[10px] border border-border bg-card p-[18px]">
            <h2 className="text-xs font-medium tracking-[0.05em] text-muted-foreground uppercase">
              Saídas por categoria
            </h2>
            <div className="flex flex-col gap-2.5">
              {caixa.byCategory.map(({ category, amount }) => (
                <div
                  key={category}
                  className="flex items-center gap-3 text-[13px]"
                >
                  <span className="w-[132px] shrink-0">
                    {EXPENSE_LABELS[category as ExpenseCategory]}
                  </span>
                  {/* A barra é largura, e a largura é a fração do total: é o
                      que deixa comparar duas categorias sem dividir de cabeça. */}
                  <span
                    aria-hidden
                    className="h-2 min-w-[2px] rounded-full bg-chip"
                    style={{
                      width: `${Math.round((amount / caixa.expense) * 100)}%`,
                    }}
                  />
                  <span className="ml-auto shrink-0 tabular-nums text-muted-foreground">
                    R$ {formatMoney(amount)}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        <Statement entries={caixa.entries} />
      </div>
    </>
  );
}
