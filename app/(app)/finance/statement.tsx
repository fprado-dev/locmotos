"use client";

import { useActionState, useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { EXPENSE_LABELS, formatDay, formatMoney } from "@/app/ui";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  EXPENSE_CATEGORIES,
  type CashEntry,
  type ExpenseCategory,
} from "@/modules/finance";
import { removeExpense, saveExpense } from "./actions";

/** "2026-09-19" vira "19/09" — a coluna é estreita e o ano está no topo. */
function shortDay(date: string): string {
  const [, mês, dia] = date.split("-");
  return `${dia}/${mês}`;
}

/** Um campo do formulário, com rótulo em cima. */
function Field({
  name,
  label,
  hint,
  invalid,
  ...props
}: React.ComponentProps<typeof Input> & {
  name: string;
  label: string;
  hint?: string;
  invalid?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={name} className="text-xs">
        {label}
      </Label>
      <Input id={name} name={name} aria-invalid={invalid} {...props} />
      {hint && <span className="text-xs text-subtle">{hint}</span>}
    </div>
  );
}

/**
 * O lançamento de uma saída, num diálogo.
 *
 * Não há o lançamento de uma **entrada**: todo dinheiro que entra na v1 entrou
 * quitando uma cobrança, e isso se registra no painel da locação, junto da
 * cobrança que está sendo quitada. Um campo de receita solto aqui criaria uma
 * segunda porta para o mesmo dinheiro.
 */
