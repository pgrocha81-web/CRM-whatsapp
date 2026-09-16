# Progress — Koala WhatsApp CRM

Última atualização: 2026-09-16

## Feito (IMPLEMENTADO, não testado contra serviços reais — sem credenciais ainda)

- Estrutura do projeto Next.js 16 + TypeScript + Tailwind (escrita manualmente; `npm install` bloqueado neste ambiente de desenvolvimento por política de rede, roda normalmente no seu computador/Vercel)
- Schema completo do banco em `supabase/migrations/` (0001-0004): contacts, opportunities (1 contato : N oportunidades), pipeline configurável com as 13 etapas do briefing, conversations, messages, webhook_events, tasks, followups/sequences/steps, templates, automation_rules/logs, audit_logs — com índices e RLS
- Seed inicial: 3 marcas, ~19 produtos, pipeline padrão com as 13 etapas
- Webhook do WhatsApp (`/api/webhooks/whatsapp`): verificação GET, validação de assinatura HMAC-SHA256, registro idempotente em `webhook_events` (dedupe por `wa_message_id`)
- Teste unitário (Vitest) da validação de assinatura — 5 casos (válida, secret errado, ausente, formato errado, payload alterado)
- Middleware de autenticação (Supabase Auth) protegendo o dashboard
- Documentação: README, CRM_ARCHITECTURE, DATABASE_SCHEMA, SETUP_WHATSAPP, AUTOMATIONS, FOLLOWUP_RULES, SECURITY, DEPLOY, .env.example

## Em andamento

- Nada em andamento no momento — aguardando as credenciais/decisões abaixo para avançar

## Pendente (por sprint)

- **Sprint 1 (resto)**: telas de login/auth funcionais de verdade, gestão de usuários
- **Sprint 2**: cliente de envio da WhatsApp Cloud API (mensagens/templates), processamento do evento de `webhook_events` → criação/atualização de contato e conversa
- **Sprint 3**: inbox funcional (3 colunas) com dados reais
- **Sprint 4**: CRUD de contatos e oportunidades na UI
- **Sprint 5**: pipeline Kanban arrastável
- **Sprint 6**: motor de execução de follow-up (job de cron já tem o slot em `vercel.json`, faltando a lógica)
- **Sprint 7**: integração Claude — classificação, resumo, sugestão de resposta, lead scoring explicável
- **Sprint 8**: automações configuráveis e handoff humano
- **Sprint 9**: dashboard e relatórios
- **Sprint 10**: testes de fluxo completos, rate limiting, retry controlado, deploy validado ponta a ponta

## Bloqueios reais (só o Piero resolve)

1. Repositório GitHub vazio para receber este código (em andamento pelo Piero)
2. Projeto Supabase dedicado (URL + chaves)
3. Meta App + WABA + número de telefone + tokens (ver `SETUP_WHATSAPP.md`)
4. Conta Vercel + projeto importado do GitHub
5. Billing da Anthropic API em console.anthropic.com (separado de assinatura claude.ai) — necessário para Sprint 7

## Próximo passo

Assim que a URL do repositório GitHub chegar: configurar remote, dar push do estado atual, e seguir para o restante do Sprint 1 (auth) e início do Sprint 2 (cliente de envio da Cloud API), que não dependem de credenciais Meta para o código em si — só para testar de fato.
