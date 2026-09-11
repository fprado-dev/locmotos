"use client";

import { useActionState } from "react";
import { buttonClass, fieldClass } from "@/app/ui";
import { attachVehicleFiles, type FormState } from "../actions";

const initialState: FormState = {};

/** Como cada anexo se chama na tela, e o que o input aceita. */
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
        <p role="alert" className="text-red-600">
          {state.error}
        </p>
      )}

      <div className="flex flex-wrap items-end gap-4">
        {FILES.map(({ kind, label, accept }) => (
          <label key={kind} className="flex flex-col gap-1 text-sm">
            <span className="text-zinc-600 dark:text-zinc-400">
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
                    className="underline"
                  >
                    abrir
                  </a>
                </>
              )}
            </span>
            <input
              type="file"
              name={kind}
              accept={accept}
              className={`${fieldClass} text-xs`}
            />
          </label>
        ))}
      </div>

      <button
        type="submit"
        disabled={pending}
        className={`${buttonClass} self-start disabled:opacity-50`}
      >
        {pending ? "Enviando…" : "Enviar arquivos"}
      </button>
    </form>
  );
}
