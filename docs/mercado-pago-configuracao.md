# Configurar o Mercado Pago (recebimentos automáticos)

Passo a passo para ligar os recebimentos automáticos do sinal. Sem esta configuração, a seção "Recebimentos" em Ajustes não aparece e o sinal segue pela chave Pix do negócio, com confirmação manual. Nada quebra.

## Quem faz o quê

- **EasyAgenda+ (uma vez só):** cria uma aplicação no Mercado Pago, na conta da EasyAgenda+, e coloca as credenciais dela no Render (passos 1 a 4). A aplicação só pede autorização em nome dos negócios. O dinheiro dos negócios não passa por ela.
- **Cada negócio:** em Ajustes › Recebimentos › Mercado Pago, clica em **Conectar**, entra na própria conta do Mercado Pago e autoriza. Não digita chave, token nem código. O sinal cai direto na conta do negócio, e as taxas do Mercado Pago saem do valor do sinal.

Neste guia, `<backend>` é o endereço do backend, sem barra no final. Hoje é `https://easybarber-backend.onrender.com`.

Os nomes dos menus podem mudar no painel do Mercado Pago. Procure pelo equivalente.

## Ordem de implantação

> **Aplique a migração `20261108120000_recebimentos` ANTES do deploy do backend.**
>
> A rotina que expira reservas consulta a tabela nova em toda reserva, com ou sem gateway conectado. Sem a migração, **nenhuma reserva expira** e a página pública para de acompanhar a reserva.

Em produção, a migração foi aplicada em 07/11/2026, antes do deploy. Este aviso vale para um banco novo (outro ambiente ou restauração).

## 1. Criar a aplicação no Mercado Pago

1. Entre em https://www.mercadopago.com.br/developers/panel com a conta da EasyAgenda+.
2. Abra **Suas integrações** e clique em **Criar aplicação**. Dê o nome `EasyAgenda+`.
3. Quando o painel perguntar qual API ou produto vai usar, escolha **API de Orders** (Checkout API via Orders). O Pix da reserva é criado por ela. O cartão usa o Checkout Pro, que funciona com as mesmas credenciais, sem marcar nada a mais.
4. Em **Dados da aplicação**, responda:

   | Pergunta | Resposta |
   |---|---|
   | Quantas marcas usarão a integração? | **Várias marcas** (cada negócio vende com o próprio nome) |
   | Em quantos países realizará transações? | **Um país** |
   | Quantas contas Mercado Pago usará? | **Várias contas por país** (cada negócio conecta a dele) |

5. Em **Outras funcionalidades**, marque só **Sítios**. Deixe **App iOS**, **App Android** e **Protocolo de segurança 3DS** desmarcados: não há app, e o cartão é pago dentro do Checkout do Mercado Pago, que cuida da segurança.
6. Em **Configurações da aplicação**, na parte de OAuth:
   - ligue o **OAuth** (autorização de contas de terceiros);
   - ligue o **PKCE**. O sistema sempre manda a autorização com PKCE. Sem ele ligado, o Conectar mostra `{"error":"Invalid request parameters"}`;
   - preencha a **URL de retorno** (redirect URI):

     `<backend>/api/v1/recebimentos/mercadopago/callback`

     Ela precisa ser igual, letra por letra, ao valor de `MERCADOPAGO_REDIRECT_URI` no passo 3.
7. Em **Credenciais de produção**, guarde o **Client ID** e o **Client Secret**. Não envie o Client Secret por chat, e-mail nem repositório.

As **credenciais de teste** pertencem a uma conta de teste separada, criada pelo Mercado Pago. Por isso o número dentro do token de teste é diferente do de produção. Isso é normal.

## 2. Configurar o webhook

O Mercado Pago tem um único webhook por aplicação. Ele serve a todos os negócios conectados.

1. Na aplicação, abra **Webhooks** (ou **Notificações**) e escolha a configuração de **produção**.
2. **URL de produção:**

   `<backend>/api/v1/recebimentos/webhook/mercadopago`

