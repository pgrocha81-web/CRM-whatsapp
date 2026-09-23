# Avisos automáticos

Código: `src/lib/avisos/`. Cada aviso sai **uma vez só**: a tabela `notification_log` tem uma chave única formada por tipo, pessoa ou viagem, data de referência e canal. Se a data mudar (por exemplo, a viagem foi remarcada), sai um aviso novo.

| Aviso | Quem recebe | Quando | Template |
|---|---|---|---|
| Viagem chegando | cliente | 7 dias antes da ida (se a rotina falhar, até 5 dias antes) | `koala_viagem_1_semana` |
| Passaporte vencendo | cliente + tarefa para a equipe | vence em até 6 meses | `koala_passaporte_vencendo` |
| Visto americano vencendo | cliente (com botão **Quero renovar**) + tarefa | vence em até 6 meses | `koala_visto_vencendo` |
| Documento x viagem | tarefa 🔴/🟡 para a equipe | quando as datas chegam, e todo dia para viagens vendidas | — |

Quando o cliente toca em **Quero renovar**, abre uma oportunidade nova "Renovação de visto americano" com a tag `visto` e temperatura quente, a conversa passa para a equipe e ele recebe uma confirmação.

**Regras de conferência** (`rules.ts`):
- **EUA/Orlando:** o passaporte e o visto têm que valer até a volta. Brasileiros são isentos da regra dos 6 meses nos EUA.
- **Europa e outros destinos:** o passaporte tem que valer até a volta (senão é bloqueio 🔴) e ter pelo menos 6 meses na ida (senão é aviso 🟡, porque a equipe confirma a exigência do país).
- **Cruzeiro:** falta de passaporte vira aviso, não bloqueio, porque roteiros só no Brasil não exigem.

**Proteções:**
- No máximo `AVISOS_MAX_VENCIMENTOS_POR_DIA` mensagens de vencimento por dia (padrão 40), para não disparar tudo de uma vez ao importar a base antiga.
- Documento vencido há mais de 30 dias não gera mensagem.
- Contato com `opt_out_at` preenchido não recebe aviso de vencimento. Quem está na blocklist comercial não recebe a oferta de visto.

## Agendamento

**Diária** (`/api/cron/daily`): já configurada no `vercel.json` para 11:00 UTC, que é 8h em São Paulo. Funciona no plano Hobby. Ela também roda as tarefas da rotina de hora em hora, como garantia.

**De hora em hora** (`/api/cron/hourly`): cuida do lembrete de "parou no meio", do reprocessamento de eventos e das re-tentativas de Calendar e Trello. O plano Hobby da Vercel não permite rodar de hora em hora, então o agendamento é feito pelo **pg_cron do Supabase**, que é grátis. Rode uma vez no SQL Editor, trocando `<DOMINIO>` e `<CRON_SECRET>`:

```sql
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'koala-hourly',
  '5 * * * *',
  $$ select net.http_get(
       url := 'https://<DOMINIO>/api/cron/hourly',
       headers := jsonb_build_object('Authorization', 'Bearer <CRON_SECRET>')
     ); $$
);
```

Ambas as rotas exigem `Authorization: Bearer <CRON_SECRET>`.
