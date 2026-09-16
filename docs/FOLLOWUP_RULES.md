# Motor de follow-up

Status: schema **IMPLEMENTADO** (`followup_sequences`, `followup_steps`, `followups`); motor de execução **PENDENTE** (Sprint 6).

## Sequências configuráveis

`followup_sequences` permite condicionar por marca, produto, origem do lead, temperatura, etapa do pipeline e valor mínimo — sem precisar mexer em código para criar uma sequência nova (ex: runDisney com uma cadência, Orlando com outra, visto com outra).

Cada sequência tem passos (`followup_steps`) com atraso em dias (a partir do início da sequência ou do passo anterior), tipo de ação (tarefa interna / template de WhatsApp / mensagem sugerida por IA) e uma flag de "última tentativa".

## Follow-up inteligente (baseado em contexto, não só calendário)

A IA (Sprint 7) interpreta frases da conversa e cria um follow-up com `source = 'ai_contextual'`, preenchendo `ai_reasoning` com o motivo extraído — por exemplo:

- "Vou falar com meu marido e te respondo amanhã" → follow-up amanhã, motivo "aguardando decisão familiar"
- "Meu cartão vira dia 20" → follow-up dia 20, motivo "aguardando fechamento da fatura"
- "Vou viajar só ano que vem" → sem perseguição diária; follow-up espaçado, coerente com o horizonte da viagem

## Proteções antes de qualquer envio automático (checklist obrigatório)

Antes de executar um `followup` agendado, o job (Sprint 6) precisa verificar, nesta ordem, e preencher `skip_reason` quando aplicável:

1. Cliente já respondeu desde o agendamento?
2. Cliente já comprou (oportunidade em etapa `is_won`)?
3. Cliente pediu para parar (`commercial_blocklist`)?
4. Cliente mudou de assunto de forma que o follow-up ficou desatualizado?
5. Um atendente já falou recentemente (fora do fluxo automático)?
6. Já existe outro follow-up ativo para a mesma oportunidade? (garantido também por constraint de banco, `uniq_active_followup_per_opportunity`)
7. A mensagem é permitida pelas regras atuais do WhatsApp nesse momento (dentro da janela de 24h, ou precisa de template aprovado)?
8. Existe opt-in quando necessário?

Nunca enviar mensagem duplicada. Nunca continuar uma sequência após pedido de parada — isso é reforçado tanto em `commercial_blocklist` quanto deve ser checado no código do job, não só no banco.
