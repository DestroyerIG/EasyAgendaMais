-- Reversão MANUAL da migration 20260917150000_rename_to_business_professional
-- (e do registro da 20260917160000_drop_legacy_bot_config_defaults).
--
-- ─── Quando usar ───────────────────────────────────────────────────────────────
-- Só quando as duas migrations foram APLICADAS COM SUCESSO e é preciso voltar o
-- backend para a versão anterior à renomeação (o código antigo espera
-- barbershops, barbers, barbershop_id, current_barbershop_id() ...), sem
-- restaurar o pg_dump (por exemplo, para não perder o que foi gravado depois da
-- publicação). O roteiro completo está em docs/PUBLICACAO-FUNDACAO.md.
--
-- NÃO usar quando a migration FALHOU no deploy. Nesse caso o Postgres desfaz a
-- migration inteira (ela roda numa transação só) e o banco continua com os
-- nomes antigos; o que falta é só o registro: corrigir a causa e rodar
--   npx prisma migrate resolve --rolled-back 20260917150000_rename_to_business_professional
-- O script se recusa a rodar se public.businesses não existir.
--
-- ─── Como rodar ────────────────────────────────────────────────────────────────
-- É manual: fica fora de prisma/migrations e nunca roda sozinho. Antes, voltar o
-- backend no Render para o deploy anterior à renomeação (senão o boot seguinte
-- roda `prisma migrate deploy` com o código novo e reaplica a renomeação). Depois,
-- na conexão DIRETA do Supabase (a mesma do DIRECT_URL, não o pooler):
--   psql "$DIRECT_URL" -v ON_ERROR_STOP=1 -f backend/prisma/rollback/20260917150000_rename_to_business_professional.down.sql
-- Tudo roda numa transação só: se algo falhar, nada muda.
--
-- ─── Histórico do Prisma ───────────────────────────────────────────────────────
-- `prisma migrate resolve --rolled-back` só aceita migration que FALHOU; para
-- migration aplicada com sucesso ele recusa com o erro P3012 ("cannot be rolled
-- back because it is not in a failed state"). Por isso o próprio script, na
-- última seção e na mesma transação, marca as duas migrations como revertidas
-- em _prisma_migrations (rolled_back_at = now(), o mesmo que o resolve grava).
-- Com isso o `prisma migrate deploy` passa a tratá-las como não aplicadas: o
-- boot do código antigo (sem essas pastas em prisma/migrations) sobe normal, e
-- um novo deploy do código novo as aplica de novo. Atenção: o
-- `prisma migrate status` (Prisma 5.22) continua dizendo "Database schema is up
-- to date!" nesse estado; para conferir, olhe a tabela:
--   SELECT migration_name, finished_at, rolled_back_at FROM _prisma_migrations
--    WHERE migration_name LIKE '202609%';
--
-- ─── O que NÃO volta ───────────────────────────────────────────────────────────
-- 1. Os DADOS das seis colunas apagadas pela migration:
--      barbershops.whatsapp_phone_number_id, whatsapp_waba_id, whatsapp_access_token
--      barbershop_settings.google_calendar_enabled, custom_webhook_url, email_reminders
--    As colunas voltam vazias e aceitando NULL. As duas booleanas voltam com o
--    DEFAULT original (email_reminders = true, google_calendar_enabled = false),
--    que preenche as linhas existentes: o Prisma Client antigo declara essas
--    duas como Boolean obrigatório e falharia ao ler NULL. Recuperar os valores
--    originais exige o pg_dump feito antes da publicação. Para voltar também ao
--    NOT NULL original, depois de conferir:
--      ALTER TABLE public.barbershop_settings
--        ALTER COLUMN email_reminders SET NOT NULL,
--        ALTER COLUMN google_calendar_enabled SET NOT NULL;
-- 2. Os DEFAULTs de legado das mensagens do bot, tirados pela
--    20260917160000_drop_legacy_bot_config_defaults. Não precisam voltar: o
--    código antigo também cai no texto padrão dele quando a coluna é NULL.
-- 3. O nome exato de legado da unicidade de uma coluna de Stripe que só tinha o
--    objeto uq_barbershops_stripe_* (a seção 5b da migration a renomeou para o
--    nome padrão do Prisma): ela volta como barbershops_<coluna>_key. Nenhum
--    código lê esse nome.
-- 4. O bucket professional-photos e as fotos enviadas para ele: as políticas
--    dele saem, mas o bucket fica, para exclusão manual pelo painel do Storage.
-- 5. Mensagens do bot digitadas DEPOIS da publicação com {nome_negocio} ou
--    {profissional} viram {nome_barbearia} e {barbeiro} (é o que o código antigo
--    entende); mensagens que já não usavam esses tokens não mudam.

\set ON_ERROR_STOP on

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.businesses') IS NULL THEN
    RAISE EXCEPTION 'public.businesses não existe: a renomeação não está aplicada neste banco, nada a reverter';
  END IF;
  IF to_regclass('public.barbershops') IS NOT NULL THEN
    RAISE EXCEPTION 'public.barbershops já existe: banco em estado inesperado, reverter à mão';
  END IF;
END $$;

-- ─── 1. Políticas e função com os nomes novos saem primeiro ───────────────────

DROP POLICY IF EXISTS "tenant_select_business"                ON public.businesses;
DROP POLICY IF EXISTS "tenant_update_business"                ON public.businesses;
DROP POLICY IF EXISTS "tenant_select_users"                   ON public.users;
DROP POLICY IF EXISTS "tenant_update_own_user"                ON public.users;
DROP POLICY IF EXISTS "tenant_all_professionals"              ON public.professionals;
DROP POLICY IF EXISTS "tenant_all_services"                   ON public.services;
DROP POLICY IF EXISTS "tenant_all_clients"                    ON public.clients;
DROP POLICY IF EXISTS "tenant_all_appointments"               ON public.appointments;
DROP POLICY IF EXISTS "tenant_all_earnings"                   ON public.earnings;
DROP POLICY IF EXISTS "tenant_all_expenses"                   ON public.expenses;
DROP POLICY IF EXISTS "tenant_select_subscription_events"     ON public.subscription_events;
DROP POLICY IF EXISTS "tenant_select_billing_webhook_events"  ON public.billing_webhook_events;
DROP POLICY IF EXISTS "tenant_select_billing_payments"        ON public.billing_payments;
DROP POLICY IF EXISTS "tenant_select_audit_logs"              ON public.audit_logs;
DROP POLICY IF EXISTS "tenant_select_whatsapp_sessions"       ON public.whatsapp_sessions;
DROP POLICY IF EXISTS "tenant_all_whatsapp_bot_config"        ON public.whatsapp_bot_config;
DROP POLICY IF EXISTS "tenant_select_whatsapp_ratings"        ON public.whatsapp_ratings;
DROP POLICY IF EXISTS "tenant_all_business_settings"          ON public.business_settings;
DROP POLICY IF EXISTS "tenant_all_whatsapp_menu_options"      ON public.whatsapp_menu_options;

-- Sem CASCADE: se alguma política feita à mão depois da publicação usar a
-- função, o DROP aborta o script inteiro em vez de apagá-la em silêncio.
DROP FUNCTION IF EXISTS public.current_business_id();

-- ─── 2. Tabelas ───────────────────────────────────────────────────────────────

ALTER TABLE public.businesses        RENAME TO barbershops;
ALTER TABLE public.professionals     RENAME TO barbers;
ALTER TABLE public.business_settings RENAME TO barbershop_settings;

-- ─── 3. Colunas ───────────────────────────────────────────────────────────────

ALTER TABLE public.users                  RENAME COLUMN business_id     TO barbershop_id;
ALTER TABLE public.barbers                RENAME COLUMN business_id     TO barbershop_id;
ALTER TABLE public.services               RENAME COLUMN business_id     TO barbershop_id;
ALTER TABLE public.clients                RENAME COLUMN business_id     TO barbershop_id;
ALTER TABLE public.appointments           RENAME COLUMN business_id     TO barbershop_id;
ALTER TABLE public.appointments           RENAME COLUMN professional_id TO barber_id;
ALTER TABLE public.earnings               RENAME COLUMN business_id     TO barbershop_id;
ALTER TABLE public.expenses               RENAME COLUMN business_id     TO barbershop_id;
ALTER TABLE public.subscription_events    RENAME COLUMN business_id     TO barbershop_id;
ALTER TABLE public.billing_webhook_events RENAME COLUMN business_id     TO barbershop_id;
ALTER TABLE public.billing_payments       RENAME COLUMN business_id     TO barbershop_id;
ALTER TABLE public.whatsapp_sessions      RENAME COLUMN business_id     TO barbershop_id;
ALTER TABLE public.whatsapp_bot_config    RENAME COLUMN business_id     TO barbershop_id;
ALTER TABLE public.whatsapp_ratings       RENAME COLUMN business_id     TO barbershop_id;
ALTER TABLE public.barbershop_settings    RENAME COLUMN business_id     TO barbershop_id;
ALTER TABLE public.whatsapp_menu_options  RENAME COLUMN business_id     TO barbershop_id;
ALTER TABLE public.audit_logs             RENAME COLUMN actor_business_id  TO actor_barbershop_id;
ALTER TABLE public.audit_logs             RENAME COLUMN target_business_id TO target_barbershop_id;

-- pending_registrations é tabela de SQL cru (sem modelo Prisma) e não existe no
-- banco montado pelo 0_init.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'pending_registrations' AND column_name = 'business_name'
  ) THEN
    ALTER TABLE public.pending_registrations RENAME COLUMN business_name TO barbershop_name;
  END IF;
