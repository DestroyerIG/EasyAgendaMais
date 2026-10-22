-- CreateTable
CREATE TABLE "whatsapp_automacoes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "business_id" UUID NOT NULL,
    "regra" VARCHAR(20) NOT NULL,
    "ativa" BOOLEAN NOT NULL DEFAULT false,
    "texto" TEXT,
    "config" JSONB NOT NULL DEFAULT '{}',
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "whatsapp_automacoes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whatsapp_respostas_pendentes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "business_id" UUID NOT NULL,
    "phone_key" VARCHAR(20) NOT NULL,
    "tipo" VARCHAR(15) NOT NULL,
    "appointment_id" UUID NOT NULL,
    "expira_em" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "whatsapp_respostas_pendentes_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "appointments" ADD COLUMN "client_confirmed_at" TIMESTAMPTZ(6),
ADD COLUMN "confirmation_sent_at" TIMESTAMPTZ(6);

-- AlterTable
ALTER TABLE "whatsapp_envios" ADD COLUMN "prioridade" SMALLINT NOT NULL DEFAULT 5,
ADD COLUMN "appointment_id" UUID;

-- AlterTable
ALTER TABLE "business_settings" ADD COLUMN "google_review_url" VARCHAR(500);

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_automacoes_business_id_regra_key" ON "whatsapp_automacoes"("business_id", "regra");

-- CreateIndex
CREATE INDEX "whatsapp_respostas_pendentes_business_id_phone_key_idx" ON "whatsapp_respostas_pendentes"("business_id", "phone_key");

-- CreateIndex
CREATE INDEX "whatsapp_envios_business_id_status_prioridade_agendado_para_idx" ON "whatsapp_envios"("business_id", "status", "prioridade", "agendado_para");

-- AddForeignKey
ALTER TABLE "whatsapp_automacoes" ADD CONSTRAINT "whatsapp_automacoes_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_respostas_pendentes" ADD CONSTRAINT "whatsapp_respostas_pendentes_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_respostas_pendentes" ADD CONSTRAINT "whatsapp_respostas_pendentes_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE public.whatsapp_automacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_respostas_pendentes ENABLE ROW LEVEL SECURITY;
