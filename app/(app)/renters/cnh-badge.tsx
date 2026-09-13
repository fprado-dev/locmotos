"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { cnhAlert, daysUntilCnh } from "@/modules/renters";

/**
 * O que a tela precisa dizer sobre a CNH deste locatário.
 *
 * Vencida em vermelho, vencendo em âmbar — e a cor não carrega a informação
 * sozinha: o texto diz qual é qual, e quantos dias.
 *
 * Mora num arquivo próprio porque aparece em três lugares — a lista, o painel
 * e a abertura de locação — e o painel e a abertura se importam um ao outro.
 */
export function CnhBadge({ dueDate }: { dueDate: string | null }) {
  const alert = cnhAlert(dueDate);
  if (!alert || !dueDate) return null;

  const days = daysUntilCnh(dueDate);

  return (
    <Badge
      className={cn(
        "h-auto rounded-md px-[9px] py-1 text-xs",
        alert === "overdue"
          ? "bg-late font-semibold text-white"
          : "bg-soon-bg font-medium text-soon-fg",
      )}
    >
      {alert === "overdue" ? `Vencida há ${-days} d` : `Vence em ${days} d`}
    </Badge>
  );
}
