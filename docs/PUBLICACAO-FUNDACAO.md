# Publicação da Fundação EasyAgenda+ (sub-projeto A)

Este roteiro substitui a Tarefa 13 do plano (`docs/superpowers/plans/2026-09-17-fundacao-easyagenda.md`), que não era seguro do jeito que estava escrito. Siga as seções na ordem. As consultas marcadas "só leitura" não alteram nada no banco.

Em todo o roteiro, `<DIRETA>` é a string de conexão do Supabase que o Prisma Migrate usa: a conexão direta ou a do **Session pooler** (porta 5432), copiada em Supabase → Connect. Nunca a do Transaction pooler (porta 6543, com `pgbouncer=true`).

---

## 1. Tudo isto acontece ANTES do merge

- O merge em `main` é a publicação. O Render e a Vercel publicam `main` sozinhos, e o Start Command do Render é `npx prisma migrate deploy && npm start` (ver `DEPLOY.md`). Então o merge aplica no banco de produção as duas migrations novas:
  - `20260917150000_rename_to_business_professional` (renomeia tabelas, colunas, índices, restrições, função e políticas);
  - `20260917160000_drop_legacy_bot_config_defaults` (tira os DEFAULTs antigos das mensagens do bot).
- As seções 2, 3, 4 e 8 precisam estar feitas, e o script da seção 7 à mão, **antes** de clicar em merge.
- Entre o início da migration e o fim dos deploys do Render e da Vercel o sistema fica fora do ar. Com apenas contas de teste, isso é aceitável.

## 2. Backup do banco

O plano gratuito do Supabase não tem backup pelo painel. Faça um `pg_dump` (mesmo padrão de `POSTGRESQL_SETUP.md`), usando a conexão `<DIRETA>`:

```bash
pg_dump "<DIRETA>" --schema=public --no-owner --no-privileges \
  -f backup_easyagenda_antes_fundacao_$(date +%Y%m%d_%H%M%S).sql
```

- O `pg_dump` precisa ser da mesma versão principal do Postgres do Supabase, ou mais nova (veja com `SELECT version();`). Sem `pg_dump` instalado, use o Docker com a imagem da versão certa, por exemplo `docker run --rm -v "$PWD:/backup" postgres:17-alpine pg_dump "<DIRETA>" --schema=public --no-owner --no-privileges -f /backup/backup_easyagenda_antes_fundacao.sql`.
- Confira que o arquivo não está vazio: `grep -c "CREATE TABLE public" backup_easyagenda_antes_fundacao_*.sql` deve dar mais de 20.
- O schema `public` tem todas as tabelas do sistema e o histórico `_prisma_migrations`. Os schemas `auth` e `storage` são do Supabase e não entram; as políticas de Storage que a migration troca são recriadas pelo script de reversão (seção 7).
- Guarde o arquivo **fora do repositório** (tem dados pessoais) e não apague até a verificação da seção 11 terminar. É a única forma de recuperar os dados das colunas que a migration apaga (seção 7).

## 3. Conferências só de leitura no Supabase

Rode cada consulta no SQL Editor do Supabase e guarde a saída de todas.

### 3.1 Histórico do Prisma

Com a branch `feat/fundacao-easyagenda` na máquina:

```bash
cd backend
DATABASE_URL="<DIRETA>" DIRECT_URL="<DIRETA>" npx prisma migrate status
```

Esperado: nenhuma migration com falha, e só as duas novas como pendentes (`20260917150000_rename_to_business_professional` e `20260917160000_drop_legacy_bot_config_defaults`).

