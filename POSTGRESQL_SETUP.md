# PostgreSQL e migrações

Como preparar o banco e aplicar mudanças de schema. Atualizado em 27/10/2026.

## Visão geral

- O banco é PostgreSQL. Em produção, é o Postgres do Supabase.
- O schema vive em `backend/prisma/schema.prisma`, e toda mudança passa pelo **Prisma Migrate** (`backend/prisma/migrations/`).
- Os arquivos `database.sql` e `migration_v*.sql` antigos ficam em `backend/prisma/legacy-migrations/` só como histórico. **Não execute.**

## Migrações atuais

| Migração | O que trouxe |
|---|---|
| `0_init` | Baseline do banco legado (registrado sem executar em bancos antigos) |
| `20260508…` a `20260609…` | Clientes ativas, `supabase_user_id`, menu do WhatsApp, cadastro pendente, RLS, storage de fotos |
| `20260917150000_rename_to_business_professional` | Renomeação para `business` e `professional` (Fundação) |
| `20260917160000_drop_legacy_bot_config_defaults` | Limpeza da configuração antiga do robô |
| `20260930135500_add_public_booking_fields` | Página pública e sinal Pix |
| `20261001100000` a `20261001140000` | Galeria, endereço do negócio e notificações |
| `20261013120000_agenda_comanda_caixa` | 2A: status novos, comanda, produtos, caixa e comissão |
| `20261014120000_hoje_clientes` | 2B: segmento, ficha técnica, fotos, consentimento, etiquetas e lista de espera |
| `20261016120000_whatsapp_conversas` | 2C-1: conversas, mensagens e opt-out |
| `20261020120000_whatsapp_envios` | 2C-2a: fila de envios |
| `20261021120000_whatsapp_automacoes` | 2C-2b: automações e respostas pendentes |
| `20261023120000_whatsapp_campanhas` | 2C-2c: campanhas |
| `20261024120000_plano_cobranca` | 2D: troca de plano |
| `20261025120000_relatorios_comissoes` | 3: repasses, adiantamentos e salão-parceiro |
| `20261026120000_clube_pacotes` | 4: clube e pacotes |
| `20261027120000_app_profissional` | 5: papel `professional`, convites, avaliações e push |
| `20261028120000_onboarding` | 6: onboarding e segmento |
| `20261029120000_google_agenda` | 7: conexões e eventos do Google Agenda |

Todas estão aplicadas em produção.

## Banco local do zero

1. Crie o banco:

```bash
createdb -h localhost -p 5432 -U postgres --encoding=UTF8 easyagenda
psql -h localhost -p 5432 -U postgres -d easyagenda -c "CREATE EXTENSION IF NOT EXISTS pgcrypto;"
```

2. As migrações usam objetos que só existem no Supabase (schemas `auth` e `storage`, papéis `authenticated` e `anon`, função `auth.uid()`). Num Postgres local, aplique o stub antes:

```bash
psql -h localhost -p 5432 -U postgres -d easyagenda -v ON_ERROR_STOP=1 -f backend/prisma/local/supabase-stub.sql
```

3. Configure `DATABASE_URL` e `DIRECT_URL` no `backend/.env` (localmente, os dois com o mesmo valor) e aplique as migrações:

```bash
cd backend
npm run db:sync            # banco vazio: roda prisma migrate deploy
npm run db:migrate:status  # confere
```

## Banco existente

| Situação | Comando |
|---|---|
| Banco já no Prisma, com migrações pendentes | `npm run db:migrate:deploy` |
| Banco legado sem `_prisma_migrations` | `npm run db:sync` (registra o `0_init` sem executar SQL e depois aplica o resto com `db:migrate:deploy`) |
| Só conferir | `npm run db:migrate:status` |

## Criar uma migração nova

```bash
cd backend
npm run db:migrate -- --name descricao_da_mudanca
```

Antes de aplicar, abra o `migration.sql` gerado e **apague** qualquer `DROP INDEX` destes índices. Eles existem só no SQL das migrações, fora do `schema.prisma`, e o Prisma tenta removê-los toda vez:

