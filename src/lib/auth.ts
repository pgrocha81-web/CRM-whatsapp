import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "./supabase/server";

export interface StaffProfile {
  id: string;
  full_name: string;
  email: string;
  role: "admin" | "manager" | "agent" | "viewer";
  active: boolean;
}

/**
 * Garante que quem está vendo a página é alguém da equipe (logado e ativo).
 * Retorna o client Supabase do usuário (respeita RLS) e o perfil.
 */
export async function requireStaff() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase
    .from("users")
    .select("id, full_name, email, role, active")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.active) redirect("/login?erro=sem-acesso");
  return { supabase, user, profile: profile as StaffProfile };
}
