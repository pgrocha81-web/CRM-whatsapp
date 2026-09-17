import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

type CookieToSet = { name: string; value: string; options: CookieOptions };

/**
 * Middleware de autenticação: refresca a sessão Supabase e redireciona
 * para /login quem tentar acessar o dashboard sem sessão válida.
 * Rotas de webhook e cron ficam FORA deste middleware (matcher abaixo)
 * porque usam sua própria autenticação (assinatura Meta / CRON_SECRET).
 */
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isLoginPage = request.nextUrl.pathname === "/login";

  if (!user && !isLoginPage) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    return NextResponse.redirect(loginUrl);
  }

  if (user && isLoginPage) {
    const dashboardUrl = request.nextUrl.clone();
    dashboardUrl.pathname = "/inbox";
    return NextResponse.redirect(dashboardUrl);
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Aplica a todas as rotas EXCETO:
     * - /api/webhooks/* (autenticação própria via assinatura Meta)
     * - /api/cron/* (autenticação própria via CRON_SECRET)
     * - arquivos estáticos e internals do Next.js
     */
    "/((?!api/webhooks|api/cron|_next/static|_next/image|favicon.ico).*)",
  ],
};
