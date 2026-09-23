# Telas do CRM

| Tela | O que faz |
|---|---|
| **Funil** (`/funil`) | O Kanban com as 13 etapas. No computador, é só arrastar o card. Ao soltar em **VENDA FECHADA**, o sistema pede o valor fechado e dispara Calendar, Trello e o pedido de documentos. "Perdido" e "Sem interesse" ficam escondidos, com um botão para mostrar. |
| **Oportunidade** (`/oportunidades/:id`) | A etapa (uma lista para trocar, que também funciona no celular), os dados da viagem, o link do orçamento (Infotravel, Hoteldo…) com o botão **Enviar orçamento no WhatsApp** (que move o card para ORÇAMENTO ENVIADO), os viajantes com a situação de cada documento, as tarefas e o histórico. |
| **Conversas** (`/inbox`) | Lista de conversas com filtros (Todas, Não lidas, Com a equipe) e selos 🤖 bot e "pediu atendente". Atualiza a cada 8s. Quem responde assume a conversa e o bot para. Fora da janela de 24h, o campo de texto fica bloqueado. |
| **Clientes** (`/clientes`) | Busca por nome, telefone ou cidade. A ficha mostra as viagens, os viajantes, os documentos e o histórico. |
| **Tarefas** (`/tarefas`) | Tarefas manuais e automáticas (🤖): cotação, atendente, documentos e vencimentos. As 🔴 urgentes aparecem primeiro. |
| **Vencimentos** (`/vencimentos`) | Passaportes e vistos agrupados em: vencidos, vencem em até 6 meses e de 6 a 12 meses. |

Os documentos aparecem com cores: 🟢 ok, 🟡 vence em até 6 meses, 🔴 vencido, "?" quando a data não foi informada.

## Acesso da equipe

1. No Supabase, vá em **Authentication → Users → Add user**. Informe o e-mail e a senha e marque "Auto confirm".
2. Só os e-mails que estão em `public.staff_allowlist` recebem acesso. O Piero (admin) já está na lista. Para liberar outra pessoa, adicione o e-mail dela **antes** de criar o usuário:
   ```sql
   insert into staff_allowlist (email, full_name, role) values ('email@koalaturismo.com.br', 'Aline Sousa', 'admin');
   ```
   Uma conta criada fora da lista entra como inativa e não vê nenhum dado.

## Pré-visualização

Com `ENABLE_PREVIEW=1`, as rotas `/preview/funil`, `/preview/inbox` e `/preview/viajantes` mostram as telas com dados fictícios. Em produção, sem essa variável, elas respondem 404.
