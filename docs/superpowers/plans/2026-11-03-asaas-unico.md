# Asaas único e teste de 7 ou 14 dias: plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** a assinatura passa a ser cobrada só pelo Asaas, no Pix ou no cartão (página do Asaas). O Stripe sai do código e do banco, e o teste grátis passa a ser de 7 dias sem cartão ou 14 dias com o cartão cadastrado.

**Architecture:**
- O cartão usa o Checkout Asaas recorrente (`POST /v3/checkouts`), com `nextDueDate` no fim do teste ou hoje.
- O webhook do Asaas, que já trata o Pix, passa a tratar os eventos de checkout e de assinatura e as cobranças de cartão.
- O estado "teste com cartão" usa campos que já existem em `businesses`:
  - `subscription_status = 'trialing'`;
  - `provider = 'asaas'`;
  - `payment_method = 'card'`;
  - `provider_subscription_id`;
  - o fim do teste em `subscription_current_period_end`.
- O Stripe sai por inteiro. A migração que apaga as colunas `stripe_*` e a tabela `subscription_events` é escrita aqui, mas só roda depois do deploy e com autorização do dono.

**Tech Stack:** Express + Prisma (SQL cru com `Prisma.sql`), Vitest + supertest com Prisma mockado, Next.js App Router + Tailwind (tokens do DESIGN.md), Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-11-03-asaas-unico-design.md`

## Global Constraints

- **Banco:** o `backend/.env` aponta para **produção**. Nenhum comando escreve no banco. A migração é criada como arquivo e não roda aqui, e testes usam Prisma mockado.
- **Cartão:** nenhum dado de cartão passa pelo servidor. O cartão é sempre digitado na página do Asaas.
- **Durante o teste ninguém é cobrado.** O teste com cartão cobra no `nextDueDate` = cadastro + 14 dias.
- **Cupom:** vale só na primeira mensalidade, no cartão e no Pix.
- **Teste sem cartão:** 7 dias.
- **Teste com cartão:** 14 dias a partir do **cadastro**. Cartão cadastrado depois do fim dos 7 dias cobra na hora e não estende nada.
- **Contas em teste antes do deploy:** mantêm a data de fim que já têm.
- **Textos:**
  - nenhuma tela cita "Stripe";
  - nenhuma tela promete "14 dias" sem cartão;
  - frase normal, maiúscula só na primeira palavra, PT-BR.
- **Webhook:** idempotente pelo `billing_webhook_events`, como já é hoje.

## Review Focus

1. **Cartão cadastrado no último dia do teste de 7 dias, ou num teste estendido pelo SuperAdmin.**
   - Se o fim atual do teste já for depois de cadastro + 14, ele não pode encurtar.
   - O `nextDueDate` é `max(fim atual do teste, cadastro + 14)`.
   - Teste na Task 3.
2. **Webhook de cobrança de cartão que chega antes do evento de assinatura/checkout** (ordem trocada).
   - O negócio ainda não tem `provider_subscription_id` e precisa ser achado pelo `externalReference` da cobrança ou da assinatura.
   - Teste na Task 4.
3. **Primeira cobrança do cartão recusada no fim do teste.**
   - A conta passa de `trialing` para a contingência da H1, com carência de 7 dias, e não volta para "teste".
   - O "já pagou" continua falso, então o bloqueio final tem `motivo: 'teste'` e não `'cobranca'`. Esse é o comportamento da H1 para quem nunca pagou.
   - Teste na Task 4.
4. **Cancelar no teste com cartão e depois tentar cadastrar o cartão de novo.**
   - Vale a mesma regra: se o teste ainda estiver ativo, `nextDueDate` = fim do teste; nunca uma cobrança na hora durante o teste.
   - Teste na Task 3.
5. **Cupom de 100% no cartão.**
   - Hoje o cupom de 100% ativa sem cobrança (`FREE_ACTIVATION`). No cartão isso continua, sem abrir o checkout.
   - Teste na Task 3.

---

### Task 1: Conferência no sandbox do Asaas (portão)

Este passo decide o resto. **Se o item (a) falhar, pare e volte ao dono.**

**Files:**
- Create: `docs/design/asaas-sandbox-conferencia.md` (o resultado)
- O script fica fora do repositório: `<scratchpad>/asaas-sandbox/conferir.mjs`

**Interfaces:**
- Produces: o documento com as respostas de (a) a (f), com os nomes reais de eventos e campos. As Tasks 3 a 5 usam esses nomes.

- [ ] **Step 1: Pedir ao dono a chave do sandbox do Asaas**
  - O dono cria a conta de sandbox em `https://sandbox.asaas.com`, gera a chave de API e a grava num arquivo fora do repositório, que o script lê (`ASAAS_SANDBOX_API_KEY`).
  - O implementador nunca cria conta nem digita senha.
  - URL da API do sandbox: `https://api-sandbox.asaas.com/v3`.

