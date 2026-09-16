# Arquitetura — Koala WhatsApp CRM

## Por que um sistema separado

A Koala Turismo já tem dois sistemas relacionados:

1. **CRM de Viagens / VamosKoalar** — HTML estático + Supabase, em produção (`app.koalaturismo.com.br`), focado em gestão de viagens já vendidas e portal do cliente.
2. **KOALA APP** — plataforma nova (Next.js + Supabase + Tailwind), com fases de planejamento aprovadas mas Sprint 0 ainda não validado por Piero; seu escopo de WhatsApp no MVP é raso (só abrir uma conversa).

Este projeto foi criado deliberadamente **separado dos dois**, por decisão explícita do Piero, para não travar no ritmo de validação fase-a-fase do KOALA APP nem misturar responsabilidades com o CRM de Viagens (que cuida de pós-venda, não do funil comercial de WhatsApp). No futuro, nada impede os três sistemas de compartilharem o mesmo projeto Supabase ou serem consolidados — decisão para quando fizer sentido, não agora.

## Visão geral do fluxo

```
WHATSAPP (cliente)
   |
   v
META CLOUD API
   |
   v
WEBHOOK (/api/webhooks/whatsapp) — valida assinatura HMAC, garante idempotência
   |
   v
webhook_events (registro bruto, deduplicado por wa_message_id)
   |
   v
Identificação do contato (por telefone/wa_id) -> cria ou atualiza contacts
   |
   v
Conversa (conversations) -> mensagem (messages)
   |
   v
Análise IA (classificação de tópico/intenção/sentimento, seletiva por custo)
   |
   v
CRM (opportunities, lead_scores, pipeline_stages)
   |
   v
Automações (automation_rules) + Follow-up (followups, followup_sequences)
   |
   v
Atendente humano (inbox) / handoff obrigatório quando necessário
```

## Camadas do código

- `src/app/api/webhooks/whatsapp` — recepção de eventos da Meta (implementado, Sprint 2)
- `src/app/api/cron` — jobs periódicos (follow-up, alertas) — pendente, Sprint 6
- `src/app/(dashboard)` — inbox, pipeline kanban, contatos, tarefas, relatórios — pendente, Sprints 3-9
- `src/lib/whatsapp` — cliente da Cloud API (envio de mensagem/template), validação de webhook
- `src/lib/ai` — orquestração de chamadas a Claude (classificação, resumo, sugestão de resposta) — pendente, Sprint 7
- `src/lib/followup` — motor de regras de follow-up — pendente, Sprint 6
- `src/lib/classification` — regras de roteamento por palavra-chave/assunto — pendente, Sprint 7/8
- `supabase/migrations` — schema completo do banco (implementado, Sprint 1)

## Controle de custo de IA

Nem toda mensagem passa por análise de IA. Regra planejada (Sprint 7): mensagens curtas/triviais (ex: "obrigado", "ok") são classificadas por regras simples (palavra-chave/regex) sem chamar a API do Claude; mensagens com conteúdo comercial relevante (perguntas, valores, datas, objeções) acionam a IA, com contexto resumido (não o histórico completo da conversa) para controlar tokens.

## Diferenciação IMPLEMENTADO vs PENDENTE

Este documento e o `progress.md` usam sempre esta distinção, nunca afirmando que algo funciona sem ter sido testado de fato:

- **IMPLEMENTADO** — código escrito e presente no repositório
- **TESTADO** — validado com teste automatizado ou execução real
- **PENDENTE DE CREDENCIAL** — código pronto, mas precisa de uma chave/token real do Piero
- **PENDENTE DE CONFIGURAÇÃO META** — depende de um passo manual no painel da Meta
- **PENDENTE DE DEPLOY** — depende de o projeto estar publicado na Vercel
