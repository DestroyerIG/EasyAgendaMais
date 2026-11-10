-- Cobrança do saldo da comanda: a tabela passa a guardar também cobranças do balcão (tipo 'saldo').
ALTER TABLE "cobrancas_sinal" ADD COLUMN "tipo" VARCHAR(10) NOT NULL DEFAULT 'sinal';
ALTER TABLE "cobrancas_sinal" ADD COLUMN "usuario_id" UUID;
CREATE INDEX "cobrancas_sinal_appointment_id_tipo_idx" ON "cobrancas_sinal"("appointment_id", "tipo");
