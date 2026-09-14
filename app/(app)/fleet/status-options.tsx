"use client";

import { STATUS_LABELS } from "@/app/ui";
import { SelectItem } from "@/components/ui/select";
import { MANAGER_VEHICLE_STATUSES } from "@/modules/fleet";

/**
 * As situações que o gestor escolhe à mão — e o motivo de as outras duas não
 * estarem entre elas.
 *
 * "Reservada" significa "tem locação ativa"; "Em manutenção" significa "tem
 * ordem de serviço aberta". As duas são derivadas na leitura, e por isso
 * deixaram de ser escolha. A nota fica dentro do próprio menu porque é ali que
 * a pergunta nasce — o gestor abre o select procurando a opção que sumiu.
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
        Reservada vem da locação e Em manutenção vem da ordem de serviço — as
        duas mudam na ficha da moto.
      </p>
    </>
  );
}
