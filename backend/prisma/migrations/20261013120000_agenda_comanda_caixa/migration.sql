-- AlterTable
ALTER TABLE "professionals" ADD COLUMN     "break_end" TIME(6),
ADD COLUMN     "break_start" TIME(6),
ADD COLUMN     "commission_product_pct" DECIMAL(5,2),
ADD COLUMN     "commission_service_pct" DECIMAL(5,2);

-- AlterTable
ALTER TABLE "appointments" ADD COLUMN     "deposit_amount" DECIMAL(10,2),
ADD COLUMN     "finished_at" TIMESTAMP(3),
ADD COLUMN     "started_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "expenses" ADD COLUMN     "payment_method" VARCHAR(20);

-- AlterTable
ALTER TABLE "business_settings" ADD COLUMN     "commission_product_pct" DECIMAL(5,2) NOT NULL DEFAULT 0,
ADD COLUMN     "commission_service_pct" DECIMAL(5,2) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "products" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "business_id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "description" VARCHAR(255),
    "price" DECIMAL(10,2) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comandas" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "business_id" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "appointment_id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "professional_id" UUID NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'rascunho',
    "services_total" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "products_total" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "deposit_applied" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "discount_amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "tip_amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "total_charged" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "payment_method" VARCHAR(20),
    "commission_total" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "cash_session_id" UUID,
    "closed_at" TIMESTAMP(3),
    "closed_by" UUID,
    "receipt_sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "comandas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comanda_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "comanda_id" UUID NOT NULL,
    "kind" VARCHAR(10) NOT NULL,
    "service_id" UUID,
    "product_id" UUID,
    "name" VARCHAR(255) NOT NULL,
    "unit_price" DECIMAL(10,2) NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "duration_minutes" INTEGER,
    "commission_pct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "commission_amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "is_main" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "comanda_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "business_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "opened_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "opened_by" UUID NOT NULL,
    "opening_balance" DECIMAL(10,2) NOT NULL,
    "closed_at" TIMESTAMP(3),
    "closed_by" UUID,
    "counted_balance" DECIMAL(10,2),
    "expected_balance" DECIMAL(10,2),
    "difference" DECIMAL(10,2),
    "notes" TEXT,

    CONSTRAINT "cash_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_movements" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "cash_session_id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "kind" VARCHAR(20) NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "description" VARCHAR(255) NOT NULL,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cash_movements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "products_business_id_active_idx" ON "products"("business_id", "active");

-- CreateIndex
CREATE UNIQUE INDEX "comandas_appointment_id_key" ON "comandas"("appointment_id");

-- CreateIndex
CREATE INDEX "comandas_business_id_closed_at_idx" ON "comandas"("business_id", "closed_at");

-- CreateIndex
CREATE UNIQUE INDEX "comandas_business_id_number_key" ON "comandas"("business_id", "number");

-- CreateIndex
CREATE INDEX "comanda_items_comanda_id_idx" ON "comanda_items"("comanda_id");

-- CreateIndex
CREATE UNIQUE INDEX "cash_sessions_business_id_date_key" ON "cash_sessions"("business_id", "date");

-- CreateIndex
CREATE INDEX "cash_movements_cash_session_id_idx" ON "cash_movements"("cash_session_id");

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comandas" ADD CONSTRAINT "comandas_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comandas" ADD CONSTRAINT "comandas_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comandas" ADD CONSTRAINT "comandas_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comandas" ADD CONSTRAINT "comandas_professional_id_fkey" FOREIGN KEY ("professional_id") REFERENCES "professionals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comandas" ADD CONSTRAINT "comandas_cash_session_id_fkey" FOREIGN KEY ("cash_session_id") REFERENCES "cash_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comandas" ADD CONSTRAINT "comandas_closed_by_fkey" FOREIGN KEY ("closed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comanda_items" ADD CONSTRAINT "comanda_items_comanda_id_fkey" FOREIGN KEY ("comanda_id") REFERENCES "comandas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comanda_items" ADD CONSTRAINT "comanda_items_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comanda_items" ADD CONSTRAINT "comanda_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_sessions" ADD CONSTRAINT "cash_sessions_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_sessions" ADD CONSTRAINT "cash_sessions_opened_by_fkey" FOREIGN KEY ("opened_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_sessions" ADD CONSTRAINT "cash_sessions_closed_by_fkey" FOREIGN KEY ("closed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_cash_session_id_fkey" FOREIGN KEY ("cash_session_id") REFERENCES "cash_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Sinal já pago em reservas públicas antigas (antes só era calculado na hora).
UPDATE "appointments" a
   SET "deposit_amount" = ROUND(s."price" * s."deposit_percentage" / 100, 2)
  FROM "services" s
 WHERE a."service_id" = s."id"
   AND a."source" = 'publico'
   AND a."status" <> 'aguardando_pagamento'
   AND a."deposit_amount" IS NULL
   AND s."deposit_percentage" IS NOT NULL;

-- RLS sem policy = nenhuma leitura pela API pública do Supabase (o backend usa a
-- conexão de serviço). `notifications` (20261001140000) tinha ficado sem RLS.
ALTER TABLE public.products        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comandas        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comanda_items   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_sessions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_movements  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications   ENABLE ROW LEVEL SECURITY;
