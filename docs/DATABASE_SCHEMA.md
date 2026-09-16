# Modelo de dados

Schema completo em `supabase/migrations/`. Aplicar na ordem numérica (0001 → 0004).

## Tabelas principais

| Tabela | Propósito |
|---|---|
| `users` | Usuários internos (atendentes/gestores/admins), espelha `auth.users` |
| `brands` | As três marcas: Koala Turismo, Orlando com Koala, Corrida na Disney |
| `products` | Produtos/serviços por marca (passagem, hotel, ingresso, visto, DHL...) |
| `contacts` | O cliente/lead — um registro por telefone |
| `contact_custom_fields` | Campos personalizados futuros, sem alterar schema |
| `tags` / `contact_tags` | Tags livres por contato |
| `commercial_blocklist` | Contatos que pediram para parar — bloqueia follow-up automático |
| `pipelines` / `pipeline_stages` | Pipeline configurável (não hardcoded no código) |
| `opportunities` | Uma oportunidade comercial — um contato pode ter várias |
| `opportunity_stage_history` | Toda mudança de etapa é registrada, nunca sobrescrita |
| `lead_scores` | Histórico do score 0-100 com `breakdown` explicável (não caixa-preta) |
| `conversations` | Uma conversa de WhatsApp por contato |
| `messages` | Mensagens, com `wa_message_id` único (idempotência) |
| `webhook_events` | Todo evento bruto da Meta, deduplicado por `dedupe_key` |
| `attachments` / `notes` / `activities` | Timeline completa do cliente |
| `tasks` | Tarefas atribuídas a atendentes |
| `followup_sequences` / `followup_steps` | Regras de follow-up configuráveis por produto/marca/origem/temperatura/etapa/valor |
| `followups` | Follow-ups agendados de fato, com no máximo 1 ativo por oportunidade |
| `templates` | Message templates aprovados na Meta |
| `automation_rules` / `automation_logs` | Regras de automação (desligadas por padrão) e log de execução |
| `audit_logs` | Auditoria de ações sensíveis (LGPD) |

## Decisões de modelagem

- **Um contato, várias oportunidades**: `opportunities.contact_id` sem unicidade — o exemplo do brief (orçamento Disney em setembro + cruzeiro em dezembro) vira duas linhas em `opportunities` para o mesmo `contact_id`.
- **Idempotência de webhook**: `messages.wa_message_id` e `webhook_events.dedupe_key` são `UNIQUE`. Um insert duplicado (reenvio da Meta) simplesmente falha por constraint e é ignorado — nunca duplica.
- **Follow-up único ativo**: índice único parcial `uniq_active_followup_per_opportunity` garante no banco (não só na aplicação) que uma oportunidade nunca tenha dois follow-ups `scheduled` simultâneos.
- **Lead score explicável**: `lead_scores.breakdown` é um JSON com a lista de fatores e pontos de cada um — a UI pode sempre mostrar "por que esse score".
- **RLS**: todo staff ativo (`users.active = true`) lê e escreve dados comerciais; exclusão e gestão de usuários restrita a `admin`/`manager`. `webhook_events` e `audit_logs` só acessíveis via chave secreta (server-side).

## Índices relevantes

Todos os campos usados em filtros do dashboard/inbox têm índice: `owner_id`, `stage_id`, `next_activity_at`, `lead_temperature` em `opportunities`; `status` em `conversations`; `scheduled_for` em `followups`; etc. Ver os arquivos de migration para a lista completa.
