import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

/**
 * Volta do link mágico: troca o que veio na URL por sessão e grava os cookies.
 *
 * **Dois formatos, porque são duas origens.**
 *
 * `code` é o fluxo PKCE: quem pediu o link guardou um verificador no cookie
 * _deste_ navegador, e só ele fecha a troca. É o que o e-mail de login usa, e é
 * o mais seguro dos dois — o código roubado no meio do caminho não serve sem o
 * cookie.
 *
 * `token_hash` é o link que nasceu fora deste navegador: gerado pela Admin API,
 * ou aberto no celular depois de pedido no computador. Não depende de cookie
 * nenhum, e é o formato que o Supabase documenta para link de e-mail no App
 * Router. Sem ele, "abra no mesmo navegador em que pediu" deixa de ser um
 * aviso e vira uma regra que o produto não explica.
 *
 * Cada link serve uma vez só — usado ou vencido cai no login.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const code = params.get("code");
  const tokenHash = params.get("token_hash");
  const type = params.get("type") as EmailOtpType | null;

  const client = await createClient();

  if (code) {
    const { error } = await client.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL("/fleet", request.url));
  } else if (tokenHash && type) {
    const { error } = await client.auth.verifyOtp({
      type,
      token_hash: tokenHash,
    });
    if (!error) return NextResponse.redirect(new URL("/fleet", request.url));
  }

  return NextResponse.redirect(new URL("/login?erro=link", request.url));
}