- [ ] **Step 2: Script de conferência**
  - Cria um cliente.
  - Cria um checkout com `billingTypes: ['CREDIT_CARD']`, `chargeTypes: ['RECURRENT']`, `subscription: { cycle: 'MONTHLY', nextDueDate: <hoje + 14> }`, `items` com o valor do Solo (49,90), `callback` e `externalReference: 'business:<uuid-de-teste>:plan:basico'`.
  - Imprime a URL do checkout.
  - O dono abre a URL e paga com o **cartão de teste do sandbox** (os números de teste estão na documentação do Asaas).

- [ ] **Step 3: Responder, consultando a API e o histórico de webhooks do sandbox:**
  - **(a)** Alguma cobrança foi feita na hora? Qual é o `nextDueDate` da assinatura criada?
  - **(b)** Quais eventos de webhook chegaram (`CHECKOUT_PAID`? `SUBSCRIPTION_CREATED`? `PAYMENT_CREATED`?) e em que ordem?
  - **(c)** O `externalReference` do checkout aparece na assinatura e nas cobranças?
  - **(d)** Dá para mudar `value` e `nextDueDate` dessa assinatura (`PUT /subscriptions/{id}`) sem tokenização?
  - **(e)** Dá para aplicar desconto só na primeira cobrança (`PUT /payments/{id}` com `value` ou `discount`) sem tokenização?
  - **(f)** Pagar uma cobrança da assinatura com outro cartão troca o cartão das próximas?

- [ ] **Step 4: Registrar e commitar**
  - Gravar as respostas, com exemplos de payload sem dados pessoais, em `docs/design/asaas-sandbox-conferencia.md`.
  - Commit: `docs(asaas): conferência do checkout recorrente no sandbox`.

### Task 2: Teste de 7 dias sem cartão e constantes de teste

**Files:**
- Modify: `backend/src/config/trial.ts`, `backend/src/repositories/authRepository.ts:503`, `frontend/src/lib/constants.ts:26-27`, `frontend/src/components/admin/visaoGeral/CartaoTestes.tsx`
- Test: `backend/src/__tests__/trialConfig.test.ts` (create), `frontend/src/lib/__tests__/constants.test.ts` (create or extend)

**Interfaces:**
- Produces (backend `config/trial.ts`):
  - `TESTE_SEM_CARTAO_DIAS = 7`;
  - `TESTE_COM_CARTAO_DIAS = 14`;
  - `fimDoTesteComCartao(criadoEm: Date, fimAtual: Date | null): Date`, que devolve `max(fimAtual, criadoEm + 14 dias)`.
- Produces (frontend `lib/constants.ts`): `TESTE_SEM_CARTAO_DIAS = 7` e `TESTE_COM_CARTAO_DIAS = 14`. `TRIAL_DAYS` sai dos dois lados.

- [ ] **Step 1: Testes que falham**
  - Backend:
    - `fimDoTesteComCartao(new Date('2026-11-01T12:00:00Z'), new Date('2026-11-08T12:00:00Z'))` → `2026-11-15T12:00:00Z`;
    - com `fimAtual` = `2026-11-20T12:00:00Z` → `2026-11-20T12:00:00Z`;
    - com `fimAtual` = `null` → `2026-11-15T12:00:00Z`;
    - o INSERT de cadastro do `authRepository` usa `TESTE_SEM_CARTAO_DIAS` (teste com o `prisma.$queryRaw` mockado, conferindo o valor 7 no SQL gerado).
  - Frontend: lê `backend/src/config/trial.ts` como texto (como o `planCatalog.test.ts` faz com o catálogo, sem import) e confere que os dois números batem.

- [ ] **Step 2: Rodar e ver falhar**
  - Run: `cd backend && npx vitest run src/__tests__/trialConfig.test.ts`
  - Expected: FAIL.

