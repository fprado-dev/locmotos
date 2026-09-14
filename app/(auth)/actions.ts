"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { requiredField } from "@/lib/form";
import { createClient } from "@/lib/supabase/server";

/**
 * Para onde o link do e-mail devolve a pessoa.
 *
 * Sai do Origin da requisição, e não de uma variável de ambiente, para o link
 * funcionar igual em localhost, preview e produção. O Supabase só redireciona
 * para URLs da allow list do projeto (Authentication → URL Configuration).
 */
async function callbackUrl(): Promise<string> {
  const origin = (await headers()).get("origin");
  if (!origin) throw new Error("Requisição sem Origin");

  return `${origin}/auth/callback`;
}

/**
 * Por que o link não saiu, numa palavra que a tela sabe traduzir.
 *
 * O erro do GoTrue não pode subir cru: Server Action que lança vira a tela de
 * "A server error occurred", e quem está tentando entrar fica sem nada para
 * fazer. O motivo real vai para o log do servidor, que é onde ele serve.
 *
 * `otp_disabled` é o Supabase dizendo que não existe conta com esse e-mail e
 * que criar uma aqui não é permitido — no login, é o caso mais comum de todos.
 */
function motivo(error: { code?: string }): string {
  return error.code === "otp_disabled" ? "sem-conta" : "envio";
}

/** Cadastro: cria a conta do gestor e, pelo trigger no banco, a locadora dele. */
export async function signUp(formData: FormData) {
  const tenantName = requiredField(formData, "tenantName", "Nome da locadora");
  const email = requiredField(formData, "email", "E-mail");

  const client = await createClient();
  const { error } = await client.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: await callbackUrl(),
      // Lido pelo trigger `provision_tenant_on_signup`, que cria a Locadora e
      // carimba o `tenant_id` no app_metadata.
      data: { tenant_name: tenantName },
      shouldCreateUser: true,
    },
  });

  if (error) {
    console.error("Falha ao enviar o link de cadastro", error);
    redirect(`/signup?erro=${motivo(error)}`);
  }

  redirect("/signup?enviado=1");
}

/** Login: manda o link mágico para quem já tem conta. */
export async function signIn(formData: FormData) {
  const email = requiredField(formData, "email", "E-mail");

  const client = await createClient();
  const { error } = await client.auth.signInWithOtp({
    email,
    // Sem conta, sem link: cadastro é pela outra tela, que pede a locadora.
    options: { emailRedirectTo: await callbackUrl(), shouldCreateUser: false },
  });

  if (error) {
    console.error("Falha ao enviar o link de acesso", error);
    redirect(`/login?erro=${motivo(error)}`);
  }

  redirect("/login?enviado=1");
}

export async function signOut() {
  const client = await createClient();
  await client.auth.signOut();

  redirect("/login");
}
