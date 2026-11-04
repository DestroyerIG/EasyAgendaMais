# Conferência do Checkout Asaas recorrente no sandbox

**Data:** 03/11/2026.
**Ambiente:** sandbox (`https://api-sandbox.asaas.com/v3`), com a conta de testes do dono.
**Cartão:** `4444 4444 4444 4444`, o cartão de teste do Asaas.
**Origem:** Task 1 do plano `docs/superpowers/plans/2026-11-03-asaas-unico.md`.

## Resultado

| Pergunta | Resposta |
|---|---|
| (a) O checkout recorrente com `nextDueDate` daqui a 14 dias cobra na hora? | **Não.** Depois do pagamento na página, a assinatura nasce `ACTIVE`, e a primeira cobrança fica `PENDING` com `dueDate` = o `nextDueDate` pedido. O `nextDueDate` da assinatura avança para o mês seguinte, porque a primeira cobrança já foi gerada |
| (b) Quais webhooks chegam? | Não conferido: não há endpoint público no sandbox. O que dá para afirmar pela API: a cobrança gerada traz `subscription`, `checkoutSession` e `billingType: 'CREDIT_CARD'`. Por isso o vínculo não depende de evento de checkout, e sim da cobrança (`PAYMENT_CREATED` e as seguintes) |
| (c) O `externalReference` do checkout passa para a assinatura e as cobranças? | **Não.** Os dois vêm com `externalReference: null`. O que liga tudo é o `checkoutSession` (o id do checkout), presente na assinatura e na cobrança |
| (d) Dá para mudar `value` e `nextDueDate` da assinatura? | **Sim, no sandbox.** `PUT /subscriptions/{id}` com `value` e com `nextDueDate`, ambos com `updatePendingPayments: false`. A documentação diz que em produção isso exige a **tokenização habilitada** na conta |
| (e) Desconto só na primeira cobrança? | **Sim.** `PUT /payments/{id}` com `value` (e `dueDate`) muda só aquela cobrança pendente |
| (f) Pagar com outro cartão troca o cartão salvo? | Não conferido. O botão não promete troca do cartão salvo: o texto fica "Pagar a fatura com outro cartão" (spec, risco 2) |
| Extra: cancelar | `DELETE /subscriptions/{id}` remove a assinatura **e a cobrança pendente** (`deleted: true`). Quem cancela no teste não é cobrado |
| Extra: restaurar | `POST /subscriptions/{id}/restore` **não existe** (404). O `asaasService.reactivateSubscription` atual usa esse caminho e não funciona para assinatura |
| Extra: reativar sem digitar o cartão | **Funciona** com `POST /subscriptions` usando o `creditCardToken` que a assinatura devolve em `creditCard.creditCardToken`, com `nextDueDate` futuro. Ela nasce `ACTIVE`, com a cobrança `PENDING` e o `externalReference` mantido. Em produção, depende da tokenização habilitada |
| Extra: cliente já cadastrado | Checkout com `customer` exige `phone`, `address`, `addressNumber`, `postalCode`, `province` e `city` do cliente. **Sem `customer`, a página do Asaas pede os dados**, e o Asaas cria um cliente novo |
| Extra: cartão na assinatura | A assinatura devolve `creditCard: { creditCardNumber: '4444' (final), creditCardBrand: 'VISA', creditCardToken }` |

## Consequências para o plano

1. **O checkout vai sem `customer`.** O cliente do Asaas passa a ser o que a cobrança traz (`payment.customer`) e é gravado no negócio quando chega.
2. **O vínculo é pelo id do checkout:**
   - ao criar o checkout, grava `businesses.metadata.checkoutCartao = { id, plano, criadoEm }`;
   - no webhook, a cobrança com `checkoutSession` acha o negócio por esse id;
   - as cobranças seguintes acham pelo `provider_subscription_id`.
3. **Teste com cartão:**
   - a primeira cobrança (`PAYMENT_CREATED`, cartão, com `checkoutSession`) liga o cartão e grava a assinatura e o fim do teste = `dueDate`;
   - o webhook não precisa de evento de checkout.
4. **Reativar no cartão** cria uma assinatura nova com o `creditCardToken` guardado em `businesses.metadata.cartao = { token, bandeira, final }`, e não usa `restore`.
5. **Estender o teste com cartão (SuperAdmin):**
   - `PUT /payments/{id}` com o novo `dueDate` na cobrança pendente;
   - `PUT /subscriptions/{id}` com o `nextDueDate` seguinte.
6. **Desconto da primeira mensalidade:** `PUT /payments/{id}` com o valor descontado, na primeira cobrança.
7. **Antes do deploy:** o dono pede ao Asaas a **tokenização habilitada na conta de produção**. Sem ela, reativar, estender o teste e o downgrade no cartão podem falhar em produção. Isso entra no roteiro de deploy.
