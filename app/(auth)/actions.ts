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

  if (error) throw error;
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

  if (error) throw error;
  redirect("/login?enviado=1");
}

export async function signOut() {
  const client = await createClient();
  await client.auth.signOut();

  redirect("/login");
}
