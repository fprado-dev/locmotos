import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Refresh do token de autenticação a cada request, e porta de entrada da app:
 * sem sessão, só as rotas públicas abrem.
 *
 * No Next 16 este arquivo substitui o antigo `middleware.ts`.
 *
 * Usa `getClaims()` e não `getSession()`: a documentação do Supabase é explícita
 * que `getSession()` não garante revalidação do token no servidor.
 */
export default async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const { data } = await supabase.auth.getClaims();

  if (!data?.claims && !isPublic(request.nextUrl.pathname)) {
    const login = request.nextUrl.clone();
    login.pathname = "/login";

    const redirect = NextResponse.redirect(login);
    // Os cookies renovados acima vão junto; sem isso o refresh se perde e a
    // pessoa volta para o login na requisição seguinte.
    response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));

    return redirect;
  }

  return response;
}

/** Rotas que existem justamente para quem ainda não tem sessão. */
function isPublic(pathname: string): boolean {
  return (
    pathname === "/" ||
    // `/entrar` é o botão que gasta o link de acesso: quem chega nele ainda
    // não tem sessão, e é justamente para ganhar uma que está ali.
    ["/login", "/signup", "/auth", "/entrar"].some((route) =>
      pathname.startsWith(route),
    )
  );
}

export const config = {
  matcher: [
    /*
     * Todas as rotas, menos arquivos estáticos e imagens.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
