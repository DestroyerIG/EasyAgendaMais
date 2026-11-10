-- Opção do proprietário: o robô do WhatsApp cobra o sinal. Só acrescenta a coluna; desligada por padrão.
ALTER TABLE "businesses" ADD COLUMN "bot_cobra_sinal" BOOLEAN NOT NULL DEFAULT false;
