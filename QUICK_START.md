# Quick Start

Caminho curto para subir o projeto em desenvolvimento.

## Pré-requisitos

- Node.js 20+ e npm 10+
- PostgreSQL 14+ (recomendado 16) ou um projeto Supabase
- Projeto Supabase para o Auth

## 1. Instalar

```bash
git clone <url-do-repositorio>
cd EasyBarber
npm run install:all
```

O `postinstall` do backend já roda `prisma generate`.

## 2. Configurar o ambiente

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env.local
```

Mínimo no `backend/.env`:

```env
PORT=5000
NODE_ENV=development
DATABASE_URL=postgresql://postgres:senha@localhost:5432/easyagenda
DIRECT_URL=postgresql://postgres:senha@localhost:5432/easyagenda
JWT_SECRET=troque_por_uma_chave_forte
FRONTEND_URL=http://localhost:3000
APP_URL=http://localhost:3000
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_ANON_KEY=<anon-key>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
AUTH_SUPABASE_REDIRECT_TO=http://localhost:3000/auth/confirm
```

Mínimo no `frontend/.env.local`:

```env
BACKEND_API_URL=http://localhost:5000/api/v1
NEXT_PUBLIC_API_URL=http://localhost:5000/api/v1
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
```

WhatsApp, pagamento, push e Google são opcionais. Sem as variáveis deles, esses recursos só não aparecem.

> Confira para qual banco o `DATABASE_URL` aponta. Não rode migração contra produção sem querer.

## 3. Preparar o banco

```bash
createdb -h localhost -p 5432 -U postgres --encoding=UTF8 easyagenda
psql -h localhost -p 5432 -U postgres -d easyagenda -c "CREATE EXTENSION IF NOT EXISTS pgcrypto;"
psql -h localhost -p 5432 -U postgres -d easyagenda -f backend/prisma/local/supabase-stub.sql
cd backend && npm run db:sync
```

O stub só é necessário em Postgres local. Detalhes em `POSTGRESQL_SETUP.md`.

## 4. Subir

```bash
cd backend && npm run dev     # terminal 1
cd frontend && npm run dev    # terminal 2
```

- Frontend: http://localhost:3000
- Backend: http://localhost:5000/health
- API: http://localhost:5000/api/v1

## 5. Validar

```bash
curl http://localhost:5000/health
```

Depois:

1. Cadastre uma conta em `/cadastro` e confirme o e-mail.
2. Faça login em `/login`.
3. Passe pelas 5 etapas do onboarding.
4. Chegue à tela Hoje.

## Testes

```bash
cd backend && npm test && npm run typecheck
cd frontend && npm test && npm run build
```
