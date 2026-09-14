import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Volta do link mágico.
 *
 * **`code` é o fluxo PKCE** e se resolve aqui: quem pediu o link guardou um
 * verificador no cookie _deste_ navegador, e só ele fecha a troca. Trocar já é
 * seguro porque sem o cookie o código não serve para mais ninguém.
 *
 * **`token_hash` não se gasta aqui.** Ele vale em qualquer navegador — é essa a
 * graça dele, e é essa a armadilha: pré-visualizador de mensagem e prefetch
 * abrem a URL sozinhos, e o link de uso único morre antes de a pessoa clicar.
 * Então o `GET` só encaminha para `/entrar`, que mostra um botão; quem gasta é
 * o `POST`. Robô nenhum aperta botão.
 *
 * **Link gasto com sessão em pé não é erro**: quem chegou aqui logado já passou
 * por um link que funcionou, e o destino é a frota, não um aviso.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const dentro = NextResponse.redirect(new URL("/fleet", request.url));

  const tokenHash = params.get("token_hash");
  const type = params.get("type");

  if (tokenHash && type) {
    const entrar = new URL("/entrar", request.url);
    entrar.searchParams.set("token_hash", tokenHash);
    entrar.searchParams.set("type", type);
    return NextResponse.redirect(entrar);
  }

  const client = await createClient();
  const code = params.get("code");

  if (code) {
    const { error } = await client.auth.exchangeCodeForSession(code);
    if (!error) return dentro;
  }

  const { data } = await client.auth.getClaims();
  if (data?.claims) return dentro;

  return NextResponse.redirect(new URL("/login?erro=link", request.url));
}