- [ ] **Step 3: Implementar**
  - O cadastro (`authRepository.ts:503`) grava `NOW() + 7 days`.
  - Trocar todo `TRIAL_DAYS` pelo nome novo. Achar os usos com `grep -rn TRIAL_DAYS backend/src frontend/src`.
  - `CartaoTestes.tsx` diz "Contas em período de teste (7 dias sem cartão ou 14 com cartão)".

- [ ] **Step 4: Rodar**
  - Run: `cd backend && npx vitest run && npx tsc --noEmit`; `cd frontend && npx vitest run src/lib src/components/admin && npx tsc --noEmit`
  - Expected: PASS.

- [ ] **Step 5: Commit** `feat(teste): teste grátis de 7 dias sem cartão`

### Task 3: Checkout do cartão no Asaas

**Files:**
- Modify:
  - `backend/src/integrations/asaas/service.ts` (nova função);
  - `backend/src/services/billing/providers/asaasBillingProvider.ts`;
  - `backend/src/services/billing/billingProviderFactory.ts`;
  - `backend/src/services/billingService.ts:403-700` (`createCheckoutSession`).
- Test: `backend/src/__tests__/checkoutCartaoAsaas.test.ts` (create)

**Interfaces:**
- Consumes: `fimDoTesteComCartao` e `TESTE_COM_CARTAO_DIAS` (Task 2); os nomes de campos e eventos de `docs/design/asaas-sandbox-conferencia.md` (Task 1).
- Produces:
  - `asaasService.criarCheckoutCartao(i: { business: BusinessBillingContext; plan: PlanName; valor: number; nextDueDate: Date; urlRetorno: string }): Promise<{ checkoutId: string; url: string }>`;
  - `externalReference` = `business:<id>:plan:<plano>:cartao`. Ele continua compatível com `extractBusinessIdFromExternalReference` e com `resolvePlanFromExternalReference`;
  - `billingProviderFactory`: `card → 'asaas'`, `pix → 'asaas'`. `boleto` sai, e `ProviderName` vira `'asaas'`;
  - `createCheckoutSession` com `paymentMethod: 'card'` devolve `{ provider: 'asaas', formaPagamento: 'card', checkoutUrl: string, cobrancaEm: string /* ISO do nextDueDate */, plan }`. Com cupom de 100% devolve o `FREE_ACTIVATION` de hoje.
  - `nextDueDate`:
    - durante o teste (`subscription_status = 'trialing'` e `subscription_current_period_end > agora`), `fimDoTesteComCartao(created_at, subscription_current_period_end)`;
    - fora do teste, hoje.
  - Cupom: a assinatura usa o valor cheio. O desconto da primeira mensalidade fica em `businesses.metadata.descontoPrimeiraMensalidade = { valor, cupom }`, e a Task 4 aplica na primeira cobrança. Se a Task 1 (e) mostrar que não dá, o desconto vira o caminho alternativo da spec, e a decisão vai para o ledger.

- [ ] **Step 1: Testes que falham** (com `asaasClient.post` mockado)
  - `'cartão no teste cobra no fim do teste'`: negócio `trialing`, criado em 2026-11-01, fim em 2026-11-08, agora 2026-11-03. O POST do checkout recebe `subscription.nextDueDate = '2026-11-15'` e `billingTypes: ['CREDIT_CARD']`, e a resposta traz `cobrancaEm` 2026-11-15.
  - `'cartão depois do teste cobra hoje'`: `trialing` com fim em 2026-11-08 e agora 2026-11-10, ou status `incomplete`. O `nextDueDate` é hoje.
  - `'teste estendido não encurta'`: fim em 2026-11-20 e criado em 2026-11-01. O `nextDueDate` é 2026-11-20.
  - `'cancelou no teste e cadastra de novo'`: `trialing` com `cancel_at_period_end = true` e fim em 2026-11-15. O `nextDueDate` é 2026-11-15, nunca hoje.
  - `'cupom no cartão: valor cheio na assinatura e desconto guardado'`: Solo com cupom de 10%. O POST do checkout tem valor 49,90, e o `metadata.descontoPrimeiraMensalidade.valor` fica 4,99.
  - `'cupom de 100% no cartão ativa sem checkout'`: devolve `type: 'FREE_ACTIVATION'`, e o `asaasClient.post` não é chamado para `/checkouts`.
  - `'card não vai mais para o Stripe'`: `billingProviderFactory.resolveProviderByPaymentMethod('card') === 'asaas'`, e `'boleto'` lança `INVALID_PAYMENT_METHOD`.

