-- AlterTable
ALTER TABLE "comandas" ADD COLUMN     "desconto_clube" DECIMAL(10,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "comanda_items" ADD COLUMN     "cobertura_contrato_id" UUID,
ADD COLUMN     "valor_coberto" DECIMAL(10,2) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "clube_ofertas" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "business_id" UUID NOT NULL,
    "tipo" VARCHAR(10) NOT NULL,
    "nome" VARCHAR(120) NOT NULL,
    "descricao" TEXT,
    "preco" DECIMAL(10,2) NOT NULL,
    "sessoes_por_ciclo" INTEGER,
    "sessoes_referencia" INTEGER NOT NULL DEFAULT 4,
    "intervalo_minimo_dias" INTEGER NOT NULL DEFAULT 0,
    "total_sessoes" INTEGER,
    "validade_dias" INTEGER,
    "falta_debita" BOOLEAN NOT NULL DEFAULT false,
    "desconto_extras_pct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "beneficios" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "publica" BOOLEAN NOT NULL DEFAULT false,
    "status" VARCHAR(12) NOT NULL DEFAULT 'ativa',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "clube_ofertas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clube_oferta_servicos" (
    "oferta_id" UUID NOT NULL,
    "service_id" UUID NOT NULL,

    CONSTRAINT "clube_oferta_servicos_pkey" PRIMARY KEY ("oferta_id","service_id")
);

-- CreateTable
CREATE TABLE "clube_oferta_profissionais" (
    "oferta_id" UUID NOT NULL,
    "professional_id" UUID NOT NULL,

    CONSTRAINT "clube_oferta_profissionais_pkey" PRIMARY KEY ("oferta_id","professional_id")
);

-- CreateTable
CREATE TABLE "clube_contratos" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "business_id" UUID NOT NULL,
    "oferta_id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "tipo" VARCHAR(10) NOT NULL,
    "status" VARCHAR(24) NOT NULL,
    "origem" VARCHAR(10) NOT NULL DEFAULT 'painel',
    "preco" DECIMAL(10,2) NOT NULL,
    "valor_sessao" DECIMAL(10,2) NOT NULL,
    "sessoes_por_ciclo" INTEGER,
    "intervalo_minimo_dias" INTEGER NOT NULL DEFAULT 0,
    "total_sessoes" INTEGER,
    "sessoes_usadas" INTEGER NOT NULL DEFAULT 0,
    "validade_dias" INTEGER,
    "ativado_em" DATE,
    "ciclo_inicio" DATE,
    "ciclo_fim" DATE,
    "valido_ate" DATE,
    "cancelado_em" TIMESTAMPTZ(6),
    "cancela_em" DATE,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "clube_contratos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clube_cobrancas" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "business_id" UUID NOT NULL,
    "contrato_id" UUID NOT NULL,
    "competencia" DATE NOT NULL,
    "valor" DECIMAL(10,2) NOT NULL,
    "vencimento" DATE NOT NULL,
    "status" VARCHAR(12) NOT NULL DEFAULT 'pendente',
    "pix_copia_cola" TEXT,
    "forma" VARCHAR(20),
    "pago_em" TIMESTAMPTZ(6),
    "confirmado_por" UUID,
    "cash_session_id" UUID,
    "enviado_em" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "clube_cobrancas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clube_usos" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "business_id" UUID NOT NULL,
    "contrato_id" UUID NOT NULL,
    "comanda_item_id" UUID,
    "appointment_id" UUID,
    "service_id" UUID,
    "data" DATE NOT NULL,
    "valor_sessao" DECIMAL(10,2) NOT NULL,
    "motivo" VARCHAR(12) NOT NULL DEFAULT 'atendimento',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "clube_usos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "clube_ofertas_business_id_status_idx" ON "clube_ofertas"("business_id", "status");

-- CreateIndex
CREATE INDEX "clube_contratos_business_id_status_idx" ON "clube_contratos"("business_id", "status");

-- CreateIndex
CREATE INDEX "clube_contratos_business_id_client_id_idx" ON "clube_contratos"("business_id", "client_id");

-- CreateIndex
CREATE INDEX "clube_contratos_oferta_id_idx" ON "clube_contratos"("oferta_id");

-- CreateIndex
CREATE INDEX "clube_cobrancas_business_id_status_vencimento_idx" ON "clube_cobrancas"("business_id", "status", "vencimento");

-- CreateIndex
CREATE INDEX "clube_cobrancas_business_id_pago_em_idx" ON "clube_cobrancas"("business_id", "pago_em");

-- CreateIndex
CREATE INDEX "clube_cobrancas_cash_session_id_idx" ON "clube_cobrancas"("cash_session_id");

-- CreateIndex
CREATE UNIQUE INDEX "clube_cobrancas_contrato_id_competencia_key" ON "clube_cobrancas"("contrato_id", "competencia");

-- CreateIndex
CREATE UNIQUE INDEX "clube_usos_comanda_item_id_key" ON "clube_usos"("comanda_item_id");

-- CreateIndex
CREATE INDEX "clube_usos_contrato_id_data_idx" ON "clube_usos"("contrato_id", "data");

-- CreateIndex
CREATE UNIQUE INDEX "clube_usos_contrato_id_appointment_id_key" ON "clube_usos"("contrato_id", "appointment_id");

-- AddForeignKey
ALTER TABLE "comanda_items" ADD CONSTRAINT "comanda_items_cobertura_contrato_id_fkey" FOREIGN KEY ("cobertura_contrato_id") REFERENCES "clube_contratos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clube_ofertas" ADD CONSTRAINT "clube_ofertas_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clube_oferta_servicos" ADD CONSTRAINT "clube_oferta_servicos_oferta_id_fkey" FOREIGN KEY ("oferta_id") REFERENCES "clube_ofertas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clube_oferta_servicos" ADD CONSTRAINT "clube_oferta_servicos_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clube_oferta_profissionais" ADD CONSTRAINT "clube_oferta_profissionais_oferta_id_fkey" FOREIGN KEY ("oferta_id") REFERENCES "clube_ofertas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clube_oferta_profissionais" ADD CONSTRAINT "clube_oferta_profissionais_professional_id_fkey" FOREIGN KEY ("professional_id") REFERENCES "professionals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clube_contratos" ADD CONSTRAINT "clube_contratos_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clube_contratos" ADD CONSTRAINT "clube_contratos_oferta_id_fkey" FOREIGN KEY ("oferta_id") REFERENCES "clube_ofertas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clube_contratos" ADD CONSTRAINT "clube_contratos_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clube_cobrancas" ADD CONSTRAINT "clube_cobrancas_contrato_id_fkey" FOREIGN KEY ("contrato_id") REFERENCES "clube_contratos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clube_usos" ADD CONSTRAINT "clube_usos_contrato_id_fkey" FOREIGN KEY ("contrato_id") REFERENCES "clube_contratos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