- **Migration com falha registrada:** o `migrate deploy` para com o erro P3009 e não aplica nada; como ele roda em todo boot do Render, o backend não sobe mais. Resolva antes do merge.
- **Inconsistência conhecida:** a migration `20260512190000_update_whatsapp_bot_config` renomeia `welcome_message` para `welcome_header`, mas a `legacy-migrations/migration_v3.sql` já tinha criado `welcome_header`. Num banco montado pelas legacy-migrations, como o de produção, ela falha. Confira como produção registrou:

  ```sql
  SELECT migration_name, started_at, finished_at, rolled_back_at, applied_steps_count
  FROM _prisma_migrations
  ORDER BY started_at;

  SELECT column_name
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'whatsapp_bot_config'
  ORDER BY ordinal_position;
  ```

  - `20260512190000_update_whatsapp_bot_config` com `finished_at` preenchido e `rolled_back_at` vazio: registrada como aplicada, nada a fazer. Se `welcome_message` ainda existir, é uma sobra fora do `schema.prisma`: o código não a lê, e a migration nova tira o DEFAULT antigo dela.
  - `finished_at` e `rolled_back_at` vazios (falhou): se `welcome_header` e as 13 colunas que ela acrescenta (`end_session_message` até `instagram_message`) já existem, o efeito dela já está no banco. Registre como aplicada: `DATABASE_URL="<DIRETA>" DIRECT_URL="<DIRETA>" npx prisma migrate resolve --applied 20260512190000_update_whatsapp_bot_config`. Se faltar alguma coluna, pare e peça ajuda.
- **Outras pendentes além das duas novas:** elas também vão rodar no merge. Pare e confira o que cada uma faz antes.

### 3.2 Consulta de descoberta (rodar ANTES e DEPOIS)

Lista tudo que ainda tem nome de barbearia no banco:

```sql
SELECT 'tabela' AS tipo, c.relname AS nome FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','i') AND c.relname ILIKE '%barb%'
UNION ALL SELECT 'restricao', conname FROM pg_constraint WHERE conname ILIKE '%barb%'
UNION ALL SELECT 'coluna', table_name || '.' || column_name FROM information_schema.columns WHERE table_schema='public' AND column_name ILIKE '%barb%'
UNION ALL SELECT 'politica', policyname FROM pg_policies WHERE policyname ILIKE '%barb%'
ORDER BY 1, 2;
```

Antes do merge: várias linhas (tabelas `barbershops`, `barbers`, `barbershop_settings`, índices, restrições, colunas `barbershop_id`/`barber_id`, políticas). Guarde como "antes". Depois do deploy: zero linhas (seção 11).

### 3.3 Políticas e o que depende de `current_barbershop_id()`

```sql
SELECT schemaname, tablename, policyname FROM pg_policies ORDER BY 1, 2, 3;
```

A migration apaga a função `public.current_barbershop_id()` sem `CASCADE`. Se alguma política criada à mão no painel usar essa função, o `DROP FUNCTION` aborta a migration inteira (seção 6). Esta consulta lista o que depende da função e não é uma das 18 políticas que a própria migration remove antes do `DROP FUNCTION` (a 19ª, `tenant_update_own_user`, não usa a função):

```sql
SELECT pg_describe_object(d.classid, d.objid, d.objsubid) AS objeto_inesperado
FROM pg_depend d
LEFT JOIN pg_policy p ON d.classid = 'pg_policy'::regclass AND p.oid = d.objid
WHERE d.refclassid = 'pg_proc'::regclass
  AND d.refobjid = to_regprocedure('public.current_barbershop_id()')
  AND (p.polname IS NULL OR p.polname NOT IN (
    'tenant_select_barbershop', 'tenant_update_barbershop', 'tenant_select_users',
    'tenant_all_barbers', 'tenant_all_services', 'tenant_all_clients', 'tenant_all_appointments',
    'tenant_all_earnings', 'tenant_all_expenses', 'tenant_select_subscription_events',
    'tenant_select_billing_webhook_events', 'tenant_select_billing_payments', 'tenant_select_audit_logs',
    'tenant_select_whatsapp_sessions', 'tenant_all_whatsapp_bot_config', 'tenant_select_whatsapp_ratings',
    'tenant_all_barbershop_settings', 'tenant_all_whatsapp_menu_options'));
```

Esperado: zero linhas. Se aparecer algo, anote a definição (`SELECT * FROM pg_policies WHERE policyname = '<nome>';`), apague antes do merge e recrie depois usando `public.current_business_id()`.

Confira também que nenhuma função ou visão depende dos nomes antigos (esperado: zero linhas nas duas):

