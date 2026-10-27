# Deploy — EasyAgenda+

Guia de produção. Stack: Node.js 20 + Express + Prisma + PostgreSQL (Supabase) + Vercel (frontend) + Render (backend). Atualizado em 27/10/2026.

> **Regra de ouro:** a migração do banco vai **antes** do deploy do código que depende dela, e só com autorização do dono. Rode `npm run db:migrate:status` antes e depois.

---

## Pré-requisitos

- Node.js 20+
- PostgreSQL 14+ (recomendado: Supabase)
- Supabase Auth configurado

---

## Variáveis de Ambiente — Backend

### Obrigatórias

```env
DATABASE_URL=postgresql://user:password@host:5432/easyagenda?sslmode=require
DIRECT_URL=postgresql://user:password@host:5432/easyagenda?sslmode=require
JWT_SECRET=chave_forte_32_chars_minimo
NODE_ENV=production
PORT=5000
FRONTEND_URL=https://seu-frontend.vercel.app
APP_URL=https://seu-frontend.vercel.app
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_ANON_KEY=<anon-key>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
AUTH_SUPABASE_REDIRECT_TO=https://seu-frontend.vercel.app/auth/confirm
```

### Stripe

```env
STRIPE_SECRET_KEY=sk_live_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx
STRIPE_PRICE_ID_BASICO=price_xxx
STRIPE_PRICE_ID_PROFISSIONAL=price_xxx
STRIPE_PRICE_ID_PREMIUM=price_xxx
```

### Asaas (opcional)

```env
ASAAS_API_KEY=<api-key>
ASAAS_BASE_URL=https://api.asaas.com/v3
ASAAS_WEBHOOK_TOKEN=<token>
```

### WhatsApp Evolution API (opcional)

```env
EVOLUTION_API_URL=https://sua-evolution.com
EVOLUTION_API_KEY=<api-key>
BACKEND_WEBHOOK_BASE_URL=https://sua-api.render.com/api/v1/whatsapp/webhook
```

### Push (notificações no navegador)

```env
VAPID_PUBLIC_KEY=<chave-publica>
VAPID_PRIVATE_KEY=<chave-privada>
VAPID_SUBJECT=mailto:contato@seudominio.com
```

Gere uma vez com `npx web-push generate-vapid-keys` e não troque depois: trocar invalida as inscrições existentes. Sem as três, o botão "Ativar notificações" não aparece.

### Google Agenda

```env
GOOGLE_CLIENT_ID=<id-do-cliente>
GOOGLE_CLIENT_SECRET=<chave-secreta>
GOOGLE_AGENDA_REDIRECT_URI=https://sua-api.render.com/api/v1/google-agenda/callback
GOOGLE_TOKEN_KEY=<32 bytes em base64>
```

`GOOGLE_TOKEN_KEY` cifra o acesso guardado. Não troque depois, porque trocar invalida as conexões. Passo a passo completo em `docs/google-configuracao.md`.

### SMTP (convite da profissional)

```env
SMTP_HOST=smtp.seuprovedor.com
SMTP_PORT=587
SMTP_USER=<usuario>
SMTP_PASS=<senha>
SMTP_FROM="EasyAgenda+ <no-reply@seudominio.com>"
```

### Opcionais

```env
LOG_LEVEL=info
API_JSON_BODY_LIMIT=1mb
WHATSAPP_WEBHOOK_BODY_LIMIT=6mb
BUSINESS_TIMEZONE=America/Sao_Paulo
VERCEL_PROJECT_PREFIX=barberpro-saas-2-0
OTEL_ENABLED=false
```

`BUSINESS_TIMEZONE` define o fuso usado pelo cron de lembretes. O servidor roda em UTC, mas os agendamentos gravam o relógio local do negócio; sem essa variável o alvo dos lembretes pode sair errado. Padrão: `America/Sao_Paulo`.

---

## Variáveis de Ambiente — Frontend (Vercel)

```env
BACKEND_API_URL=https://sua-api.render.com/api/v1
NEXT_PUBLIC_API_URL=https://sua-api.render.com/api/v1
NEXT_PUBLIC_APP_URL=https://seu-frontend.vercel.app
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
BACKEND_ORIGIN=https://sua-api.render.com
NEXT_PUBLIC_GOOGLE_LOGIN_ATIVO=1
NEXT_PUBLIC_SUPPORT_WHATSAPP=5583999999999
NEXT_PUBLIC_WHATSAPP_CONTACT_URL=https://wa.me/55...
```

