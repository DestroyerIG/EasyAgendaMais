-- AlterTable
ALTER TABLE "businesses" ADD COLUMN     "whatsapp_connected_at" TIMESTAMPTZ(6);

-- AlterTable
ALTER TABLE "whatsapp_bot_config" ADD COLUMN     "politica_message" TEXT;

-- CreateTable
CREATE TABLE "whatsapp_conversations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "business_id" UUID NOT NULL,
    "phone" VARCHAR(20) NOT NULL,
    "phone_key" VARCHAR(20) NOT NULL,
    "client_id" UUID,
    "handler" VARCHAR(10) NOT NULL DEFAULT 'bot',
    "assigned_user_id" UUID,
    "status" VARCHAR(12) NOT NULL DEFAULT 'aberta',
    "last_message_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_message_preview" VARCHAR(160) NOT NULL DEFAULT '',
    "last_inbound_at" TIMESTAMPTZ(6),
    "unread_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "whatsapp_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whatsapp_messages" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "business_id" UUID NOT NULL,
    "conversation_id" UUID,
    "phone_key" VARCHAR(20) NOT NULL,
    "direction" VARCHAR(3) NOT NULL,
    "origin" VARCHAR(20) NOT NULL,
    "body" TEXT NOT NULL DEFAULT '',
    "media_type" VARCHAR(12),
    "provider_message_id" VARCHAR(128),
    "status" VARCHAR(10) NOT NULL,
    "sent_by_user_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "whatsapp_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whatsapp_opt_outs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "business_id" UUID NOT NULL,
    "phone_key" VARCHAR(20) NOT NULL,
    "client_id" UUID,
    "keyword" VARCHAR(20) NOT NULL,
    "opted_out_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reactivated_at" TIMESTAMPTZ(6),

    CONSTRAINT "whatsapp_opt_outs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "whatsapp_conversations_business_id_status_last_message_at_idx" ON "whatsapp_conversations"("business_id", "status", "last_message_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_conversations_business_id_phone_key_key" ON "whatsapp_conversations"("business_id", "phone_key");

-- CreateIndex
CREATE INDEX "whatsapp_messages_conversation_id_created_at_idx" ON "whatsapp_messages"("conversation_id", "created_at");

-- CreateIndex
CREATE INDEX "whatsapp_messages_business_id_direction_created_at_idx" ON "whatsapp_messages"("business_id", "direction", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_opt_outs_business_id_phone_key_key" ON "whatsapp_opt_outs"("business_id", "phone_key");

-- AddForeignKey
ALTER TABLE "whatsapp_conversations" ADD CONSTRAINT "whatsapp_conversations_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_conversations" ADD CONSTRAINT "whatsapp_conversations_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_conversations" ADD CONSTRAINT "whatsapp_conversations_assigned_user_id_fkey" FOREIGN KEY ("assigned_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_messages" ADD CONSTRAINT "whatsapp_messages_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_messages" ADD CONSTRAINT "whatsapp_messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "whatsapp_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_messages" ADD CONSTRAINT "whatsapp_messages_sent_by_user_id_fkey" FOREIGN KEY ("sent_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_opt_outs" ADD CONSTRAINT "whatsapp_opt_outs_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Mensagem da Evolution gravada uma vez só por negócio (reentrega do webhook e eco fromMe).
CREATE UNIQUE INDEX IF NOT EXISTS "whatsapp_messages_business_provider_key"
  ON "whatsapp_messages" ("business_id", "provider_message_id")
  WHERE "provider_message_id" IS NOT NULL;

ALTER TABLE public.whatsapp_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_messages      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_opt_outs      ENABLE ROW LEVEL SECURITY;
