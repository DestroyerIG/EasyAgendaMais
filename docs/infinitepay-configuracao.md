# Configurar a InfinitePay (recebimentos automáticos)

Passo a passo para ligar o sinal pela InfinitePay (Pix ou cartão). Sem a configuração do Render, a InfinitePay não aparece em Ajustes › Recebimentos e o sinal segue pela chave Pix do negócio, com confirmação manual. Nada quebra.

## Quem faz o quê

- **EasyAgenda+ (uma vez só):** cria a variável `BACKEND_URL` no Render. Não existe aplicação para cadastrar na InfinitePay: cada negócio usa a própria chave.
- **Cada negócio:** liga o Checkout integrado na InfinitePay, cria uma chave de API e cola a InfiniteTag e a chave em Ajustes › Recebimentos › InfinitePay. O sinal cai direto na conta do negócio, e as taxas da InfinitePay saem do valor recebido.

Neste guia, `<backend>` é o endereço do backend, sem barra no final. Hoje é `https://easybarber-backend.onrender.com`.

Os nomes dos menus podem mudar no app da InfinitePay. Procure pelo equivalente.

## 1. Implantação (EasyAgenda+)

Não há migração de banco.

No serviço do backend, em **Environment**, confira que existem as duas variáveis:

| Variável | Valor |
|---|---|
| `RECEBIMENTOS_TOKEN_KEY` | Já criada para o Mercado Pago. Não troque |
| `BACKEND_URL` | `<backend>`, sem barra no final. Ex.: `https://easybarber-backend.onrender.com` |

A `BACKEND_URL` serve para montar o endereço do aviso de pagamento (webhook) de cada cobrança. Salve e espere o Render reiniciar. A InfinitePay passa a aparecer em Ajustes › Recebimentos para quem é administrador do negócio.

Confira também que `FRONTEND_URL` começa com `https://`, para a volta do cliente funcionar.

## 2. Passo a passo do profissional

Mostre este roteiro ao dono do negócio. Ele segue a tela de Ajustes.

1. No app ou no site da InfinitePay, ative **Habilitar checkout integrado**.
2. Crie uma **chave de API**. Ela começa com `inchk_` e aparece **uma vez só**. Copie na hora.
3. No EasyAgenda+, abra **Ajustes › Recebimentos › InfinitePay**.
4. Cole a **InfiniteTag** (o nome de usuário da conta na InfinitePay) e a **chave**.
5. Leia e aceite os avisos da tela.
6. Clique em **Conectar**.

Um negócio usa **um gateway só**. Se o Mercado Pago estiver conectado, desconecte antes de conectar a InfinitePay.

A tela passa a mostrar a conta conectada e a última confirmação automática. Para sair, use **Desconectar**.

## 3. Como fica para o cliente

- Na etapa de pagamento, o cliente vê o botão **"Pagar o sinal na InfinitePay (Pix ou cartão)"**.
- Ele paga na página da InfinitePay, por Pix ou cartão em até 12 parcelas. Os juros do parcelamento ficam por conta do cliente.
- O link vale até o vencimento da reserva e aceita um pagamento só.
- Abaixo fica o botão **"Pagar com Pix direto ao estabelecimento"**: Pix manual pela chave do negócio, com confirmação manual.
- A InfinitePay não envia mensagem de sinal pelo WhatsApp, como o cartão do Mercado Pago.

## 4. Como a reserva é confirmada

Há dois caminhos. Os dois conferem o pagamento na InfinitePay (`payment_check`) antes de confirmar. Nada é confirmado só porque alguém avisou.

1. **Webhook:** a InfinitePay avisa `<backend>/api/v1/recebimentos/webhook/infinitepay/<id da cobrança>`. O endereço é definido sozinho em cada link. Não há nada para cadastrar no painel.
2. **Volta do cliente:** ao voltar para a página da reserva, a página manda os dados do pagamento ao backend, que confere.

