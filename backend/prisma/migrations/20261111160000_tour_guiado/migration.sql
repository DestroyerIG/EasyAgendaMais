-- Tour guiado pelo painel no primeiro acesso. Negócios que já existem não veem o tour: ficam como concluídos.
ALTER TABLE "businesses" ADD COLUMN "tour_concluido_em" TIMESTAMP(3);
UPDATE "businesses" SET "tour_concluido_em" = NOW();
