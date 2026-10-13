-- Cria `pending_registrations` (cadastro aguardando confirmação de e-mail).
--
-- A tabela nasceu nas migrações legadas (legacy-migrations/migration_v10.sql, v14, v16)
-- e nunca entrou no histórico do Prisma: num banco novo (`prisma migrate deploy`) o
-- cadastro quebrava por falta dela. As migrações seguintes já a alteram com IF EXISTS
-- (20260530 desired_plan, 20260608 RLS, 20260917 barbershop_name -> business_name),
-- por isso esta vem antes delas e usa o nome de coluna da época (`barbershop_name`).
--
-- Em bancos onde a tabela já existe (produção) tudo aqui é no-op.

CREATE TABLE IF NOT EXISTS public.pending_registrations (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email                VARCHAR(255) NOT NULL UNIQUE,
  supabase_user_id     UUID UNIQUE,
  barbershop_name      VARCHAR(255) NOT NULL,
  owner_name           VARCHAR(255) NOT NULL,
  whatsapp             VARCHAR(20) NOT NULL,
  cpf_cnpj             VARCHAR(20),
  desired_plan         VARCHAR(50) NOT NULL DEFAULT 'basico'
    CONSTRAINT pending_registrations_desired_plan_check
      CHECK (desired_plan IN ('basico', 'profissional', 'premium')),
  password_hash        CHAR(60),
  auth_provider        VARCHAR(20) NOT NULL DEFAULT 'supabase'
    CONSTRAINT chk_pending_registrations_auth_provider_supabase_only
      CHECK (auth_provider = 'supabase'),
  status               VARCHAR(20) NOT NULL DEFAULT 'pending'
    CONSTRAINT pending_registrations_status_check
      CHECK (status IN ('pending', 'completed', 'canceled')),
  verification_sent_at TIMESTAMP,
  confirmed_at         TIMESTAMP,
  created_at           TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at           TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_pending_registrations_cpf_cnpj_digits
    CHECK (cpf_cnpj IS NULL OR cpf_cnpj ~ '^([0-9]{11}|[0-9]{14})$')
);

CREATE INDEX IF NOT EXISTS idx_pending_registrations_status_email
  ON public.pending_registrations (status, email);