3. **Eventos:** marque **Order (Mercado Pago)** e **Pagamentos (legacy)**. O primeiro confirma o Pix. O segundo confirma o cartão e traz devolução e contestação.
4. Salve. Se o painel tiver botão de teste, use: o backend responde 200.

O painel também gera uma **assinatura secreta**. Não é preciso copiá-la nem colocá-la no Render: o backend não confia no corpo do aviso e consulta o pagamento no Mercado Pago, com o acesso do negócio, antes de confirmar qualquer reserva.

## 3. Variáveis no Render

No serviço do backend, em **Environment**, crie as quatro:

| Variável | Valor |
|---|---|
| `MERCADOPAGO_CLIENT_ID` | Client ID de produção (passo 1.7) |
| `MERCADOPAGO_CLIENT_SECRET` | Client Secret de produção (passo 1.7) |
| `MERCADOPAGO_REDIRECT_URI` | `<backend>/api/v1/recebimentos/mercadopago/callback` (igual ao cadastrado no Mercado Pago) |
| `RECEBIMENTOS_TOKEN_KEY` | Chave de 32 bytes, em base64, para cifrar os acessos guardados |

Para gerar a chave, rode uma vez, em qualquer computador com Node:

```
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Cole o resultado no Render, com o `=` do final, e guarde uma cópia num cofre de senhas.

> **Não troque `RECEBIMENTOS_TOKEN_KEY` depois que houver contas conectadas.** Os acessos guardados deixam de abrir, e todos os negócios precisam reconectar.

Confira também que `FRONTEND_URL` começa com `https://`. Sem o protocolo, a volta do Checkout e o endereço técnico do pagador saem errados.

Salve e espere o Render reiniciar. A seção "Recebimentos" passa a aparecer em Ajustes para quem é administrador do negócio.

## 4. Ativar a aplicação no Mercado Pago

Uma aplicação nova ainda não pode receber autorização de outras contas. Até ser ativada, o Conectar mostra **"O aplicativo não está pronto para se conectar a Mercado Pago"**. O painel pede duas provas de que a integração funciona.

### 4.1 Order ID de teste

O painel pede o **Order ID** de uma cobrança feita com as **credenciais de teste** nos últimos 7 dias. Crie uma pela mesma API que o sistema usa, com o **Access Token de teste** da aplicação:

```
curl -X POST https://api.mercadopago.com/v1/orders \
  -H "Authorization: Bearer <ACCESS_TOKEN_DE_TESTE>" \
  -H "Content-Type: application/json" \
  -H "X-Idempotency-Key: ativacao-teste-1" \
  -d '{"type":"online","processing_mode":"automatic","total_amount":"1.00","external_reference":"ativacao-teste-1","description":"Teste EasyAgenda+","payer":{"email":"test@testuser.com"},"transactions":{"payments":[{"amount":"1.00","payment_method":{"id":"pix","type":"bank_transfer"},"expiration_time":"PT30M"}]}}'
```

A resposta traz um `id` que começa com `ORDTST`. Cole esse número no campo do painel. A cobrança não precisa ser paga.

### 4.2 Pagamento real

O painel pede que a aplicação **receba um pagamento de produção**. Crie uma cobrança Pix de R$ 1,00 com o **Access Token de produção** (o mesmo comando, trocando o token e o `X-Idempotency-Key`/`external_reference` por outro valor, por exemplo `ativacao-producao-1`). A resposta traz o `id` (começa com `ORD`) e o código Pix copia e cola em `transactions.payments[0].payment_method.qr_code`.

- Pague o Pix pelo app de **outro banco**. A própria conta da EasyAgenda+ não paga para ela mesma.
- Para conferir que foi aprovado: `GET https://api.mercadopago.com/v1/orders/<id>` com o mesmo token. O `status` deve ser `processed` e o `status_detail`, `accredited`.
- O R$ 1,00 cai na conta da EasyAgenda+. Se quiser, devolva pelo painel.

Depois do pagamento, o Mercado Pago leva **até 24 horas** para identificar o pagamento e marcar a integração como pronta.

