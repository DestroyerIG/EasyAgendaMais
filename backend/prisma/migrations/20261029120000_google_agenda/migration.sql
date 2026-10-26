-- CreateTable
CREATE TABLE "google_agenda_conexoes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "business_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "tipo" VARCHAR(15) NOT NULL,
    "professional_id" UUID,
    "google_email" VARCHAR(255) NOT NULL,
    "refresh_token_cifrado" TEXT NOT NULL,
    "calendario_id" VARCHAR(255) NOT NULL,
    "status" VARCHAR(15) NOT NULL DEFAULT 'ativa',
    "ultimo_erro" VARCHAR(255),
    "ultima_sync_em" TIMESTAMP(3),
    "criada_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "google_agenda_conexoes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "google_agenda_eventos" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "conexao_id" UUID NOT NULL,
    "appointment_id" UUID NOT NULL,
    "google_event_id" VARCHAR(255) NOT NULL,
    "versao" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "google_agenda_eventos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "google_agenda_ocupado" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "conexao_id" UUID NOT NULL,
    "inicio" TIMESTAMPTZ(6) NOT NULL,
    "fim" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "google_agenda_ocupado_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "google_agenda_conexoes_user_id_key" ON "google_agenda_conexoes"("user_id");

-- CreateIndex
CREATE INDEX "google_agenda_conexoes_business_id_idx" ON "google_agenda_conexoes"("business_id");

-- CreateIndex
CREATE UNIQUE INDEX "google_agenda_eventos_conexao_id_appointment_id_key" ON "google_agenda_eventos"("conexao_id", "appointment_id");

-- CreateIndex
CREATE INDEX "google_agenda_ocupado_conexao_id_inicio_idx" ON "google_agenda_ocupado"("conexao_id", "inicio");

-- AddForeignKey
ALTER TABLE "google_agenda_conexoes" ADD CONSTRAINT "google_agenda_conexoes_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "google_agenda_conexoes" ADD CONSTRAINT "google_agenda_conexoes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "google_agenda_conexoes" ADD CONSTRAINT "google_agenda_conexoes_professional_id_fkey" FOREIGN KEY ("professional_id") REFERENCES "professionals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "google_agenda_eventos" ADD CONSTRAINT "google_agenda_eventos_conexao_id_fkey" FOREIGN KEY ("conexao_id") REFERENCES "google_agenda_conexoes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "google_agenda_eventos" ADD CONSTRAINT "google_agenda_eventos_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "google_agenda_ocupado" ADD CONSTRAINT "google_agenda_ocupado_conexao_id_fkey" FOREIGN KEY ("conexao_id") REFERENCES "google_agenda_conexoes"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Uma conexão do negócio (a da dona) por negócio
CREATE UNIQUE INDEX "google_agenda_conexoes_negocio_key" ON "google_agenda_conexoes"("business_id") WHERE "tipo" = 'negocio';
