# Start Here

Guia de entrada para quem acabou de clonar o EasyAgenda+.

## Ordem de leitura

1. `README.md`: visão geral, stack e comandos.
2. `docs/FUNCIONALIDADES.md`: o que o sistema faz, tela por tela.
3. `docs/ROADMAP.md`: fases do relançamento e o estado de cada uma.
4. `QUICK_START.md`: subir local.
5. `PROJECT_STRUCTURE.md`: onde fica cada coisa no código.
6. `API_DOCS.md`: endpoints.
7. `DEPLOY.md`: produção.

## Decisão rápida

| Quero... | Leia |
|---|---|
| Rodar local | `QUICK_START.md` |
| Instalar com mais contexto | `INSTALL.md` |
| Preparar ou migrar o banco | `POSTGRESQL_SETUP.md` |
| Entender um endpoint | `API_DOCS.md` |
| Entender planos e permissões | `PLANOS.md` |
| Mexer no WhatsApp | `WHATSAPP_BOT.md` |
| Configurar o Google | `docs/google-configuracao.md` |
| Mudar uma tela | `docs/design/DESIGN.md` e `docs/design/stitch/` |
| Ver o que ficou pendente | `docs/design/SEGUIMENTO.md` |
| Publicar | `DEPLOY.md` |
| Diagnosticar um erro | `TROUBLESHOOTING.md` e `FIX_CADASTRO.md` |

## Checklist de onboarding

- Instalar Node.js 20+, npm 10+, PostgreSQL 14+ e Git.
- `npm run install:all`.
- Criar `backend/.env` e `frontend/.env.local` a partir dos exemplos.
- Configurar o Supabase Auth (`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` e as redirect URLs).
- Preparar o banco com o Prisma (`npm run db:sync` no backend). Os SQL antigos não são mais usados.
- Subir backend e frontend.
- Validar `GET /health`, cadastro, confirmação de e-mail, login, onboarding e a tela Hoje.

## Como o trabalho é organizado

- Cada fase tem uma spec em `docs/superpowers/specs/` e um plano em `docs/superpowers/plans/`.
- O código vai por PR para a `main`. Ao fechar uma fase, atualize o `docs/ROADMAP.md`, o `docs/FUNCIONALIDADES.md` e as pendências em `docs/design/SEGUIMENTO.md`.
- Migração em produção só com autorização do dono, e sempre antes do deploy do código.
- As telas seguem o Google Stitch (`docs/design/stitch/projeto/`) com dado real. Nada de número inventado na tela.

## Atenções importantes

- A API canônica é `/api/v1`. Chamadas para `/api/*` são redirecionadas com HTTP 301.
- O frontend chama o backend pelo BFF (`frontend/src/app/api/*`), nunca direto.
- O Supabase Auth é obrigatório para cadastro, confirmação de e-mail e login.
- `AUTH_PROVIDER_MODE` é obsoleto.
- Ambiente local com Docker: `docker compose up --build` (Postgres, migrações do Prisma, backend e frontend).
