# Bot de qualificação e funil

Roteiro aprovado pelo Piero em 22/09/2026. Código: `src/lib/bot/qualificacao.ts`. Todos os textos estão nesse arquivo, para facilitar ajustes.

## Quando o bot começa

A primeira mensagem de um **contato novo** cria:
1. o contato,
2. a conversa,
3. uma oportunidade em **NOVO LEAD**,

e em seguida o bot começa. Nesse momento o card vai para **QUALIFICAÇÃO**.

Para um contato que já existe, o bot só começa se não houver nada em andamento. Ele **não** começa quando:
- existe uma negociação aberta, porque aí quem conduz é a equipe;
- existe uma viagem vendida ainda vigente (a ida está no futuro ou a volta foi há menos de 30 dias), porque isso é pós-venda;
- o contato está na blocklist comercial;
- a conversa está com a equipe (`pending_human`).

## Perguntas (uma por mensagem)

| # | Pergunta | Formato | Campo na oportunidade |
|---|---|---|---|
| 1 | Nome | texto | `contacts.name` |
| 2 | Cidade de saída | texto | `origin_city` |
| 3 | Destino | lista: Orlando/Disney · EUA · Cruzeiro · Europa · Outro | `destination`, `destination_code` |
| 3b | Qual destino (se "Outro") | texto | `destination` |
| 4 | Visto americano (só EUA/Orlando) | botões: Todos · Alguns · Ninguém | `us_visa_status` + tag **visto** se "Alguns" ou "Ninguém" |
| 5 | Quantas pessoas | texto | `travelers_count` |
| 6 | Idades | texto ("38, 35, 8") | `traveler_ages`, `adults_count`, `children_ages` |
| 7 | Datas | botões: Definidas · Só o mês · Não sei | `travel_date_confidence` |
| 7a | Ida e volta | texto (15/01/2027) | `travel_date_estimate`, `travel_return_date` |
| 7b | Mês e duração | texto | `travel_month_text` |
| 8 | Orçamento do grupo | lista de faixas | `budget_range` |
| 9 | Forma de pagamento | lista | `payment_preference` |
| 10 | Prova runDisney (só leads do Corrida na Disney) | texto | `rundisney_race` |

As respostas são salvas **a cada passo**. Se o cliente parar no meio, a equipe já vê o que ele respondeu até ali.

Ao terminar, o bot envia o resumo e a mensagem de horário (ou o aviso de "fora do horário") e o link do grupo de promoções. O card vai para **ORÇAMENTO EM PREPARAÇÃO** e é criada uma tarefa "Montar cotação".

## Regras

- **Áudio:** o bot responde "Não conseguimos ouvir áudio 🙏 Pode escrever pra mim?" e repete a pergunta.
- **"atendente":** em qualquer momento, o bot para, a conversa vai para `pending_human` e é criada uma tarefa urgente.
- **Parou no meio:** 2h depois vai **1 lembrete** com a pergunta atual, só dentro da janela de 24h. Depois de 72h sem resposta, a sessão é marcada como abandonada, mas o card continua no funil.
- **Respostas digitadas:** onde há botão ou lista, o bot também aceita o número da opção ("2") ou texto parecido ("sim", "orlando", "uns 20 mil").

## Marca de origem

A marca é detectada pelo texto da primeira mensagem. Use links wa.me com texto pré-preenchido:
- Corrida na Disney: `https://wa.me/55XXXXXXXXXXX?text=Olá!%20Vim%20pelo%20Corrida%20na%20Disney`
- Orlando com Koala: `https://wa.me/55XXXXXXXXXXX?text=Olá!%20Vim%20pelo%20Orlando%20com%20Koala`

## Venda fechada → fluxo de documentos

Quando o card vai para **VENDA FECHADA**, o bot pede para cada viajante:
- o nome completo;
- a data de vencimento do passaporte;
- a data de vencimento do visto americano (se o destino for EUA ou Orlando).

Ele guarda **só as datas**. Isso só acontece se o cliente falou nas últimas 24h. Caso contrário, é criada uma tarefa para a equipe pedir as datas ou cadastrar direto no CRM.
