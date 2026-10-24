-- Relatórios e comissões (sub-projeto 3): modelo de repasse, CNPJ/especialidade da profissional, repasses e adiantamentos
-- AlterTable
ALTER TABLE "professionals" ADD COLUMN     "cnpj" VARCHAR(20),
ADD COLUMN     "especialidade" VARCHAR(80);

-- AlterTable
ALTER TABLE "business_settings" ADD COLUMN     "modelo_repasse" VARCHAR(20) NOT NULL DEFAULT 'comissao';

-- CreateTable
CREATE TABLE "repasses" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "business_id" UUID NOT NULL,
    "professional_id" UUID NOT NULL,
    "periodo_inicio" DATE NOT NULL,
    "periodo_fim" DATE NOT NULL,
    "servicos" DECIMAL(10,2) NOT NULL,
    "produtos" DECIMAL(10,2) NOT NULL,
    "comissao_servico" DECIMAL(10,2) NOT NULL,
    "comissao_produto" DECIMAL(10,2) NOT NULL,
    "gorjetas" DECIMAL(10,2) NOT NULL,
    "adiantamentos" DECIMAL(10,2) NOT NULL,
    "valor_pago" DECIMAL(10,2) NOT NULL,
    "modelo" VARCHAR(20) NOT NULL,
    "forma" VARCHAR(20) NOT NULL,
    "pago_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "pago_por" UUID,
    "observacao" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "repasses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "adiantamentos" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "business_id" UUID NOT NULL,
    "professional_id" UUID NOT NULL,
    "valor" DECIMAL(10,2) NOT NULL,
    "valor_abatido" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "data" DATE NOT NULL,
    "descricao" VARCHAR(255),
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "adiantamentos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "repasse_adiantamentos" (
    "repasse_id" UUID NOT NULL,
    "adiantamento_id" UUID NOT NULL,
    "valor" DECIMAL(10,2) NOT NULL,

    CONSTRAINT "repasse_adiantamentos_pkey" PRIMARY KEY ("repasse_id","adiantamento_id")
);

-- CreateIndex
CREATE INDEX "repasses_business_id_periodo_fim_idx" ON "repasses"("business_id", "periodo_fim");

-- CreateIndex
CREATE UNIQUE INDEX "repasses_business_id_professional_id_periodo_inicio_periodo_key" ON "repasses"("business_id", "professional_id", "periodo_inicio", "periodo_fim");

-- CreateIndex
CREATE INDEX "adiantamentos_business_id_professional_id_data_idx" ON "adiantamentos"("business_id", "professional_id", "data");

-- AddForeignKey
ALTER TABLE "repasses" ADD CONSTRAINT "repasses_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repasses" ADD CONSTRAINT "repasses_professional_id_fkey" FOREIGN KEY ("professional_id") REFERENCES "professionals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "adiantamentos" ADD CONSTRAINT "adiantamentos_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "adiantamentos" ADD CONSTRAINT "adiantamentos_professional_id_fkey" FOREIGN KEY ("professional_id") REFERENCES "professionals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repasse_adiantamentos" ADD CONSTRAINT "repasse_adiantamentos_repasse_id_fkey" FOREIGN KEY ("repasse_id") REFERENCES "repasses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repasse_adiantamentos" ADD CONSTRAINT "repasse_adiantamentos_adiantamento_id_fkey" FOREIGN KEY ("adiantamento_id") REFERENCES "adiantamentos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