- `tags_business_id_lower_name_key` (unicidade das etiquetas);
- `whatsapp_envios_cliente_ativo_key` (um convite ativo por cliente na fila);
- `whatsapp_messages_business_provider_key` (mensagem sem duplicata).

As tabelas novas seguem o padrão de RLS habilitada das migrações anteriores.

## Produção (Supabase)

- `DATABASE_URL` usa o pooler de transação (porta `6543`, `?pgbouncer=true`).
- `DIRECT_URL` é a conexão que o Prisma Migrate usa: a direta ou a do **pooler de sessão** (porta `5432`), nunca a de transação. Quando a conexão direta falha, use o `DATABASE_URL` com `:6543` trocado por `:5432` e sem a query string.
- Rode `npm run db:migrate:status` antes e depois de aplicar.
- Aplique a migração **antes** de publicar o código que depende dela. O código novo quebra as consultas se a coluna ainda não existir.
- Faça backup antes de qualquer migração destrutiva:

```bash
pg_dump -h <host> -p 5432 -U <usuario> -d <banco> -Fc -f backup_easyagenda.dump
```

Reversão: `prisma migrate resolve --rolled-back <nome>` só desfaz o registro de uma migração que falhou. Para desfazer uma migração aplicada, use o SQL em `backend/prisma/rollback/` quando existir, ou siga `docs/PUBLICACAO-FUNDACAO.md`.

## Docker Compose e `setup.ps1`

Ambiente local completo, sem instalar Postgres nem Node na máquina:

1. Crie um `.env` na raiz, ao lado do `docker-compose.yml`, com `SUPABASE_URL`, `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY` (o login depende do Supabase Auth). Opcionais: `DB_PASSWORD`, `JWT_SECRET`, `NEXT_PUBLIC_GOOGLE_LOGIN_ATIVO` e as variáveis de WhatsApp, push e Google, que têm os mesmos nomes do `backend/.env.example`.
2. Rode `docker compose up --build`.

| Serviço | O que faz |
|---|---|
| `db` | Postgres 16. Na primeira subida aplica `backend/prisma/local/supabase-stub.sql` |
| `migrate` | Roda `prisma migrate deploy` e termina |
| `backend` | API em http://localhost:5000, sobe depois que as migrações terminam |
| `frontend` | Painel em http://localhost:3000. O BFF fala com o backend por `http://backend:5000` |

- As `NEXT_PUBLIC_*` entram no bundle no build. Trocou alguma? Rode `docker compose build frontend`.
- Para recomeçar o banco do zero: `docker compose down -v`.
- Os Dockerfiles servem só para o compose. Produção usa o build nativo do Render e da Vercel (`DEPLOY.md`).

**`setup.ps1` (Windows, sem Docker):** com o Postgres instalado e o `psql` no PATH, ele recria o banco `easyagenda`, aplica o stub do Supabase, roda `prisma migrate deploy` e gera `backend\.env` e `frontend\.env.local`. Se esses arquivos já existirem, guarda uma cópia `.bak-<data>` antes. Depois, preencha as chaves do Supabase nos dois arquivos.

## Validação rápida

```bash
cd backend
npm run db:migrate:status
psql "$DATABASE_URL" -c "SELECT migration_name FROM _prisma_migrations ORDER BY finished_at DESC LIMIT 3;"
```

## Erros comuns

| Erro | Causa e solução |
|---|---|
| `schema "auth" does not exist` ou `role "authenticated" does not exist` | Postgres local sem o stub: aplique `backend/prisma/local/supabase-stub.sql` |
| `P1001` ao migrar no Supabase | `DIRECT_URL` apontando para o pooler de transação: use a porta 5432 |
| `prepared statement already exists` | `DATABASE_URL` no pooler sem `?pgbouncer=true` |
| Coluna inexistente depois do deploy | O código subiu antes da migração: aplique a migração |
| Etiquetas ou convites duplicados depois de migrar | Um `DROP INDEX` dos índices listados acima passou: recrie o índice pelo SQL da migração original |
