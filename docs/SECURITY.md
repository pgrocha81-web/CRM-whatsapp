# Segurança e LGPD

## Autenticação e controle de acesso

- Supabase Auth para login dos usuários internos (`users.role`: admin, manager, agent, viewer)
- RLS habilitado em todas as tabelas de negócio (ver `supabase/migrations/0004_rls_policies.sql`)
- Exclusão de registros e gestão de usuários restrita a `admin`/`manager`
- `webhook_events` e `audit_logs` só acessíveis pela chave secreta do Supabase, nunca pelo browser

## Webhook

- Toda requisição POST ao webhook da Meta é validada por assinatura HMAC-SHA256 (`X-Hub-Signature-256`) usando `META_APP_SECRET`, com comparação em tempo constante (`timingSafeEqual`) para evitar timing attacks
- Idempotência garantida por constraint `UNIQUE` no banco (`webhook_events.dedupe_key`, `messages.wa_message_id`) — não depende só de lógica de aplicação

## Segredos

- Nenhuma credencial real neste repositório — só `.env.example` com nomes de variáveis, vazios
- `.env.local` está no `.gitignore`
- Tokens nunca aparecem em logs (revisar todo `console.log`/`console.error` antes de logar payloads que contenham tokens)

## LGPD

- **Minimização**: o schema coleta apenas dados comerciais necessários ao atendimento/venda — não há campos para dados sensíveis (saúde, biometria etc.)
- **Consentimento**: `contacts.opt_in_marketing` e `opt_in_at`/`opt_out_at` registram consentimento explícito; `commercial_blocklist` bloqueia follow-up automático para quem pediu para parar
- **Direito ao esquecimento**: PENDENTE — implementar rotina de exclusão/anonimização de contato sob pedido (Sprint 10), registrando a ação em `audit_logs`
- **Dados sensíveis e IA**: documentos pessoais (passaporte, vistos) recebidos por WhatsApp não devem ser enviados à API da Claude sem necessidade — avaliar caso a caso; texto de conversa é resumido antes de ir para a IA, reduzindo exposição desnecessária

## Rate limiting e resiliência

- PENDENTE (Sprint 10): rate limiting nas rotas públicas (`/api/webhooks/whatsapp`)
- PENDENTE: retry controlado com backoff para chamadas de saída à Cloud API e à API da Claude
- Tratamento de erro no webhook sempre responde 200 quando o problema é de configuração interna (evita a Meta acumular retries), mas registra o erro no log do servidor
