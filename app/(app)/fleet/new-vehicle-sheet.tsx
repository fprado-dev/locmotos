"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { VehicleForm } from "./vehicle-form";

/**
 * O cadastro de veículo, num painel lateral.
 *
 * O formulário é o mesmo de sempre; o que muda é onde ele mora. A lista é a
 * tela onde o gestor passa o dia, e quem ocupa o espaço dela é a frota — o
 * cadastro entra por cima e sai quando termina.
 *
 * Aberto e fechado viram estado porque o painel se fecha sozinho ao salvar:
 * deixar aberto um formulário já gravado convida a gravar de novo. O aviso vai
 * em toast, que sobrevive ao painel que o causou; erro de validação fica
 * dentro, colado ao campo, porque lá ainda há o que corrigir.
 */
export function NewVehicleSheet() {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger render={<Button size="lg" className="gap-2 px-4" />}>
        <Plus />
        Cadastrar veículo
      </SheetTrigger>

      <SheetContent className="w-[560px] gap-0 sm:max-w-[560px]">
        <SheetHeader className="h-16 shrink-0 justify-center border-b border-border px-6">
          <SheetTitle>Cadastrar veículo</SheetTitle>
        </SheetHeader>

        <VehicleForm
          onCancel={() => setOpen(false)}
          onSaved={({ id, plate }) => {
            setOpen(false);
            toast.success(`${plate} entrou na frota.`);

            /*
             * A moto nova é a que menos tempo passou parada, então na ordem de
             * sempre — mais parada primeiro — ela cai no fim da última página,
             * onde o gestor não a vê e conclui que o cadastro não funcionou.
             *
             * A tela volta ordenada pela mais recente e sem filtro nenhum: a
             * moto que acabou de entrar pode não passar pelo filtro que estava
             * aplicado, e ela é a única coisa que o gestor quer ver agora.
             * `new` diz qual linha realçar, e some no clique seguinte.
             */
            router.push(
              `/fleet?sort=daysWithoutRental&direction=asc&new=${id}`,
            );
          }}
        />
      </SheetContent>
    </Sheet>
  );
}