```sql
SELECT p.oid::regprocedure AS funcao
FROM pg_proc p
WHERE p.pronamespace = 'public'::regnamespace
  AND p.prosrc ILIKE '%barb%'
  AND p.proname <> 'current_barbershop_id';

SELECT table_name AS visao FROM information_schema.views WHERE table_schema = 'public';
```

### 3.4 DEFAULTs das mensagens do bot

```sql
SELECT column_name, column_default
FROM information_schema.columns
WHERE table_name='whatsapp_bot_config' AND column_default IS NOT NULL;
```

Em produção, montada pelas legacy-migrations, esperam-se `id`, `created_at`, `updated_at` e as colunas de mensagem com os textos antigos (`{nome_barbearia}`, `{barbeiro}`, "EasyBarber Bot"). O "Resetar para o padrão" das mensagens do bot grava uma linha só com o negócio, e cada coluna pega esse DEFAULT: é por isso que existe a migration `20260917160000_drop_legacy_bot_config_defaults`. Depois do deploy, a mesma consulta deve trazer só `id`, `created_at` e `updated_at` (seção 11).

## 4. Variáveis de ambiente

No Render (backend), antes do merge:

- Acrescente os nomes novos **ao lado** dos antigos, com os mesmos valores:
  - `WHATSAPP_DEFAULT_BUSINESS_ID` = valor de `WHATSAPP_DEFAULT_BARBERSHOP_ID` (se existir);
  - `WHATSAPP_INSTANCE_BUSINESS_MAP` = valor de `WHATSAPP_INSTANCE_BARBERSHOP_MAP` (se existir).
  Não apague os antigos agora: o código que está no ar, e o de uma eventual reversão, lê os nomes antigos.
- `ASAAS_BILLING_DESCRIPTION`: o código novo troca `{plan}` e `{business}` (o antigo trocava `{barbershop}`). O mais simples é **apagar a variável**: cada versão do código usa o próprio texto padrão (o novo é `EasyAgenda+ - Plano {plan} ({business})`). Se quiser um texto próprio, defina-o logo depois do deploy, com `{plan}` e `{business}`.
- `SMTP_FROM`: troque o nome para `EasyAgenda+`, com um endereço de um domínio que você controla. Hoje o backend não envia e-mail por SMTP (ver seção 8), então isso é só para não deixar a marca antiga.
- Apague `DEBUG_TOKEN`: as rotas `/debug` não existem mais.
- Ao salvar, o Render pode oferecer publicar de novo a versão atual. Não tem problema: o código atual ignora os nomes novos.
- Os nomes antigos (`WHATSAPP_DEFAULT_BARBERSHOP_ID`, `WHATSAPP_INSTANCE_BARBERSHOP_MAP`) só saem depois da verificação da seção 11.

Na Vercel (frontend): `BACKEND_ORIGIN` é opcional. Sem ela, o CSP libera o backend atual (`https://easybarber-backend.onrender.com`). O projeto na Vercel continua `barberpro-saas-2-0`.

## 5. Publicar

Caminho normal: fazer o merge do PR. No log do Render devem aparecer, nesta ordem:

```
Applying migration `20260917150000_rename_to_business_professional`
Applying migration `20260917160000_drop_legacy_bot_config_defaults`
All migrations have been successfully applied.
```

e depois a subida do servidor. Em seguida, espere o deploy da Vercel terminar.

**Se preferir aplicar a migration à mão** antes do merge, em vez de deixar o Render aplicar:

```bash
cd backend
DATABASE_URL="<DIRETA>" DIRECT_URL="<DIRETA>" npx prisma migrate status   # confira o host na linha "Datasource"
DATABASE_URL="<DIRETA>" DIRECT_URL="<DIRETA>" npx prisma migrate deploy
```

