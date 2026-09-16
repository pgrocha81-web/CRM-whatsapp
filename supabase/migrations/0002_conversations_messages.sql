-- ============================================================
-- Migration 0002: Conversas, mensagens e eventos de webhook
-- ============================================================

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.contacts(id) on delete cascade,
  current_opportunity_id uuid references public.opportunities(id) on delete set null,

  assigned_to uuid references public.users(id) on delete set null,
  status text not null default 'open' check (status in ('open','pending_human','waiting_customer','closed')),

  -- janela de atendimento de 24h da Meta: última mensagem RECEBIDA do cliente
  last_customer_message_at timestamptz,
  unread_count integer not null default 0,

  ai_summary text, -- resumo periódico gerado pela IA (reduz tokens em chamadas futuras)
  ai_summary_updated_at timestamptz,

  human_handoff_required boolean not null default false,
  human_handoff_reason text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_conversations_contact on public.conversations(contact_id);
create index if not exists idx_conversations_assigned on public.conversations(assigned_to);
create index if not exists idx_conversations_status on public.conversations(status);

create trigger set_updated_at_conversations before update on public.conversations
  for each row execute procedure public.set_updated_at();

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,

  -- ID da mensagem retornado pela Meta Cloud API — chave de idempotência
  wa_message_id text unique,

  direction text not null check (direction in ('inbound','outbound')),
  sender_type text not null check (sender_type in ('customer','agent','automation','ai_suggestion')),
  sender_user_id uuid references public.users(id),

  message_type text not null default 'text' check (message_type in
    ('text','image','document','audio','video','location','button','template','interactive','sticker','unknown')),
  content text, -- texto da mensagem ou caption
  media_url text, -- URL após download/armazenamento (não a URL temporária da Meta)
  media_mime_type text,
  location_lat double precision,
  location_lng double precision,

  template_name text, -- quando message_type = template

  status text default 'received' check (status in
    ('queued','sent','delivered','read','failed','received')),
  failure_reason text,

  -- classificação automática (preenchida pela pipeline de IA/regras)
  detected_topic text, -- disney | universal | orlando | corrida | rundisney | passagem | hotel | cruzeiro | visto | passaporte | dhl | seguro | carro | pacote | financeiro | suporte | outros
  detected_intent text, -- duvida | orcamento | fechamento | reclamacao | suporte | outro
  detected_sentiment text, -- positivo | neutro | negativo

  raw_payload jsonb, -- payload bruto do webhook, para auditoria/replay

  created_at timestamptz not null default now()
);
create index if not exists idx_messages_conversation on public.messages(conversation_id, created_at);
create index if not exists idx_messages_wa_id on public.messages(wa_message_id);

-- ------------------------------------------------------------
-- WEBHOOK EVENTS — idempotência e auditoria de tudo que a Meta envia
-- ------------------------------------------------------------
create table if not exists public.webhook_events (
  id uuid primary key default gen_random_uuid(),
  -- ID único do evento/mensagem usado para deduplicar processamento
  dedupe_key text not null unique,
  event_type text not null, -- message | status | unknown
  payload jsonb not null,
  processed boolean not null default false,
  processed_at timestamptz,
  processing_error text,
  received_at timestamptz not null default now()
);
create index if not exists idx_webhook_events_processed on public.webhook_events(processed, received_at);

-- ------------------------------------------------------------
-- ATTACHMENTS, NOTES, ACTIVITIES — timeline completa do cliente
-- ------------------------------------------------------------
create table if not exists public.attachments (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid references public.contacts(id) on delete cascade,
  opportunity_id uuid references public.opportunities(id) on delete cascade,
  message_id uuid references public.messages(id) on delete set null,
  file_name text not null,
  file_url text not null,
  mime_type text,
  uploaded_by uuid references public.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid references public.contacts(id) on delete cascade,
  opportunity_id uuid references public.opportunities(id) on delete cascade,
  author_id uuid references public.users(id),
  body text not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_notes_contact on public.notes(contact_id);

-- log genérico de qualquer evento relevante na timeline (venda, mudança de responsável, pagamento registrado etc.)
create table if not exists public.activities (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid references public.contacts(id) on delete cascade,
  opportunity_id uuid references public.opportunities(id) on delete cascade,
  actor_id uuid references public.users(id), -- null = sistema/automação
  activity_type text not null, -- stage_change | owner_change | note | task | call | followup | payment | sale | edit
  description text not null,
  metadata jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_activities_contact on public.activities(contact_id, created_at desc);
create index if not exists idx_activities_opportunity on public.activities(opportunity_id, created_at desc);