- [ ] **Step 2: Rodar e ver falhar**
  - Run: `cd backend && npx vitest run src/__tests__/checkoutCartaoAsaas.test.ts`
  - Expected: FAIL.

- [ ] **Step 3: Implementar**
  - Usar `getOrCreateAsaasCustomer` antes do checkout, como o Pix já faz.
  - `urlRetorno` = `${FRONTEND_URL}/dashboard/planos?cartao=retorno`.
  - O ramo `providerName === 'stripe'` do `createCheckoutSession` sai nesta task.

- [ ] **Step 4: Rodar**
  - Run: `cd backend && npx vitest run && npx tsc --noEmit`
  - Expected: PASS.

- [ ] **Step 5: Commit** `feat(cobranca): checkout do cartão pelo Asaas`

### Task 4: Webhook do Asaas para cartão, checkout e assinatura

**Files:**
- Modify: `backend/src/integrations/asaas/mapper.ts`, `backend/src/services/billingService.ts:252-400` e `:1017-1143`
- Test: `backend/src/__tests__/webhookCartaoAsaas.test.ts` (create)

**Interfaces:**
- Consumes: os eventos e campos da Task 1, o `externalReference` da Task 3 e `fimDoTesteComCartao` (Task 2).
- Produces:
  - `normalizeAsaasWebhookPayload` passa a aceitar payloads com `checkout` ou `subscription` além de `payment`. O retorno ganha `formaPagamento: 'card' | 'pix'`, vindo de `billingType`, e o `businessId` sai do `externalReference` de qualquer um dos três;
  - `updateBusinessFromAsaasPayment` e `saveAsaasPaymentSnapshot` gravam `paymentMethod` = `formaPagamento`, não mais `'pix'` fixo.

- [ ] **Step 1: Testes que falham** (payloads montados com os nomes da Task 1)
  - `'assinatura de cartão criada no teste liga o cartão e estende o teste'`. Negócio `trialing`, criado em 2026-11-01, fim em 2026-11-08. O evento de assinatura criada (ou checkout pago) com `nextDueDate` 2026-11-15 grava:
    - `provider = 'asaas'`;
    - `payment_method = 'card'`;
    - `provider_subscription_id`;
    - `subscription_current_period_end = 2026-11-15`;
    - o status continua `trialing`.
  - `'cobrança de cartão confirmada no fim do teste ativa o plano escolhido'`. `PAYMENT_CONFIRMED` com `billingType: 'CREDIT_CARD'` e `externalReference` `…plan:basico:cartao` produz:
    - status `active` e plano `basico`;
    - `billing_payments.payment_method = 'card'`;
    - período a partir da data de pagamento.
  - `'desconto da primeira mensalidade'`: com `metadata.descontoPrimeiraMensalidade`, o `PAYMENT_CREATED` da primeira cobrança chama a atualização da cobrança com o valor descontado e limpa o metadata. Uma segunda cobrança não recebe desconto.
  - `'cobrança de cartão antes do evento de assinatura'` (Review Focus 2): a cobrança chega com `externalReference` e sem `provider_subscription_id` no negócio. O negócio é achado pelo `externalReference`, e o id da assinatura é gravado.
  - `'primeira cobrança recusada no fim do teste'` (Review Focus 3): `PAYMENT_OVERDUE` de cartão em negócio `trialing` deixa o status `past_due` e marca `inadimplente_desde`. `estadoContaService` devolve carência, e depois dos 7 dias, `bloqueada` com `motivo: 'teste'`.
  - `'cobrança de Pix continua igual'`: os testes existentes do webhook Pix continuam passando, sem mudar.
  - `'evento repetido é ignorado'`: o mesmo `eventId` duas vezes dá `duplicate: true`.

- [ ] **Step 2: Rodar e ver falhar**
  - Run: `cd backend && npx vitest run src/__tests__/webhookCartaoAsaas.test.ts`
  - Expected: FAIL.

- [ ] **Step 3: Implementar**
  - O `eventId` de eventos sem `payment` usa `payload.id` (o id do evento do Asaas) quando existir. Senão, usa `${event}:${checkout.id ?? subscription.id}`.
  - A extensão do teste só acontece se o negócio estiver `trialing` e o teste ainda não tiver acabado. Depois do teste, a assinatura criada com `nextDueDate` hoje segue o caminho normal.

- [ ] **Step 4: Rodar**
  - Run: `cd backend && npx vitest run && npx tsc --noEmit`
  - Expected: PASS.

