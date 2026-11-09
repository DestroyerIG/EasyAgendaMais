# Recebimentos automáticos pela InfinitePay: design

Data: 09/11/2026. Segue o design do Mercado Pago (`2026-11-05-recebimentos-mercado-pago-design.md`), que continua valendo onde este documento não diz o contrário.

Decisões do dono na conversa:
- a InfinitePay é opcional, para o profissional que quiser;
- é aceitável que o cliente sempre saia para a página da InfinitePay e possa escolher cartão parcelado, sem como bloquear.

As decisões marcadas como "escolha do Claude" estão abertas à revisão.

## Por quê

Muitos profissionais de beleza já recebem pela maquininha da InfinitePay e não querem abrir conta no Mercado Pago. Com a InfinitePay conectada, o sinal confirma a reserva sozinho, igual ao Mercado Pago, e o dinheiro cai direto na conta do profissional.

## Como a InfinitePay funciona (documentação lida em 09/11/2026)

Fontes: https://www.infinitepay.io/checkout-documentacao e o artigo de ajuda "Como usar o Checkout Integrado da InfinitePay".

- **Conexão:** não há OAuth nem aplicação de parceiro. O profissional liga "Habilitar checkout integrado" no app ou no site da InfinitePay e gera uma **chave de API** (`inchk_...`, mostrada uma vez, até 5 ativas). A chave vai no cabeçalho `X-Api-Key`. A **InfiniteTag** (`handle`, sem o `$`) identifica a conta. Se a chave e o handle forem de contas diferentes, a API responde 403.
- **Criar link:** `POST https://api.checkout.infinitepay.io/links`, com:
  - `items` (`quantity`, `price` em centavos, `description`);
  - `order_nsu` (nosso id);
  - `redirect_url`;
  - `webhook_url`;
  - `customer` (opcional);
  - `options`, que exige a chave: `valid_until` (ISO 8601), `single_payment`, `assured_installments` e `payment_methods_enabled`.

  A resposta traz `url`. O `slug` não vem na criação.
- **Não devolve código Pix.** O cliente paga na página da InfinitePay.
- **Não dá para desligar o cartão.** O cartão aceita até 12x. `payment_methods_enabled` só tira o Pix.
- **Webhook:** é definido por link e **não tem assinatura**. O corpo traz:
  - `invoice_slug`, `transaction_nsu`, `order_nsu`;
  - `amount`, `paid_amount`, `installments`;
  - `capture_method` (`pix` ou `credit_card`), `receipt_url` e `items`.

  Qualquer resposta que não seja 2xx faz a InfinitePay tentar de novo. A documentação recomenda responder 400 em caso de erro.
- **Conferir:** `POST https://api.checkout.infinitepay.io/payment_check` com `handle`, `order_nsu`, `transaction_nsu` e `slug`.
  - A resposta é `{ success, paid, amount, paid_amount, installments, capture_method }`.
  - Dados que não batem devolvem 200 com `paid: false`.
  - **Não existe busca só por `order_nsu`.**
- **Volta do cliente:** a `redirect_url` recebe `order_nsu`, `slug`, `transaction_nsu`, `capture_method` e `receipt_url` na query.
- **Devolução:** não existe pela API. É feita só no app.
- **Teste:** não há ambiente de teste. O mínimo é R$ 1,00, com pagamento real devolvido depois.

Pontos que a documentação não confirma e que precisam ser checados no teste real:
- o corpo completo da resposta de `/links`;
- se `X-Api-Key` é obrigatório em `/payment_check`;
- o corpo do webhook em eventos diferentes de pago;
- quantas vezes e em que intervalo o webhook é repetido.

## Objetivos

1. O profissional conecta a InfinitePay sozinho, colando a InfiniteTag e a chave, sem suporte.
2. Um sinal pago confirma a reserva sem ação humana, e o cliente vê a confirmação ao voltar.
3. Uma falha da InfinitePay nunca impede a reserva: o sistema volta para a chave Pix e a confirmação manual, como no Mercado Pago.
4. O Mercado Pago continua funcionando igual.