`NEXT_PUBLIC_GOOGLE_LOGIN_ATIVO=1` mostra "Continuar com Google" no login e no cadastro. `NEXT_PUBLIC_SUPPORT_WHATSAPP` (só dígitos, com DDI) mostra os botões do financeiro em Plano e cobrança.

`DIRECT_URL` (backend) é a conexão que o Prisma Migrate usa (`directUrl` no `schema.prisma`): no Supabase, a conexão direta ou a do Session pooler (porta 5432), não a do Transaction pooler (porta 6543). `BACKEND_ORIGIN` (frontend) é a origem do backend liberada no `connect-src` do CSP em `next.config.js`; é opcional e, sem ela, vale `https://easybarber-backend.onrender.com`.

---

## Render (Backend)

### Build & Start Commands

```
Build Command:  npm install && npx prisma generate && npm run build
Start Command:  npx prisma migrate deploy && npm start
```

### Ordem de execução no deploy

```bash
npm install                    # instala dependências
npx prisma generate            # gera Prisma Client
npm run build                  # tsc → dist/
npx prisma migrate deploy      # aplica migrations pendentes (seguro, idempotente)
npm start                      # node dist/server.js
```

### Migrações em produção

O Start Command roda `prisma migrate deploy`, mas a regra do projeto é aplicar a migração **antes**, a partir da máquina local, com autorização do dono:

```bash
cd backend
npm run db:migrate:status      # confere o que está pendente
npm run db:migrate:deploy      # aplica
npm run db:migrate:status      # confere de novo
```

Use `DIRECT_URL` no pooler de sessão do Supabase (porta 5432). Se a conexão direta falhar, troque `:6543` por `:5432` no `DATABASE_URL` e tire a query string.

### Banco novo (primeira vez)

```bash
# Na máquina local com DATABASE_URL apontando para produção:
npm run db:sync                # detecta estado e aplica baseline ou migrate deploy
```

### Banco existente (migração de pg bruto para Prisma)

```bash
# Na máquina local:
npm run db:sync                # detecta banco legado → aplica baseline sem executar SQL
```

### Migrations futuras

```bash
# Local (gera migration file):
npm run db:migrate -- --name descricao_da_mudanca

# Produção (aplica automaticamente via Start Command acima):
npx prisma migrate deploy
```

---

## Vercel (Frontend)

- Framework: Next.js
- Build Command: `npm run build` (padrão)
- Output Directory: `.next` (padrão)
- Variáveis de ambiente: configurar no painel Vercel → Settings → Environment Variables

Nenhuma mudança de configuração necessária pelo Prisma — o Prisma roda apenas no backend (Render).

---

## Supabase

- O Supabase fornece o **Auth** (senha e Google), o **Postgres** (via `DATABASE_URL` e `DIRECT_URL`) e o **Storage** (fotos das clientes em bucket privado, logo e galeria).
- **Authentication › URL Configuration › Redirect URLs:** `https://<site>/auth/confirm`, `https://<site>/auth/callback` e `https://<site>/auth/redefinir-senha`.
- **Authentication › Providers › Google:** ligado, com o ID e a chave do Google Cloud (`docs/google-configuracao.md`).

### Connection String Supabase

```
postgresql://postgres.[project-ref]:[password]@aws-0-sa-east-1.pooler.supabase.com:6543/postgres?sslmode=require&pgbouncer=true
```

O Prisma requer `?pgbouncer=true&connection_limit=1` quando usa pgBouncer em modo transaction.

---

## Webhooks

### Stripe

Endpoints aceitos:
```
POST https://sua-api.render.com/api/v1/billing/webhooks/stripe
POST https://sua-api.render.com/api/v1/billing/webhook/stripe
```
Signing secret: `STRIPE_WEBHOOK_SECRET`

### Asaas

```
POST https://sua-api.render.com/api/v1/billing/webhooks/asaas
```
Token: `ASAAS_WEBHOOK_TOKEN`

