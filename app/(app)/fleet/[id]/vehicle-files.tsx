"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { attachVehicleFiles, type FormState } from "../actions";

const initialState: FormState = {};

/** Como cada anexo se chama na tela, e o que o campo aceita. */
const FILES = [
  { kind: "photo", label: "Foto", accept: "image/*" },
  { kind: "crlv", label: "CRLV", accept: "image/*,application/pdf" },
  { kind: "crv", label: "CRV", accept: "image/*,application/pdf" },
] as const;

/**
 * Envio da foto e dos documentos.
 *
 * Um formulário para os três: o gestor normalmente tem um arquivo à mão, e
 * três formulários seriam três telas de envio para a mesma tarefa.
 */
export function VehicleFiles({
  id,
  links,
}: {
  id: string;
  links: Partial<Record<(typeof FILES)[number]["kind"], string>>;
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

      <div className="flex flex-wrap items-end gap-4">
        {FILES.map(({ kind, label, accept }) => (
          <div key={kind} className="flex flex-col gap-1.5">
            <Label htmlFor={kind}>
              {label}
              {links[kind] && (
                <>
                  {" — "}
                  {/*
                    A URL é assinada e vence em um minuto: por isso ela abre
                    numa aba nova em vez de virar link para guardar.
                  */}
                  <a
                    href={links[kind]}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-brand-text underline underline-offset-4"
                  >
                    abrir
                  </a>
                </>
              )}
            </Label>
            <Input
              id={kind}
              type="file"
              name={kind}
              accept={accept}
              className="w-[240px]"
            />
          </div>
        ))}
      </div>

      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "Enviando…" : "Enviar arquivos"}
      </Button>
    </form>
  );
}
