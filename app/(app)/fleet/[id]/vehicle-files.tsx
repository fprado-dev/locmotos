"use client";

import { useActionState } from "react";
import { Download, FileText } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { attachVehicleFiles, type FormState } from "../actions";

const initialState: FormState = {};

/** Como cada anexo se chama na tela, e o que o campo aceita. */
const FILES = [
  { kind: "photo", label: "Foto", accept: "image/*" },
  { kind: "crlv", label: "CRLV", accept: "image/*,application/pdf" },
  { kind: "crv", label: "CRV", accept: "image/*,application/pdf" },
] as const;

type Kind = (typeof FILES)[number]["kind"];

/** O que já está guardado: como ver, como baixar, e se dá para pré-visualizar. */
export type VehicleFileLink = {
  view: string | null;
  download: string | null;
  image: boolean;
};

/**
 * Envio da foto e dos documentos, e o que já subiu.
 *
 * Um formulário para os três: o gestor normalmente tem um arquivo à mão, e
 * três formulários seriam três telas de envio para a mesma tarefa.
 *
 * O que já existe aparece como miniatura, não como link. "Abrir" obriga a sair
 * da tela para descobrir se a foto é da moto certa — e era isso que o gestor
 * queria saber. Baixar continua sendo um botão à parte, porque é outra coisa.
 */
export function VehicleFiles({
  id,
  links,
}: {
  id: string;
  links: Partial<Record<Kind, VehicleFileLink>>;
}) {
  const [state, formAction, pending] = useActionState(
    attachVehicleFiles,
    initialState,
  );

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <h2 className="font-semibold">Foto e documentos</h2>
      <input type="hidden" name="id" value={id} />

      {state.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}

      <div className="flex flex-wrap items-start gap-4">
        {FILES.map(({ kind, label, accept }) => (
          <div key={kind} className="flex w-[240px] flex-col gap-1.5">
            <Label htmlFor={kind}>{label}</Label>

            <Preview label={label} link={links[kind]} />

            <Input id={kind} type="file" name={kind} accept={accept} />
          </div>
        ))}
      </div>

      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "Enviando…" : "Enviar arquivos"}
      </Button>
    </form>
  );
}

/**
 * O arquivo que já está lá, ou o lugar vazio dele.
 *
 * A miniatura é `<img>` e não `next/image` de propósito: o arquivo é privado e
 * o endereço vence em minutos. Passá-lo pelo otimizador guardaria um documento
 * de locadora no cache de imagens do servidor, que é público para quem tiver o
 * caminho — e otimizar um endereço que expira não se aproveita na próxima vez.
 */
function Preview({
  label,
  link,
}: {
  label: string;
  link: VehicleFileLink | undefined;
}) {
  if (!link?.view) {
    return (
      <div className="flex h-[120px] items-center justify-center rounded-lg border border-dashed border-input text-xs text-subtle">
        Nada enviado
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <a
        href={link.view}
        target="_blank"
        rel="noopener noreferrer"
        title={`Abrir ${label} em tamanho cheio`}
        className="flex h-[120px] items-center justify-center overflow-hidden rounded-lg border border-border bg-surface-2 transition-colors hover:border-input"
      >
        {link.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={link.view} alt={label} className="size-full object-cover" />
        ) : (
          <span className="flex flex-col items-center gap-1.5 text-xs text-muted-foreground">
            <FileText aria-hidden className="size-6" />
            Documento
          </span>
        )}
      </a>

      {link.download && (
        <a
          href={link.download}
          className={cn(
            buttonVariants({ variant: "outline", size: "sm" }),
            "gap-1.5",
          )}
        >
          <Download />
          Baixar
        </a>
      )}
    </div>
  );
}