## Fora do escopo

- Devolução automática, porque não existe na API.
- Bloquear o cartão ou o parcelamento, porque a InfinitePay não deixa.
- Clube e pacotes.
- Ter Mercado Pago e InfinitePay conectados ao mesmo tempo. Continua um gateway por negócio.

## Anti-objetivos

- Confirmar reserva por aviso falso: todo aviso e toda volta passam pelo `payment_check` com a chave do negócio.
- A chave de API aparecer em tela, log ou resposta de API depois de colada.
- O profissional achar que a InfinitePay oferece só Pix: a tela diz antes de conectar que o cliente pode pagar com cartão parcelado.

## Como funciona para o profissional

### Tela de passos da InfinitePay

Hoje a InfinitePay aparece como "Em breve" e passa a ficar disponível. Na tela própria, com a logo no topo, aparecem estes passos:

1. **Tenha uma conta na InfinitePay.** Links para entrar e para criar conta.
2. **Ligue o Checkout integrado.** No app ou no site da InfinitePay, em Configurações › Checkout, ligue "Habilitar checkout integrado".
3. **Gere uma chave de API.** No mesmo lugar, crie uma chave e copie na hora, porque ela só aparece uma vez.
4. **Cole aqui.** Campos "InfiniteTag" (aceita com ou sem `$`) e "Chave de API", com o botão "Conectar".
5. **Pronto.** A tela mostra a InfiniteTag conectada e avisa que os novos sinais serão confirmados sozinhos.

Antes de conectar, a tela avisa:
- As taxas são as do link de pagamento da InfinitePay e saem do valor do sinal.
- O cliente escolhe na página da InfinitePay entre Pix e cartão, em até 12x. Os juros do parcelamento ficam com o cliente.
- No cartão, o cliente pode contestar a compra no banco.
- A devolução do sinal é feita no app da InfinitePay.

O botão Conectar exige um aceite desses avisos, que é o mesmo aceite do cartão no Mercado Pago (`aceite_cartao_em`).

Não há a escolha "Pix / cartão" da tela do Mercado Pago, porque a InfinitePay não deixa escolher.

### Ao conectar

O backend confere a chave antes de salvar.

- **Escolha do Claude:** a conferência é um `payment_check` com o handle, a chave e dados inexistentes.
  - 403 significa chave e InfiniteTag de contas diferentes.
  - 401 significa chave inválida.
  - O erro `external_checkout_not_enabled` significa que o Checkout integrado está desligado.
  - Uma resposta 200 com `paid: false` significa que a chave vale.
  - Cada caso mostra uma mensagem em português. Se a conferência não funcionar assim no teste real, o construtor pode criar um link de R$ 1,00 com `valid_until` de poucos minutos, que nunca é pago.
- O handle vira a conta externa (`conta_externa_id`), e a InfiniteTag com `$` vira o nome mostrado. A mesma InfiniteTag não conecta dois negócios, como já acontece com a conta do Mercado Pago.
- Depois de conectar, roda a mesma conferência de cobranças da reconexão do Mercado Pago.

### Depois de conectar

A tela fica igual à do Mercado Pago: conta conectada, última confirmação automática e Desconectar.

Se a InfinitePay recusar a chave (401 ou 403 numa conferência), a conexão vai para "Reconectar", e o sino avisa com o texto da InfinitePay. Para reconectar, o profissional cola uma chave nova.

## Como funciona para o cliente final

- Na etapa de pagamento, o cliente vê um único botão: **"Pagar o sinal na InfinitePay (Pix ou cartão)"**, sem escolha de forma.
- A reserva é criada, e o cliente vai para a página da InfinitePay pelo mesmo caminho do Checkout de cartão do Mercado Pago.
- A InfinitePay não manda mensagem de sinal pelo WhatsApp, como o cartão do Mercado Pago.
- Abaixo do botão fica o botão de reserva **"Pagar com Pix direto ao estabelecimento"**: Pix manual pela chave do negócio, com confirmação manual.
- Ao voltar, o cliente vê a situação real da reserva, como acontece hoje na volta do cartão.

