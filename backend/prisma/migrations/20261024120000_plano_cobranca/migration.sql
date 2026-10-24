-- Downgrade agendado para o fim do período (2D)
ALTER TABLE "businesses" ADD COLUMN "plano_agendado" VARCHAR(50);
ALTER TABLE "businesses" ADD COLUMN "plano_agendado_em" TIMESTAMP(3);

-- Cobrança mensal ou diferença de upgrade
ALTER TABLE "billing_payments" ADD COLUMN "tipo" VARCHAR(20) NOT NULL DEFAULT 'mensalidade';
ALTER TABLE "billing_payments" ADD COLUMN "plano" VARCHAR(50);
