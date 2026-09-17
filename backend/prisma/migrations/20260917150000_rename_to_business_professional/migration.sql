-- Renomeia o domínio de barbearia para negócio genérico (EasyAgenda+).
-- Não apaga dados: só renomeia tabelas, colunas, índices, restrições e políticas,
-- e remove colunas comprovadamente mortas.

-- ─── 1. Políticas e função de RLS saem primeiro (dependem dos nomes antigos) ───

DROP POLICY IF EXISTS "tenant_select_barbershop"              ON public.barbershops;
DROP POLICY IF EXISTS "tenant_update_barbershop"              ON public.barbershops;
DROP POLICY IF EXISTS "tenant_select_users"                   ON public.users;
DROP POLICY IF EXISTS "tenant_update_own_user"                ON public.users;
DROP POLICY IF EXISTS "tenant_all_barbers"                    ON public.barbers;
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
DROP POLICY IF EXISTS "tenant_all_barbershop_settings"        ON public.barbershop_settings;
DROP POLICY IF EXISTS "tenant_all_whatsapp_menu_options"      ON public.whatsapp_menu_options;

DROP FUNCTION IF EXISTS public.current_barbershop_id();

-- ─── 2. Tabelas ───────────────────────────────────────────────────────────────

ALTER TABLE public.barbershops         RENAME TO businesses;
ALTER TABLE public.barbers             RENAME TO professionals;
ALTER TABLE public.barbershop_settings RENAME TO business_settings;

-- ─── 3. Colunas ───────────────────────────────────────────────────────────────

ALTER TABLE public.users                  RENAME COLUMN barbershop_id TO business_id;
ALTER TABLE public.professionals          RENAME COLUMN barbershop_id TO business_id;
ALTER TABLE public.services               RENAME COLUMN barbershop_id TO business_id;
ALTER TABLE public.clients                RENAME COLUMN barbershop_id TO business_id;
ALTER TABLE public.appointments           RENAME COLUMN barbershop_id TO business_id;
ALTER TABLE public.appointments           RENAME COLUMN barber_id     TO professional_id;
ALTER TABLE public.earnings               RENAME COLUMN barbershop_id TO business_id;
ALTER TABLE public.expenses               RENAME COLUMN barbershop_id TO business_id;
ALTER TABLE public.subscription_events    RENAME COLUMN barbershop_id TO business_id;
ALTER TABLE public.billing_webhook_events RENAME COLUMN barbershop_id TO business_id;
ALTER TABLE public.billing_payments       RENAME COLUMN barbershop_id TO business_id;
ALTER TABLE public.whatsapp_sessions      RENAME COLUMN barbershop_id TO business_id;
ALTER TABLE public.whatsapp_bot_config    RENAME COLUMN barbershop_id TO business_id;
ALTER TABLE public.whatsapp_ratings       RENAME COLUMN barbershop_id TO business_id;
ALTER TABLE public.business_settings      RENAME COLUMN barbershop_id TO business_id;
ALTER TABLE public.whatsapp_menu_options  RENAME COLUMN barbershop_id TO business_id;
ALTER TABLE public.audit_logs             RENAME COLUMN actor_barbershop_id  TO actor_business_id;
ALTER TABLE public.audit_logs             RENAME COLUMN target_barbershop_id TO target_business_id;

-- pending_registrations é tabela de SQL cru (sem modelo Prisma)
ALTER TABLE IF EXISTS public.pending_registrations RENAME COLUMN barbershop_name TO business_name;

-- ─── 4. Colunas mortas ────────────────────────────────────────────────────────
-- Credenciais da API oficial da Meta: nunca lidas pelo código; a conexão é por QR code.
DROP INDEX IF EXISTS public.barbershops_whatsapp_phone_number_id_idx;
ALTER TABLE public.businesses DROP COLUMN IF EXISTS whatsapp_phone_number_id;
ALTER TABLE public.businesses DROP COLUMN IF EXISTS whatsapp_waba_id;
ALTER TABLE public.businesses DROP COLUMN IF EXISTS whatsapp_access_token;

-- Configurações que apareciam na tela sem nenhum efeito.
ALTER TABLE public.business_settings DROP COLUMN IF EXISTS google_calendar_enabled;
ALTER TABLE public.business_settings DROP COLUMN IF EXISTS custom_webhook_url;
ALTER TABLE public.business_settings DROP COLUMN IF EXISTS email_reminders;

