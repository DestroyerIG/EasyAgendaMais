-- Modo de contingência (H1): data de início da inadimplência.
--
-- ATENÇÃO: o trigger abaixo NÃO está no schema.prisma (o Prisma não modela
-- triggers). Todo `prisma migrate dev` futuro deve ser conferido antes de
-- aplicar, para não remover o trigger trg_marcar_inadimplente_desde. Mesmo
-- aviso dos índices parciais do 2B e do 2C.
--
-- O trigger só grava a data quando ela está nula: pending -> active -> pending
-- no mesmo dia não gera carência nova a cada volta do webhook.

-- AlterTable
ALTER TABLE "businesses" ADD COLUMN IF NOT EXISTS "inadimplente_desde" TIMESTAMPTZ;

-- Função do trigger
CREATE OR REPLACE FUNCTION marcar_inadimplente_desde() RETURNS trigger AS $$
BEGIN
  IF NEW.subscription_status IN ('past_due', 'unpaid', 'pending') THEN
    NEW.inadimplente_desde := COALESCE(OLD.inadimplente_desde, now());
  ELSE
    NEW.inadimplente_desde := NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_marcar_inadimplente_desde ON "businesses";
CREATE TRIGGER trg_marcar_inadimplente_desde
  BEFORE UPDATE OF subscription_status ON "businesses"
  FOR EACH ROW
  EXECUTE FUNCTION marcar_inadimplente_desde();

-- Backfill dos negócios que já estão inadimplentes
UPDATE "businesses"
SET "inadimplente_desde" = COALESCE("subscription_updated_at", now())
WHERE "subscription_status" IN ('past_due', 'unpaid', 'pending')
  AND "inadimplente_desde" IS NULL;

-- Índices para a checagem "já pagou" feita a cada requisição autenticada
CREATE INDEX IF NOT EXISTS billing_payments_business_id_idx ON billing_payments (business_id);
CREATE INDEX IF NOT EXISTS subscription_events_business_id_idx ON subscription_events (business_id);
