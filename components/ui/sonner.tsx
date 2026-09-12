"use client";

import { Toaster as Sonner, type ToasterProps } from "sonner";
import { useResolvedTheme } from "@/lib/theme";
import {
  CircleCheckIcon,
  InfoIcon,
  TriangleAlertIcon,
  OctagonXIcon,
  Loader2Icon,
} from "lucide-react";

const Toaster = ({ ...props }: ToasterProps) => {
  // Escuro até montar, que é o que o script anti-flash já aplicou: o
  // `data-sonner-theme` vai no HTML servido e tem que bater no primeiro quadro.
  const theme = useResolvedTheme() ?? "dark";

  return (
    <Sonner
      theme={theme}
      // No topo do centro porque o aviso costuma ser resposta a algo que
      // acabou de fechar — um painel, um modal —, e o canto inferior direito
      // fica fora de onde o olho estava.
      position="top-center"
      // Sucesso em verde e erro em vermelho: a cor diz o que houve antes de a
      // frase ser lida. As cores saem dos tokens do produto, não das do
      // sonner, senão o verde dele brigaria com o verde de "disponível".
      richColors
      className="toaster group"
      icons={{
        success: <CircleCheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      // O toast cai em cima do card da tabela, e `--popover` é a mesma cor que
      // `--card` nos dois temas: um aviso da cor exata do que está atrás dele
      // não se lê. Sobe um degrau de superfície, a borda vem do tom de input,
      // que é visível, e a sombra faz o resto.
      style={
        {
          "--normal-bg": "var(--surface-2)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--input)",
          "--border-radius": "var(--radius)",
          "--success-bg":
            "color-mix(in oklch, var(--ok) 16%, var(--surface-2))",
          "--success-text": "var(--ok)",
          "--success-border": "color-mix(in oklch, var(--ok) 45%, transparent)",
          "--error-bg":
            "color-mix(in oklch, var(--destructive) 16%, var(--surface-2))",
          "--error-text": "var(--destructive)",
          "--error-border":
            "color-mix(in oklch, var(--destructive) 45%, transparent)",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "shadow-xl",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
