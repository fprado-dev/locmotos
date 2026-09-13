"use client";

import { STATUS_LABELS } from "@/app/ui";
import { SelectItem } from "@/components/ui/select";
import { MANAGER_VEHICLE_STATUSES } from "@/modules/fleet";

/**
 * As situações que o gestor escolhe à mão — e o motivo de a quarta não estar
 * entre elas.
 *
 * "Reservada" deixou de ser escolha: ela significa "tem locação ativa" e é
 * derivada na leitura. A nota fica dentro do próprio menu porque é ali que a
 * pergunta nasce — o gestor abre o select procurando a opção que sumiu.
 */
export function StatusOptions() {
  return (
    <>
      {MANAGER_VEHICLE_STATUSES.map((valor) => (
        <SelectItem key={valor} value={valor}>
          {STATUS_LABELS[valor]}
        </SelectItem>
      ))}

      <p className="mt-1 border-t border-border px-2 pt-2 pb-1 text-xs text-muted-foreground">
        Reservada é consequência de locação ativa — abra ou encerre a locação.
      </p>
    </>
  );
}