END $$;

-- ─── 4. Colunas apagadas voltam vazias (os dados só voltam pelo pg_dump) ──────

ALTER TABLE public.barbershops ADD COLUMN IF NOT EXISTS whatsapp_phone_number_id VARCHAR(64);
ALTER TABLE public.barbershops ADD COLUMN IF NOT EXISTS whatsapp_waba_id         VARCHAR(64);
ALTER TABLE public.barbershops ADD COLUMN IF NOT EXISTS whatsapp_access_token    TEXT;
CREATE INDEX IF NOT EXISTS barbershops_whatsapp_phone_number_id_idx ON public.barbershops (whatsapp_phone_number_id);

ALTER TABLE public.barbershop_settings ADD COLUMN IF NOT EXISTS email_reminders         BOOLEAN DEFAULT true;
ALTER TABLE public.barbershop_settings ADD COLUMN IF NOT EXISTS google_calendar_enabled BOOLEAN DEFAULT false;
ALTER TABLE public.barbershop_settings ADD COLUMN IF NOT EXISTS custom_webhook_url      TEXT;

-- ─── 5. Varredura inversa de constraints e índices ────────────────────────────
-- Espelho da seção 5c da migration: todo nome de constraint ou índice com
-- "business" ou "professional" volta para "barbershop"/"barber", na ordem mais
-- específica primeiro ("businesses" antes de "business", "professionals" antes
-- de "professional"). Também desfaz a seção 5b (businesses_email_key etc.).
-- Índice que sustenta pkey/unique/exclusion da própria tabela é pulado no laço
-- de índices: renomear a constraint renomeia o índice junto. Tolerante: nome
-- alvo já em uso faz pular aquele objeto em vez de abortar.
DO $$
DECLARE
  rec      record;
  new_name text;