export function NewExpense({
  vehicles,
  today,
}: {
  vehicles: Array<{ id: string; plate: string; model: string }>;
  /** Hoje em Brasília, resolvido no servidor — o relógio do browser não manda. */
  today: string;
}) {
  const [aberto, setAberto] = useState(false);

  const [state, formAction, pending] = useActionState(
    async (previous: Parameters<typeof saveExpense>[0], form: FormData) => {
      const next = await saveExpense(previous, form);
      if (next.done) {
        toast.success(next.done);
        setAberto(false);
      }
      return next;
    },
    {},
  );

  return (
    <>
      <Button onClick={() => setAberto(true)}>Lançar despesa</Button>

      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="flex max-h-[calc(100svh-3rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-[560px]">
          <form action={formAction} className="flex min-h-0 flex-1 flex-col">
            <DialogHeader className="shrink-0 gap-1.5 border-b border-border px-6 py-5 pr-12">
              <DialogTitle>Lançar despesa</DialogTitle>
              <DialogDescription>
                Dinheiro que saiu do caixa. O que entrou já entra sozinho, pelos
                pagamentos registrados.
              </DialogDescription>
            </DialogHeader>

            <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-6 py-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  name="spentOn"
                  label="Quando saiu"
                  type="date"
                  required
                  defaultValue={today}
                  max={today}
                  hint="O dia do dinheiro, não o da digitação."
                  invalid={state.field === "spentOn"}
                />
                <Field
                  name="amount"
                  label="Valor"
                  type="number"
                  step="0.01"
                  min={0.01}
                  required
                  placeholder="0,00"
                  invalid={state.field === "amount"}
                />
              </div>

              <Field
                name="description"
                label="O que foi"
                required
                placeholder="Ex.: Troca de óleo e filtro"
                invalid={state.field === "description"}
              />

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="category" className="text-xs">
                  Categoria
                </Label>
                <Select name="category" defaultValue="maintenance" required>
                  <SelectTrigger
                    id="category"
                    aria-invalid={state.field === "category"}
                  >
                    <SelectValue placeholder="Escolher…" />
                  </SelectTrigger>
                  <SelectContent>
                    {EXPENSE_CATEGORIES.map((categoria) => (
                      <SelectItem key={categoria} value={categoria}>
                        {EXPENSE_LABELS[categoria]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="vehicleId" className="text-xs">
                  Moto (opcional)
                </Label>
                <Select name="vehicleId">
                  <SelectTrigger id="vehicleId">
                    <SelectValue placeholder="Nenhuma moto específica" />
                  </SelectTrigger>
                  <SelectContent>
                    {vehicles.map((moto) => (
                      <SelectItem key={moto.id} value={moto.id}>
                        <span className="font-mono">{moto.plate}</span>
                        <span className="ml-2 text-muted-foreground">
                          {moto.model}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {/* Aluguel do galpão não é de moto nenhuma, e obrigar a
                    escolher uma faria o custo por moto mentir. */}
                <span className="text-xs text-subtle">
                  Deixe em branco o que é da locadora inteira.
                </span>
              </div>
            </div>

            <DialogFooter className="mx-0 mb-0 shrink-0 flex-col items-center gap-3 px-6 py-4 sm:flex-row sm:justify-between">
              <p
                role="alert"
                className="text-xs text-destructive empty:hidden sm:mr-4"
              >
                {state.error}
              </p>
              <span className="flex flex-col-reverse gap-2 sm:flex-row">
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  onClick={() => setAberto(false)}
                >
                  Cancelar
                </Button>
                <Button type="submit" size="lg" disabled={pending}>
                  Lançar
                </Button>
              </span>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * O extrato do mês: o que entrou e o que saiu, numa lista só.
 *
 * Uma lista e não duas colunas lado a lado. O gestor quer saber o que
 * aconteceu com o caixa em ordem de dia — duas tabelas paralelas obrigariam a
 * ler as duas e somar de cabeça para responder "sobrou ou faltou no dia 12".
 *
 * A direção é sinal e cor, e nunca só cor: `+` e `−` continuam legíveis em
 * escala de cinza e para quem não distingue verde de vermelho.
 */
export function Statement({ entries }: { entries: CashEntry[] }) {
  const [apagando, setApagando] = useState<CashEntry | null>(null);
  const [pendente, iniciar] = useTransition();

  if (entries.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-input px-4 py-10 text-center text-[13px] text-muted-foreground">
        Nenhum movimento neste mês.
      </p>
    );
  }

  return (
    <>
      <div className="overflow-hidden rounded-[10px] border border-border bg-card">
        {entries.map((entry) => {
          const entrada = entry.kind === "payment";
          // A linha de manutenção não mora em `expenses`: ela é o custo da
          // ordem de serviço, lido de lá. Corrigi-la aqui abriria a segunda
          // porta para o mesmo número — então daqui só se vai até ela.
          const daOficina = entry.kind === "maintenance";

          return (
            <div
              key={`${entry.kind}-${entry.id}`}
              className="flex items-center gap-3 border-b border-border px-[18px] py-3 text-[13px] last:border-b-0"
            >
              <span className="w-[52px] shrink-0 tabular-nums text-muted-foreground">
                {shortDay(entry.happenedOn)}
              </span>

              <span className="min-w-0 flex-1">
                <span className="flex items-baseline gap-2">
                  <span className="truncate font-medium">
                    {entrada
                      ? `Semana de ${shortDay(entry.cycleStart!)} – ${shortDay(entry.cycleEnd!)}`
                      : entry.description}
                  </span>
                  {!entrada && (
                    <span className="shrink-0 rounded-md border border-border px-2 py-0.5 text-[11px] text-muted-foreground">
                      {EXPENSE_LABELS[entry.category as ExpenseCategory]}
                    </span>
                  )}
                </span>

                <span className="flex flex-wrap items-baseline gap-x-2.5 text-xs text-muted-foreground">
                  {entry.renterId && entry.renterName && (
                    <Link
                      href={`/renters?open=${entry.renterId}`}
                      className="rounded-sm hover:underline"
                    >
                      {entry.renterName}
                    </Link>
                  )}
                  {entry.vehicleId && entry.plate && (
                    <Link
                      href={`/fleet/${entry.vehicleId}`}
                      className="rounded-sm font-mono hover:underline"
                    >
                      {entry.plate}
                    </Link>
                  )}
                  <span className="text-subtle">{entry.by}</span>
                </span>
              </span>

              <span
                className={cn(
                  "shrink-0 tabular-nums",
                  entrada ? "text-ok" : "text-late",
                )}
              >
                {entrada ? "+" : "−"} R$ {formatMoney(entry.amount)}
              </span>

              {/* Só a despesa avulsa se apaga aqui. Desfazer uma entrada é
                  estornar o pagamento, e isso se faz onde ele foi lançado —
                  registrando o desfazimento em vez de sumir com a linha. */}
              <span className="w-[72px] shrink-0 text-right">
                {daOficina ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="-my-1 text-xs text-muted-foreground"
                    render={<Link href={`/fleet/${entry.vehicleId}`} />}
                  >
                    Na ficha
                  </Button>
                ) : (
                  !entrada && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="-my-1 text-xs text-muted-foreground"
                      onClick={() => setApagando(entry)}
                    >
                      Apagar
                    </Button>
                  )
                )}
              </span>
            </div>
          );
        })}
      </div>

      <AlertDialog
        open={apagando !== null}
        onOpenChange={(aberto) => !aberto && setApagando(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Apagar esta despesa?</AlertDialogTitle>
            <AlertDialogDescription>
              {apagando?.description} — R${" "}
              {apagando && formatMoney(apagando.amount)} em{" "}
              {apagando && formatDay(apagando.happenedOn)}. O caixa do mês muda
              na mesma hora.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              render={
                <Button
                  variant="destructive"
                  disabled={pendente}
                  onClick={() => {
                    const alvo = apagando;
                    if (!alvo) return;

                    iniciar(async () => {
                      const { error } = await removeExpense(alvo.id);

                      if (error) toast.error(error);
                      else toast.success("Despesa apagada.");
                      setApagando(null);
                    });
                  }}
                />
              }
            >
              Apagar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
