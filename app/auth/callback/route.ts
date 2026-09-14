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
 * Router.
 *
 * **Link gasto com sessão em pé não é erro.** Cada link serve uma vez só, e
 * clicar de novo — recarregar a aba, voltar no histórico, o scanner do provedor
 * de e-mail ter passado antes — devolvia "esse link não vale mais" para quem já
 * estava logado. Quem já entrou quer a frota, não um aviso sobre o papel que o
 * levou até lá.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const code = params.get("code");
  const tokenHash = params.get("token_hash");
  const type = params.get("type") as EmailOtpType | null;

  const client = await createClient();
  const dentro = NextResponse.redirect(new URL("/fleet", request.url));

  if (code) {
    const { error } = await client.auth.exchangeCodeForSession(code);
    if (!error) return dentro;
  } else if (tokenHash && type) {
    const { error } = await client.auth.verifyOtp({
      type,
      token_hash: tokenHash,
    });
    if (!error) return dentro;
  }

  // O link não valeu. Se a sessão vale, o destino é o mesmo: quem chegou aqui
  // logado já passou por um link que funcionou.
  const { data } = await client.auth.getClaims();
  if (data?.claims) return dentro;

  return NextResponse.redirect(new URL("/login?erro=link", request.url));
}