Não existe rotina de cada minuto para a InfinitePay. Se os dois caminhos falharem, a reserva expira e o dono confirma à mão na aba **Aguardando Pix**.

No **Caixa**, o sinal aparece como **Sinal Pix** ou **Sinal cartão**, conforme a forma em que o cliente de fato pagou.

## 5. Chave revogada

Se a InfinitePay recusar a chave (por exemplo, o dono apagou a chave no app), a conexão passa a **Reconectar** e o sino avisa. O dono cria uma chave nova e cola de novo em Ajustes.

## 6. Teste real com valor baixo

Teste com um negócio seu e sinal de R$ 1,00, antes de avisar os clientes. Pague de outra conta ou de outro banco.

1. Conecte a InfinitePay em Ajustes (passo 2).
2. Faça uma reserva pública e pague **R$ 1,00 por Pix**.
3. Faça outra e pague **R$ 1,00 por cartão**.
4. Em uma terceira reserva, abra a página da InfinitePay, pague e **feche a página antes de voltar**. Confira se a reserva confirma sozinha pelo webhook.
5. Confira:
   - a página pública mostra a reserva confirmada e o negócio recebe o aviso de sempre;
   - o **Caixa** mostra um **Sinal Pix** e um **Sinal cartão**;
   - o botão de Pix direto ao estabelecimento continua aparecendo.
6. **Devolva** os valores pelo app da InfinitePay. A devolução não é automática, e o EasyAgenda+ não tem como devolver.

## 7. Problemas comuns

| O que aparece | Causa provável |
|---|---|
| "A InfinitePay recusou a chave. Confira se a chave e a InfiniteTag são da mesma conta." | Chave e InfiniteTag de contas diferentes, chave copiada incompleta ou chave apagada |
| "Ligue o Checkout integrado na InfinitePay e tente de novo." | Falta ligar o **Habilitar checkout integrado** na conta (passo 2.1) |
| "A InfinitePay não respondeu. Tente de novo em alguns minutos." | Instabilidade da InfinitePay. Tentar de novo depois |
| "Esta conta da InfinitePay já está conectada a outro negócio." | Uma conta conecta um negócio só. Desconecte no outro |
| "Desconecte o Mercado Pago antes de conectar a InfinitePay." | Um gateway por negócio |
| InfinitePay não aparece em Ajustes › Recebimentos | Falta `BACKEND_URL` ou `RECEBIMENTOS_TOKEN_KEY` no Render, ou o Render ainda não reiniciou |
| Cliente pagou e a reserva não confirmou | O webhook e a volta falharam e a reserva expirou. Confirme em **Aguardando Pix** depois de ver o pagamento no app da InfinitePay |

## 8. Pontos a confirmar no teste real

Estes itens vieram da documentação da InfinitePay e não foram testados contra a conta real. Anote o resultado aqui.

1. **`payment_check` com pedido inexistente:** responde 200? A conferência da chave ao conectar depende disso. Se responder 4xx, chaves válidas são recusadas ao conectar. **Avise o desenvolvedor.**
2. **`payment_check` exige a chave (`X-Api-Key`)?** Se não exigir, a prova de chave revogada deixa de valer, e passa a ser um 401/403 ao **criar o link**.
3. **Webhook:** qual é o corpo para eventos que não são de pagamento, e qual é a política de reenvio?
4. **Resposta completa de `/links`:** conferir os campos além da `url`.

## 9. Troca de domínio

1. No Render, atualize `BACKEND_URL` e `FRONTEND_URL`.
2. Links já criados mantêm o webhook antigo até vencerem. Refaça um pagamento de teste.
3. As contas conectadas continuam valendo. Só reconecte quem aparecer com "Reconectar".

## Limites desta versão

- Um negócio usa um gateway só (Mercado Pago ou InfinitePay).
- Uma conta da InfinitePay conecta um negócio só.
- A devolução do sinal é feita à mão, no app da InfinitePay.
- O Clube e os pacotes seguem com confirmação manual.
