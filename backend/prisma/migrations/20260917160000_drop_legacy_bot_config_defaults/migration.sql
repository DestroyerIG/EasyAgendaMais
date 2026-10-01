-- Tira os DEFAULTs de legado das colunas de texto de whatsapp_bot_config.
--
-- Por que existe: produção foi montada pelas legacy-migrations, não pelo
-- baseline 0_init (ver backend/prisma/legacy-migrations/README.md). Lá as
-- colunas de mensagem do bot ganharam DEFAULT com os textos antigos
-- (database.sql:238-279 e migration_v3.sql:7-84): {nome_barbearia}, {barbeiro},
-- "Barbeiro:", 💈 e "Me chame de *EasyBarber Bot*". A migration
-- 20260917150000_rename_to_business_professional reescreveu as LINHAS salvas,
-- mas não os DEFAULTs das colunas.
--
-- O "restaurar padrão" do bot (POST /whatsapp/config/reset, em
-- backend/src/routes/whatsapp.ts) faz INSERT INTO whatsapp_bot_config
-- (business_id): toda coluna de mensagem recebe o DEFAULT do banco. Com os
-- DEFAULTs de legado, o cliente passaria a receber {nome_barbearia} e
-- {barbeiro} crus (o backend não substitui mais esses tokens) e a marca antiga.
--
-- Sem DEFAULT, a coluna fica NULL, e quem lê a configuração cai no texto padrão
-- do código para cada NULL: getBotConfig (whatsappConfigService.ts) usa
-- `?? DEFAULT_BOT_CONFIG.<campo>` e o lembrete (cronService.ts) só usa o texto
-- salvo quando ele existe.
--
-- Guiado pelo catálogo, não por lista fixa (uma coluna criada à mão no painel
-- também é coberta):
--   - toda coluna de texto com DEFAULT perde o DEFAULT;
--   - toda coluna de texto NOT NULL perde o NOT NULL. O schema.prisma declara
--     todas elas como String?, e o legado não as fez NOT NULL; mas se alguma
--     tiver sido marcada NOT NULL à mão, o INSERT (business_id) passaria a
--     falhar depois do DROP DEFAULT.
-- Colunas de chave primária e colunas geradas ficam de fora. No banco montado
-- pelo 0_init (sem DEFAULT e sem NOT NULL nessas colunas) não faz nada.
--
-- Não precisa de script de reversão: o código anterior à renomeação também cai
-- no texto padrão dele quando a coluna é NULL. Os textos de legado continuam em
-- backend/prisma/legacy-migrations/ e no pg_dump feito antes da publicação.

DO $$
DECLARE
  col record;
BEGIN
  FOR col IN
    SELECT a.attname    AS column_name,
           a.atthasdef  AS has_default,
           a.attnotnull AS not_null
    FROM pg_attribute a
    WHERE a.attrelid = 'public.whatsapp_bot_config'::regclass
      AND a.attnum > 0
      AND NOT a.attisdropped
      AND a.attgenerated = ''
      AND a.atttypid IN ('text'::regtype, 'character varying'::regtype, 'character'::regtype)
      AND NOT EXISTS (
        SELECT 1 FROM pg_constraint pk
        WHERE pk.conrelid = a.attrelid
          AND pk.contype = 'p'
          AND a.attnum = ANY (pk.conkey)
      )
    ORDER BY a.attnum
  LOOP
    IF col.has_default THEN
      EXECUTE format('ALTER TABLE public.whatsapp_bot_config ALTER COLUMN %I DROP DEFAULT', col.column_name);
    END IF;

    IF col.not_null THEN
      EXECUTE format('ALTER TABLE public.whatsapp_bot_config ALTER COLUMN %I DROP NOT NULL', col.column_name);
    END IF;
  END LOOP;
END $$;
