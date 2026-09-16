import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Client Supabase para uso em Server Components / Route Handlers,
 * autenticado como o usuário logado (respeita RLS).
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // set() chamado de um Server Component — ignorado, middleware cuida do refresh
          }
        },
      },
    }
  );
}

/**
 * Client Supabase com a chave SECRETA — bypassa RLS.
 * Uso EXCLUSIVO em rotas server-side de confiança: webhook do WhatsApp,
 * cron jobs, jobs de automação. NUNCA importar em código que roda no browser.
 */
export function createSupabaseServiceClient() {
  const { createClient } = require("@supabase/supabase-js");
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!secretKey) {
    throw new Error(
      "SUPABASE_SECRET_KEY não configurada — necessária para operações server-side privilegiadas."
    );
  }
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
