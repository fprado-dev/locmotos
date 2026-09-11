import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Volta do link mágico: troca o código por sessão e grava os cookies.
 *
 * O link do e-mail passa pelo Supabase, que redireciona para cá com `code`.
 * Cada código serve uma vez só — link já usado ou expirado cai no login.
 */
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");

  if (code) {
    const client = await createClient();
    const { error } = await client.auth.exchangeCodeForSession(code);

    if (!error) return NextResponse.redirect(new URL("/fleet", request.url));
  }

  return NextResponse.redirect(new URL("/login?erro=link", request.url));
}
