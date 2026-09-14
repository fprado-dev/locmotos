"use client";

import * as React from "react";
import { Dialog as SheetPrimitive } from "@base-ui/react/dialog";
import { cn } from "cn";

import { Button } from "@/components/ui/button";
import { XIcon } from "lucide-react";

/**
 * A raiz da gaveta.
 *
 * O `open` passa por um quadro fechado antes de virar verdade, de propósito.
 * O Base UI não anima o que já nasce aberto — é decisão dele, para um popup
 * com `defaultOpen` não entrar animado no carregamento da página —, e não há
 * prop para desligar isso. Só que as nossas gavetas de detalhe nascem abertas:
 * quem as abre é a URL (`?open=<id>`), então o componente monta com `open`
 * já verdadeiro e aparecia de uma vez, sem deslizar.
 *
 * Nascendo fechada, a abertura vira uma mudança de estado como qualquer
 * outra, e o `data-starting-style` volta a existir. Gaveta aberta por botão
 * não muda: ela já nascia fechada.
 */
function Sheet({ open, ...props }: SheetPrimitive.Root.Props) {
  const [montada, setMontada] = React.useState(false);
  React.useEffect(() => {
    // Um quadro pintado com a gaveta fechada é justamente o que faltava: sem
    // ele o navegador vê os dois estados no mesmo quadro e não transiciona.
    const quadro = requestAnimationFrame(() => setMontada(true));
    return () => cancelAnimationFrame(quadro);
  }, []);

  // `undefined && x` continua `undefined`: gaveta sem `open` segue não
  // controlada, na mão do gatilho.
  return (
    <SheetPrimitive.Root data-slot="sheet" open={open && montada} {...props} />
  );
}

function SheetTrigger({ ...props }: SheetPrimitive.Trigger.Props) {
  return <SheetPrimitive.Trigger data-slot="sheet-trigger" {...props} />;
}

function SheetClose({ ...props }: SheetPrimitive.Close.Props) {
  return <SheetPrimitive.Close data-slot="sheet-close" {...props} />;
}

function SheetPortal({ ...props }: SheetPrimitive.Portal.Props) {
  return <SheetPrimitive.Portal data-slot="sheet-portal" {...props} />;
}

function SheetOverlay({ className, ...props }: SheetPrimitive.Backdrop.Props) {
  return (
    <SheetPrimitive.Backdrop
      data-slot="sheet-overlay"
      className={cn(
        "fixed inset-0 z-50 bg-black/10 transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0 supports-backdrop-filter:backdrop-blur-xs",
        className,
      )}
      {...props}
    />
  );
}

/**
 * As classes que toda gaveta carrega.
 *
 * Fora do componente para o teste alcançá-las sem renderizar nada.
 */
const SHEET_BASE =
  "fixed z-50 flex flex-col gap-4 bg-popover bg-clip-padding text-sm text-popover-foreground shadow-lg transition duration-300 ease-out data-ending-style:opacity-0 data-starting-style:opacity-0 data-[side=bottom]:inset-x-0 data-[side=bottom]:bottom-0 data-[side=bottom]:h-auto data-[side=bottom]:border-t data-[side=bottom]:data-ending-style:translate-y-[2.5rem] data-[side=bottom]:data-starting-style:translate-y-[2.5rem] data-[side=left]:inset-y-0 data-[side=left]:left-0 data-[side=left]:h-full data-[side=left]:w-3/4 data-[side=left]:border-r data-[side=left]:data-ending-style:-translate-x-full data-[side=left]:data-starting-style:-translate-x-full data-[side=right]:inset-y-0 data-[side=right]:right-0 data-[side=right]:h-full data-[side=right]:w-3/4 data-[side=right]:border-l data-[side=right]:data-ending-style:translate-x-full data-[side=right]:data-starting-style:translate-x-full data-[side=top]:inset-x-0 data-[side=top]:top-0 data-[side=top]:h-auto data-[side=top]:border-b data-[side=top]:data-ending-style:translate-y-[-2.5rem] data-[side=top]:data-starting-style:translate-y-[-2.5rem] sm:max-w-sm data-[side=bottom]:sm:max-w-none data-[side=top]:sm:max-w-none";

/*
 * O teto padrão é `sm:max-w-sm` **sem** variante de lado, de propósito.
 *
 * Escrito como `data-[side=right]:sm:max-w-sm`, ele ganhava por especificidade
 * de qualquer `sm:max-w-[520px]` de quem chama — e o `tailwind-merge` não
 * consegue casar as duas, porque as variantes são diferentes. O resultado era
 * silencioso e do tipo pior: toda gaveta do app abria com 384px em vez da
 * largura que o código pedia. Agora o teto está na mesma forma que quem chama
 * escreve, então o merge o descarta; top e bottom, que não querem teto nenhum,
 * o derrubam pela variante.
 */
function SheetContent({
  className,
  children,
  side = "right",
  showCloseButton = true,
  ...props
}: SheetPrimitive.Popup.Props & {
  side?: "top" | "right" | "bottom" | "left";
  showCloseButton?: boolean;
}) {
  return (
    <SheetPortal>
      <SheetOverlay />
      <SheetPrimitive.Popup
        data-slot="sheet-content"
        data-side={side}
        className={cn(SHEET_BASE, className)}
        {...props}
      >
        {children}
        {showCloseButton && (
          <SheetPrimitive.Close
            data-slot="sheet-close"
            render={
              <Button
                variant="ghost"
                className="absolute top-3 right-3"
                size="icon-sm"
              />
            }
          >
            <XIcon />
            <span className="sr-only">Close</span>
          </SheetPrimitive.Close>
        )}
      </SheetPrimitive.Popup>
    </SheetPortal>
  );
}

function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-header"
      className={cn("flex flex-col gap-0.5 p-4", className)}
      {...props}
    />
  );
}

function SheetFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-footer"
      className={cn("mt-auto flex flex-col gap-2 p-4", className)}
      {...props}
    />
  );
}

function SheetTitle({ className, ...props }: SheetPrimitive.Title.Props) {
  return (
    <SheetPrimitive.Title
      data-slot="sheet-title"
      className={cn(
        "font-heading text-base font-medium text-foreground",
        className,
      )}
      {...props}
    />
  );
}

function SheetDescription({
  className,
  ...props
}: SheetPrimitive.Description.Props) {
  return (
    <SheetPrimitive.Description
      data-slot="sheet-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}

export {
  SHEET_BASE,
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
};
