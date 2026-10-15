-- AlterTable
ALTER TABLE "business_settings" ADD COLUMN     "daily_revenue_goal" DECIMAL(10,2),
ADD COLUMN     "segment" VARCHAR(20) NOT NULL DEFAULT 'outro';

-- CreateTable
CREATE TABLE "tags" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "business_id" UUID NOT NULL,
    "name" VARCHAR(40) NOT NULL,
    "color" VARCHAR(20) NOT NULL DEFAULT 'brand',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_tags" (
    "client_id" UUID NOT NULL,
    "tag_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "client_tags_pkey" PRIMARY KEY ("client_id","tag_id")
);

-- CreateTable
CREATE TABLE "client_technical_sheets" (
    "client_id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "allergies" TEXT,
    "fields" JSONB NOT NULL DEFAULT '{}',
    "custom_fields" JSONB NOT NULL DEFAULT '[]',
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,

    CONSTRAINT "client_technical_sheets_pkey" PRIMARY KEY ("client_id")
);

-- CreateTable
CREATE TABLE "client_photos" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "business_id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "appointment_id" UUID,
    "service_name" VARCHAR(255),
    "caption" VARCHAR(255),
    "storage_path" TEXT NOT NULL,
    "taken_at" DATE NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,

    CONSTRAINT "client_photos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_consents" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "business_id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "kind" VARCHAR(30) NOT NULL DEFAULT 'whatsapp_lembretes',
    "granted" BOOLEAN NOT NULL,
    "channel" VARCHAR(20) NOT NULL,
    "granted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMP(3),
    "recorded_by" UUID,

    CONSTRAINT "client_consents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "waitlist_entries" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "business_id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "service_id" UUID NOT NULL,
    "professional_id" UUID,
    "desired_date" DATE,
    "period" VARCHAR(10) NOT NULL DEFAULT 'qualquer',
    "notes" VARCHAR(255),
    "status" VARCHAR(15) NOT NULL DEFAULT 'aguardando',
    "offered_at" TIMESTAMP(3),
    "appointment_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "waitlist_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tags_business_id_idx" ON "tags"("business_id");

-- CreateIndex
CREATE INDEX "client_photos_client_id_taken_at_idx" ON "client_photos"("client_id", "taken_at");

-- CreateIndex
CREATE INDEX "client_consents_client_id_granted_at_idx" ON "client_consents"("client_id", "granted_at");

-- CreateIndex
CREATE UNIQUE INDEX "waitlist_entries_appointment_id_key" ON "waitlist_entries"("appointment_id");

-- CreateIndex
CREATE INDEX "waitlist_entries_business_id_status_idx" ON "waitlist_entries"("business_id", "status");

-- AddForeignKey
ALTER TABLE "tags" ADD CONSTRAINT "tags_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_tags" ADD CONSTRAINT "client_tags_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_tags" ADD CONSTRAINT "client_tags_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_technical_sheets" ADD CONSTRAINT "client_technical_sheets_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_technical_sheets" ADD CONSTRAINT "client_technical_sheets_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_technical_sheets" ADD CONSTRAINT "client_technical_sheets_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_photos" ADD CONSTRAINT "client_photos_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_photos" ADD CONSTRAINT "client_photos_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_photos" ADD CONSTRAINT "client_photos_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_photos" ADD CONSTRAINT "client_photos_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_consents" ADD CONSTRAINT "client_consents_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_consents" ADD CONSTRAINT "client_consents_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_consents" ADD CONSTRAINT "client_consents_recorded_by_fkey" FOREIGN KEY ("recorded_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "waitlist_entries" ADD CONSTRAINT "waitlist_entries_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "waitlist_entries" ADD CONSTRAINT "waitlist_entries_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "waitlist_entries" ADD CONSTRAINT "waitlist_entries_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "waitlist_entries" ADD CONSTRAINT "waitlist_entries_professional_id_fkey" FOREIGN KEY ("professional_id") REFERENCES "professionals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "waitlist_entries" ADD CONSTRAINT "waitlist_entries_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Etiqueta única por negócio sem diferenciar maiúsculas (o Prisma não expressa lower()).
CREATE UNIQUE INDEX IF NOT EXISTS "tags_business_id_lower_name_key" ON "tags" ("business_id", lower("name"));

-- Bucket privado das fotos de procedimento (dado pessoal da cliente).
INSERT INTO storage.buckets (id, name, public)
VALUES ('client-photos', 'client-photos', false)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.tags                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_tags             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_technical_sheets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_photos           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_consents         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.waitlist_entries        ENABLE ROW LEVEL SECURITY;
