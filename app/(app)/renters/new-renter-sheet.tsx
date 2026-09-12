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
import { RenterForm } from "./renter-form";

/**
 * O cadastro de locatário, num painel lateral.
 *
 * Mesma escolha da Frota: a lista é a tela onde o gestor passa o dia, e o
 * cadastro entra por cima e sai quando termina. Aberto e fechado viram estado
 * porque o painel se fecha sozinho ao salvar — deixar aberto um formulário já
 * gravado convida a gravar de novo.
 */
export function NewRenterSheet() {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger render={<Button size="lg" className="gap-2 px-4" />}>
        <Plus />
        Cadastrar locatário
      </SheetTrigger>

      <SheetContent className="w-[560px] gap-0 sm:max-w-[560px]">
        <SheetHeader className="h-16 shrink-0 justify-center border-b border-border px-6">
          <SheetTitle>Cadastrar locatário</SheetTitle>
        </SheetHeader>

        <RenterForm
          onCancel={() => setOpen(false)}
          onSaved={({ id, name }) => {
            setOpen(false);
            toast.success(`${name} entrou na carteira.`);

            /*
             * Na ordem de sempre — nome A–Z — quem acabou de ser cadastrado
             * cai onde o alfabeto mandar, que pode ser três páginas adiante.
             * A tela volta pelos mais recentes e sem filtro nenhum: a pessoa
             * que acabou de entrar é a única coisa que o gestor quer ver
             * agora. `new` diz qual linha realçar, e some no clique seguinte.
             */
            router.push(`/renters?sort=createdAt&direction=desc&new=${id}`);
          }}
        />
      </SheetContent>
    </Sheet>
  );
}
