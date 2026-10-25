-- AlterTable
ALTER TABLE "users" ADD COLUMN     "professional_id" UUID;

-- AlterTable
ALTER TABLE "whatsapp_ratings" ADD COLUMN     "origem" VARCHAR(20) NOT NULL DEFAULT 'whatsapp';

-- AlterTable
ALTER TABLE "business_settings" ADD COLUMN     "profissional_cobra" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "comandas" ADD COLUMN     "avaliacao_token_hash" CHAR(64),
ADD COLUMN     "enviada_recepcao_em" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "profissional_convites" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "business_id" UUID NOT NULL,
    "professional_id" UUID NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "expira_em" TIMESTAMP(3) NOT NULL,
    "aceito_em" TIMESTAMP(3),
    "revogado_em" TIMESTAMP(3),
    "criado_por" UUID,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "profissional_convites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "push_inscricoes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" VARCHAR(255) NOT NULL,
    "auth" VARCHAR(255) NOT NULL,
    "user_agent" VARCHAR(255),
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ultimo_erro_em" TIMESTAMP(3),

    CONSTRAINT "push_inscricoes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "profissional_convites_token_hash_key" ON "profissional_convites"("token_hash");

-- CreateIndex
CREATE INDEX "profissional_convites_business_id_professional_id_idx" ON "profissional_convites"("business_id", "professional_id");

-- CreateIndex
CREATE UNIQUE INDEX "push_inscricoes_endpoint_key" ON "push_inscricoes"("endpoint");

-- CreateIndex
CREATE INDEX "push_inscricoes_user_id_idx" ON "push_inscricoes"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_professional_id_key" ON "users"("professional_id");

-- CreateIndex
CREATE INDEX "whatsapp_ratings_business_id_created_at_idx" ON "whatsapp_ratings"("business_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "comandas_avaliacao_token_hash_key" ON "comandas"("avaliacao_token_hash");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_professional_id_fkey" FOREIGN KEY ("professional_id") REFERENCES "professionals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profissional_convites" ADD CONSTRAINT "profissional_convites_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profissional_convites" ADD CONSTRAINT "profissional_convites_professional_id_fkey" FOREIGN KEY ("professional_id") REFERENCES "professionals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profissional_convites" ADD CONSTRAINT "profissional_convites_criado_por_fkey" FOREIGN KEY ("criado_por") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "push_inscricoes" ADD CONSTRAINT "push_inscricoes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

