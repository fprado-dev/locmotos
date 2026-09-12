"use client";

import { Plus } from "lucide-react";
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
 * O formulário é o mesmo de sempre; o que muda é onde ele mora. A lista virou
 * a tela de operação e ocupa a altura toda, então o cadastro sai de dentro
 * dela. O painel do desenho — grid de duas colunas, dropzone de CRLV — é a
 * issue #26; aqui ele só ganha um lugar.
 */
export function NewVehicleSheet() {
  return (
    <Sheet>
      <SheetTrigger render={<Button size="lg" className="gap-2 px-4" />}>
        <Plus />
        Cadastrar veículo
      </SheetTrigger>

      <SheetContent className="w-[440px] gap-0 sm:max-w-[440px]">
        <SheetHeader className="h-16 shrink-0 justify-center border-b border-border px-6">
          <SheetTitle>Cadastrar veículo</SheetTitle>
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto p-6">
          <VehicleForm />
        </div>
      </SheetContent>
    </Sheet>
  );
}
