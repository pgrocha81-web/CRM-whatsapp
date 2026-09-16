import { createBrowserClient } from "@supabase/ssr";

/**
 * Client Supabase para uso em Client Components (browser).
 * Usa a chave PUBLISHABLE — nunca a secreta.
 */
export function createSupabaseBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  );
}
