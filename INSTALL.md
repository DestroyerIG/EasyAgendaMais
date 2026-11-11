# Instalação completa

Guia detalhado do ambiente de desenvolvimento. Para o caminho curto, veja `QUICK_START.md`.

## 1. Pré-requisitos

- Node.js 20+ e npm 10+
- Git
- PostgreSQL 14+ (recomendado 16) com `psql`, ou um projeto Supabase
- Projeto Supabase (Auth, e também Storage para fotos, logo e galeria)
- Opcionais, conforme o que for testar:
  - servidor Evolution API v2 (WhatsApp);
  - conta de teste no Asaas (assinatura, cartão e Pix);
  - aplicação no Mercado Pago e chave da InfinitePay (recebimentos do sinal e do saldo);
  - projeto no Google Cloud (login com Google e Google Agenda).

## 2. Clonar

```bash
git clone <url-do-repositorio>
cd EasyAgendaMais
```

## 3. Instalar dependências

```bash
npm run install:all
```

Ou separado:

```bash
cd backend && npm install     # o postinstall roda prisma generate
cd ../frontend && npm install
```

## 4. Variáveis de ambiente

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env.local
```

Os dois arquivos de exemplo estão comentados. Por grupo:

### Backend

| Grupo | Variáveis | Obrigatório |
|---|---|---|
| Servidor | `PORT`, `NODE_ENV`, `LOG_LEVEL` | Sim |
| Banco | `DATABASE_URL`, `DIRECT_URL` | Sim |
| Sessão e URLs | `JWT_SECRET`, `FRONTEND_URL`, `APP_URL` | Sim |
| Supabase Auth | `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `AUTH_SUPABASE_REDIRECT_TO` | Sim |
| Fuso | `BUSINESS_TIMEZONE` (padrão `America/Sao_Paulo`) | Não |
| Asaas | `ASAAS_API_KEY`, `ASAAS_BASE_URL`, `ASAAS_WEBHOOK_TOKEN` | Para a assinatura (cartão e Pix) |
| Recebimentos | `MERCADOPAGO_CLIENT_ID`, `MERCADOPAGO_CLIENT_SECRET`, `MERCADOPAGO_REDIRECT_URI`, `RECEBIMENTOS_TOKEN_KEY`, `BACKEND_URL` | Para Mercado Pago e InfinitePay |
| WhatsApp | `EVOLUTION_API_URL`, `EVOLUTION_API_KEY`, `BACKEND_WEBHOOK_BASE_URL` | Para WhatsApp |
| Push | `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Para notificações push |
| Google | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_AGENDA_REDIRECT_URI`, `GOOGLE_TOKEN_KEY` | Para Google Agenda |
| E-mail | `RESEND_API_KEY` e `RESEND_FROM`, ou `SMTP_*` | Não (convite da profissional; sem e-mail a dona copia o link) |

Gerar as chaves VAPID uma vez:

```bash
cd backend && npx web-push generate-vapid-keys
```

`VAPID_SUBJECT` é um `mailto:` ou a URL do site.

### Frontend

| Variável | Para quê |
|---|---|
| `BACKEND_API_URL` | Backend usado pelo BFF (servidor) |
| `NEXT_PUBLIC_API_URL` | Backend visto pelo navegador |
| `NEXT_PUBLIC_APP_URL` | URL do site |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase Auth |
| `NEXT_PUBLIC_GOOGLE_LOGIN_ATIVO` | `1` mostra "Continuar com Google" |
| `BACKEND_ORIGIN` | Origem do backend no CSP (opcional) |
| `AUTH_BFF_UPSTREAM_TIMEOUT_MS` | Tempo limite do BFF |
| `NEXT_PUBLIC_SUPPORT_WHATSAPP` | Número do financeiro em Plano e cobrança |
| `NEXT_PUBLIC_WHATSAPP_CONTACT_URL` | Contato da landing |

### Supabase

- **Authentication › URL Configuration › Redirect URLs:** `http://localhost:3000/auth/confirm`, `http://localhost:3000/auth/callback` e `http://localhost:3000/auth/redefinir-senha`.
- Para o login com Google, siga `docs/google-configuracao.md`.

## 5. Banco

Siga `POSTGRESQL_SETUP.md`. Em resumo, para um Postgres local:

```bash
createdb -h localhost -p 5432 -U postgres --encoding=UTF8 easyagenda
psql -h localhost -p 5432 -U postgres -d easyagenda -c "CREATE EXTENSION IF NOT EXISTS pgcrypto;"
psql -h localhost -p 5432 -U postgres -d easyagenda -f backend/prisma/local/supabase-stub.sql
cd backend && npm run db:sync
```

## 6. Executar

```bash
cd backend && npm run dev
cd frontend && npm run dev
```

## 7. Seeds administrativos

Com o Supabase e o banco prontos:

```bash
npm run seed:auth-admin       # admin da plataforma (SuperAdmin)
npm run seed:system-users     # usuários de sistema
```

## 8. Testes e checagens

```bash
cd backend && npm test && npm run typecheck
cd frontend && npm test && npm run build
```

## 9. Docker

Com um `.env` na raiz com as chaves do Supabase, rode `docker compose up --build`. Isso sobe o Postgres, aplica as migrações do Prisma e inicia o backend (:5000) e o frontend (:3000). No Windows sem Docker, o `setup.ps1` prepara um Postgres local. Os detalhes estão em `POSTGRESQL_SETUP.md` › Docker Compose e `setup.ps1`.
