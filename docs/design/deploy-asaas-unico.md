# Roteiro de deploy: Asaas único e teste de 7 ou 14 dias

**Spec:** `docs/superpowers/specs/2026-11-03-asaas-unico-design.md`.
**Conferência no sandbox:** `docs/design/asaas-sandbox-conferencia.md`.

A migração apaga colunas que o código antigo lê. Por isso a ordem importa: **primeiro o código, por último a migração**.

## Antes de juntar o PR

- [ ] **Tokenização na conta de produção:** pedir ao Asaas que habilite. Sem ela, três coisas podem falhar em produção:
  - reativar no cartão sem digitar de novo;
  - mover o vencimento quando o SuperAdmin estende um teste com cartão;
  - mudar o valor da assinatura numa troca de plano no cartão.
- [ ] **Webhook do Asaas:** conferir que está assinado para as cobranças (`PAYMENT_CREATED`, `PAYMENT_CONFIRMED`, `PAYMENT_RECEIVED`, `PAYMENT_OVERDUE`, `PAYMENT_REFUNDED`, `PAYMENT_DELETED`). Eles já valem para o Pix.
  - O cartão usa os mesmos eventos. O código não depende dos eventos de checkout.

## Deploy

1. Juntar o PR.
2. **Backend (Render)** sobe primeiro.
   - O código novo não lê mais `stripe_*` nem `subscription_events`, e as colunas que ainda existem no banco são ignoradas.
3. **Frontend (Vercel)** sobe em seguida.
   - Se subir antes do backend, o checkout de cartão falha até o backend novo entrar. O Pix continua funcionando.

## Conferência antes da migração (só leitura, rodada pelo dono)

```sql
SELECT count(*) FILTER (WHERE stripe_subscription_id IS NOT NULL OR stripe_customer_id IS NOT NULL) AS com_stripe,
       count(*) FILTER (WHERE provider = 'stripe') AS provider_stripe
FROM businesses;

SELECT count(*) AS pagamentos_stripe
FROM subscription_events
WHERE event_type IN ('invoice.paid', 'invoice.payment_succeeded');
```

- Tudo zero: segue para a migração.
- `pagamentos_stripe` maior que zero: **parar**. Copiar esse histórico para `billing_payments` antes de apagar, senão o "já pagou" e o LTV do SuperAdmin perdem esses negócios.
- Conferir também no painel do Stripe que não há assinatura ativa.

## Migração (com autorização do dono)

```bash
cd backend && npm run db:migrate:deploy
```

A migração `20261104120000_remove_stripe`:
- põe `provider = NULL` onde era `stripe`;
- põe `payment_method = NULL` onde era `boleto`;
- remove as quatro colunas `stripe_*` de `businesses`;
- remove a tabela `subscription_events`.

## Depois

- [ ] Apagar as variáveis `STRIPE_*` no Render e na Vercel.
- [ ] Desligar o webhook e a conta no Stripe.
- [ ] **Teste de ponta a ponta com cartão real:**
  - [ ] Criar uma conta nova, escolher "14 dias com cartão" e cadastrar o cartão.
  - [ ] No painel do Asaas, a primeira cobrança deve estar para cadastro + 14 dias.
  - [ ] Cancelar no painel do EasyAgenda+. A assinatura some no Asaas e nada é cobrado.
- [ ] Uma assinatura no cartão sem teste, cobrada na hora e estornada em seguida pelo painel do Asaas.