## Como o sistema confirma

### Criação do link

- **`order_nsu`:** o id da cobrança.
- **`items`:** um item com o valor do sinal em centavos e a descrição atual da cobrança.
- **`redirect_url`:** a mesma volta do cartão do Mercado Pago (`/agendar/<slug>?reserva=<id>&retorno=...`). A InfinitePay acrescenta os próprios parâmetros.
- **`webhook_url`:** `<backend>/api/v1/recebimentos/webhook/infinitepay/<id da cobrança>`.
- **`options`:**
  - `valid_until` = vencimento da reserva;
  - `single_payment: true`;
  - `assured_installments: 0`.

Guardamos a `url` em `checkout_url` e o id da cobrança (o `order_nsu`) em `id_externo`. Com isso, a cobrança aparece na página como já acontece com o Checkout.

### Dois caminhos, uma conferência

Os dois caminhos levam à mesma conferência, com o `slug` e o `transaction_nsu` que chegaram:

1. **Webhook:** o id da cobrança vem na URL. O backend confere se o `order_nsu` do corpo é igual a ele.
2. **Volta do cliente:** a página pública manda ao backend o `slug`, o `transaction_nsu` e o `order_nsu` da query, por um endpoint público com limite de chamadas.

**Nada que chega por esses caminhos é gravado antes de conferido** (escolha do Claude). O webhook não tem assinatura, e o cliente conhece o id da cobrança. Gravar antes da conferência deixaria qualquer pessoa trocar o par verdadeiro por um falso. Só depois de o `payment_check` responder `paid: true` com o `order_nsu` certo, o `transaction_nsu` vai para `pagamento_externo_id`. O `slug` não é guardado: nada mais consulta a InfinitePay depois do pagamento, e `id_externo` continua com o id da cobrança.

**A rotina de cada minuto não confere cobranças da InfinitePay**, porque sem o par não há o que consultar. A garantia contra aviso perdido é a própria InfinitePay repetir o webhook até receber 2xx. O cliente também pode recarregar a volta. Se nada disso funcionar, a cobrança vence como hoje, e o profissional confirma à mão na aba Aguardando Pix.

A conferência é um `payment_check` com a chave do negócio. O resultado vira um `PagamentoGateway`, e as regras de decisão atuais (`decidirPagamento`) continuam valendo:
- `paid: true` vira `status: 'approved'`;
- `paid: false` vira `pending`;
- o valor considerado é `amount`, não `paid_amount`, porque o `paid_amount` pode incluir os juros pagos pelo cliente;
- `capture_method` vira `formaPaga`: `pix` vira `pix` e `credit_card` vira `credito`.

Assim, pago depois do vencimento, pago em dobro e reativação seguem as mesmas regras do Mercado Pago.

### Respostas ao webhook

- A cobrança não existe, é de outro gateway ou o `order_nsu` não bate: responde 200 e ignora, para a InfinitePay não insistir.
- O `payment_check` respondeu `paid: false`: responde 200 e não grava nada.
- A cobrança já estava paga, ou a confirmação foi aplicada: responde 200.
- Nos outros casos, responde 400, para ela tentar de novo. Isso cobre a InfinitePay fora do ar ou recusando a conferência, o negócio sem chave utilizável (precisa reconectar, chave trocada, `BACKEND_URL` ausente) e qualquer erro inesperado, inclusive do banco. Assim o pagamento não se perde enquanto o problema é resolvido.

### Banco

Não precisa de migração. O `order_nsu` não precisa ser guardado, porque é o próprio id da cobrança. Até a confirmação, `id_externo` fica com o id da cobrança, para a página saber que existe link para pagar. Depois de pago, continua com o id da cobrança, porque o `slug` não é guardado; só o `pagamento_externo_id` recebe o `transaction_nsu`.

### Endereço público do backend

