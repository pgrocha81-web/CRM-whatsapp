# Setup do WhatsApp Business Cloud API — checklist Meta

Baseado na documentação oficial da Meta (verificar sempre a versão mais atual em developers.facebook.com/docs/whatsapp/cloud-api antes de configurar — regras de janela de atendimento, templates e limites mudam).

## O que só o Piero pode fazer

1. **Meta Business Portfolio** — criar ou usar um já existente em business.facebook.com.
2. **Meta App** — criar em developers.facebook.com/apps, tipo "Business", adicionar o produto "WhatsApp".
3. **WhatsApp Business Account (WABA)** — criada junto com o App; anotar o **WABA ID**.
4. **Número de telefone** — conectar o número comercial da Koala Turismo (ou um número de teste primeiro, recomendado para não arriscar o número de produção durante o desenvolvimento); anotar o **Phone Number ID**.
5. **Access Token** — gerar um token permanente (token de sistema/usuário do Business Manager, não o token temporário de 24h que aparece por padrão no painel de testes).
6. **App Secret** — em App Settings > Basic, usado para validar a assinatura dos webhooks.
7. **Webhook Verify Token** — você escolhe uma string secreta qualquer (ex: gerada com `openssl rand -hex 32`).
8. **Configurar o webhook na Meta**: URL = `https://<seu-domínio-vercel>/api/webhooks/whatsapp`, verify token = o mesmo do passo 7, campo assinado = `messages`.

## Onde colocar cada credencial

Todas vão em variáveis de ambiente (`.env.local` local, ou Vercel > Settings > Environment Variables em produção) — nunca no código:

```
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_BUSINESS_ACCOUNT_ID=
WHATSAPP_ACCESS_TOKEN=
WHATSAPP_WEBHOOK_VERIFY_TOKEN=
META_APP_SECRET=
```

## Status atual

- Rota de verificação do webhook (GET): **IMPLEMENTADO**
- Validação de assinatura HMAC (POST): **IMPLEMENTADO**
- Registro idempotente de eventos: **IMPLEMENTADO**
- Testado contra a Meta de verdade: **PENDENTE DE CREDENCIAL** (nada disso foi testado com tráfego real — só temos testes unitários locais da função de validação de assinatura)
- Envio de mensagens/templates: **PENDENTE** (Sprint 2 avançado / Sprint 8)

## Regras que precisam ser confirmadas na documentação atual antes de automatizar envio (não assumir)

- Janela de atendimento gratuita de 24h a partir da última mensagem do cliente
- Quais categorias de mensagem exigem template pré-aprovado fora dessa janela
- Limites de mensagens por dia conforme o tier de qualidade do número
- Regras de opt-in para mensagens iniciadas pela empresa

Essas regras ainda **não foram verificadas na documentação mais recente da Meta** neste projeto — fazer isso antes de habilitar qualquer envio automático (Sprint 8).
