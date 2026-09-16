# Automações e handoff humano

Status: **PENDENTE DE IMPLEMENTAÇÃO** (Sprint 8) — este documento registra as regras já decididas no briefing, para orientar a implementação futura.

## Princípio

IA como copiloto comercial, não como vendedor autônomo. Toda automação relevante para venda passa por aprovação humana por padrão (`automation_rules.requires_human_approval = true`).

## Classificação automática de assunto (`messages.detected_topic`)

DISNEY, UNIVERSAL, ORLANDO, CORRIDA, RUNDISNEY, PASSAGEM, HOTEL, CRUZEIRO, VISTO, PASSAPORTE, DHL, SEGURO, CARRO, PACOTE, FINANCEIRO, SUPORTE, OUTROS — usado para roteamento automático ao responsável correto por assunto.

## Automações básicas planejadas

- Saudação simples em "oi"/primeira mensagem — opcional, configurável, OFF por padrão
- Resposta a pergunta de horário de funcionamento — automatizável
- Pedido de orçamento → **não fechar sozinho**: coletar destino/data aproximada/quantidade de pessoas, criar lead no CRM, transferir para atendimento

## Handoff humano obrigatório (`conversations.human_handoff_required = true`)

Gatilhos: reclamação, cliente irritado, problema financeiro, chargeback, cancelamento, alteração de viagem, emergência, problema durante a viagem, pedido de desconto, negociação, pagamento, documentação sensível, informação jurídica, situação migratória complexa.

Quando disparado: automação para imediatamente, conversa marcada, responsável notificado.

## Sugestão de resposta da IA

Toda sugestão aparece como "Sugestão Claude" com três ações: USAR / EDITAR / DESCARTAR. Para assuntos comerciais importantes, aprovação humana é obrigatória antes do envio — sem exceção no MVP.
