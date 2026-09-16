-- ============================================================
-- Migration 0004: Row Level Security
-- Regra geral: qualquer usuário autenticado E ativo em public.users
-- pode ler/escrever dados comerciais (agência inteira colabora no CRM).
-- Ações administrativas (roles, exclusão de contato) restritas a admin/manager.
-- webhook_events e audit_logs só acessíveis via service role (rotas server-side).
-- ============================================================

alter table public.users enable row level security;
alter table public.contacts enable row level security;
alter table public.contact_custom_fields enable row level security;
alter table public.tags enable row level security;
alter table public.contact_tags enable row level security;
alter table public.commercial_blocklist enable row level security;
alter table public.brands enable row level security;
alter table public.products enable row level security;
alter table public.pipelines enable row level security;
alter table public.pipeline_stages enable row level security;
alter table public.opportunities enable row level security;
alter table public.opportunity_stage_history enable row level security;
alter table public.lead_scores enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.attachments enable row level security;
alter table public.notes enable row level security;
alter table public.activities enable row level security;
alter table public.tasks enable row level security;
alter table public.followup_sequences enable row level security;
alter table public.followup_steps enable row level security;
alter table public.followups enable row level security;
alter table public.templates enable row level security;
alter table public.automation_rules enable row level security;
alter table public.automation_logs enable row level security;
-- webhook_events e audit_logs: RLS ligado, SEM policy para authenticated
-- (só a chave secreta/service role, usada em rotas server-side, tem acesso)
alter table public.webhook_events enable row level security;
alter table public.audit_logs enable row level security;

-- Helper: usuário autenticado está ativo na equipe?
create or replace function public.is_active_staff()
returns boolean as $$
  select exists (
    select 1 from public.users u
    where u.id = auth.uid() and u.active = true
  );
$$ language sql stable security definer;

create or replace function public.is_admin_or_manager()
returns boolean as $$
  select exists (
    select 1 from public.users u
    where u.id = auth.uid() and u.active = true and u.role in ('admin','manager')
  );
$$ language sql stable security definer;

-- users: qualquer staff ativo lê a lista da equipe; só admin/manager edita outros perfis;
-- cada um edita o próprio perfil (campos não sensíveis, ex: avatar).
create policy "staff can read users" on public.users
  for select using (public.is_active_staff());
create policy "self can update own profile" on public.users
  for update using (id = auth.uid());
create policy "admin manages users" on public.users
  for all using (public.is_admin_or_manager());

-- Política padrão reutilizável para as tabelas comerciais: staff ativo lê e escreve.
do $$
declare
  t text;
begin
  foreach t in array array[
    'contacts','contact_custom_fields','tags','contact_tags','commercial_blocklist',
    'brands','products','pipelines','pipeline_stages',
    'opportunities','opportunity_stage_history','lead_scores',
    'conversations','messages','attachments','notes','activities',
    'tasks','followup_sequences','followup_steps','followups','templates',
    'automation_rules','automation_logs'
  ]
  loop
    execute format(
      'create policy "staff select %1$s" on public.%1$s for select using (public.is_active_staff());',
      t
    );
    execute format(
      'create policy "staff insert %1$s" on public.%1$s for insert with check (public.is_active_staff());',
      t
    );
    execute format(
      'create policy "staff update %1$s" on public.%1$s for update using (public.is_active_staff());',
      t
    );
    execute format(
      'create policy "admin delete %1$s" on public.%1$s for delete using (public.is_admin_or_manager());',
      t
    );
  end loop;
end $$;
