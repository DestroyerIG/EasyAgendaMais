-- AlterTable
ALTER TABLE "businesses" ADD COLUMN "slug" VARCHAR(100),
ADD COLUMN "pix_key" VARCHAR(255),
ADD COLUMN "pix_key_type" VARCHAR(20),
ADD COLUMN "logo_url" TEXT,
ADD COLUMN "brand_color" VARCHAR(7);

-- CreateIndex
CREATE UNIQUE INDEX "businesses_slug_key" ON "businesses"("slug");

-- AlterTable
ALTER TABLE "services" ADD COLUMN "deposit_percentage" NUMERIC(5,2);

-- AlterTable
ALTER TABLE "appointments" ADD COLUMN "expires_at" TIMESTAMP(3),
ADD COLUMN "source" VARCHAR(20) NOT NULL DEFAULT 'painel';
