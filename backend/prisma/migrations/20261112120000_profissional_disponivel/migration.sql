-- Disponibilidade da profissional (liga/desliga a agenda). Todas continuam disponíveis.
ALTER TABLE "professionals" ADD COLUMN "available" BOOLEAN NOT NULL DEFAULT true;
