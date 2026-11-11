-- Maquininha Point: terminal usado em cada cobranca do saldo e terminal padrao do negocio.
ALTER TABLE "cobrancas_sinal" ADD COLUMN "terminal_id" VARCHAR(100);
ALTER TABLE "conexoes_recebimento" ADD COLUMN "terminal_padrao_id" VARCHAR(100);