- [ ] **Step 5: Commit** `feat(cobranca): webhook do Asaas trata cartão, checkout e assinatura`

### Task 5: Troca de plano, cancelar, reativar e estender teste no cartão

**Files:**
- Modify:
  - `backend/src/modules/billing/planChange.service.ts`;
  - `backend/src/services/billingService.ts:780-893` (`cancelSubscription` e `reactivateSubscription`);
  - `backend/src/integrations/asaas/service.ts` (atualizar assinatura);
  - `backend/src/services/adminService.ts` e `backend/src/repositories/adminRepository.ts` (`estenderTeste`);
  - `backend/src/modules/conta/estadoConta.rules.ts:36-44`.
- Test: `backend/src/__tests__/planChangeCartaoAsaas.test.ts` (create), mais os testes existentes de `planChange`, `estadoConta` e `adminService`.

**Interfaces:**
- Consumes: os resultados (d) e (f) da Task 1.
- Produces: `asaasService.atualizarAssinatura(id: string, campos: { value?: number; nextDueDate?: Date }): Promise<void>`, que faz `PUT /subscriptions/{id}`.

- [ ] **Step 1: Testes que falham**
  - `'upgrade no cartão cobra a diferença pela página do Asaas'`:
    - `formaPagamento` `'card'` (ativo, `provider` `asaas`, `payment_method` `card`);
    - `changePlan` cria uma cobrança avulsa com `referenciaUpgrade` e devolve `status: 'aguardando'` com a URL da fatura (`invoiceUrl`), em vez do QR Code;
    - depois do webhook pago, `atualizarAssinatura(id, { value: preço novo })`.
  - `'downgrade no cartão'`: o agendamento é o de hoje. Na virada (`planChange.repository`), chama `atualizarAssinatura(id, { value: preço do plano menor })`.
  - `'cancelar no cartão remove a assinatura no Asaas'` e mantém o acesso até o fim do período ou do teste.
  - `'reativar no cartão restaura a assinatura'`: `reactivateSubscription` chama o restore e não abre checkout.
  - `'estender teste com cartão move o nextDueDate'`: `estenderTeste` em negócio `trialing` com `payment_method = 'card'` chama `atualizarAssinatura(id, { nextDueDate: novo fim })`. Se a Task 1 (d) disser que não dá, vira o teste do caminho alternativo: `podeEstenderTeste` passa a ser `false` com o motivo "Teste com cartão cadastrado: o vencimento é do Asaas".
  - `'contingência no cartão segue a regra do Pix'`: `estadoConta.rules` deixa de tratar `pix` e cartão de formas diferentes. Os testes existentes do Pix continuam iguais, e um caso novo de cartão com o mesmo cenário dá o mesmo resultado.

- [ ] **Step 2: Rodar e ver falhar**
  - Run: `cd backend && npx vitest run src/__tests__/planChangeCartaoAsaas.test.ts`
  - Expected: FAIL.

- [ ] **Step 3: Implementar**
  - O ramo Stripe do `planChange.service.ts` sai.
  - `formaPagamento` (`planChange.service.ts:75`): `'card'` quando `provider = 'asaas'` e `payment_method = 'card'`.
  - O `PreviaTroca.formaPagamento` continua `'card' | 'pix'`.
  - O `ResultadoTroca` `aguardando` ganha `invoiceUrl: string | null`.

- [ ] **Step 4: Rodar**
  - Run: `cd backend && npx vitest run && npx tsc --noEmit`
  - Expected: PASS.

- [ ] **Step 5: Commit** `feat(cobranca): troca de plano e cancelamento no cartão pelo Asaas`

### Task 6: Stripe fora do backend e migração

**Files:**
- Delete:
  - `backend/src/config/stripe.ts`;
  - `backend/src/services/stripeCheckoutService.ts`;
  - `backend/src/services/stripePricingService.ts`;
  - `backend/src/services/billing/providers/stripeBillingProvider.ts`;
  - os testes só do Stripe (achar com `grep -rln -i stripe backend/src/__tests__`).