A `webhook_url` precisa do endereço público do backend. Hoje nenhuma variável traz isso sozinha, então entra uma variável nova, `BACKEND_URL` (ex.: `https://easybarber-backend.onrender.com`, sem barra no final). Essa é a escolha do Claude. A InfinitePay só aparece como disponível com `RECEBIMENTOS_TOKEN_KEY` e `BACKEND_URL` preenchidas. A `BACKEND_WEBHOOK_BASE_URL` do WhatsApp não é reaproveitada, para não amarrar os recebimentos ao WhatsApp.

### Chave revogada

A InfinitePay não tem um endereço fixo que mostre a conta, como o `/users/me` do Mercado Pago. Para ela, `acessoRevogado` é o mesmo `payment_check` com dados inexistentes usado ao conectar: 401 ou 403 provam que a chave caiu (escolha do Claude). Se o teste real mostrar que o `payment_check` não exige a chave, a prova passa a ser um 401 ou 403 ao **criar o link**, porque a criação com `options` exige a chave. O construtor confere isso no teste real e registra o resultado no guia.

## Mudanças no código (o construtor decide os detalhes)

- **`recebimentosConfigurado()`:** passa a valer por gateway.
  - A InfinitePay precisa de `RECEBIMENTOS_TOKEN_KEY` e `BACKEND_URL`.
  - O Mercado Pago continua precisando das quatro variáveis.
  - A seção Recebimentos aparece se algum gateway estiver disponível.
- **Interface `Gateway`:** separar a parte de OAuth (`urlAutorizacao`, `trocarCodigo`, `renovar`) da parte de cobrança.
  - A InfinitePay implementa: criar o link, conferir o pagamento e conferir a chave.
  - `GatewayId` passa a ser `'mercadopago' | 'infinitepay'`.
- **Conexão por chave:**
  - Novo `POST /:gateway/chave` (só `tenant_admin`), com `handle`, `chave` e o aceite.
  - A chave é guardada cifrada em `access_token_cifrado`.
  - `refresh_token_cifrado` recebe um valor vazio cifrado.
  - `token_expira_em` recebe uma data muito distante, para a renovação nunca rodar.
- **Formas:** para a InfinitePay, `formas()` devolve uma forma que represente "link" (ou o caminho do cartão com outro rótulo, como o construtor achar mais limpo). A cobrança guarda em `forma_paga` a forma realmente usada.
- **Caixa:** o Caixa mostra o sinal como Pix ou cartão, conforme `forma_paga`.
- **Textos que falam "Mercado Pago"** em alertas e no sino passam a usar o nome do gateway conectado.
- **Página pública:** o botão único, o envio dos parâmetros da volta e o link no WhatsApp.
- **Tela de Ajustes:**
  - o catálogo da InfinitePay sai de "em breve";
  - a tela de passos ganha os campos da chave;
  - o tipo de conexão (`conexao: 'usuario'`) passa a ser `'chave'`.
- **Testes:** os mesmos tipos de teste do Mercado Pago, com `fetch` simulado. Cobrir:
  - criação do link;
  - webhook com `order_nsu` trocado;
  - `paid: false`;
  - 403 na conexão;
  - volta do cliente;
  - par falso no webhook e na volta, que não pode gravar nada;
  - rotina de cada minuto ignorando cobranças da InfinitePay.

## Teste real (depois do merge)

Com um negócio de teste e uma conta InfinitePay real:
1. Conecte a conta.
2. Faça uma reserva com sinal de R$ 1,00 e pague com Pix.
3. Faça outra reserva e pague com cartão.
4. Confira, em cada uma:
   - a reserva confirmou sozinha;
   - o Caixa mostra a forma certa;
   - a volta para a página funcionou.
5. Feche a página antes de voltar e confira que o webhook confirmou sozinho.
6. Devolva os valores pelo app.

Os pontos marcados como "não confirmados" na seção da documentação são checados aqui.

## Limites desta versão

- Se todas as repetições do webhook e a volta do cliente falharem, a reserva não confirma sozinha: a InfinitePay não deixa procurar o pagamento só pelo número da reserva.
- Implantação: criar `BACKEND_URL` no Render.
- Devolução e contestação não geram alerta no sino, porque a InfinitePay não as informa de forma conferível (escolha do Claude).
- O cliente sempre pode pagar com cartão parcelado.
