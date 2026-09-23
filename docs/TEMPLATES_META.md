# Templates para aprovar na Meta

Os avisos são enviados fora da janela de 24h, então precisam de template aprovado. Para criar: WhatsApp Manager → Modelos de mensagem → Criar, com idioma **Português (BR)**. Os nomes têm que ser **exatamente** os abaixo (ou ajuste as variáveis `WA_TEMPLATE_*`). Depois que a Meta aprovar, atualize `templates.approval_status` para `approved`.

## 1. `koala_viagem_1_semana` (categoria: Utilidade)

```
Oi, {{1}}! 🐨✈️
Falta só 1 semana pra sua viagem para {{2}}! Embarque em {{3}}.
Separe passaportes, vistos e vouchers, e confira se está tudo certo com a sua documentação.
Qualquer dúvida, é só chamar a gente por aqui. Boa viagem! 💛
Equipe Koala Turismo
```
Exemplos para a Meta: `{{1}}` = João · `{{2}}` = Orlando / Disney · `{{3}}` = 15/01/2027

## 2. `koala_passaporte_vencendo` (categoria: Utilidade)

```
Oi, {{1}}! 🐨
O passaporte de {{2}} vence em {{3}}.
Pra não ter surpresa na próxima viagem, vale já programar a renovação.
Qualquer dúvida sobre documentação, é só chamar a gente por aqui.
Equipe Koala Turismo
```
Exemplos: João · Maria · 10/03/2027

## 3. `koala_visto_vencendo` (categoria: Marketing)

```
Oi, {{1}}! 🐨
O visto americano de {{2}} vence em {{3}}.
A renovação no Brasil pode levar meses, então o ideal é começar já.
A Koala faz toda a consultoria do seu visto 🇺🇸 Quer ajuda?
```
**Botão:** Resposta rápida → `Quero renovar`
Exemplos: João · Maria · 10/03/2027

> Esse template é "Marketing" porque oferece um serviço. A Meta pode reclassificar as categorias. Se o de passaporte for reclassificado para Marketing, ele continua funcionando, só muda o preço por envio.
