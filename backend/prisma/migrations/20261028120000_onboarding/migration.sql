-- AlterTable
ALTER TABLE "businesses" ADD COLUMN     "onboarding_concluido_em" TIMESTAMP(3),
ADD COLUMN     "onboarding_etapa" SMALLINT NOT NULL DEFAULT 1,
ADD COLUMN     "primeiros_passos_dispensado_em" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "business_settings" ADD COLUMN     "modo_equipe" VARCHAR(10);


-- Contas que já existem não passam pelo onboarding (decisão do dono, 25/10)
UPDATE "businesses" SET "onboarding_etapa" = 6, "onboarding_concluido_em" = CURRENT_TIMESTAMP;