BEGIN
  FOR rec IN
    SELECT c.relname AS name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_index ix ON ix.indexrelid = c.oid
    WHERE n.nspname = 'public'
      AND c.relkind = 'i'
      AND (c.relname ILIKE '%business%' OR c.relname ILIKE '%professional%')
      AND NOT EXISTS (
        SELECT 1 FROM pg_constraint pc
        WHERE pc.conindid = c.oid
          AND pc.contype IN ('p', 'u', 'x')
          AND pc.conrelid = ix.indrelid
      )
  LOOP
    new_name := rec.name;
    new_name := REPLACE(new_name, 'businesses',    'barbershops');
    new_name := REPLACE(new_name, 'business',      'barbershop');
    new_name := REPLACE(new_name, 'professionals', 'barbers');
    new_name := REPLACE(new_name, 'professional',  'barber');

    IF new_name = rec.name THEN
      CONTINUE;
    END IF;

    IF EXISTS (SELECT 1 FROM pg_class WHERE relname = new_name AND relnamespace = 'public'::regnamespace) THEN
      CONTINUE;
    END IF;

    EXECUTE format('ALTER INDEX public.%I RENAME TO %I', rec.name, new_name);
  END LOOP;

  FOR rec IN
    SELECT pc.conname AS name, rel.relname AS owner, pc.contype
    FROM pg_constraint pc
    JOIN pg_class rel ON rel.oid = pc.conrelid
    WHERE pc.connamespace = 'public'::regnamespace
      AND (pc.conname ILIKE '%business%' OR pc.conname ILIKE '%professional%')
  LOOP
    new_name := rec.name;
    new_name := REPLACE(new_name, 'businesses',    'barbershops');
    new_name := REPLACE(new_name, 'business',      'barbershop');
    new_name := REPLACE(new_name, 'professionals', 'barbers');
    new_name := REPLACE(new_name, 'professional',  'barber');

    IF new_name = rec.name THEN
      CONTINUE;
    END IF;

    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = new_name AND connamespace = 'public'::regnamespace)
       OR (rec.contype IN ('p', 'u', 'x')
           AND EXISTS (SELECT 1 FROM pg_class WHERE relname = new_name AND relnamespace = 'public'::regnamespace)) THEN
      CONTINUE;
    END IF;

    EXECUTE format('ALTER TABLE public.%I RENAME CONSTRAINT %I TO %I', rec.owner, rec.name, new_name);
  END LOOP;
