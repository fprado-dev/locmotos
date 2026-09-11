"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { STATUS_LABELS } from "@/app/ui";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { VehicleStatus } from "@/modules/fleet";
import { changeVehicleStatus } from "./actions";

/**
 * A situação do veículo, alterável na própria lista.
 *
 * Escolher já é a confirmação — um botão "salvar" ao lado de cada moto seria
 * um clique a mais para dizer o que o gestor acabou de dizer. O erro vem em
 * toast porque aqui não há formulário onde encostar a mensagem.
 */
export function StatusSelect({
  id,
  status,
}: {
  id: string;
  status: VehicleStatus;
}) {
  const [pendente, iniciar] = useTransition();

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
        {Object.entries(STATUS_LABELS).map(([valor, rotulo]) => (
          <SelectItem key={valor} value={valor}>
            {rotulo}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
