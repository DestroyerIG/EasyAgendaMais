-- CreateTable
CREATE TABLE "whatsapp_campanhas" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "business_id" UUID NOT NULL,
    "nome" VARCHAR(80) NOT NULL,
    "segmento" VARCHAR(20) NOT NULL,
    "professional_id" UUID,
    "service_id" UUID,
    "texto" TEXT NOT NULL,
    "inicio_em" TIMESTAMPTZ(6) NOT NULL,
    "cadencia" SMALLINT NOT NULL DEFAULT 25,
    "status" VARCHAR(12) NOT NULL DEFAULT 'rascunho',
    "total" INTEGER NOT NULL DEFAULT 0,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "whatsapp_campanhas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "whatsapp_campanhas_business_id_created_at_idx" ON "whatsapp_campanhas"("business_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "whatsapp_envios_business_id_lote_id_status_idx" ON "whatsapp_envios"("business_id", "lote_id", "status");

-- AddForeignKey
ALTER TABLE "whatsapp_campanhas" ADD CONSTRAINT "whatsapp_campanhas_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE public.whatsapp_campanhas ENABLE ROW LEVEL SECURITY;
