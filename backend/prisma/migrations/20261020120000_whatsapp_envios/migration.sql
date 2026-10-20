-- CreateTable
CREATE TABLE "whatsapp_envios" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "business_id" UUID NOT NULL,
    "client_id" UUID,
    "phone" VARCHAR(20) NOT NULL,
    "phone_key" VARCHAR(20) NOT NULL,
    "body" TEXT NOT NULL,
    "origin" VARCHAR(20) NOT NULL,
    "agendado_para" TIMESTAMPTZ(6) NOT NULL,
    "status" VARCHAR(12) NOT NULL DEFAULT 'na_fila',
    "motivo" VARCHAR(160),
    "enviado_em" TIMESTAMPTZ(6),
    "intervalo_apos_s" INTEGER,
    "lote_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "whatsapp_envios_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "whatsapp_envios_business_id_status_agendado_para_idx" ON "whatsapp_envios"("business_id", "status", "agendado_para");

-- CreateIndex
CREATE INDEX "whatsapp_envios_business_id_client_id_created_at_idx" ON "whatsapp_envios"("business_id", "client_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "whatsapp_envios_business_id_enviado_em_idx" ON "whatsapp_envios"("business_id", "enviado_em" DESC);

-- AddForeignKey
ALTER TABLE "whatsapp_envios" ADD CONSTRAINT "whatsapp_envios_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_envios" ADD CONSTRAINT "whatsapp_envios_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE public.whatsapp_envios ENABLE ROW LEVEL SECURITY;

-- Um convite ativo por cliente e origem (índice parcial; fora do schema do Prisma).
CREATE UNIQUE INDEX "whatsapp_envios_cliente_ativo_key" ON "whatsapp_envios" ("business_id", "client_id", "origin") WHERE "status" IN ('na_fila','enviando') AND "client_id" IS NOT NULL;
