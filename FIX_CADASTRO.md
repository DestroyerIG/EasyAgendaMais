# Correção Rápida para Falha no Cadastro

Checklist objetivo para quando cadastro, confirmação de e-mail ou login falham no ambiente local.

## Sintomas

- Cadastro retorna erro genérico.
- Link de confirmação abre, mas a conta não é ativada.
- Login retorna 401 após cadastro.
- Dashboard não abre depois da autenticação.

## Checklist

1. Confirme que o backend inicia sem erro:

```bash
curl http://localhost:5000/health
```

2. Revise `backend/.env`:

```env
DATABASE_URL=postgresql://postgres:senha@localhost:5432/easyagenda
DIRECT_URL=postgresql://postgres:senha@localhost:5432/easyagenda
JWT_SECRET=uma_chave_forte_com_32_ou_mais_caracteres
FRONTEND_URL=http://localhost:3000
APP_URL=http://localhost:3000
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_ANON_KEY=<anon-key>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
AUTH_SUPABASE_REDIRECT_TO=http://localhost:3000/auth/confirm
```

3. Revise `frontend/.env.local`:

```env
NEXT_PUBLIC_API_URL=http://localhost:5000/api/v1
BACKEND_API_URL=http://localhost:5000/api/v1
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
```

4. No Supabase, confira:

- Email confirmation habilitado conforme o ambiente.
- Redirect URLs `http://localhost:3000/auth/confirm` e `http://localhost:3000/auth/callback` cadastradas.
- Chaves anon/service role corretas.

5. Confirme que não há migração pendente:

```bash
cd backend && npm run db:migrate:status
```

6. Login com Google: confira `NEXT_PUBLIC_GOOGLE_LOGIN_ATIVO=1` no frontend, o provedor Google ligado no Supabase e a redirect URL `http://localhost:3000/auth/callback`. Quem entra pelo Google sem conta vai para `/cadastro/completar`.

7. Depois do primeiro login, uma conta nova vai para o onboarding (`/onboarding`) e só chega ao painel depois das etapas 1 a 3. Isso é esperado.

## Pontos que Mais Quebram

- `DATABASE_URL` incorreto.
- `JWT_SECRET` ausente.
- Frontend sem `/api/v1` em `NEXT_PUBLIC_API_URL`.
- `SUPABASE_SERVICE_ROLE_KEY` ausente em scripts administrativos.
- Redirect do Supabase divergente de `AUTH_SUPABASE_REDIRECT_TO`.
- Banco sem as migrações do Prisma aplicadas (`npm run db:migrate:status`).
- Cookies bloqueados por domínio/CORS em produção.

## Se Persistir

Siga TROUBLESHOOTING.md e anexe:

- Log do backend no momento do erro.
- Payload ou rota chamada.
- Status HTTP e resposta recebida.
- A saída de `npm run db:migrate:status`.
