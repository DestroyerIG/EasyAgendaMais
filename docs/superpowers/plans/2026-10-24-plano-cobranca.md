# Plano e cobrança (2D) Implementation Plan

**Goal:** Tela Ajustes › Plano e cobrança só com dado real, tela nova de comparação e upgrade, e troca de plano (upgrade na hora com proporcional, downgrade na renovação).

**Spec:** `docs/superpowers/specs/2026-10-24-plano-cobranca-design.md`.

**Tech Stack:** Express, Prisma 5 (PostgreSQL), Zod, Vitest, Stripe SDK, Asaas REST; Next.js 15, React, Tailwind com tokens, Vitest e Testing Library.

## Global Constraints
- Branch `feat/plano-cobranca`; PR para a `main`, que o dono junta.
- `backend/.env` aponta para **produção**: nunca rodar `prisma migrate dev/deploy/db push/reset`. Só `prisma validate`, `migrate diff --script` e `generate`. SQL à mão em `backend/prisma/migrations/20261024120000_plano_cobranca/migration.sql`; aplicar só com autorização do dono.
- Testes nunca tocam o banco nem o Stripe/Asaas: tudo mockado com `vi.mock`.
- Textos em pt-BR; cores só por token (`themeCompliance.test.ts`); proxies Next com `proxyRequest`.

## Ajustes da spec descobertos no código (decisões do Claude)
1. **Pix não é assinatura recorrente no Asaas.** Cada mês é uma cobrança avulsa (`asaasService.createPixSubscription` devolve `subscription: null`), gerada pelo "Gerar nova cobrança Pix" (`/billing/reactivate`). Então:
   - Upgrade no Pix = cobrança avulsa da diferença com `externalReference` `business:{id}:plan:{novo}:upgrade`. O webhook reconhece o sufixo `:upgrade` e só troca o plano, **sem mexer no período** (o handler de hoje reinicia o período a partir da data do pagamento).
   - Downgrade no Pix = `plano_agendado`; a rotina diária aplica no fim do período, e a próxima cobrança Pix sai no preço novo.
2. **Stripe:**
   - Upgrade = `subscriptions.update` com o Price novo, `proration_behavior: 'always_invoice'` e `payment_behavior: 'pending_if_incomplete'`. A troca só vale se a diferença for paga; senão o Stripe descarta. Depois de pagar, atualiza `metadata.plan`.
   - O webhook passa a preferir o plano do Price ao `metadata.plan` (hoje o metadata ganha e manteria o plano antigo).
   - Downgrade = subscription schedule com duas fases (atual até o fim do período, nova depois). Cancelar = `subscriptionSchedules.release` + volta da fase. A virada chega pelo webhook `customer.subscription.updated` e limpa `plano_agendado`.
3. **Profissionais e downgrade:** recusado se houver mais profissionais ativas do que o plano novo permite. Enquanto o downgrade estiver agendado, o limite para criar profissional é o do plano agendado. Assim a troca nunca precisa ser adiada.
4. **Sem assinatura paga ativa** (teste, cancelada, incompleta, cupom): a comparação leva ao checkout que já existe (`PricingPlansSection`), que continua na tela de Plano só nesses casos, com o título "Escolha seu plano".

## Tasks
1. Catálogo único `backend/src/config/planCatalog.ts` (preço, nome, limite, matriz); `PLAN_VALUES` do billing e do Asaas e `PROFESSIONAL_LIMITS` leem dele; `GET /billing/plans`. Teste no front que `plans.ts` bate com o catálogo (snapshot do catálogo em JSON).
2. Migração + schema: `businesses.plano_agendado`, `plano_agendado_em`; `billing_payments.tipo`, `plano`.
3. Regras puras `modules/billing/planChange.rules.ts`: direção, proporcional (mínimo R$ 5), bloqueio por profissionais.
4. Serviço `modules/billing/planChange.service.ts`: preview, change (Stripe/Pix), cancel; webhook Asaas de upgrade; rotina diária de downgrade Pix; Stripe metadata e preferência de plano pelo Price; limite de profissional com plano agendado.
5. Faturas e forma de pagamento: `GET /billing/invoices`, `GET /billing/payment-method`; status estendido.
6. Frontend: `lib/billing.ts` com os tipos e as chamadas novas, proxies.
7. Tela Plano e cobrança reescrita (sem `conteudoDemo.plano`).
8. Tela `/dashboard/planos/comparar` + modal de troca (prévia, Pix com QR e consulta a cada 5 s).
9. `SubscriptionBlockCard`/upgrade → `/planos/comparar?recurso=`; `SUPPORT_WHATSAPP` via `NEXT_PUBLIC_SUPPORT_WHATSAPP`.
10. SEGUIMENTO e ROADMAP; testes, typecheck e lint.
