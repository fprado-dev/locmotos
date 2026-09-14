"use server";

import { redirect } from "next/navigation";
import type { EmailOtpType } from "@supabase/supabase-js";
import { requiredField } from "@/lib/form";
import { createClient } from "@/lib/supabase/server";

/**
 * Gasta o link e abre a sessão.
 *
 * É Server Action, e não `GET`, de propósito: **quem gasta o link tem que ser
 * uma pessoa**. Pré-visualizador de mensagem e prefetch de navegador abrem URL
 * sozinhos, e um link de uso único morre no primeiro que abrir — o que estava
 * acontecendo em produção, com o token consumido 3 segundos antes do clique de
 * verdade. Robô nenhum aperta botão.
 */
export async function confirmAccess(formData: FormData) {
  const tokenHash = requiredField(formData, "tokenHash", "Link");
  const type = requiredField(formData, "type", "Link") as EmailOtpType;

  const client = await createClient();
  const { error } = await client.auth.verifyOtp({
    type,
    token_hash: tokenHash,
  });

  if (error) {
    console.error("Falha ao confirmar o acesso", error);
    redirect("/login?erro=link");
  }

  redirect("/fleet");
}
