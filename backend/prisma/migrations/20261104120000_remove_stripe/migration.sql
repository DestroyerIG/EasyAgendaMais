-- Asaas único: o Stripe sai do banco.
-- Roda só depois do deploy do código novo (que já não lê nada disto) e com autorização do dono,
-- depois da conferência do roteiro docs/design/deploy-asaas-unico.md.
UPDATE businesses SET provider = NULL WHERE provider = 'stripe';
UPDATE businesses SET payment_method = NULL WHERE payment_method = 'boleto';

ALTER TABLE businesses
  DROP COLUMN IF EXISTS stripe_customer_id,
  DROP COLUMN IF EXISTS stripe_subscription_id,
  DROP COLUMN IF EXISTS stripe_price_id,
  DROP COLUMN IF EXISTS stripe_payment_mode;

DROP TABLE IF EXISTS subscription_events;
