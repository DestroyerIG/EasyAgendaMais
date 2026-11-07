# Configurar o Mercado Pago (recebimentos automáticos)

Passo a passo para ligar os recebimentos automáticos do sinal. Sem esta configuração, a seção "Recebimentos" em Ajustes não aparece e o sinal segue pela chave Pix do negócio, com confirmação manual. Nada quebra.

Você faz isto uma vez, na conta do Mercado Pago da EasyAgenda+. Depois, cada negócio conecta a própria conta sozinho, pela tela de Ajustes.

Neste guia, `<backend>` é o endereço do backend, sem barra no final.

## Ordem de implantação (leia antes de tudo)

> **Aplique a migração `20261108120000_recebimentos` ANTES do deploy do backend.**
>
> A rotina que expira reservas passou a consultar a tabela nova em toda reserva, com ou sem gateway conectado. Se o código novo subir antes da migração, a consulta falha e **nenhuma reserva expira**. A página pública também para de acompanhar a reserva, porque a consulta da situação lê a mesma tabela.
>
> A migração só acrescenta tabelas e precisa da autorização do dono. Ordem certa: 1) aplicar a migração; 2) conferir o `migrate status`; 3) deploy do backend; 4) deploy do frontend.

Se as variáveis do passo 3 ainda não estiverem no Render, a seção de Recebimentos fica escondida. Mesmo assim, as consultas às tabelas novas continuam rodando na reserva pública. Por isso a migração vem sempre primeiro.

## 1. Criar a aplicação no Mercado Pago

1. Entre em https://www.mercadopago.com.br/developers/panel com a conta da EasyAgenda+.
2. Abra **Suas integrações** e clique em **Criar aplicação**.
3. Dê o nome `EasyAgenda+` e escolha o produto **Checkout Pro**. Aceite os termos.
4. Em **Configurações da aplicação**, ligue o **OAuth** (autorização de contas de terceiros) e preencha a **URL de retorno** (redirect URI):

   `<backend>/api/v1/recebimentos/mercadopago/callback`

   Ela precisa ser igual, letra por letra, ao valor de `MERCADOPAGO_REDIRECT_URI` no passo 3.
5. Guarde o **Client ID** e o **Client Secret** da aplicação. Não envie o Client Secret por chat, e-mail nem repositório.

Os nomes dos menus podem mudar no painel do Mercado Pago. Procure pelo equivalente.

## 2. Configurar o webhook

O Mercado Pago tem um único webhook por aplicação. Ele serve a todos os negócios conectados.

1. Na aplicação, abra **Webhooks** (ou **Notificações**) e escolha a configuração de **produção**.
2. **URL de produção:**

   `<backend>/api/v1/recebimentos/webhook/mercadopago`

3. **Tópicos:** marque `order` e `payment`.
4. Salve. Se o painel tiver botão de teste, use: o backend responde 200.

O backend não confia no corpo do aviso. Ele consulta o pagamento no Mercado Pago antes de confirmar qualquer reserva.

## 3. Variáveis no Render

No serviço do backend, em **Environment**, crie as quatro:

| Variável | Valor |
|---|---|
| `MERCADOPAGO_CLIENT_ID` | Client ID do passo 1.5 |
| `MERCADOPAGO_CLIENT_SECRET` | Client Secret do passo 1.5 |
| `MERCADOPAGO_REDIRECT_URI` | `<backend>/api/v1/recebimentos/mercadopago/callback` (igual ao cadastrado no Mercado Pago) |
| `RECEBIMENTOS_TOKEN_KEY` | Chave de 32 bytes, em base64, para cifrar os acessos guardados |

Para gerar a chave, rode uma vez, em qualquer computador com Node:

```
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Cole o resultado no Render e guarde uma cópia num cofre de senhas.

> **Não troque `RECEBIMENTOS_TOKEN_KEY` depois que houver contas conectadas.** Os acessos guardados deixam de abrir, e todos os negócios precisam reconectar.

Salve e espere o Render reiniciar. A seção "Recebimentos" passa a aparecer em Ajustes para quem é administrador do negócio.

## 4. Teste real com valor baixo

Antes de avisar os clientes, teste com um negócio seu e um sinal pequeno (por exemplo, R$ 1,00). Use sua conta do Mercado Pago, com uma chave Pix cadastrada.

1. Em Ajustes › Recebimentos › Mercado Pago, clique em **Conectar**.
2. Faça uma reserva pública paga com **Pix** e outra com **cartão**.
3. Confira:
   - **Autorização:** a tela do Mercado Pago abre, você autoriza e volta para a tela de passos mostrando a conta conectada.
   - **Aviso de conta conectada:** o Pix confirma a reserva na hora, sem clicar em nada. Se demorar até um minuto, o aviso não chegou e a rotina de cada minuto é que confirmou. Anote qual dos dois aconteceu.
   - **Confirmação:** a página pública mostra a reserva confirmada, e o negócio recebe o WhatsApp e o aviso de sempre.
   - **Débito no Checkout:** o Checkout aceita cartão de débito e não oferece boleto, Pix nem parcelamento.
   - **Endereço técnico do pagador:** o Pix é aceito. A reserva não pede e-mail, então o sistema envia ao Mercado Pago `reserva-<id da cobrança>@<domínio do FRONTEND_URL>`. Se o Mercado Pago recusar (erro ou bloqueio antifraude), **pare**. A decisão de pedir o e-mail do cliente na reserva volta ao dono.
4. Devolva os valores do teste pelo painel do Mercado Pago. A devolução não é automática.
5. Confira que a devolução gerou o alerta de devolução no sino do negócio. Devolução e contestação só chegam pelo aviso do Mercado Pago: se o alerta não aparecer, o aviso de conta conectada não está chegando.
6. Confira no Render que `FRONTEND_URL` começa com `https://`. Sem o protocolo, a volta do Checkout e o endereço técnico do pagador saem errados.

## 5. Troca de domínio

Quando o domínio mudar:

1. No Mercado Pago, atualize a **URL de retorno** (passo 1.4) e o **webhook** (passo 2).
2. No Render, atualize `MERCADOPAGO_REDIRECT_URI` e a `FRONTEND_URL`.
3. O endereço técnico do pagador usa o domínio de `FRONTEND_URL`. Confira que ele aponta para o domínio novo e refaça um Pix de teste.
4. As contas já conectadas continuam valendo. Só reconecte quem aparecer com "Reconectar".

## Limites desta versão

- Uma conta do Mercado Pago conecta um negócio só.
- A devolução do sinal é feita à mão, no Mercado Pago.
- O Clube e os pacotes seguem com confirmação manual.