- Passe as **duas** variáveis. O `schema.prisma` tem `directUrl = env("DIRECT_URL")`, e é por essa conexão que o Migrate roda.
- O Prisma também lê `backend/.env`: uma variável que faltar na linha de comando vem de lá. Um `backend/.env` esquecido, apontando para outro banco, faria a migration rodar no banco errado (ou ler só a metade certa). Confira com `ls backend/.env` e com a linha "Datasource" do `migrate status`.
- A partir daí o backend que está no ar (código antigo) para de funcionar: faça o merge logo em seguida. No boot, o Render roda `migrate deploy` de novo e não encontra nada pendente.

## 6. Se a migration falhar

O que acontece (testado num banco local com uma política feita à mão usando `current_barbershop_id()`):

- A migration roda numa transação só: o erro desfaz tudo, e o banco fica com os nomes antigos.
- Mas o Prisma registra a migration como falha em `_prisma_migrations`. A partir daí, todo boot do Render para no `migrate deploy` com o erro P3009, e o backend não sobe (fica reiniciando).

Como sair:

1. Leia o erro no log do Render (linhas `Database error`).
2. Corrija a causa no banco. Exemplo: a política que usa `current_barbershop_id()` — anote a definição e apague.
3. Marque a migration como revertida (use o nome que aparece no log):
   ```bash
   cd backend
   DATABASE_URL="<DIRETA>" DIRECT_URL="<DIRETA>" npx prisma migrate resolve --rolled-back 20260917150000_rename_to_business_professional
   ```
4. No Render, publique de novo (Manual Deploy → Deploy latest commit). O `migrate deploy` aplica as duas migrations.

Se o banco estiver num estado que você não entende, não improvise: pare, guarde o log e peça ajuda. O backup da seção 2 é a referência do estado anterior.

## 7. Script de reversão

Arquivo: `backend/prisma/rollback/20260917150000_rename_to_business_professional.down.sql`. O cabeçalho dele explica tudo; o resumo:

- **Quando usar:** as migrations foram aplicadas **com sucesso**, mas é preciso voltar para o código anterior à renomeação. Se a migration **falhou**, não use: siga a seção 6.
- **Como usar:**
  1. Render: volte para o deploy anterior ao merge (Rollback na lista de deploys). O código antigo sobe; a pasta de migrations dele não tem as duas novas, então o `migrate deploy` do boot não faz nada. Até o passo 2 as telas dão erro.
  2. Rode o script, na conexão `<DIRETA>`:
     ```bash
     psql "<DIRETA>" -v ON_ERROR_STOP=1 -f backend/prisma/rollback/20260917150000_rename_to_business_professional.down.sql
     ```
     Ele roda numa transação só e se recusa a rodar se `public.businesses` não existir.
  3. Vercel: promova o deploy anterior (Instant Rollback).
  4. Confira: a consulta de descoberta (3.2) volta a listar os nomes antigos, e `SELECT to_regprocedure('public.current_barbershop_id()');` não é nulo.
- **Histórico do Prisma:** o `prisma migrate resolve --rolled-back` recusa migration aplicada com sucesso (erro P3012). Por isso o próprio script marca as duas migrations como revertidas em `_prisma_migrations` (`rolled_back_at`). O `prisma migrate status` continua dizendo "up to date" nesse estado; confira pela tabela:
  ```sql
  SELECT migration_name, finished_at, rolled_back_at FROM _prisma_migrations WHERE migration_name LIKE '202609%';
  ```
  Um novo merge do código novo aplica as duas de novo.
- **O que não volta:**
  - os dados de `barbershops.whatsapp_phone_number_id`, `whatsapp_waba_id`, `whatsapp_access_token` e de `barbershop_settings.google_calendar_enabled`, `custom_webhook_url`, `email_reminders`: as colunas voltam vazias (as duas booleanas com o DEFAULT original). Os valores só voltam pelo backup da seção 2;
  - os DEFAULTs antigos das mensagens do bot: não precisam voltar, porque o código antigo também usa o texto padrão dele quando a coluna está vazia. Por isso não há script de reversão separado para a `20260917160000`;
  - o bucket `professional-photos` fica (sem políticas), para exclusão manual.

## 8. E-mails do Supabase Auth

