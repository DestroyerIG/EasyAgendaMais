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

ALTER INDEX public.barbershops_email_key                          RENAME TO businesses_email_key;
ALTER INDEX public.barbershops_stripe_customer_id_key             RENAME TO businesses_stripe_customer_id_key;
ALTER INDEX public.barbershops_stripe_subscription_id_key         RENAME TO businesses_stripe_subscription_id_key;
ALTER INDEX public.whatsapp_bot_config_barbershop_id_key          RENAME TO whatsapp_bot_config_business_id_key;
ALTER INDEX public.barbershop_settings_barbershop_id_key          RENAME TO business_settings_business_id_key;
ALTER INDEX public.whatsapp_menu_options_barbershop_id_option_order_key RENAME TO whatsapp_menu_options_business_id_option_order_key;
-- uq_barbershops_whatsapp_instance_name_norm não existe nas migrations rastreadas
-- (não aparece em nenhuma migration aplicada localmente, apenas em legacy-migrations
-- não usadas); segue o mesmo padrão de pending_registrations: guarda com IF EXISTS
-- para o caso de existir apenas em produção, criada fora do histórico do Prisma.
ALTER INDEX IF EXISTS public.uq_barbershops_whatsapp_instance_name_norm RENAME TO uq_businesses_whatsapp_instance_name_norm;

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
-- Colunas reais de whatsapp_bot_config conferidas via \d: não existe
-- `welcome_message` (o brief assumia esse nome); a coluna de boas-vindas é
-- `welcome_header`, que contém {nome_barbearia} (ver DEFAULT_BOT_CONFIG em
-- backend/src/services/whatsapp/whatsappConstants.ts). `confirmation_message`
-- também contém {barbeiro} e foi incluída.

UPDATE public.whatsapp_bot_config SET
  welcome_header       = REPLACE(REPLACE(welcome_header,       '{nome_barbearia}', '{nome_negocio}'), '{barbeiro}', '{profissional}'),
  confirmation_message = REPLACE(REPLACE(confirmation_message, '{nome_barbearia}', '{nome_negocio}'), '{barbeiro}', '{profissional}'),
  reminder_message      = REPLACE(REPLACE(reminder_message,     '{nome_barbearia}', '{nome_negocio}'), '{barbeiro}', '{profissional}')
WHERE welcome_header       LIKE '%{nome_barbearia}%' OR welcome_header       LIKE '%{barbeiro}%'
   OR confirmation_message LIKE '%{nome_barbearia}%' OR confirmation_message LIKE '%{barbeiro}%'
   OR reminder_message      LIKE '%{nome_barbearia}%' OR reminder_message      LIKE '%{barbeiro}%';
