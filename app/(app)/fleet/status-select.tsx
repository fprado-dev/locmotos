"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { STATUS_LABELS } from "@/app/ui";
import {
  Select,
  SelectContent,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DERIVED_VEHICLE_STATUSES, type VehicleStatus } from "@/modules/fleet";
import { changeVehicleStatus } from "./actions";
import { StatusOptions } from "./status-options";

/**
 * A situação do veículo, alterável na própria lista.
 *
 * Escolher já é a confirmação — um botão "salvar" ao lado de cada moto seria
 * um clique a mais para dizer o que o gestor acabou de dizer. O erro vem em
 * toast porque aqui não há formulário onde encostar a mensagem.
 *
 * Moto reservada ou em manutenção não muda de situação por aqui: quem a tirou
 * da frota foi um fato — a locação ou a ordem de serviço —, e é fechando esse
 * fato que ela volta.
 */
export function StatusSelect({
  id,
  status,
}: {
  id: string;
  status: VehicleStatus;
}) {
  const [pendente, iniciar] = useTransition();

  // Situação derivada não é um valor que se escolhe, então também não é um
  // select que se abre: no lugar dele, a situação lida com o motivo ao lado.
  // Um select desabilitado esconderia a explicação num `title` que o browser
  // não mostra em campo desabilitado.
  const derivada = DERIVED_VEHICLE_STATUSES.find((valor) => valor === status);

  if (derivada) {
    return (
      <span className="flex h-8 items-center gap-2 rounded-lg border border-border bg-surface-2 px-3 text-[13px] text-muted-foreground">
        <span
          aria-hidden
          className="size-[9px] shrink-0 rounded-full"
          style={{
            boxShadow: `inset 0 0 0 2px var(${derivada === "reserved" ? "--ok" : "--off"})`,
          }}
        />
        {STATUS_LABELS[derivada]}
        <span className="text-subtle">
          {derivada === "reserved"
            ? "· encerre a locação para mudar"
            : "· feche a manutenção para mudar"}
        </span>
      </span>
    );
  }

  return (
    <Select
      value={status}
      disabled={pendente}
      onValueChange={(valor) =>
        iniciar(async () => {
          const { error } = await changeVehicleStatus(
            id,
            valor as VehicleStatus,
          );

          if (error) toast.error(error);
          else
            toast.success(
              `Situação alterada para ${STATUS_LABELS[valor as VehicleStatus]}.`,
            );
        })
      }
    >
      <SelectTrigger size="sm" className="w-[150px]" aria-label="Situação">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <StatusOptions />
      </SelectContent>
    </Select>
  );
}