- Modify:
  - `backend/src/modules/billing/billing.routes.ts` (rotas `/webhook(s)/stripe` e `stripeWebhookMiddleware`);
  - `backend/src/middleware/auth.ts:39`;
  - `backend/src/services/subscriptionService.ts` (eventos do Stripe, `applyTrial`);
  - `backend/src/controllers/subscriptionController.ts`;
  - `backend/src/repositories/subscriptionRepository.ts` (`storeSubscriptionEvent`, `hasProcessedEvent`, o `EXISTS` da linha 42 e os campos `stripe_*`);
  - `backend/src/services/billingService.ts:531` (o evento da ativação por cupom vira só `logger.info`);
  - `backend/src/modules/billing/billingInfo.service.ts`;
  - `backend/src/modules/admin/painel.repository.ts:20-45` e `:118-122`;
  - `backend/src/repositories/adminRepository.ts`;
  - `backend/src/services/cronService.ts:301`;
  - `backend/src/server.ts`;
  - `backend/src/types/domain.ts`;
  - `backend/src/services/billing/statusMapper.ts`;
  - `backend/package.json` (sai `stripe`);
  - `backend/.env.example` (saem as `STRIPE_*`);
  - `backend/prisma/schema.prisma` (saem os 4 campos e o `model SubscriptionEvent` com a relação em `Business`).
- Create:
  - `backend/prisma/migrations/20261104120000_remove_stripe/migration.sql`;
  - `backend/src/__tests__/semStripe.test.ts`.

**Interfaces:**
- Produces:
  - `billingInfo.service`: faturas só de `billing_payments` (cartão e Pix);
  - forma de pagamento: `{ tipo: 'card' | 'pix' | null; bandeira: string | null; final: string | null; urlFatura: string | null }`. A bandeira e o final vêm de `metadata.rawPayment.creditCard` da última cobrança de cartão paga, e o `urlFatura` é o `invoiceUrl` da cobrança em aberto ou da última;
  - `ja_pagou` e `SQL_PAGAMENTOS_CONFIRMADOS` só com `billing_payments` e `last_payment_date`.

- [ ] **Step 1: Teste que falha**
  - `semStripe.test.ts` varre `backend/src` (fora de `__tests__`), `backend/package.json` e `backend/prisma/schema.prisma`.
  - Espera zero ocorrências de `/stripe/i`, exceto a migração.

- [ ] **Step 2: Rodar e ver falhar**
  - Run: `cd backend && npx vitest run src/__tests__/semStripe.test.ts`
  - Expected: FAIL, listando os arquivos.

- [ ] **Step 3: Remover**
  - Apagar o código do Stripe e ajustar os pontos listados.
  - Rodar `npm install` para atualizar o `package-lock.json`. Não rodar `prisma migrate` nem nada que toque o banco.
  - `npx prisma generate` pode rodar: ele só lê o `schema.prisma`.

- [ ] **Step 4: Escrever a migração (sem rodar):**
  ```sql
  UPDATE businesses SET provider = NULL WHERE provider = 'stripe';
  UPDATE businesses SET payment_method = NULL WHERE payment_method = 'boleto';
  ALTER TABLE businesses
    DROP COLUMN IF EXISTS stripe_customer_id,
    DROP COLUMN IF EXISTS stripe_subscription_id,
    DROP COLUMN IF EXISTS stripe_price_id,
    DROP COLUMN IF EXISTS stripe_payment_mode;
  DROP TABLE IF EXISTS subscription_events;
  ```

- [ ] **Step 5: Rodar**
  - Run: `cd backend && npx vitest run && npx tsc --noEmit`
  - Expected: tudo PASS. Os testes do SuperAdmin (H2) que usavam `subscription_events` passam a cobrir só `billing_payments`.

- [ ] **Step 6: Commit** `refactor(cobranca): Stripe fora do backend e migração que apaga as colunas`

### Task 7: Frontend da cobrança só com o Asaas

**Files:**
- Delete: `frontend/src/app/api/billing/webhook/stripe/route.ts`
- Modify:
  - `frontend/src/lib/billing.ts:13-50`;
  - `frontend/src/components/marketing/PricingPlansSection.tsx` (linhas 592, 614 e 738);
  - `frontend/src/app/pagamento/page.tsx:214`;
  - `frontend/src/app/dashboard/page.tsx:86`;
  - `frontend/src/app/dashboard/planos/page.tsx` (linhas 7, 122, 240, 316 e 645);
  - `frontend/src/app/dashboard/planos/comparar/page.tsx`;
  - `frontend/src/components/assinatura/PagamentoContingencia.tsx`;
  - `frontend/src/app/termos/page.tsx:39`;
  - `frontend/src/app/privacidade/page.tsx:39`.
- Test: os testes existentes de cada tela, mais `frontend/src/__tests__/semStripe.test.ts` (create).