END $$;

-- ─── 6. Função e políticas originais (20260608000000_enable_rls_policies) ─────

CREATE OR REPLACE FUNCTION public.current_barbershop_id()
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT barbershop_id
  FROM public.users
  WHERE supabase_user_id = auth.uid()
  LIMIT 1
$$;

CREATE POLICY "tenant_select_barbershop"
  ON public.barbershops FOR SELECT
  TO authenticated
  USING (id = public.current_barbershop_id());

CREATE POLICY "tenant_update_barbershop"
  ON public.barbershops FOR UPDATE
  TO authenticated
  USING  (id = public.current_barbershop_id())
  WITH CHECK (id = public.current_barbershop_id());

CREATE POLICY "tenant_select_users"
  ON public.users FOR SELECT
  TO authenticated
  USING (barbershop_id = public.current_barbershop_id());

CREATE POLICY "tenant_update_own_user"
  ON public.users FOR UPDATE
  TO authenticated
  USING  (supabase_user_id = auth.uid())
  WITH CHECK (supabase_user_id = auth.uid());

CREATE POLICY "tenant_all_barbers"
  ON public.barbers FOR ALL
  TO authenticated
  USING  (barbershop_id = public.current_barbershop_id())
  WITH CHECK (barbershop_id = public.current_barbershop_id());

CREATE POLICY "tenant_all_services"
  ON public.services FOR ALL
  TO authenticated
  USING  (barbershop_id = public.current_barbershop_id())
  WITH CHECK (barbershop_id = public.current_barbershop_id());

CREATE POLICY "tenant_all_clients"
  ON public.clients FOR ALL
  TO authenticated
  USING  (barbershop_id = public.current_barbershop_id())
  WITH CHECK (barbershop_id = public.current_barbershop_id());

CREATE POLICY "tenant_all_appointments"
  ON public.appointments FOR ALL
  TO authenticated
  USING  (barbershop_id = public.current_barbershop_id())
  WITH CHECK (barbershop_id = public.current_barbershop_id());

CREATE POLICY "tenant_all_earnings"
  ON public.earnings FOR ALL
  TO authenticated
  USING  (barbershop_id = public.current_barbershop_id())
  WITH CHECK (barbershop_id = public.current_barbershop_id());

CREATE POLICY "tenant_all_expenses"
  ON public.expenses FOR ALL
  TO authenticated
  USING  (barbershop_id = public.current_barbershop_id())
  WITH CHECK (barbershop_id = public.current_barbershop_id());

CREATE POLICY "tenant_select_subscription_events"
  ON public.subscription_events FOR SELECT
  TO authenticated
  USING (barbershop_id = public.current_barbershop_id());

CREATE POLICY "tenant_select_billing_webhook_events"
  ON public.billing_webhook_events FOR SELECT
  TO authenticated
  USING (barbershop_id = public.current_barbershop_id());

CREATE POLICY "tenant_select_billing_payments"
  ON public.billing_payments FOR SELECT
  TO authenticated
  USING (barbershop_id = public.current_barbershop_id());

CREATE POLICY "tenant_select_audit_logs"
  ON public.audit_logs FOR SELECT
  TO authenticated
  USING (
    actor_barbershop_id  = public.current_barbershop_id()
    OR target_barbershop_id = public.current_barbershop_id()
  );

CREATE POLICY "tenant_select_whatsapp_sessions"
  ON public.whatsapp_sessions FOR SELECT
  TO authenticated
  USING (barbershop_id = public.current_barbershop_id());

CREATE POLICY "tenant_all_whatsapp_bot_config"
  ON public.whatsapp_bot_config FOR ALL
  TO authenticated
  USING  (barbershop_id = public.current_barbershop_id())
  WITH CHECK (barbershop_id = public.current_barbershop_id());

CREATE POLICY "tenant_select_whatsapp_ratings"
  ON public.whatsapp_ratings FOR SELECT
  TO authenticated
  USING (barbershop_id = public.current_barbershop_id());