-- ─── 5. Restrições e índices ──────────────────────────────────────────────────

ALTER TABLE public.businesses            RENAME CONSTRAINT barbershops_pkey         TO businesses_pkey;
ALTER TABLE public.professionals         RENAME CONSTRAINT barbers_pkey             TO professionals_pkey;
ALTER TABLE public.business_settings     RENAME CONSTRAINT barbershop_settings_pkey TO business_settings_pkey;

ALTER TABLE public.users                  RENAME CONSTRAINT users_barbershop_id_fkey                  TO users_business_id_fkey;
ALTER TABLE public.professionals          RENAME CONSTRAINT barbers_barbershop_id_fkey                TO professionals_business_id_fkey;
ALTER TABLE public.services               RENAME CONSTRAINT services_barbershop_id_fkey               TO services_business_id_fkey;
ALTER TABLE public.clients                RENAME CONSTRAINT clients_barbershop_id_fkey                TO clients_business_id_fkey;
ALTER TABLE public.appointments           RENAME CONSTRAINT appointments_barbershop_id_fkey           TO appointments_business_id_fkey;
ALTER TABLE public.appointments           RENAME CONSTRAINT appointments_barber_id_fkey               TO appointments_professional_id_fkey;
ALTER TABLE public.earnings               RENAME CONSTRAINT earnings_barbershop_id_fkey               TO earnings_business_id_fkey;
ALTER TABLE public.expenses               RENAME CONSTRAINT expenses_barbershop_id_fkey               TO expenses_business_id_fkey;
ALTER TABLE public.subscription_events    RENAME CONSTRAINT subscription_events_barbershop_id_fkey    TO subscription_events_business_id_fkey;
ALTER TABLE public.billing_webhook_events RENAME CONSTRAINT billing_webhook_events_barbershop_id_fkey TO billing_webhook_events_business_id_fkey;
ALTER TABLE public.billing_payments       RENAME CONSTRAINT billing_payments_barbershop_id_fkey       TO billing_payments_business_id_fkey;
ALTER TABLE public.whatsapp_sessions      RENAME CONSTRAINT whatsapp_sessions_barbershop_id_fkey      TO whatsapp_sessions_business_id_fkey;
ALTER TABLE public.whatsapp_bot_config    RENAME CONSTRAINT whatsapp_bot_config_barbershop_id_fkey    TO whatsapp_bot_config_business_id_fkey;
ALTER TABLE public.whatsapp_ratings       RENAME CONSTRAINT whatsapp_ratings_barbershop_id_fkey       TO whatsapp_ratings_business_id_fkey;
ALTER TABLE public.business_settings      RENAME CONSTRAINT barbershop_settings_barbershop_id_fkey    TO business_settings_business_id_fkey;
ALTER TABLE public.whatsapp_menu_options  RENAME CONSTRAINT whatsapp_menu_options_barbershop_id_fkey  TO whatsapp_menu_options_business_id_fkey;
ALTER TABLE public.audit_logs             RENAME CONSTRAINT audit_logs_actor_barbershop_id_fkey       TO audit_logs_actor_business_id_fkey;
ALTER TABLE public.audit_logs             RENAME CONSTRAINT audit_logs_target_barbershop_id_fkey      TO audit_logs_target_business_id_fkey;

ALTER INDEX public.whatsapp_bot_config_barbershop_id_key          RENAME TO whatsapp_bot_config_business_id_key;
ALTER INDEX public.barbershop_settings_barbershop_id_key          RENAME TO business_settings_business_id_key;
ALTER INDEX public.whatsapp_menu_options_barbershop_id_option_order_key RENAME TO whatsapp_menu_options_business_id_option_order_key;

-- ─── 5b. Unicidade de businesses resolvida por coluna, não por nome fixo ──────
-- Produção NÃO foi construída pelo baseline 0_init: foi construída pelas
-- legacy-migrations (ver backend/prisma/legacy-migrations/README.md), então a
-- unicidade de stripe_customer_id/stripe_subscription_id/email pode existir lá
-- como CONSTRAINT com nome de legado (uq_barbershops_stripe_customer,
-- uq_barbershops_stripe_subscription — migration_v5.sql:26,34) em vez do índice
-- com nome padrão do Prisma que este ambiente local tem. Resolve por coluna:
-- acha o objeto de unicidade (índice solto OU índice que sustenta uma
-- constraint) sobre businesses(coluna) e renomeia o que encontrar para o nome
-- padrão do Prisma. Tolerante: sem objeto encontrado, ou nome alvo já em uso,
-- não faz nada.
DO $$
DECLARE
  cols     text[] := ARRAY['email', 'stripe_customer_id', 'stripe_subscription_id'];
  targets  text[] := ARRAY['businesses_email_key', 'businesses_stripe_customer_id_key', 'businesses_stripe_subscription_id_key'];
  i            int;
  v_col        text;
  v_target     text;
  v_indexrelid oid;
  v_indexname  text;
  v_conname    text;
