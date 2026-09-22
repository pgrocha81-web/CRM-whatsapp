# Progress — Koala WhatsApp CRM

Última atualização: 2026-09-22

## Decisão de 22/09/2026

Vai ser **um sistema só**. Este projeto vira o app da agência no endereço `app.koalaturismo.com.br`. O CRM de viagens atual (HTML + Supabase `zpffpqmkjdxqrblhadum`: tabelas `cards`, `kv_store`, `staff`) continua no ar até o novo ser testado e aprovado. Depois disso, os dados são migrados e o domínio é trocado.

## Feito e TESTADO

- Sprint 0/1: build validado no computador do Piero (17/09).
- **Sprint 2 (22/09), branch `sprint-2-bot-funil`:**
  - `tsc` sem erros;
  - `next build` OK, com 8 rotas;
  - 49 testes (Vitest) passando;
  - migrations 0001 a 0005 + seed aplicadas com sucesso num Postgres em memória (PGlite).

## Feito no Sprint 2 (IMPLEMENTADO, ainda não testado contra Meta/Google/Trello reais)

- **Bot de qualificação** com o roteiro aprovado: uma pergunta por mensagem, botões e listas, áudio, "atendente", lembrete de "parou no meio" e horário de atendimento. Docs: `docs/BOT_FUNIL.md`.
- **Processamento do webhook**: contato → conversa → mensagem → oportunidade → bot. Roda via `after()` logo depois do 200 para a Meta. Eventos com falha são reprocessados de hora em hora.
- **Funil automático**: NOVO LEAD → QUALIFICAÇÃO → ORÇAMENTO EM PREPARAÇÃO, com a tarefa "Montar cotação".
- **Envio pela Cloud API**: texto, botões, lista e template com payload de botão.
- **Venda fechada** (`POST /api/opportunities/:id/stage`): Google Calendar (conta de serviço), card no Trello e fluxo de documentos no WhatsApp. Docs: `docs/INTEGRACOES.md`.
- **Viajantes** com vencimento de passaporte e visto (só datas, por causa da LGPD), view `document_expirations` para o painel.
- **Avisos**:
  - viagem daqui a 1 semana;
  - passaporte e visto vencendo em até 6 meses (o de visto vem com o botão "Quero renovar", que abre uma oportunidade de visto);
  - conferência documento x viagem, com tarefa 🔴/🟡.
  - Docs: `docs/AVISOS.md`, `docs/TEMPLATES_META.md`.
- **Rotinas**: `/api/cron/daily` (Vercel Cron, 8h) e `/api/cron/hourly` (pg_cron do Supabase).

## Pendente

- **Telas** (Sprints 3 a 5): inbox, Kanban com arrastar (que vai chamar a rota de etapa), cadastro de viajantes e painel "Vencimentos do mês".
- **Migração do app atual**: importar os 70 cards, os clientes e as datas de passaporte e visto. Cards com etapa de venda devem entrar com `closed_at` preenchido para ganhar os avisos.
- **Login real** e gestão de usuários (Piero e Aline).
- Sprints 6 a 10, conforme o plano original (follow-up, IA, automações configuráveis, dashboard, testes ponta a ponta).

## Bloqueios reais (só o Piero resolve)

1. ~~Repositório GitHub~~: resolvido.
2. Supabase `koala-whatsapp-crm` (`ksanckobmvnpfxulipzv`): está **pausado**. É preciso reativar e depois aplicar as migrations e o seed.
3. Meta: App + WABA + número + tokens (ver `SETUP_WHATSAPP.md`), e **os 3 templates** de `TEMPLATES_META.md` enviados para aprovação.
4. Vercel: importar o projeto e configurar as variáveis do `.env.example`.
5. Google Calendar (conta de serviço) e Trello (key, token e ID da lista): ver `INTEGRACOES.md`.
6. Billing da Anthropic API, necessário para o Sprint 7.
