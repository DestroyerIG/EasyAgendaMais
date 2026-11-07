-- Textos do robô sem coluna própria, por chave. Só acrescenta a coluna; nenhum dado existente muda.
ALTER TABLE "whatsapp_bot_config" ADD COLUMN "textos_extras" JSONB NOT NULL DEFAULT '{}';