BEGIN
  FOR i IN 1..array_length(cols, 1) LOOP
    v_col    := cols[i];
    v_target := targets[i];

    IF EXISTS (SELECT 1 FROM pg_class WHERE relname = v_target AND relnamespace = 'public'::regnamespace)
       OR EXISTS (SELECT 1 FROM pg_constraint WHERE conname = v_target AND connamespace = 'public'::regnamespace) THEN
      CONTINUE; -- já existe objeto com o nome alvo; idempotente
    END IF;

    v_indexrelid := NULL;
    SELECT ix.indexrelid, ic.relname
      INTO v_indexrelid, v_indexname
    FROM pg_index ix
    JOIN pg_class ic ON ic.oid = ix.indexrelid
    JOIN pg_class tc ON tc.oid = ix.indrelid
    JOIN pg_namespace n ON n.oid = tc.relnamespace
    WHERE tc.relname = 'businesses'
      AND n.nspname = 'public'
      AND ix.indisunique
      AND ix.indnkeyatts = 1
      AND ix.indkey[0] = (
        SELECT attnum FROM pg_attribute WHERE attrelid = tc.oid AND attname = v_col
      )
    LIMIT 1;

    IF v_indexrelid IS NULL THEN
      CONTINUE; -- nenhum objeto de unicidade sobre essa coluna; nada a renomear
    END IF;

    v_conname := NULL;
    SELECT conname INTO v_conname FROM pg_constraint WHERE conindid = v_indexrelid LIMIT 1;

    IF v_conname IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.businesses RENAME CONSTRAINT %I TO %I', v_conname, v_target);
    ELSE
      EXECUTE format('ALTER INDEX public.%I RENAME TO %I', v_indexname, v_target);
    END IF;
  END LOOP;
END $$;

-- ─── 5c. Limpeza genérica de nomes legados restantes ──────────────────────────
-- Produção carrega dezenas de índices/constraints nomeados pelas legacy-migrations
-- que este script não lista um a um (ex.: idx_appointments_barbershop_date,
-- idx_barbers_barbershop_active, check_barbershops_provider,
-- chk_barbershops_cpf_cnpj_digits, clients_barbershop_id_phone_key,
-- uq_barbershops_whatsapp_instance_name_norm). Varre o que sobrar com %barb% em
-- public e renomeia por substituição de substring, na ordem mais específica
-- primeiro (senão "barbershop" vira "businesss" ao passar por "barber" antes).
-- Índices que sustentam uma constraint são pulados aqui e resolvidos no laço de
-- constraints (renomear a constraint renomeia o índice de suporte junto).
-- Tolerante: nome alvo já em uso não derruba a migration, só pula esse objeto.
DO $$
DECLARE
  rec      record;
  new_name text;
  owner    text;
