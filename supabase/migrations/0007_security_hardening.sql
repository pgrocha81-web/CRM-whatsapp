-- ============================================================
-- Migration 0007: endurecimento de segurança
-- (já aplicado no projeto Supabase em 17/09 como
--  "0006_security_hardening" + "0007_restrict_helper_functions";
--  este arquivo reproduz o mesmo efeito para ambientes novos)
-- ============================================================
alter function public.set_updated_at() set search_path = '';
alter function public.is_active_staff() set search_path = '';
alter function public.is_admin_or_manager() set search_path = '';
revoke execute on function public.is_active_staff() from anon;
revoke execute on function public.is_admin_or_manager() from anon;
