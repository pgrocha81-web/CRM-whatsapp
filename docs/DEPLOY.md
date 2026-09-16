# Deploy

## 1. GitHub

```bash
git remote add origin <URL-DO-SEU-REPO-VAZIO>
git branch -M main
git push -u origin main
```

## 2. Supabase

1. Criar um projeto novo em supabase.com (dedicado a este sistema — não reaproveitar o banco do CRM de Viagens)
2. Project Settings > API: copiar `Project URL` e a chave **publishable** (nomenclatura nova) para `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
3. Copiar a chave **secret** para `SUPABASE_SECRET_KEY` (nunca no frontend)
4. Aplicar as migrations: `supabase link --project-ref <ref>` seguido de `supabase db push`, ou colar o conteúdo de `supabase/migrations/*.sql` no SQL Editor do painel, em ordem
5. Rodar `supabase/seed/seed.sql` uma vez (marcas, produtos e pipeline padrão)

## 3. Vercel

1. Importar o repositório GitHub em vercel.com/new
2. Framework detectado automaticamente como Next.js
3. Configurar todas as variáveis de `.env.example` em Project Settings > Environment Variables
4. Deploy — a partir daqui o sistema fica no ar 24/7, independente do computador do Piero

## 4. Meta

Ver `SETUP_WHATSAPP.md` — configurar o webhook apontando para `https://<seu-domínio>.vercel.app/api/webhooks/whatsapp` só depois do primeiro deploy bem-sucedido (a URL precisa existir e responder ao GET de verificação).

## 5. Verificação pós-deploy (não assumir que funcionou sem testar)

- [ ] `GET /api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=...&hub.challenge=123` retorna `123`
- [ ] Enviar mensagem de teste de um número de teste da Meta e confirmar linha nova em `webhook_events`
- [ ] Confirmar que reenviar o mesmo evento não duplica (idempotência)
- [ ] Login funcionando com um usuário real criado no Supabase Auth