**Interfaces:**
- Consumes: a resposta do checkout de cartão da Task 3, a forma de pagamento da Task 6 e o `invoiceUrl` do upgrade da Task 5.
- Produces:
  - `BillingProvider = 'asaas' | 'coupon'`;
  - `CheckoutCartaoResponse = { provider: 'asaas'; formaPagamento: 'card'; checkoutUrl: string; cobrancaEm: string; plan: PlanId }`.

- [ ] **Step 1: Testes que falham**
  - `semStripe.test.ts` (frontend): nenhum arquivo de `src` (fora de `__tests__`) contém `/\bStripe\b/` nem `provider === 'stripe'`.
    - `StatusChip` e `AppointmentCard` usam "stripe" em minúsculas como listra visual e ficam de fora pela regex com maiúscula.
  - Nos testes das telas:
    - escolher cartão chama o checkout e faz `window.location.assign(checkoutUrl)`;
    - "Atualizar cartão" em Ajustes › Plano abre `urlFatura` numa aba nova;
    - na contingência no cartão, o botão abre `urlFatura`;
    - o upgrade no cartão leva ao `invoiceUrl`.

- [ ] **Step 2: Rodar e ver falhar**
  - Run: `cd frontend && npx vitest run src/__tests__/semStripe.test.ts src/app/dashboard/planos src/components/assinatura`
  - Expected: FAIL.

- [ ] **Step 3: Implementar e trocar os textos**
  - Em `PricingPlansSection`:
    - "Em cada plano você pode escolher checkout com cartão via Stripe ou pagamento Pix via Asaas." → "Pague no cartão ou no Pix.";
    - "Cartão abre checkout Stripe. Pix gera QR Code na tela para pagamento imediato." → "No cartão você paga na página segura do Asaas. No Pix o QR Code aparece aqui.".
  - Em `planos/page.tsx`: "Pagamento com cartão processado pela Stripe." → "Pagamento com cartão processado pelo Asaas.".
  - Termos: "(cartão via Stripe e Pix via Asaas)" → "(Asaas, no cartão e no Pix)".
  - Privacidade: "(Stripe e Asaas)" → "(Asaas)".
  - Ao voltar com `?cartao=retorno`, `planos/page.tsx` mostra "Cartão recebido. Assim que o Asaas confirmar, sua assinatura aparece aqui." e atualiza o status a cada 5 s por até 1 min.

- [ ] **Step 4: Rodar**
  - Run: `cd frontend && npx vitest run && npx tsc --noEmit && npm run lint`
  - Expected: PASS.

- [ ] **Step 5: Commit** `feat(cobranca): telas de cobrança só com o Asaas`

### Task 8: A escolha do teste e o convite do cartão

**Files:**
- Modify:
  - `frontend/src/components/auth/AuthForm.tsx` (linhas 253 e 426);
  - `frontend/src/components/onboarding/CascaOnboarding.tsx:20`;
  - `frontend/src/app/dashboard/planos/page.tsx`;
  - `frontend/src/components/marketing/PricingPlansSection.tsx` (linhas 29-31, 134, 674 e 702);
  - `frontend/src/components/marketing/landing/Hero.tsx`;
  - `frontend/src/app/page.tsx` (FAQ e CTA);
  - `frontend/src/app/nail-designers/page.tsx` (linhas 125, 141 e 331);
  - `frontend/src/app/opengraph-image.tsx:197`;
  - `frontend/src/app/twitter-image.tsx:197`;
  - `frontend/src/components/marketing/__tests__/promessasProibidas.test.ts`.
- Create:
  - `frontend/src/components/assinatura/ConviteCartao.tsx`;
  - `frontend/src/lib/escolhaTeste.ts`.
- Test: `frontend/src/components/assinatura/__tests__/ConviteCartao.test.tsx` e `frontend/src/components/auth/__tests__/AuthForm.test.tsx` (extend).

**Interfaces:**
- Consumes: `TESTE_SEM_CARTAO_DIAS` e `TESTE_COM_CARTAO_DIAS` (Task 2); o checkout de cartão (Task 7).
- Produces:
  - `lib/escolhaTeste.ts`:
    - `guardarEscolhaTeste(e: 'sem_cartao' | 'com_cartao'): void`;
    - `lerEscolhaTeste(): 'sem_cartao' | 'com_cartao' | null`, com `localStorage` dentro de try/catch;
  - `<ConviteCartao />`: aparece só para `subscription_status = 'trialing'`, sem cartão (`payment_method !== 'card'`) e com o teste ainda ativo. Botão "Cadastrar cartão e ganhar mais 7 dias", que leva ao seletor de plano e depois ao checkout de cartão.

