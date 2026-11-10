-- Nova etapa 4 (Recebimentos) no onboarding: só desloca quem ainda está no onboarding e já passou da etapa 3. Quem concluiu não muda.
UPDATE "businesses" SET "onboarding_etapa" = "onboarding_etapa" + 1 WHERE "onboarding_concluido_em" IS NULL AND "onboarding_etapa" >= 4;