CREATE POLICY "tenant_all_barbershop_settings"
  ON public.barbershop_settings FOR ALL
  TO authenticated
  USING  (barbershop_id = public.current_barbershop_id())
  WITH CHECK (barbershop_id = public.current_barbershop_id());

CREATE POLICY "tenant_all_whatsapp_menu_options"
  ON public.whatsapp_menu_options FOR ALL
  TO authenticated
  USING  (barbershop_id = public.current_barbershop_id())
  WITH CHECK (barbershop_id = public.current_barbershop_id());

-- A política de cupons não foi tocada pela migration e continua como está.

-- ─── 7. Storage: políticas do bucket barber-photos (20260609120000) ───────────
-- Só roda onde o Storage do Supabase existe. O bucket professional-photos fica
-- (sem políticas) para exclusão manual pelo painel.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'storage') THEN
    INSERT INTO storage.buckets (id, name, public)
    VALUES ('barber-photos', 'barber-photos', true)
    ON CONFLICT (id) DO UPDATE SET public = true;

    EXECUTE $p$DROP POLICY IF EXISTS "authenticated_insert_barber_photos" ON storage.objects$p$;
    EXECUTE $p$DROP POLICY IF EXISTS "authenticated_update_barber_photos" ON storage.objects$p$;
    EXECUTE $p$DROP POLICY IF EXISTS "authenticated_delete_barber_photos" ON storage.objects$p$;
    EXECUTE $p$DROP POLICY IF EXISTS "public_select_barber_photos"        ON storage.objects$p$;

    EXECUTE $p$CREATE POLICY "authenticated_insert_barber_photos"
      ON storage.objects FOR INSERT
      TO authenticated
      WITH CHECK (bucket_id = 'barber-photos')$p$;

    EXECUTE $p$CREATE POLICY "authenticated_update_barber_photos"
      ON storage.objects FOR UPDATE
      TO authenticated
      USING  (bucket_id = 'barber-photos')
      WITH CHECK (bucket_id = 'barber-photos')$p$;

    EXECUTE $p$CREATE POLICY "authenticated_delete_barber_photos"
      ON storage.objects FOR DELETE
      TO authenticated
      USING (bucket_id = 'barber-photos')$p$;

    EXECUTE $p$CREATE POLICY "public_select_barber_photos"
      ON storage.objects FOR SELECT
      TO public
      USING (bucket_id = 'barber-photos')$p$;

    EXECUTE $p$DROP POLICY IF EXISTS "authenticated_insert_professional_photos" ON storage.objects$p$;
    EXECUTE $p$DROP POLICY IF EXISTS "authenticated_update_professional_photos" ON storage.objects$p$;
    EXECUTE $p$DROP POLICY IF EXISTS "authenticated_delete_professional_photos" ON storage.objects$p$;
    EXECUTE $p$DROP POLICY IF EXISTS "public_select_professional_photos"        ON storage.objects$p$;
  END IF;
END $$;

-- ─── 8. Tokens das mensagens salvas do bot voltam ao formato antigo ───────────
-- Espelho da seção 8 da migration: todas as colunas de texto de
-- whatsapp_bot_config. No-op onde o token não aparece.
DO $$
DECLARE
  col record;
BEGIN
  FOR col IN
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'whatsapp_bot_config'
      AND data_type IN ('text', 'character varying', 'character')
  LOOP
    EXECUTE format(
      $f$UPDATE public.whatsapp_bot_config
         SET %I = REPLACE(REPLACE(%I, '{nome_negocio}', '{nome_barbearia}'), '{profissional}', '{barbeiro}')
         WHERE %I LIKE '%%{nome_negocio}%%' OR %I LIKE '%%{profissional}%%'$f$,
      col.column_name, col.column_name, col.column_name, col.column_name
    );
  END LOOP;
END $$;

-- ─── 9. Histórico do Prisma: as duas migrations passam a revertidas ───────────
-- O mesmo registro que `prisma migrate resolve --rolled-back` grava, feito aqui
-- porque o resolve recusa migration aplicada com sucesso (P3012).
DO $$
BEGIN
  IF to_regclass('public._prisma_migrations') IS NOT NULL THEN
    UPDATE public._prisma_migrations
       SET rolled_back_at = now()
     WHERE migration_name IN ('20260917150000_rename_to_business_professional',
                              '20260917160000_drop_legacy_bot_config_defaults')
       AND rolled_back_at IS NULL;
  END IF;
END $$;

COMMIT;
