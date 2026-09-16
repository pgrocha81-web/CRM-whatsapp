-- ============================================================
-- Migration 0003: Tarefas, follow-up motor e templates
-- ============================================================

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  assigned_to uuid references public.users(id) on delete set null,
  contact_id uuid references public.contacts(id) on delete cascade,
  opportunity_id uuid references public.opportunities(id) on delete cascade,
  description text not null,
  priority text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  due_date date,
  due_time time,
  status text not null default 'pending' check (status in ('pending','in_progress','done','cancelled')),
  created_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index if not exists idx_tasks_assigned on public.tasks(assigned_to, status, due_date);
create index if not exists idx_tasks_opportunity on public.tasks(opportunity_id);

-- ------------------------------------------------------------
-- FOLLOW-UP SEQUENCES (configurável por produto/marca/origem/temperatura/etapa/valor)
-- ------------------------------------------------------------
create table if not exists public.followup_sequences (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  active boolean not null default true,
  -- condições de aplicabilidade (todas opcionais; null = não filtra por esse campo)
  applies_to_brand_id uuid references public.brands(id),
  applies_to_product_id uuid references public.products(id),
  applies_to_lead_source text,
  applies_to_temperature text check (applies_to_temperature in ('hot','warm','cold','undefined')),
  applies_to_stage_id uuid references public.pipeline_stages(id),
  applies_to_min_value_cents bigint,
  priority integer not null default 0, -- desempate quando mais de uma sequência se aplica
  created_at timestamptz not null default now()
);

create table if not exists public.followup_steps (
  id uuid primary key default gen_random_uuid(),
  sequence_id uuid not null references public.followup_sequences(id) on delete cascade,
  step_order integer not null,
  delay_days integer not null, -- dias após o trigger da sequência (ou após o passo anterior, ver delay_from)
  delay_from text not null default 'sequence_start' check (delay_from in ('sequence_start','previous_step')),
  action_type text not null check (action_type in ('internal_task','whatsapp_template','ai_suggested_message')),
  message_template text, -- corpo/nome do template quando action_type = whatsapp_template
  task_description text, -- quando action_type = internal_task
  is_last_attempt boolean not null default false,
  created_at timestamptz not null default now(),
  unique (sequence_id, step_order)
);

-- follow-ups efetivamente agendados/gerados para uma oportunidade
create table if not exists public.followups (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  sequence_id uuid references public.followup_sequences(id) on delete set null,
  sequence_step_id uuid references public.followup_steps(id) on delete set null,

  -- follow-up inteligente: pode ser criado por regra de calendário OU por interpretação de IA da conversa
  source text not null default 'sequence' check (source in ('sequence','ai_contextual','manual')),
  ai_reasoning text, -- ex: "cliente disse que vai falar com o marido e responde amanhã"

  scheduled_for timestamptz not null,
  status text not null default 'scheduled' check (status in ('scheduled','sent','skipped','cancelled','failed')),
  skip_reason text, -- já_comprou | pediu_parar | atendente_falou_recentemente | outro_followup_ativo | fora_da_janela_24h | precisa_template_aprovado

  assigned_to uuid references public.users(id),
  executed_at timestamptz,

  created_at timestamptz not null default now()
);
create index if not exists idx_followups_scheduled on public.followups(scheduled_for, status);
create index if not exists idx_followups_opportunity on public.followups(opportunity_id);

-- garante no máximo um follow-up ativo (scheduled) por oportunidade — evita duplicidade
create unique index if not exists uniq_active_followup_per_opportunity
  on public.followups(opportunity_id)
  where status = 'scheduled';

-- ------------------------------------------------------------
-- TEMPLATES (message templates aprovados na Meta)
-- ------------------------------------------------------------
create table if not exists public.templates (
  id uuid primary key default gen_random_uuid(),
  meta_template_name text not null unique, -- nome exato aprovado na Meta
  category text not null check (category in ('marketing','utility','authentication')),
  language text not null default 'pt_BR',
  body_preview text,
  approval_status text not null default 'pending' check (approval_status in ('pending','approved','rejected','paused')),
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- AUTOMATION RULES & LOGS
-- ------------------------------------------------------------
create table if not exists public.automation_rules (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  trigger_type text not null, -- keyword_match | first_message | no_reply_timeout | opportunity_created | stage_changed
  trigger_config jsonb not null default '{}'::jsonb,
  action_type text not null, -- auto_reply | collect_info | notify_agent | create_task | create_opportunity
  action_config jsonb not null default '{}'::jsonb,
  active boolean not null default false, -- por padrão OFF; habilitado explicitamente
  requires_human_approval boolean not null default true,
  created_by uuid references public.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.automation_logs (
  id uuid primary key default gen_random_uuid(),
  rule_id uuid references public.automation_rules(id) on delete set null,
  conversation_id uuid references public.conversations(id) on delete set null,
  message_id uuid references public.messages(id) on delete set null,
  action_taken text not null,
  result text not null default 'success' check (result in ('success','skipped','failed')),
  detail jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_automation_logs_conversation on public.automation_logs(conversation_id);

-- ------------------------------------------------------------
-- AUDIT LOG genérico (segurança / LGPD)
-- ------------------------------------------------------------
create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.users(id),
  action text not null, -- login | export_data | delete_contact | anonymize_contact | change_role | ...
  entity_type text,
  entity_id uuid,
  detail jsonb,
  ip_address text,
  created_at timestamptz not null default now()
);
create index if not exists idx_audit_logs_actor on public.audit_logs(actor_id, created_at desc);