BEGIN
  FOR rec IN
    SELECT c.relname AS name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'i'
      AND c.relname ILIKE '%barb%'
      AND NOT EXISTS (SELECT 1 FROM pg_constraint pc WHERE pc.conindid = c.oid)
  LOOP
    new_name := rec.name;
    new_name := REPLACE(new_name, 'barbershops', 'businesses');
    new_name := REPLACE(new_name, 'barbershop',  'business');
    new_name := REPLACE(new_name, 'barbers',     'professionals');
    new_name := REPLACE(new_name, 'barber',      'professional');

    IF new_name = rec.name THEN
      CONTINUE;
    END IF;

    IF EXISTS (SELECT 1 FROM pg_class WHERE relname = new_name AND relnamespace = 'public'::regnamespace) THEN
      CONTINUE;
    END IF;

    EXECUTE format('ALTER INDEX public.%I RENAME TO %I', rec.name, new_name);
  END LOOP;

  FOR rec IN
    SELECT conname AS name
    FROM pg_constraint
    WHERE connamespace = 'public'::regnamespace
      AND conname ILIKE '%barb%'
  LOOP
    new_name := rec.name;
    new_name := REPLACE(new_name, 'barbershops', 'businesses');
    new_name := REPLACE(new_name, 'barbershop',  'business');
    new_name := REPLACE(new_name, 'barbers',     'professionals');
    new_name := REPLACE(new_name, 'barber',      'professional');

    IF new_name = rec.name THEN
      CONTINUE;
    END IF;

    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = new_name AND connamespace = 'public'::regnamespace) THEN
      CONTINUE;
    END IF;

    SELECT rel.relname INTO owner
    FROM pg_constraint pc
    JOIN pg_class rel ON rel.oid = pc.conrelid
    WHERE pc.conname = rec.name AND pc.connamespace = 'public'::regnamespace
    LIMIT 1;

    IF owner IS NULL THEN
      CONTINUE; -- constraint sem tabela dona (não deveria ocorrer neste schema)
    END IF;

    EXECUTE format('ALTER TABLE public.%I RENAME CONSTRAINT %I TO %I', owner, rec.name, new_name);
  END LOOP;
END $$;

-- ─── 6. Função e políticas de RLS com os nomes novos ──────────────────────────

CREATE OR REPLACE FUNCTION public.current_business_id()
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT business_id
  FROM public.users
  WHERE supabase_user_id = auth.uid()
  LIMIT 1
$$;

CREATE POLICY "tenant_select_business"
  ON public.businesses FOR SELECT
  TO authenticated
  USING (id = public.current_business_id());

CREATE POLICY "tenant_update_business"
  ON public.businesses FOR UPDATE
  TO authenticated
  USING  (id = public.current_business_id())
  WITH CHECK (id = public.current_business_id());

CREATE POLICY "tenant_select_users"
  ON public.users FOR SELECT
  TO authenticated
  USING (business_id = public.current_business_id());

CREATE POLICY "tenant_update_own_user"
  ON public.users FOR UPDATE
  TO authenticated
  USING  (supabase_user_id = auth.uid())
  WITH CHECK (supabase_user_id = auth.uid());

CREATE POLICY "tenant_all_professionals"
  ON public.professionals FOR ALL
  TO authenticated
  USING  (business_id = public.current_business_id())
  WITH CHECK (business_id = public.current_business_id());

CREATE POLICY "tenant_all_services"
  ON public.services FOR ALL
  TO authenticated
  USING  (business_id = public.current_business_id())
  WITH CHECK (business_id = public.current_business_id());

CREATE POLICY "tenant_all_clients"
  ON public.clients FOR ALL
  TO authenticated
  USING  (business_id = public.current_business_id())
  WITH CHECK (business_id = public.current_business_id());

CREATE POLICY "tenant_all_appointments"
  ON public.appointments FOR ALL
  TO authenticated
  USING  (business_id = public.current_business_id())
  WITH CHECK (business_id = public.current_business_id());

CREATE POLICY "tenant_all_earnings"
  ON public.earnings FOR ALL
  TO authenticated
  USING  (business_id = public.current_business_id())
  WITH CHECK (business_id = public.current_business_id());

CREATE POLICY "tenant_all_expenses"
  ON public.expenses FOR ALL
  TO authenticated
  USING  (business_id = public.current_business_id())
  WITH CHECK (business_id = public.current_business_id());

CREATE POLICY "tenant_select_subscription_events"
  ON public.subscription_events FOR SELECT
  TO authenticated
  USING (business_id = public.current_business_id());

CREATE POLICY "tenant_select_billing_webhook_events"
  ON public.billing_webhook_events FOR SELECT
  TO authenticated
  USING (business_id = public.current_business_id());

CREATE POLICY "tenant_select_billing_payments"
  ON public.billing_payments FOR SELECT
  TO authenticated
  USING (business_id = public.current_business_id());

CREATE POLICY "tenant_select_audit_logs"
  ON public.audit_logs FOR SELECT
  TO authenticated
  USING (
    actor_business_id  = public.current_business_id()
    OR target_business_id = public.current_business_id()
  );

CREATE POLICY "tenant_select_whatsapp_sessions"
  ON public.whatsapp_sessions FOR SELECT
  TO authenticated
  USING (business_id = public.current_business_id());