O Access Token de produção dá acesso à conta da EasyAgenda+. Use-o só no seu computador, não o cole em chat nem em arquivo do repositório. Se ele ou o de teste vazarem, gere outros no painel.

## 5. Teste real com valor baixo

Com a aplicação ativada, teste com um negócio seu e um sinal pequeno (por exemplo, R$ 1,00) antes de avisar os clientes.

Use uma conta do Mercado Pago **diferente da conta dona da aplicação**, com uma chave Pix cadastrada. O Mercado Pago pode não deixar a aplicação conectar à própria conta dona, e cada conta conecta um negócio só. Use uma janela anônima se precisar trocar de conta. Pague as reservas de teste de outro banco ou de outra conta.

1. Em Ajustes › Recebimentos › Mercado Pago, clique em **Conectar**.
2. Faça uma reserva pública paga com **Pix** e outra com **cartão**.
3. Confira:
   - **Autorização:** a tela do Mercado Pago abre, você autoriza e volta para a tela de passos mostrando a conta conectada.
   - **Aviso de conta conectada:** o Pix confirma a reserva na hora, sem clicar em nada. Se demorar até um minuto, o aviso não chegou e a rotina de cada minuto é que confirmou. Anote qual dos dois aconteceu.
   - **Confirmação:** a página pública mostra a reserva confirmada, e o negócio recebe o WhatsApp e o aviso de sempre.
   - **Débito no Checkout:** o Checkout aceita cartão de débito e não oferece boleto, Pix nem parcelamento.
   - **Endereço técnico do pagador:** o Pix é aceito. A reserva não pede e-mail, então o sistema envia ao Mercado Pago `reserva-<id da cobrança>@<domínio do FRONTEND_URL>`. Se o Mercado Pago recusar (erro ou bloqueio antifraude), **pare**. A decisão de pedir o e-mail do cliente na reserva volta ao dono.
   - **Caixa:** os dois sinais aparecem no Caixa, um como Pix e outro como **Sinal cartão**.
4. Devolva os valores do teste pelo painel do Mercado Pago. A devolução não é automática.
5. Confira que a devolução gerou o alerta de devolução no sino do negócio. Devolução e contestação só chegam pelo aviso do Mercado Pago: se o alerta não aparecer, o aviso de conta conectada não está chegando.

Com tudo certo, avise os negócios que eles já podem conectar a conta deles em Ajustes.

## 6. Problemas comuns

| O que aparece | Causa provável |
|---|---|
| `{"error":"Invalid request parameters"}` ao clicar em Conectar | PKCE desligado na aplicação (passo 1.6), URL de retorno diferente de `MERCADOPAGO_REDIRECT_URI`, ou `MERCADOPAGO_CLIENT_ID` errado (tem que ser o Client ID de produção, não a Public Key nem o Access Token) |
| "O aplicativo não está pronto para se conectar a Mercado Pago" | Aplicação ainda não ativada: faltam o Order ID de teste, o pagamento real ou as 24 horas do passo 4 |
| Seção "Recebimentos" não aparece em Ajustes | Alguma das quatro variáveis do passo 3 falta no Render, ou o Render ainda não reiniciou |
| Reserva só confirma depois de até um minuto | O webhook não está chegando: confira a URL e os eventos do passo 2 |

## 7. Troca de domínio

Quando o domínio mudar:

1. No Mercado Pago, atualize a **URL de retorno** (passo 1.6) e o **webhook** (passo 2).
2. No Render, atualize `MERCADOPAGO_REDIRECT_URI` e a `FRONTEND_URL`.
3. O endereço técnico do pagador usa o domínio de `FRONTEND_URL`. Confira que ele aponta para o domínio novo e refaça um Pix de teste.
4. As contas já conectadas continuam valendo. Só reconecte quem aparecer com "Reconectar".

## Limites desta versão

- Uma conta do Mercado Pago conecta um negócio só.
- A devolução do sinal é feita à mão, no Mercado Pago.
- O Clube e os pacotes seguem com confirmação manual.
- O backend não confere a assinatura secreta do webhook (não é necessário, ver passo 2).
