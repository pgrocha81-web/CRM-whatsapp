-- ============================================================
-- Migration 0005: Bot de qualificação (funil), viajantes com
-- vencimento de documentos, avisos automáticos e integrações
-- (Google Calendar / Trello) na venda fechada.
-- ============================================================

-- ------------------------------------------------------------
-- OPPORTUNITIES — campos coletados pelo bot
-- ------------------------------------------------------------
alter table public.opportunities
  add column if not exists origin_city text,                 -- cidade de saída
  add column if not exists destination_code text check (destination_code in ('orlando','eua','cruzeiro','europa','outro')),
  add column if not exists travelers_count integer check (travelers_count between 1 and 60),
  add column if not exists traveler_ages integer[],          -- idade de cada viajante
  add column if not exists travel_return_date date,          -- data de volta (travel_date_estimate = ida)
  add column if not exists travel_month_text text,           -- "julho, uns 10 dias" quando só sabe o mês
  add column if not exists us_visa_status text check (us_visa_status in ('all','some','none')),
  add column if not exists budget_range text,                -- ate_15k | 15_30k | 30_50k | acima_50k | nao_sei
  add column if not exists payment_preference text,          -- pix | cartao | entrada_parcelas | ver_opcoes
  add column if not exists rundisney_race text,              -- prova runDisney informada
  add column if not exists tags text[] not null default '{}', -- ex: {visto}
  -- integrações disparadas quando a oportunidade vai para etapa is_won
  add column if not exists google_calendar_event_id text,
  add column if not exists trello_card_id text,
  add column if not exists won_sync_error text;

create index if not exists idx_opportunities_travel_date on public.opportunities(travel_date_estimate);
create index if not exists idx_opportunities_tags on public.opportunities using gin(tags);

-- ------------------------------------------------------------
-- BOT SESSIONS — estado do roteiro de perguntas por conversa
-- ------------------------------------------------------------
create table if not exists public.bot_sessions (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  opportunity_id uuid references public.opportunities(id) on delete set null,
  flow text not null check (flow in ('qualificacao','documentos')),
  step text not null,
  answers jsonb not null default '{}'::jsonb,
  status text not null default 'active' check (status in ('active','completed','handed_off','abandoned')),
  last_prompt_at timestamptz not null default now(),   -- quando o bot fez a última pergunta
  reminder_sent_at timestamptz,                         -- lembrete de "parou no meio" (1x por sessão)
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  updated_at timestamptz not null default now()
);
-- no máximo uma sessão ativa por conversa
create unique index if not exists uniq_active_bot_session_per_conversation
  on public.bot_sessions(conversation_id) where status = 'active';
create index if not exists idx_bot_sessions_reminder
  on public.bot_sessions(status, last_prompt_at) where status = 'active';

create trigger set_updated_at_bot_sessions before update on public.bot_sessions
  for each row execute procedure public.set_updated_at();

-- ------------------------------------------------------------
-- TRAVELERS — cada pessoa que viaja (uma família de 4 = 4 linhas)
-- Guardamos SOMENTE datas de vencimento, nunca número nem foto de documento (LGPD).
-- ------------------------------------------------------------
create table if not exists public.travelers (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.contacts(id) on delete cascade, -- cliente responsável
  full_name text not null,
  birth_date date,
  passport_expires_on date,        -- null = não informado / não tem
  has_passport boolean,            -- false = informou que não tem
  us_visa_expires_on date,
  has_us_visa boolean,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_travelers_contact on public.travelers(contact_id);
create index if not exists idx_travelers_passport on public.travelers(passport_expires_on);
create index if not exists idx_travelers_visa on public.travelers(us_visa_expires_on);

create trigger set_updated_at_travelers before update on public.travelers
  for each row execute procedure public.set_updated_at();

-- quais viajantes vão em qual viagem (um viajante pode ir em várias)
create table if not exists public.opportunity_travelers (
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  traveler_id uuid not null references public.travelers(id) on delete cascade,
  primary key (opportunity_id, traveler_id)
);

-- ------------------------------------------------------------
-- NOTIFICATION LOG — garante que cada aviso sai UMA vez só
-- ------------------------------------------------------------
create table if not exists public.notification_log (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in (
    'trip_7_days',          -- viagem daqui a 1 semana (cliente)
    'passport_expiring',    -- passaporte vence em até 6 meses (cliente + equipe)
    'us_visa_expiring',     -- visto americano vence em até 6 meses (cliente + equipe)
    'document_conflict',    -- documento vence antes/durante a viagem (equipe)
    'bot_abandoned_reminder'
  )),
  entity_id uuid not null,        -- opportunity_id, traveler_id ou bot_session_id
  reference_date date not null,   -- data que motivou o aviso (ida, vencimento...) — muda a data, novo aviso
  channel text not null default 'whatsapp' check (channel in ('whatsapp','internal_task')),
  result text not null default 'sent' check (result in ('sent','skipped','failed')),
  detail jsonb,
  created_at timestamptz not null default now(),
  unique (kind, entity_id, reference_date, channel)
);

-- ------------------------------------------------------------
-- Tarefas: marcar origem automática para o painel da equipe
-- ------------------------------------------------------------
alter table public.tasks
  add column if not exists source text not null default 'manual'
    check (source in ('manual','automation')),
  add column if not exists traveler_id uuid references public.travelers(id) on delete cascade;

-- ------------------------------------------------------------
-- RLS nas tabelas novas (mesmo padrão da 0004)
-- ------------------------------------------------------------
alter table public.bot_sessions enable row level security;
alter table public.travelers enable row level security;
alter table public.opportunity_travelers enable row level security;
alter table public.notification_log enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['bot_sessions','travelers','opportunity_travelers','notification_log']
  loop
    execute format('create policy "staff select %1$s" on public.%1$s for select using (public.is_active_staff());', t);
    execute format('create policy "staff insert %1$s" on public.%1$s for insert with check (public.is_active_staff());', t);
    execute format('create policy "staff update %1$s" on public.%1$s for update using (public.is_active_staff());', t);
    execute format('create policy "admin delete %1$s" on public.%1$s for delete using (public.is_admin_or_manager());', t);
  end loop;
end $$;

-- ------------------------------------------------------------
-- Painel "Vencimentos" — view pronta para a UI
-- ------------------------------------------------------------
create or replace view public.document_expirations
with (security_invoker = true) as
select
  t.id as traveler_id,
  t.contact_id,
  t.full_name,
  'passport'::text as document,
  t.passport_expires_on as expires_on
from public.travelers t
where t.passport_expires_on is not null
union all
select
  t.id, t.contact_id, t.full_name, 'us_visa', t.us_visa_expires_on
from public.travelers t
where t.us_visa_expires_on is not null;
