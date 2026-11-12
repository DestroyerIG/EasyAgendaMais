-- Sinal geral do negócio: porcentagem do serviço sem porcentagem própria. Vale com a cobrança do sinal ligada (bot_cobra_sinal). Só acrescenta a coluna.
ALTER TABLE "businesses" ADD COLUMN "sinal_padrao_pct" DECIMAL(5,2);