### Evolution API (WhatsApp)

```
POST https://sua-api.render.com/api/v1/whatsapp/webhook
```

Eventos recomendados: `MESSAGES_UPSERT`, `MESSAGES_UPDATE`, `CONNECTION_UPDATE` e `QRCODE_UPDATED`.

### Google Agenda (OAuth)

```
GET https://sua-api.render.com/api/v1/google-agenda/callback
```

Cadastre essa URL nos URIs de redirecionamento do cliente OAuth no Google Cloud, igual a `GOOGLE_AGENDA_REDIRECT_URI`.

---

## Rotinas agendadas

O backend roda as rotinas no próprio processo (node-cron): fila do WhatsApp, lembretes, automações, clube, troca de plano, Google Agenda e limpezas. A tabela está em `docs/FUNCIONALIDADES.md` › Rotinas automáticas. Rode **uma instância só** do backend, para a mesma rotina não rodar duas vezes, e mantenha o processo acordado.
Evite `MESSAGES_SET` — payload pesado, bloqueado automaticamente.

---

## Comandos de Banco

| Comando | Uso |
|---|---|
| `npm run db:sync` | Primeiro deploy — detecta estado e sincroniza |
| `npm run db:migrate` | Criar nova migration (desenvolvimento) |
| `npm run db:migrate:deploy` | Aplicar migrations em produção |
| `npm run db:migrate:status` | Ver migrations pendentes |
| `npm run db:generate` | Regenerar Prisma Client após mudança no schema |
| `npm run db:studio` | Abrir Prisma Studio (visualizar dados) |
| `npm run typecheck` | Verificar tipagem TypeScript |

---

## Smoke Test Pós-Deploy

```bash
curl https://sua-api.render.com/health
# Espera: {"status":"ok","db":"connected"}

curl https://sua-api.render.com/api/v1/auth/me
# Espera: 401 (sem token)
```

Validação manual:
- [ ] Cadastro + confirmação e-mail
- [ ] Login por senha e com Google
- [ ] Onboarding das 5 etapas numa conta nova
- [ ] Dashboard carrega dados
- [ ] Checkout cartão (Stripe sandbox)
- [ ] Checkout PIX (Asaas sandbox)
- [ ] Webhook Stripe recebido (stripe listen)
- [ ] Status de assinatura atualiza
- [ ] Página pública `/agendar/<slug>` reserva com sinal Pix
- [ ] WhatsApp conecta pelo QR e o robô responde
- [ ] Google Agenda conecta em Ajustes › Integrações
- [ ] "Ativar notificações" aparece e o push chega
- [ ] App da profissional (`/bancada`) abre pelo convite

---

## Rollback

- **Aplicação**: redeploy da versão anterior no Render
- **Banco**: `prisma migrate resolve --rolled-back <migration_name>` (não executa SQL — apenas desfaz o registro, e só aceita migration que falhou; para desfazer uma migration aplicada com sucesso, ver `docs/PUBLICACAO-FUNDACAO.md`)
- **Schema**: restaure backup antes de reverter migration destrutiva

---

## Riscos Comuns

| Risco | Solução |
|---|---|
| `DATABASE_URL` sem `?sslmode=require` | Adicionar ao connection string |
| `pgBouncer` sem `?pgbouncer=true` | Prisma falha em transaction mode |
| `prisma generate` não rodou no build | Adicionar ao Build Command |
| `prisma migrate deploy` em banco inconsistente | Rodar `db:sync` primeiro |
| CORS sem `FRONTEND_URL` | Configurar env var no Render |
| Supabase redirect diferente de `AUTH_SUPABASE_REDIRECT_TO` | Sincronizar URLs |
| Webhook Stripe com secret errado | Verificar `STRIPE_WEBHOOK_SECRET` |
| Código publicado antes da migração | Consultas quebram por coluna inexistente: aplicar a migração |
| Duas instâncias do backend | Rotinas duplicadas (envios em dobro): manter uma instância |
| `redirect_uri_mismatch` no Google | `GOOGLE_AGENDA_REDIRECT_URI` diferente do cadastrado no Google Cloud |
| Troca da `GOOGLE_TOKEN_KEY` ou das chaves VAPID | Conexões do Google e inscrições de push param: não troque |
