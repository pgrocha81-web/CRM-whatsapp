-- ============================================================
-- Migration 0006: acesso da equipe + link do orçamento
-- ============================================================

-- ------------------------------------------------------------
-- Lista de e-mails autorizados. Só quem está aqui vira "staff ativo"
-- ao ser criado no Supabase Auth. Assim, mesmo que alguém consiga criar
-- uma conta, ela não enxerga nenhum dado (RLS exige users.active = true).
-- ------------------------------------------------------------
create table if not exists public.staff_allowlist (
  email text primary key,
  full_name text not null,
  role text not null default 'agent' check (role in ('admin','manager','agent','viewer'))
);
alter table public.staff_allowlist enable row level security;
-- sem policy: só a chave secreta / SQL do painel mexe nesta tabela

insert into public.staff_allowlist (email, full_name, role) values
  ('piero@koalaturismo.com.br', 'Piero Rocha', 'admin')
on conflict (email) do nothing;

-- Quando um usuário é criado no Auth, cria o perfil em public.users.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  allowed public.staff_allowlist%rowtype;
begin
  select * into allowed from public.staff_allowlist where lower(email) = lower(new.email);
  insert into public.users (id, full_name, email, role, active)
  values (
    new.id,
    coalesce(allowed.full_name, split_part(new.email, '@', 1)),
    new.email,
    coalesce(allowed.role, 'viewer'),
    allowed.email is not null
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_auth_user();

-- ------------------------------------------------------------
-- Oportunidade: link do orçamento (Infotravel / Hoteldo / outro)
-- e quando foi enviado — usado no card "Orçamento enviado".
-- ------------------------------------------------------------
alter table public.opportunities
  add column if not exists quote_url text,
  add column if not exists quote_sent_at timestamptz;

-- funções helper não devem ser executáveis por anon
revoke execute on function public.handle_new_auth_user() from public, anon, authenticated;

-- templates de aviso (também em seed.sql para ambientes novos)
insert into public.templates (meta_template_name, category, language, body_preview) values
  ('koala_viagem_1_semana', 'utility', 'pt_BR', 'Oi, {{1}}! 🐨✈️ Falta só 1 semana pra sua viagem para {{2}}! Embarque em {{3}}. ...'),
  ('koala_passaporte_vencendo', 'utility', 'pt_BR', 'Oi, {{1}}! 🐨 O passaporte de {{2}} vence em {{3}}. ...'),
  ('koala_visto_vencendo', 'marketing', 'pt_BR', 'Oi, {{1}}! 🐨 O visto americano de {{2}} vence em {{3}}. ... [Quero renovar]')
on conflict (meta_template_name) do nothing;
