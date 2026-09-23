# Integrações da venda fechada

Quando um card vai para **VENDA FECHADA** (`POST /api/opportunities/:id/stage`), o sistema faz três coisas:
1. cria um **evento de dia inteiro no Google Calendar**, da ida até a volta, com lembrete 7 dias antes;
2. cria um **card no Trello**, no topo da lista escolhida, com data de entrega igual à ida;
3. pede ao cliente os vencimentos de passaporte e visto (ver `BOT_FUNIL.md`).

O título e a descrição do evento e do card têm cliente, WhatsApp, destino, cidade de saída, datas, viajantes e idades, status do visto, valor fechado (ou orçamento informado), forma de pagamento e o link do CRM.

Os IDs do evento e do card ficam salvos na oportunidade (`google_calendar_event_id`, `trello_card_id`), então nada é criado duas vezes. Se algo falhar, o erro aparece em `won_sync_error` e a rotina de hora em hora tenta de novo por até 30 dias.

## Google Calendar (conta de serviço)

1. Acesse console.cloud.google.com, crie um projeto e ative a **Google Calendar API**.
2. Vá em IAM → Contas de serviço → **Criar**, depois Chaves → Adicionar chave → JSON.
3. No Google Calendar, abra as configurações da agenda da Koala → **Compartilhar com pessoas específicas** → adicione o e-mail da conta de serviço com a permissão **"Fazer alterações nos eventos"**.
4. Em Configurações da agenda → **ID da agenda**, copie o ID.
5. Preencha as variáveis na Vercel:
   - `GOOGLE_SERVICE_ACCOUNT_EMAIL`: o `client_email` do JSON;
   - `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`: o `private_key` do JSON, colado inteiro, com os `\n`;
   - `GOOGLE_CALENDAR_ID`.

## Trello

1. Em https://trello.com/power-ups/admin, crie um Power-Up para gerar a **API key**.
2. Na mesma página, gere um **token** para a sua conta.
3. Para achar o ID da lista, abra o quadro "KOALA 2025" e acrescente `.json` no fim da URL. Procure a lista desejada em `"lists"` e copie o `id`.
4. Preencha as variáveis: `TRELLO_API_KEY`, `TRELLO_TOKEN` e `TRELLO_LIST_ID`. `TRELLO_LABEL_IDS` é opcional (IDs de etiquetas separados por vírgula).

Sem essas variáveis, a venda é registrada normalmente e o aviso "não configurado" fica em `won_sync_error`.
