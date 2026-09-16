-- ============================================================
-- KOALA WHATSAPP CRM — Migration 0001: Core schema
-- Convenção: tabelas em snake_case plural, PK "id" uuid default gen_random_uuid()
-- Todas as tabelas com dados de negócio têm created_at / updated_at.
-- ============================================================

create extension if not exists "pgcrypto";

-- Função genérica de updated_at (evita depender da extensão moddatetime)
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- ------------------------------------------------------------
-- USERS & AGENTS
-- ------------------------------------------------------------
-- users: espelha auth.users do Supabase Auth (1:1), guarda perfil/role da agência.
create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  email text not null unique,
  role text not null default 'agent' check (role in ('admin', 'manager', 'agent', 'viewer')),
  avatar_url text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.users is 'Usuários internos da Koala Turismo (atendentes, gestores, admins) — espelha auth.users';

-- ------------------------------------------------------------
-- BRANDS & PRODUCTS
-- ------------------------------------------------------------
create table if not exists public.brands (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique, -- koala_turismo | orlando_com_koala | corrida_na_disney
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid references public.brands(id) on delete set null,
  slug text not null unique, -- passagem_aerea | hotel | cruzeiro | visto_americano | ingresso_disney | etc
  name text not null,
  category text, -- para agrupar produtos em relatórios
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- CONTACTS (o cliente / lead)
-- ------------------------------------------------------------
create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  name text,
  phone text not null, -- E.164, ex: +5522999999999
  whatsapp_id text unique, -- wa_id retornado pela Cloud API
  email text,
  city text,
  state text,
  country text default 'BR',

  lead_source text, -- instagram | whatsapp_direto | indicacao | site | anuncio | outro
  source_campaign text,
  source_instagram_handle text,

  owner_id uuid references public.users(id) on delete set null, -- responsável pelo atendimento
  brand_id uuid references public.brands(id) on delete set null, -- marca relacionada principal

  -- snapshot comercial agregado (derivado de opportunities, mantido por trigger/job)
  last_purchase_at timestamptz,
  lifetime_value_cents bigint not null default 0,
  purchase_count integer not null default 0,

  first_seen_at timestamptz not null default now(),
  last_interaction_at timestamptz,

  opt_in_marketing boolean, -- null = desconhecido/não perguntado
  opt_in_at timestamptz,
  opt_out_at timestamptz, -- pedido explícito de "parar" — bloqueia follow-up automático

  notes text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (phone)
);
create index if not exists idx_contacts_owner on public.contacts(owner_id);
create index if not exists idx_contacts_brand on public.contacts(brand_id);
create index if not exists idx_contacts_last_interaction on public.contacts(last_interaction_at desc);
create index if not exists idx_contacts_phone on public.contacts(phone);

-- campos personalizados futuros sem alterar schema
create table if not exists public.contact_custom_fields (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.contacts(id) on delete cascade,
  field_key text not null,
  field_value text,
  created_at timestamptz not null default now(),
  unique (contact_id, field_key)
);

create table if not exists public.tags (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  color text default '#9ca3af'
);

create table if not exists public.contact_tags (
  contact_id uuid not null references public.contacts(id) on delete cascade,
  tag_id uuid not null references public.tags(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (contact_id, tag_id)
);

-- ------------------------------------------------------------
-- COMMERCIAL BLOCKLIST (proteção de follow-up)
-- ------------------------------------------------------------
create table if not exists public.commercial_blocklist (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.contacts(id) on delete cascade unique,
  reason text not null, -- pediu_para_parar | reclamacao | chargeback | outro
  created_at timestamptz not null default now(),
  created_by uuid references public.users(id)
);

-- ------------------------------------------------------------
-- PIPELINES & STAGES (configurável, não hardcoded)
-- ------------------------------------------------------------
create table if not exists public.pipelines (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  brand_id uuid references public.brands(id) on delete set null,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.pipeline_stages (
  id uuid primary key default gen_random_uuid(),
  pipeline_id uuid not null references public.pipelines(id) on delete cascade,
  name text not null,
  position integer not null, -- ordem de exibição no kanban
  is_won boolean not null default false, -- ex: VENDA FECHADA
  is_lost boolean not null default false, -- ex: PERDIDO / SEM INTERESSE
  color text default '#6b7280',
  created_at timestamptz not null default now(),
  unique (pipeline_id, position)
);
create index if not exists idx_pipeline_stages_pipeline on public.pipeline_stages(pipeline_id);

-- ------------------------------------------------------------
-- OPPORTUNITIES (um contato pode ter várias)
-- ------------------------------------------------------------
create table if not exists public.opportunities (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.contacts(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete set null,
  product_id uuid references public.products(id) on delete set null,

  title text, -- ex: "Disney Jan/2027 — João Silva"
  description text,

  pipeline_id uuid not null references public.pipelines(id) on delete restrict,
  stage_id uuid not null references public.pipeline_stages(id) on delete restrict,

  estimated_value_cents bigint,
  closed_value_cents bigint,
  currency text not null default 'BRL',

  destination text,
  travel_date_estimate date, -- data provável da viagem (pode ser aproximada)
  travel_date_confidence text default 'unknown' check (travel_date_confidence in ('exact','approximate','unknown')),
  expected_close_date date,

  adults_count integer,
  children_count integer,
  children_ages integer[], -- idades das crianças

  owner_id uuid references public.users(id) on delete set null,
  probability integer check (probability between 0 and 100),

  origin text, -- de onde essa oportunidade específica surgiu

  lead_temperature text not null default 'undefined' check (lead_temperature in ('hot','warm','cold','undefined')),
  lead_score integer not null default 0 check (lead_score between 0 and 100),

  loss_reason text,

  created_at timestamptz not null default now(),
  last_activity_at timestamptz not null default now(),
  next_activity_at timestamptz,
  closed_at timestamptz
);
create index if not exists idx_opportunities_contact on public.opportunities(contact_id);
create index if not exists idx_opportunities_stage on public.opportunities(stage_id);
create index if not exists idx_opportunities_owner on public.opportunities(owner_id);
create index if not exists idx_opportunities_next_activity on public.opportunities(next_activity_at);
create index if not exists idx_opportunities_temperature on public.opportunities(lead_temperature);

-- histórico de mudança de etapa (nunca mover arbitrariamente sem registrar)
create table if not exists public.opportunity_stage_history (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  from_stage_id uuid references public.pipeline_stages(id),
  to_stage_id uuid not null references public.pipeline_stages(id),
  changed_by uuid references public.users(id), -- null = automação/sistema
  reason text,
  created_at timestamptz not null default now()
);
create index if not exists idx_opp_stage_history_opp on public.opportunity_stage_history(opportunity_id);

-- ------------------------------------------------------------
-- LEAD SCORES (histórico explicável, não caixa-preta)
-- ------------------------------------------------------------
create table if not exists public.lead_scores (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  score integer not null check (score between 0 and 100),
  breakdown jsonb not null, -- [{factor: "data_definida", points: 15, reason: "..."}, ...]
  computed_at timestamptz not null default now()
);
create index if not exists idx_lead_scores_opportunity on public.lead_scores(opportunity_id);

create trigger set_updated_at_users before update on public.users
  for each row execute procedure public.set_updated_at();
create trigger set_updated_at_contacts before update on public.contacts
  for each row execute procedure public.set_updated_at();
