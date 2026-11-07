-- Recebimentos automáticos (Mercado Pago): conexão do negócio e cobranças do sinal.
CREATE TABLE "conexoes_recebimento" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "business_id" UUID NOT NULL,
    "gateway" VARCHAR(20) NOT NULL,
    "situacao" VARCHAR(30) NOT NULL DEFAULT 'ativa',
    "conta_externa_id" VARCHAR(100) NOT NULL,
    "conta_nome" VARCHAR(255),
    "access_token_cifrado" TEXT NOT NULL,
    "refresh_token_cifrado" TEXT NOT NULL,
    "token_expira_em" TIMESTAMPTZ(6) NOT NULL,
    "aceita_pix" BOOLEAN NOT NULL DEFAULT true,
    "aceita_cartao" BOOLEAN NOT NULL DEFAULT false,
    "aceite_cartao_em" TIMESTAMPTZ(6),
    "ultimo_alerta_em" TIMESTAMPTZ(6),
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),

    CONSTRAINT "conexoes_recebimento_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "cobrancas_sinal" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "business_id" UUID NOT NULL,
    "appointment_id" UUID NOT NULL,
    "gateway" VARCHAR(20) NOT NULL,
    "forma" VARCHAR(10) NOT NULL,
    "valor" DECIMAL(10,2) NOT NULL,
    "situacao" VARCHAR(20) NOT NULL DEFAULT 'pendente',
    "id_externo" VARCHAR(100),
    "pagamento_externo_id" VARCHAR(100),
    "forma_paga" VARCHAR(10),
    "codigo_pix" TEXT,
    "checkout_url" TEXT,
    "vence_em" TIMESTAMPTZ(6),
    "pago_em" TIMESTAMPTZ(6),
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),

    CONSTRAINT "cobrancas_sinal_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "conexoes_recebimento_business_id_key" ON "conexoes_recebimento"("business_id");
CREATE UNIQUE INDEX "conexoes_recebimento_gateway_conta_externa_id_key" ON "conexoes_recebimento"("gateway", "conta_externa_id");
CREATE UNIQUE INDEX "cobrancas_sinal_gateway_pagamento_externo_id_key" ON "cobrancas_sinal"("gateway", "pagamento_externo_id");
CREATE INDEX "cobrancas_sinal_appointment_id_idx" ON "cobrancas_sinal"("appointment_id");
CREATE INDEX "cobrancas_sinal_situacao_vence_em_idx" ON "cobrancas_sinal"("situacao", "vence_em");
CREATE INDEX "cobrancas_sinal_business_id_situacao_vence_em_idx" ON "cobrancas_sinal"("business_id", "situacao", "vence_em");

ALTER TABLE "conexoes_recebimento" ADD CONSTRAINT "conexoes_recebimento_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "cobrancas_sinal" ADD CONSTRAINT "cobrancas_sinal_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "cobrancas_sinal" ADD CONSTRAINT "cobrancas_sinal_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE public.conexoes_recebimento ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cobrancas_sinal ENABLE ROW LEVEL SECURITY;