- [ ] **Step 1: Testes que falham**
  - No `AuthForm`, no modo cadastro:
    - aparecem os dois botões, "Testar 7 dias grátis" e "Testar 14 dias grátis";
    - as linhas são "Sem cartão. Entra agora." e "Com cartão cadastrado. A primeira cobrança só acontece no fim do teste; cancele antes e nada é cobrado.";
    - escolher 14 chama `guardarEscolhaTeste('com_cartao')`.
  - `ConviteCartao`:
    - aparece em `trialing` sem cartão com o teste ativo;
    - some com `payment_method = 'card'`;
    - some com o teste vencido;
    - o texto mostra a data de cobrança (cadastro + 14) no formato `DD/MM`.
  - O onboarding, com `lerEscolhaTeste() === 'com_cartao'`, mostra o `ConviteCartao` no topo.
  - `promessasProibidas`: entram `/14 dias grátis no cadastro/`, `/sem cartão obrigatório/`, `/14 dias de acesso gratuito/` e `/Teste grátis de 14 dias/`.

- [ ] **Step 2: Rodar e ver falhar**
  - Run: `cd frontend && npx vitest run src/components/assinatura src/components/auth src/components/marketing`
  - Expected: FAIL.

- [ ] **Step 3: Implementar e trocar os textos**
  - O selo e as linhas de preço viram "7 dias grátis sem cartão, ou 14 com cartão cadastrado".
  - Os CTAs "Testar 14 dias grátis" e "Começar 14 dias grátis" viram "Testar grátis".
  - FAQ da landing, pergunta "Como funciona o teste grátis?". Resposta: "Você escolhe no cadastro: 7 dias sem cartão, ou 14 dias com o cartão cadastrado no Asaas. Com cartão, a primeira cobrança só acontece no fim do teste; cancele antes e nada é cobrado. Quem começa sem cartão pode cadastrar depois e ganhar mais 7 dias. O teste é no plano Equipe."
  - Imagens de OG e Twitter: `['Teste grátis', '7 dias sem cartão', '14 com cartão']`.
  - O `ConviteCartao` entra no painel (`dashboard/page.tsx`, acima dos cards) e em Ajustes › Plano.

- [ ] **Step 4: Rodar**
  - Run: `cd frontend && npx vitest run && npx tsc --noEmit && npm run lint`
  - Expected: PASS.

- [ ] **Step 5: Commit** `feat(teste): escolha entre 7 dias sem cartão e 14 com cartão`

### Task 9: Conferência visual, documentos e PR

**Files:**
- Modify: `docs/ROADMAP.md`, `docs/design/SEGUIMENTO.md`
- Create: `docs/design/deploy-asaas-unico.md`

- [ ] **Step 1: Conferência visual**
  - Rodar `next dev` numa porta livre (a 3000 costuma estar ocupada), com o mock de backend fora do repositório (como na H2), respondendo `/auth/me`, `/billing/status` e o checkout.
  - Telas a conferir: cadastro com as duas opções, painel com o convite, Ajustes › Plano (cartão e Pix) e os selos novos da landing.

- [ ] **Step 2: Roteiro de deploy** (`docs/design/deploy-asaas-unico.md`)
  - Ordem da spec: código (backend, depois frontend), depois a conferência, depois a migração.
  - SQL de conferência, só leitura:
    ```sql
    SELECT count(*) FILTER (WHERE stripe_subscription_id IS NOT NULL OR stripe_customer_id IS NOT NULL) AS com_stripe,
           count(*) FILTER (WHERE provider = 'stripe') AS provider_stripe
    FROM businesses;
    SELECT count(*) FROM subscription_events WHERE event_type IN ('invoice.paid','invoice.payment_succeeded');
    ```
  - Webhook do Asaas: incluir os eventos de checkout e de assinatura.
  - Variáveis `STRIPE_*` para apagar no Render e na Vercel.

- [ ] **Step 3: Documentos**
  - ROADMAP: nova linha "Asaas único e teste 7/14".
  - SEGUIMENTO: seção com as decisões do Claude da spec e o resultado da Task 1.

- [ ] **Step 4: Commit e PR**
  - Commit: `docs(asaas): roteiro de deploy e seguimento`.
  - O PR descreve a ordem do deploy e diz que **a migração só roda depois, com autorização do dono**.
