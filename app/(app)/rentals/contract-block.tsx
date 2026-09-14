"use client";

import { useActionState } from "react";
import { Download, FileText } from "lucide-react";
import { toast } from "sonner";
import { formatDay } from "@/app/ui";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { saveContract } from "./contract-actions";

/** O contrato que já está lá: como ver, como baixar, e se dá para espiar. */
export type ContractLink = {
  view: string | null;
  download: string | null;
  image: boolean;
  signedOn: string;
  by: string;
};

/**
 * O contrato assinado da locação.
 *
 * **Sem contrato não é um bloco vazio, é uma frase.** A ausência é a coisa que
 * esta seção existe para mostrar: uma locação de seis meses sem papel assinado
 * é risco, e o gestor só descobria no dia em que precisava dele.
 *
 * Não bloqueia nada. O papel costuma ser assinado depois de a moto sair, e
 * recusar a locação por isso empurraria o gestor para fora do sistema.
 *
 * Anexar de novo **substitui**: dois contratos na mesma locação não teriam
 * qual vale, e contrato reassinado por erro de cláusula precisa de conserto.
 */
export function ContractBlock({
  rentalId,
  startedOn,
  contract,
}: {
  rentalId: string;
  /** A locação não pode ter sido assinada antes de começar. */
  startedOn: string;
  contract: ContractLink | null;
}) {
  const [state, formAction, pending] = useActionState(
    async (previous: Parameters<typeof saveContract>[0], form: FormData) => {
      const next = await saveContract(previous, form);
      if (next.done) toast.success(next.done);
      return next;
    },
    {},
  );

  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-xs font-medium tracking-[0.05em] text-muted-foreground uppercase">
        Contrato
      </h3>

      {contract ? (
        <div className="flex items-start gap-3 rounded-lg border border-border bg-card px-4 py-3">
          <a
            href={contract.view ?? "#"}
            target="_blank"
            rel="noopener noreferrer"
            title="Abrir o contrato"
            className="flex h-[72px] w-[56px] shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-surface-2 transition-colors hover:border-input"
          >
            {contract.image && contract.view ? (
              // Privado e com endereço que vence em minutos: passá-lo pelo
              // otimizador guardaria o contrato de uma locadora num cache que
              // é público para quem souber o caminho.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={contract.view}
                alt="Contrato"
                className="size-full object-cover"
              />
            ) : (
              <FileText aria-hidden className="size-5 text-muted-foreground" />
            )}
          </a>

          <div className="flex min-w-0 flex-1 flex-col gap-0.5 text-[13px]">
            <span className="font-medium">
              Assinado em {formatDay(contract.signedOn)}
            </span>
            <span className="text-xs text-muted-foreground">
              Anexado por {contract.by}
            </span>
          </div>

          {contract.download && (
            <a
              href={contract.download}
              className={cn(
                buttonVariants({ variant: "outline", size: "sm" }),
                "shrink-0 gap-1.5",
              )}
            >
              <Download />
              Baixar
            </a>
          )}
        </div>
      ) : (
        <p className="rounded-lg border border-dashed border-input px-4 py-3 text-[13px] text-muted-foreground">
          <span className="font-medium text-foreground">
            Nenhum contrato anexado.
          </span>{" "}
          A locação vale do mesmo jeito — o papel é a evidência que falta se ela
          virar cobrança judicial ou discussão de cláusula.
        </p>
      )}

      <form action={formAction} className="flex flex-col gap-3">
        <input type="hidden" name="rentalId" value={rentalId} />

        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="signedOn" className="text-xs">
              Assinado em
            </Label>
            <Input
              id="signedOn"
              name="signedOn"
              type="date"
              required
              min={startedOn}
              defaultValue={contract?.signedOn ?? startedOn}
              aria-invalid={state.field === "signedOn"}
              className="w-[160px]"
            />
          </div>

          <div className="flex min-w-[200px] flex-1 flex-col gap-1.5">
            <Label htmlFor="file" className="text-xs">
              {contract ? "Substituir o arquivo" : "Arquivo assinado"}
            </Label>
            <Input
              id="file"
              name="file"
              type="file"
              required
              accept="image/*,application/pdf"
              aria-invalid={state.field === "file"}
            />
          </div>

          <Button type="submit" variant="outline" disabled={pending}>
            {pending ? "Enviando…" : contract ? "Substituir" : "Anexar"}
          </Button>
        </div>

        <p role="alert" className="text-xs text-destructive empty:hidden">
          {state.error}
        </p>
      </form>
    </section>
  );
}
