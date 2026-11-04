-- Depoimentos reais: avaliação do produto pelos donos, aprovada no SuperAdmin e exibida na landing.
CREATE TABLE "depoimentos" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "business_id" UUID,
    "negocio_nome" VARCHAR(255) NOT NULL,
    "logo_url" TEXT,
    "nota" SMALLINT NOT NULL,
    "texto" TEXT NOT NULL,
    "texto_original" TEXT,
    "nome_exibido" VARCHAR(60),
    "cidade" VARCHAR(80),
    "autorizou" BOOLEAN NOT NULL DEFAULT false,
    "autorizado_em" TIMESTAMPTZ(6),
    "status" VARCHAR(20) NOT NULL,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    "publicado_em" TIMESTAMPTZ(6),
    "publicado_por" UUID,
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),

    CONSTRAINT "depoimentos_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "depoimentos_nota_check" CHECK ("nota" BETWEEN 1 AND 5)
);

CREATE TABLE "depoimento_pedidos" (
    "business_id" UUID NOT NULL,
    "adiado_ate" TIMESTAMPTZ(6),
    "dispensado_em" TIMESTAMPTZ(6),

    CONSTRAINT "depoimento_pedidos_pkey" PRIMARY KEY ("business_id")
);

CREATE INDEX "depoimentos_business_id_criado_em_idx" ON "depoimentos"("business_id", "criado_em" DESC);
CREATE INDEX "depoimentos_status_publicado_em_idx" ON "depoimentos"("status", "publicado_em" DESC);

ALTER TABLE "depoimentos" ADD CONSTRAINT "depoimentos_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "depoimento_pedidos" ADD CONSTRAINT "depoimento_pedidos_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
