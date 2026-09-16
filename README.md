# Koala WhatsApp CRM

Central comercial da Koala Turismo: WhatsApp Business Cloud API + CRM próprio + IA copiloto comercial (Claude). Sistema separado do CRM de Viagens (VamosKoalar) e do KOALA APP — ver `docs/CRM_ARCHITECTURE.md` para o porquê.

## Stack

- **Frontend/Backend**: Next.js 16 (App Router) + React + TypeScript
- **Banco de dados**: Supabase (PostgreSQL + RLS)
- **Autenticação**: Supabase Auth
- **WhatsApp**: Meta WhatsApp Cloud API (oficial — sem scraping ou QR Code)
- **IA**: Anthropic API (Claude)
- **Deploy**: Vercel

## Status do projeto

Ver [`docs/progress.md`](docs/progress.md) para o estado atual, sprint por sprint. Resumo: **Sprint 0 e base do Sprint 1 implementados**; sistema ainda não tem nenhuma credencial real configurada, então nada está rodando em produção ainda.

## Setup local

```bash
npm install
cp .env.example .env.local   # preencha com suas credenciais (ver docs/SETUP_WHATSAPP.md)
npm run dev
```

## Documentação

- [`docs/CRM_ARCHITECTURE.md`](docs/CRM_ARCHITECTURE.md) — arquitetura geral e decisões
- [`docs/DATABASE_SCHEMA.md`](docs/DATABASE_SCHEMA.md) — modelo de dados
- [`docs/SETUP_WHATSAPP.md`](docs/SETUP_WHATSAPP.md) — checklist de configuração na Meta
- [`docs/AUTOMATIONS.md`](docs/AUTOMATIONS.md) — regras de automação e handoff humano
- [`docs/FOLLOWUP_RULES.md`](docs/FOLLOWUP_RULES.md) — motor de follow-up
- [`docs/SECURITY.md`](docs/SECURITY.md) — segurança, LGPD, controle de acesso
- [`docs/DEPLOY.md`](docs/DEPLOY.md) — passo a passo de deploy
- [`docs/progress.md`](docs/progress.md) — feito / em andamento / pendente / próximos passos