CREATE POLICY "tenant_all_whatsapp_bot_config"
  ON public.whatsapp_bot_config FOR ALL
  TO authenticated
  USING  (business_id = public.current_business_id())
  WITH CHECK (business_id = public.current_business_id());

CREATE POLICY "tenant_select_whatsapp_ratings"
  ON public.whatsapp_ratings FOR SELECT
  TO authenticated
  USING (business_id = public.current_business_id());

CREATE POLICY "tenant_all_business_settings"
  ON public.business_settings FOR ALL
  TO authenticated
  USING  (business_id = public.current_business_id())
  WITH CHECK (business_id = public.current_business_id());

CREATE POLICY "tenant_all_whatsapp_menu_options"
  ON public.whatsapp_menu_options FOR ALL
  TO authenticated
  USING  (business_id = public.current_business_id())
  WITH CHECK (business_id = public.current_business_id());

-- A política de cupons não cita barbearia e continua como está.

-- ─── 7. Bucket de fotos ───────────────────────────────────────────────────────
-- Só roda onde o Storage do Supabase existe. As fotos de teste do bucket antigo
-- não são copiadas; o bucket barber-photos fica para exclusão manual.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'storage') THEN
    INSERT INTO storage.buckets (id, name, public)
    VALUES ('professional-photos', 'professional-photos', true)
    ON CONFLICT (id) DO UPDATE SET public = true;

    EXECUTE $p$DROP POLICY IF EXISTS "authenticated_insert_professional_photos" ON storage.objects$p$;
    EXECUTE $p$DROP POLICY IF EXISTS "authenticated_update_professional_photos" ON storage.objects$p$;
    EXECUTE $p$DROP POLICY IF EXISTS "authenticated_delete_professional_photos" ON storage.objects$p$;
    EXECUTE $p$DROP POLICY IF EXISTS "public_select_professional_photos"        ON storage.objects$p$;

    EXECUTE $p$CREATE POLICY "authenticated_insert_professional_photos"
      ON storage.objects FOR INSERT TO authenticated
      WITH CHECK (bucket_id = 'professional-photos')$p$;

    EXECUTE $p$CREATE POLICY "authenticated_update_professional_photos"
      ON storage.objects FOR UPDATE TO authenticated
      USING  (bucket_id = 'professional-photos')
      WITH CHECK (bucket_id = 'professional-photos')$p$;

    EXECUTE $p$CREATE POLICY "authenticated_delete_professional_photos"
      ON storage.objects FOR DELETE TO authenticated
      USING (bucket_id = 'professional-photos')$p$;

    EXECUTE $p$CREATE POLICY "public_select_professional_photos"
      ON storage.objects FOR SELECT TO public
      USING (bucket_id = 'professional-photos')$p$;

    EXECUTE $p$DROP POLICY IF EXISTS "authenticated_insert_barber_photos" ON storage.objects$p$;
    EXECUTE $p$DROP POLICY IF EXISTS "authenticated_update_barber_photos" ON storage.objects$p$;
    EXECUTE $p$DROP POLICY IF EXISTS "authenticated_delete_barber_photos" ON storage.objects$p$;
    EXECUTE $p$DROP POLICY IF EXISTS "public_select_barber_photos"        ON storage.objects$p$;
  END IF;
END $$;

-- ─── 8. Textos salvos do bot ──────────────────────────────────────────────────
-- whatsappMessageService.formatMessage aplica a substituição {nome_barbearia}/
-- {barbeiro} em QUALQUER template, e o MessageConfigPanel do frontend permite
-- usar essas variáveis em colunas além de welcome/confirmation/reminder (ex.:
-- promotions_message, instagram_message). Um tenant pode ter editado qualquer
-- mensagem para incluir esses tokens, então a troca varre todas as colunas de
-- texto de whatsapp_bot_config, não uma lista fixa. É um no-op onde o token não
-- aparece. Colunas não-texto (id, business_id, timestamps) ficam de fora pelo
-- filtro de data_type.
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
         SET %I = REPLACE(REPLACE(%I, '{nome_barbearia}', '{nome_negocio}'), '{barbeiro}', '{profissional}')
         WHERE %I LIKE '%%{nome_barbearia}%%' OR %I LIKE '%%{barbeiro}%%'$f$,
      col.column_name, col.column_name, col.column_name, col.column_name
    );
  END LOOP;
END $$;
