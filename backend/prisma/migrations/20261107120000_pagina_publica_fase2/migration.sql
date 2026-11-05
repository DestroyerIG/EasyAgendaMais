-- Página pública (fase 2): só acrescenta colunas; nenhum dado existente muda.
ALTER TABLE "businesses"
  ADD COLUMN "cover_url" TEXT,
  ADD COLUMN "description" VARCHAR(500),
  ADD COLUMN "comodidades" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "mostrar_nota" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "services"
  ADD COLUMN "description" VARCHAR(255);
