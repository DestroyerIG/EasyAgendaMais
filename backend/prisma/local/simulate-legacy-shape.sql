-- Simula, num banco local descartável, o formato de produção ANTES da migration
-- 20260917150000_rename_to_business_professional, para testar que ela não aborta.
--
-- Por que existe: produção não foi construída pelo baseline 0_init do Prisma, e
-- sim pelas legacy-migrations (database.sql + migration_v2.sql ...
-- migration_v20_coupon_activation.sql — ver backend/prisma/legacy-migrations/
-- README.md); o 0_init só foi marcado como aplicado. Então produção carrega
-- índices e constraints com nomes (e tipos) que o banco local montado pelo
-- Prisma não tem. Este script parte do formato Prisma (as migrations anteriores
-- à rename já aplicadas) e o converte no formato de legado.
--
-- NUNCA rodar em dev compartilhado, staging ou produção: ele troca índices
-- únicos por constraints e cria dezenas de objetos. Para evitar acidente, ele se
-- recusa a rodar se o nome do banco não contiver "legacy".
--
-- O que ele cobre:
--   1. Os 34 nomes de índice/constraint com "barb" que as legacy-migrations
--      criam (10 constraints + 24 índices), com o DDL de legado. Colhidos com:
--        grep -ohiE "[a-z0-9_]*barb[a-z0-9_]*" backend/prisma/legacy-migrations/*.sql \
--          | sort -u | grep -E "^(idx|uq|chk|check)_|_(key|check)$"
--      O grep devolve 35; o 35º, idx_appointments_barbershop, só aparece num
--      DROP INDEX IF EXISTS (migration_v2.sql:97) e nunca é criado, então fica
--      de fora. O bloco final confere que os 34 existem.
--   2. Nomes default do Postgres gerados pelo DDL inline de database.sql que lá
--      são CONSTRAINT (no Prisma são índice solto) ou nem existem no Prisma:
--      barbershops_email_key, barbershops_stripe_customer_id_key,
--      whatsapp_bot_config_barbershop_id_key, barbershop_settings_barbershop_id_key,
--      barbershops_plan_check, barbershops_desired_plan_check,
--      barbershops_subscription_status_check.
--   3. Os dois formatos possíveis da unicidade das colunas de Stripe:
--      - stripe_customer_id com DOIS objetos de unicidade: o UNIQUE inline de
--        database.sql:16 (barbershops_stripe_customer_id_key) e o
--        uq_barbershops_stripe_customer de migration_v5.sql:26 — é o que um
--        banco novo montado com o database.sql consolidado + v5 teria;
--      - stripe_subscription_id só com uq_barbershops_stripe_subscription
--        (migration_v5.sql:34) — banco montado aos poucos, em que a coluna veio
--        do ADD COLUMN da v5, sem UNIQUE inline.
--
-- Como rodar (Git Bash / Linux / macOS, na raiz do repositório, com o container
-- easyagenda-db de pé). O Prisma não tem "deploy até a migration X", então as
-- migrations anteriores à rename entram por psql e depois são marcadas como
-- aplicadas com migrate resolve — o mesmo baseline que produção fez com 0_init.
-- O último migrate deploy aplica só a rename (e o que vier depois dela), do
-- mesmo jeito que vai rodar em produção.
--
--   DB=easyagenda_legacy
--   URL="postgresql://postgres:dev@localhost:55432/$DB"
--   PRE=$(ls backend/prisma/migrations | awk '$0 < "20260917150000"')
--   docker exec -i easyagenda-db psql -U postgres -c "DROP DATABASE IF EXISTS $DB;" -c "CREATE DATABASE $DB;"
--   docker exec -i easyagenda-db psql -U postgres -d $DB -v ON_ERROR_STOP=1 < backend/prisma/local/supabase-stub.sql
--   for m in $PRE; do docker exec -i easyagenda-db psql -U postgres -d $DB -q -v ON_ERROR_STOP=1 < backend/prisma/migrations/$m/migration.sql; done
--   (cd backend && for m in $PRE; do DATABASE_URL=$URL DIRECT_URL=$URL npx prisma migrate resolve --applied $m; done)
--   docker exec -i easyagenda-db psql -U postgres -d $DB < backend/prisma/local/simulate-legacy-shape.sql
--   docker exec -i easyagenda-db psql -U postgres -d $DB -c "$DISCOVERY"    # antes
--   (cd backend && DATABASE_URL=$URL DIRECT_URL=$URL npx prisma migrate deploy)
--   docker exec -i easyagenda-db psql -U postgres -d $DB -c "$DISCOVERY"    # depois
--   docker exec -i easyagenda-db psql -U postgres -c "DROP DATABASE $DB;"
--
-- onde $DISCOVERY é a consulta que lista tudo que ainda tem nome de barbearia:
--
--   DISCOVERY="SELECT 'tabela' AS tipo, c.relname AS nome FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','i') AND c.relname ILIKE '%barb%'
--   UNION ALL SELECT 'restricao', conname FROM pg_constraint WHERE conname ILIKE '%barb%'
--   UNION ALL SELECT 'coluna', table_name || '.' || column_name FROM information_schema.columns WHERE table_schema='public' AND column_name ILIKE '%barb%'
--   UNION ALL SELECT 'politica', policyname FROM pg_policies WHERE policyname ILIKE '%barb%'
--   ORDER BY 1, 2;"
--
-- O script roda numa transação só: se algo falhar, o banco fica como estava.

\set ON_ERROR_STOP on

BEGIN;

DO $$
BEGIN
  IF current_database() NOT LIKE '%legacy%' THEN
    RAISE EXCEPTION 'simulate-legacy-shape.sql só roda num banco descartável com "legacy" no nome (banco atual: %)', current_database();
  END IF;
  IF to_regclass('public.barbershops') IS NULL THEN
    RAISE EXCEPTION 'public.barbershops não existe: aplique as migrations anteriores à rename antes deste script';
  END IF;
END $$;

-- ─── 1. Unicidade de barbershops: constraints de legado no lugar dos índices do Prisma ─
-- O 0_init cria índices únicos soltos (CREATE UNIQUE INDEX); o legado tem constraints.

DROP INDEX public.barbershops_email_key;
ALTER TABLE public.barbershops ADD CONSTRAINT barbershops_email_key UNIQUE (email);                              -- database.sql:8 (UNIQUE inline)

DROP INDEX public.barbershops_stripe_customer_id_key;
ALTER TABLE public.barbershops ADD CONSTRAINT barbershops_stripe_customer_id_key UNIQUE (stripe_customer_id);    -- database.sql:16 (UNIQUE inline)
ALTER TABLE public.barbershops ADD CONSTRAINT uq_barbershops_stripe_customer UNIQUE (stripe_customer_id);        -- migration_v5.sql:26 (segundo objeto na mesma coluna)

DROP INDEX public.barbershops_stripe_subscription_id_key;
ALTER TABLE public.barbershops ADD CONSTRAINT uq_barbershops_stripe_subscription UNIQUE (stripe_subscription_id); -- migration_v5.sql:34 (único objeto)

-- ─── 2. Outros nomes default do DDL inline de database.sql ────────────────────
DROP INDEX public.whatsapp_bot_config_barbershop_id_key;
ALTER TABLE public.whatsapp_bot_config ADD CONSTRAINT whatsapp_bot_config_barbershop_id_key UNIQUE (barbershop_id); -- database.sql:237
DROP INDEX public.barbershop_settings_barbershop_id_key;
ALTER TABLE public.barbershop_settings ADD CONSTRAINT barbershop_settings_barbershop_id_key UNIQUE (barbershop_id); -- database.sql:297

ALTER TABLE public.barbershops ADD CONSTRAINT barbershops_plan_check                                              -- database.sql:12-13
  CHECK (plan IN ('basico', 'profissional', 'premium'));
ALTER TABLE public.barbershops ADD CONSTRAINT barbershops_desired_plan_check                                      -- database.sql:14-15
  CHECK (desired_plan IN ('basico', 'profissional', 'premium'));
ALTER TABLE public.barbershops ADD CONSTRAINT barbershops_subscription_status_check                               -- database.sql:31-32
  CHECK (subscription_status IN ('active', 'trialing', 'pending', 'past_due', 'unpaid', 'canceled', 'incomplete'));

-- ─── 3. As 10 constraints de legado com nome explícito ────────────────────────
-- (uq_barbershops_stripe_customer e uq_barbershops_stripe_subscription já entraram na seção 1.)
ALTER TABLE public.barbershops ADD CONSTRAINT check_barbershops_stripe_payment_mode                               -- database.sql:26 / migration_v11.sql:18
  CHECK (stripe_payment_mode IN ('subscription', 'payment'));
ALTER TABLE public.barbershops ADD CONSTRAINT check_barbershops_provider                                          -- database.sql:28 / migration_v20_coupon_activation.sql:12
  CHECK (provider IN ('stripe', 'asaas', 'coupon'));
ALTER TABLE public.barbershops ADD CONSTRAINT check_barbershops_payment_method                                    -- database.sql:30 / migration_v20_coupon_activation.sql:28
  CHECK (payment_method IN ('card', 'pix', 'boleto', 'coupon'));
ALTER TABLE public.barbershops ADD CONSTRAINT chk_barbershops_cpf_cnpj_digits                                     -- migration_v14.sql:60
  CHECK (cpf_cnpj IS NULL OR cpf_cnpj ~ '^([0-9]{11}|[0-9]{14})$');
ALTER TABLE public.barbershops ADD CONSTRAINT chk_barbershops_plan                                                -- migration_v2.sql:11
  CHECK (plan IN ('basico', 'profissional', 'premium'));
ALTER TABLE public.barbershop_settings ADD CONSTRAINT barbershop_settings_slot_interval_minutes_check             -- migration_v19_business_days_and_intervals.sql:8
  CHECK (slot_interval_minutes IN (0, 15, 20, 30, 45, 60, 90, 120));
ALTER TABLE public.barbershop_settings ADD CONSTRAINT barbershop_settings_dias_abertos_check                      -- migration_v19_business_days_and_intervals.sql:15
  CHECK (dias_abertos <@ ARRAY['seg','ter','qua','qui','sex','sab','dom']::TEXT[] AND cardinality(dias_abertos) > 0);
ALTER TABLE public.clients ADD CONSTRAINT clients_barbershop_id_phone_key UNIQUE (barbershop_id, phone);         -- database.sql:119 / migration_v2.sql:90

-- ─── 4. Os 24 índices de legado (nenhum existe nas migrations do Prisma) ──────
CREATE UNIQUE INDEX uq_barbershops_whatsapp_instance_name_norm                                                    -- database.sql:341 / migration_v15.sql:13
  ON public.barbershops ((lower(btrim(whatsapp_instance_name))))
  WHERE NULLIF(btrim(whatsapp_instance_name), '') IS NOT NULL;
CREATE INDEX idx_appointments_barbershop_date        ON public.appointments (barbershop_id, date);               -- database.sql:320 / migration_v2.sql:101
CREATE INDEX idx_appointments_barber_date            ON public.appointments (barber_id, date);                   -- database.sql:321 / migration_v2.sql:104
CREATE INDEX idx_appointments_barbershop_date_status ON public.appointments (barbershop_id, date, status);       -- migration_v4.sql:7
CREATE INDEX idx_clients_barbershop                  ON public.clients (barbershop_id);                          -- database.sql:325 / migration_v2.sql:111
CREATE INDEX idx_clients_barbershop_phone            ON public.clients (barbershop_id, phone);                   -- migration_v4.sql:24
CREATE INDEX idx_earnings_barbershop_date            ON public.earnings (barbershop_id, date);                   -- database.sql:329 / migration_v4.sql:16
CREATE INDEX idx_expenses_barbershop_date            ON public.expenses (barbershop_id, date);                   -- database.sql:330 / migration_v4.sql:20
CREATE INDEX idx_users_barbershop_blocked            ON public.users (barbershop_id, blocked);                   -- database.sql:336 / migration_v6.sql:54
CREATE INDEX idx_barbershops_subscription_status     ON public.barbershops (subscription_status);                -- database.sql:340 / migration_v5.sql:48
CREATE INDEX idx_barbershops_stripe_customer         ON public.barbershops (stripe_customer_id);                 -- database.sql:344 / migration_v5.sql:51
CREATE INDEX idx_barbershops_stripe_payment_mode     ON public.barbershops (stripe_payment_mode);                -- migration_v11.sql:48
CREATE INDEX idx_barbershops_provider                ON public.barbershops (provider);                           -- database.sql:346 / migration_v12.sql:126
CREATE INDEX idx_barbershops_asaas_customer          ON public.barbershops (asaas_customer_id);                  -- database.sql:347 / migration_v18_asaas_customer_id.sql:15
CREATE INDEX idx_barbershops_provider_customer       ON public.barbershops (provider_customer_id);               -- database.sql:348 / migration_v12.sql:129
CREATE INDEX idx_barbershops_provider_subscription   ON public.barbershops (provider_subscription_id);           -- database.sql:349 / migration_v12.sql:132
CREATE INDEX idx_barbershops_provider_payment        ON public.barbershops (provider_payment_id);                -- database.sql:350 / migration_v12.sql:135
CREATE INDEX idx_billing_payments_barbershop         ON public.billing_payments (barbershop_id, created_at DESC); -- database.sql:353 / migration_v12.sql:144
CREATE INDEX idx_whatsapp_ratings_barbershop         ON public.whatsapp_ratings (barbershop_id);                 -- database.sql:362
CREATE INDEX idx_barbershop_settings_barbershop_id   ON public.barbershop_settings (barbershop_id);              -- database.sql:363 / migration_v8.sql:24
CREATE INDEX idx_barbers_barbershop_active           ON public.barbers (barbershop_id) WHERE active = true;      -- database.sql:366 / migration_v2.sql:127
CREATE INDEX idx_services_barbershop_active          ON public.services (barbershop_id) WHERE active = true;     -- database.sql:367 / migration_v2.sql:131
CREATE INDEX idx_menu_options_barbershop             ON public.whatsapp_menu_options (barbershop_id);            -- migration_v3.sql:102
CREATE INDEX idx_whatsapp_sessions_phone_barbershop  ON public.whatsapp_sessions (phone, barbershop_id);         -- migration_v4.sql:28

-- ─── 5. Conferência: os 34 nomes colhidos das legacy-migrations existem ───────
DO $$
DECLARE
  harvested text[] := ARRAY[
    -- 10 constraints
    'barbershop_settings_dias_abertos_check', 'barbershop_settings_slot_interval_minutes_check',
    'check_barbershops_payment_method', 'check_barbershops_provider', 'check_barbershops_stripe_payment_mode',
    'chk_barbershops_cpf_cnpj_digits', 'chk_barbershops_plan', 'clients_barbershop_id_phone_key',
    'uq_barbershops_stripe_customer', 'uq_barbershops_stripe_subscription',
    -- 24 índices
    'idx_appointments_barber_date', 'idx_appointments_barbershop_date', 'idx_appointments_barbershop_date_status',
    'idx_barbers_barbershop_active', 'idx_barbershop_settings_barbershop_id', 'idx_barbershops_asaas_customer',
    'idx_barbershops_provider', 'idx_barbershops_provider_customer', 'idx_barbershops_provider_payment',
    'idx_barbershops_provider_subscription', 'idx_barbershops_stripe_customer', 'idx_barbershops_stripe_payment_mode',
    'idx_barbershops_subscription_status', 'idx_billing_payments_barbershop', 'idx_clients_barbershop',
    'idx_clients_barbershop_phone', 'idx_earnings_barbershop_date', 'idx_expenses_barbershop_date',
    'idx_menu_options_barbershop', 'idx_services_barbershop_active', 'idx_users_barbershop_blocked',
    'idx_whatsapp_ratings_barbershop', 'idx_whatsapp_sessions_phone_barbershop',
    'uq_barbershops_whatsapp_instance_name_norm'
  ];
  missing text;
BEGIN
  IF array_length(harvested, 1) <> 34 THEN
    RAISE EXCEPTION 'lista de nomes colhidos tem % itens, esperado 34', array_length(harvested, 1);
  END IF;

  SELECT string_agg(n, ', ') INTO missing
  FROM unnest(harvested) AS n
  WHERE NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = n AND connamespace = 'public'::regnamespace)
    AND NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = n AND relnamespace = 'public'::regnamespace);

  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'nomes de legado ausentes após a simulação: %', missing;
  END IF;

  RAISE NOTICE 'simulação de legado aplicada: os 34 nomes colhidos existem';
END $$;

COMMIT;