- Os e-mails de confirmação de cadastro e de redefinição de senha saem do Supabase Auth, com os modelos do painel. O backend não envia esses e-mails (`backend/src/services/emailService.ts` não é importado em lugar nenhum).
- Em Supabase → Authentication → Emails, edite à mão todos os modelos (confirmação de cadastro, redefinição de senha, link mágico, troca de e-mail, convite): troque a marca antiga por EasyAgenda+ e "barbearia" por "negócio". Se houver SMTP próprio configurado lá, troque também o nome do remetente.
- Em Authentication → URL Configuration, confira: Site URL `https://barberpro-saas-2-0.vercel.app` e, em Redirect URLs, `https://barberpro-saas-2-0.vercel.app/auth/confirm` (é o endereço que o backend manda nos links de confirmação e de redefinição).
- Pode ser feito antes do merge.

## 9. Depois do deploy: sessões

Saia de todas as sessões de teste, em todos os navegadores, e entre de novo. O token de acesso vale 15 minutos e carrega o `barbershopId` antigo: até expirar, a API responde `missing_business_context`. As preferências salvas no navegador mudaram de nome (`easyagenda:*`) e voltam ao padrão.

## 10. Não apague o bucket `barber-photos`

As fotos dos profissionais de teste guardam o endereço público desse bucket, que continua público. As fotos novas vão para `professional-photos`. (A Tarefa 13 do plano mandava apagar: não apague.) Só apague quando nenhum registro apontar para ele:

```sql
SELECT count(*) FROM professionals WHERE photo LIKE '%/barber-photos/%';
```

## 11. Verificação

### 11.1 Banco

- Consulta de descoberta (3.2): **zero linhas**.
- Consulta de DEFAULTs (3.4): só `id`, `created_at` e `updated_at`.
- `DATABASE_URL="<DIRETA>" DIRECT_URL="<DIRETA>" npx prisma migrate status`: "Database schema is up to date!".
- Mensagens do bot já salvas com texto antigo (só leitura):
  ```sql
  SELECT business_id FROM whatsapp_bot_config w WHERE to_jsonb(w)::text ~* 'easybarber|barbeir|barbear';
  ```
  A migration só trocou as variáveis (`{nome_barbearia}` → `{nome_negocio}`, `{barbeiro}` → `{profissional}`). Linhas criadas com os textos padrão antigos continuam com "EasyBarber Bot" e "Barbeiro:". Para cada negócio listado: no painel, WhatsApp → Mensagens → botão de voltar ao padrão (ícone de seta circular, "Resetar para o padrão").

### 11.2 Roteiro manual

Com uma conta de teste:

1. Cadastro novo, com o e-mail de confirmação chegando com a marca EasyAgenda+ (depende da seção 8).
2. Login e abertura do painel.
3. Criar um profissional e um serviço.
4. Criar um agendamento, concluir e conferir o lançamento no caixa.
5. Exportar o relatório em PDF e conferir o cabeçalho.
6. Enviar foto de profissional (bucket `professional-photos`).
7. Conectar o WhatsApp por QR code (só se a instância de teste não responder) e trocar uma mensagem com o bot, conferindo que ele se apresenta como assistente do negócio.
8. Em WhatsApp → Mensagens, clicar em "Resetar para o padrão" (ícone de seta circular), recarregar a página e conferir que nenhum texto tem `{nome_barbearia}`, `{barbeiro}` ou a marca antiga.
9. Desligar "Enviar lembretes por WhatsApp" e confirmar que a opção fica salva.
10. Uma cobrança Pix no Asaas e uma no cartão pelo Stripe, em modo de teste, **criadas depois do deploy**. Cobranças e checkouts abertos antes carregam o identificador antigo (`barbershop:<id>` no Asaas, `barbershopId` nos metadados do Stripe), que o código novo não reconhece: não pague os antigos; cancele as assinaturas de teste antigas no Stripe se precisar.

### 11.3 Limpeza

Só depois de tudo conferido:

- Render: apague `WHATSAPP_DEFAULT_BARBERSHOP_ID` e `WHATSAPP_INSTANCE_BARBERSHOP_MAP`.
- Guarde o backup da seção 2 até ter certeza de que não vai precisar da reversão.
