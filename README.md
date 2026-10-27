# EasyAgenda+

![Node.js](https://img.shields.io/badge/Node.js-20+-green?style=flat-square&logo=node.js)
![Next.js](https://img.shields.io/badge/Next.js-15-black?style=flat-square&logo=next.js)
![TypeScript](https://img.shields.io/badge/TypeScript-Strict-blue?style=flat-square&logo=typescript)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Prisma%205-336791?style=flat-square&logo=postgresql)
![Status](https://img.shields.io/badge/Status-Em%20produção-green?style=flat-square)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue?style=flat-square)](./LICENSE)

> **SaaS multi-tenant para negócios de beleza e bem-estar (barbearias, estúdios de unhas e cílios, salões e clínicas de estética): agenda, comanda e caixa, CRM, WhatsApp com automações, clube e pacotes, comissões, app da profissional e Google Agenda.**

Em produção em https://www.easybarber.tech.

---

## Funcionalidades

O guia completo, tela por tela, está em [`docs/FUNCIONALIDADES.md`](./docs/FUNCIONALIDADES.md). Em resumo:

**Conta e acesso**
- Cadastro com confirmação de e-mail, login por senha e **login com Google** (Supabase Auth).
- **Onboarding guiado em 5 etapas** (negócio, horários, serviços, página e WhatsApp) para contas novas.
- **Segmentos e vocabulário:** barbeiro, nail designer, lash designer, cabeleireira ou esteticista em todos os textos.
- Teste grátis de 14 dias. Assinatura por cartão (Stripe) ou Pix (Asaas).

**Painel da dona**
- **Hoje:** faturamento, ocupação, pendências e "Termine de configurar".
- **Agenda:** linha do tempo por profissional, painel de detalhes, status do atendimento, intervalo de almoço e lista de espera.
- **Comanda:** serviços, produtos, desconto, gorjeta, comissão por item, sessão do clube e comprovante no WhatsApp.
- **Clientes (CRM):** fases (novo, recorrente, fiel, em risco, perdido), ciclo, retorno previsto, LTV, etiquetas, ficha técnica por segmento, fotos privadas e consentimento LGPD.
- **Caixa:** abertura, sangria, suprimento, despesas e fechamento com diferença.
- **Clube e pacotes:** assinatura mensal e pacote pré-pago, cobrados pelo Pix do salão, com adesão pública.
- **WhatsApp:** Hora de voltar, 7 automações, campanhas com fila cadenciada, central de conversas, conexão e robô de agendamento.
- **Relatórios e comissões:** indicadores, mapa de ocupação, origem, evolução, apuração por quinzena, repasse e salão-parceiro.
- **Minha página:** página pública de agendamento com galeria e sinal Pix.
- **Ajustes:** negócio, serviços e equipe, plano e cobrança com upgrade e downgrade, integrações.
- **Google Agenda:** agendamentos vão para o Google, e compromissos do Google bloqueiam horário.
- **Notificações** no sino e push no navegador.

**Fora do painel**
- **App da profissional (PWA)** em `/bancada`: agenda do dia, ficha rápida, fechar atendimento, reagendar e Meus números.
- **Páginas públicas:** agendamento com sinal Pix, adesão ao clube, avaliação da cliente, termos e privacidade.
- **SuperAdmin** em `/admin`: métricas, negócios, assinaturas, logs e cupons.

---

## Stack

### Backend

| Tecnologia | Uso |
|---|---|
| Node.js 20+ e TypeScript (strict, ESM) | Runtime e linguagem |
| Express 4 | HTTP |
| Prisma 5 e PostgreSQL (Supabase) | ORM, migrações e banco |
| Supabase Auth | Identidade, confirmação de e-mail e login com Google |
| Zod | Validação |
| Pino | Log estruturado |
| node-cron | Rotinas (fila do WhatsApp, lembretes, clube, Google Agenda) |
| Stripe e Asaas | Assinatura por cartão e Pix |
| Evolution API v2 | WhatsApp |
| web-push | Notificações push (VAPID) |
| Google Calendar API | Google Agenda (OAuth próprio do backend) |
| Vitest e Supertest | Testes |

### Frontend

| Tecnologia | Uso |
|---|---|
| Next.js 15 (App Router) e React 18 | Framework e UI |
| TypeScript | Linguagem |
| Tailwind CSS, Radix UI e next-themes | Estilo, componentes acessíveis e modo escuro |
| Material Symbols | Ícones |
| Recharts | Gráficos |
| jsPDF | PDFs (relatórios, comissões, extrato) |
| Vitest e Testing Library | Testes |

---

## Arquitetura

```
Navegador → Next.js (páginas + BFF em app/api/*) → Backend Express /api/v1 → PostgreSQL
                                                         ├→ Supabase Auth
                                                         ├→ Stripe / Asaas
                                                         ├→ Evolution API (WhatsApp)
                                                         ├→ Google Calendar API
                                                         └→ Web Push
```

- O frontend chama o backend pelas rotas do BFF em `frontend/src/app/api/*`, que repassam os cookies de sessão.
- O frontend nunca fala direto com Evolution, Stripe, Asaas ou Google com segredo.
- No backend, cada domínio é um módulo em `backend/src/modules/<domínio>/` com routes, controller, service, repository, rules e types.
- Estrutura completa em [`PROJECT_STRUCTURE.md`](./PROJECT_STRUCTURE.md).

---

## Começar rápido

```bash
npm run install:all
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env.local
```

Preencha as variáveis, prepare o banco (`cd backend && npm run db:sync`) e suba os serviços:

```bash
cd backend && npm run dev     # http://localhost:5000
cd frontend && npm run dev    # http://localhost:3000
```

| Serviço | URL |
|---|---|
| Frontend | http://localhost:3000 |
| Backend | http://localhost:5000 |
| Health check | http://localhost:5000/health |
| API | http://localhost:5000/api/v1 |

Passo a passo em [`QUICK_START.md`](./QUICK_START.md) e [`INSTALL.md`](./INSTALL.md).

> **Atenção:** confira para qual banco o `DATABASE_URL` aponta antes de rodar qualquer migração. Nunca rode `db:migrate` contra produção.

---

## Variáveis de ambiente

Os modelos completos estão em `backend/.env.example` e `frontend/.env.example`. As principais:

| Onde | Variáveis | Para quê |
|---|---|---|
| Backend | `DATABASE_URL`, `DIRECT_URL` | Banco (aplicação e Prisma Migrate) |
| Backend | `JWT_SECRET`, `FRONTEND_URL`, `APP_URL` | Sessão, CORS e links |
| Backend | `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `AUTH_SUPABASE_REDIRECT_TO` | Supabase Auth |
| Backend | `STRIPE_*`, `ASAAS_*` | Assinatura |
| Backend | `EVOLUTION_API_URL`, `EVOLUTION_API_KEY`, `BACKEND_WEBHOOK_BASE_URL` | WhatsApp |
| Backend | `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Push |
| Backend | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_AGENDA_REDIRECT_URI`, `GOOGLE_TOKEN_KEY` | Google Agenda |
| Backend | `BUSINESS_TIMEZONE` | Fuso das rotinas (padrão `America/Sao_Paulo`) |
| Frontend | `BACKEND_API_URL`, `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_APP_URL` | Backend e URL do site |
| Frontend | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase Auth |
| Frontend | `NEXT_PUBLIC_GOOGLE_LOGIN_ATIVO` | `1` mostra "Continuar com Google" |
| Frontend | `NEXT_PUBLIC_SUPPORT_WHATSAPP`, `NEXT_PUBLIC_WHATSAPP_CONTACT_URL` | Contato do financeiro e da landing |

Sem as variáveis do Google, do push ou do WhatsApp, os recursos correspondentes só não aparecem. Nada quebra.

---

## Banco de dados

- Schema: `backend/prisma/schema.prisma`. Migrações: `backend/prisma/migrations/` (baseline `0_init` + 29 incrementais, a última é `20261029120000_google_agenda`).
- Banco novo: `npm run db:sync` (aplica tudo). Banco existente: `npm run db:migrate:deploy`.
- Em produção, a migração é aplicada **antes** do deploy do código que depende dela.

Detalhes em [`POSTGRESQL_SETUP.md`](./POSTGRESQL_SETUP.md).

---

## Scripts

| Onde | Script | Descrição |
|---|---|---|
| Raiz | `npm run install:all` | Instala backend e frontend |
| Raiz | `npm run dev:backend` / `npm run dev:frontend` | Sobe cada serviço em desenvolvimento |
| Raiz | `npm run seed:auth-admin` | Cria o admin da plataforma |
| Raiz | `npm run seed:system-users` | Cria os usuários de sistema |
| Backend | `npm run dev` | Desenvolvimento com hot reload (tsx) |
| Backend | `npm run build` / `npm start` | Build (tsc) e produção |
| Backend | `npm run typecheck` | Checagem de tipos |
| Backend | `npm test` | Testes (Vitest) |
| Backend | `npm run db:migrate` / `db:migrate:deploy` / `db:migrate:status` | Migrações |
| Backend | `npm run db:sync` | Prepara um banco novo ou legado |
| Frontend | `npm run dev` / `build` / `start` | Desenvolvimento, build e produção |
| Frontend | `npm test` | Testes (Vitest) |
| Frontend | `npm run lint` | Lint |

---

## API

Base: `/api/v1`. Os grupos de rotas:

| Grupo | Responsabilidade |
|---|---|
| `/auth` | Cadastro, login, Google, sessão |
| `/onboarding` | Onboarding guiado e primeiros passos |
| `/dashboard` | Tela Hoje |
| `/appointments` | Agenda e disponibilidade |
| `/comandas`, `/products`, `/cash` | Comanda, produtos e caixa |
| `/clients`, `/tags`, `/waitlist` | CRM, etiquetas e lista de espera |
| `/finance` | Despesas e resumo financeiro |
| `/reports` | Relatórios, comissões e adiantamentos |
| `/clube` | Clube e pacotes |
| `/whatsapp` | Conexão, robô, conversas, Hora de voltar, automações e campanhas |
| `/business`, `/business-public-page` | Ajustes e Minha página |
| `/equipe`, `/convites` | Acesso das profissionais |
| `/bancada` | App da profissional |
| `/google-agenda` | Google Agenda |
| `/notifications`, `/push` | Sino e push |
| `/avaliacoes` | Avaliação pública da cliente |
| `/public` | Página pública e adesão ao clube |
| `/billing`, `/subscriptions` | Assinatura do sistema |
| `/admin` | SuperAdmin |

Endpoints em [`API_DOCS.md`](./API_DOCS.md).

---

## Planos

| Plano | Id interno | Preço | Profissionais |
|---|---|---|---|
| Solo | `basico` | R$ 49,90/mês | 1 |
| Equipe | `profissional` | R$ 99,90/mês | Até 5 |
| Salão | `premium` | R$ 199,90/mês | Ilimitadas |

- O Solo já tem WhatsApp, página, Hora de voltar, ficha e caixa.
- O Equipe soma comissões, relatórios e o app da profissional.
- O Salão soma salão-parceiro, clube e pacotes.

Regras completas em [`PLANOS.md`](./PLANOS.md). Fonte única: `backend/src/config/planCatalog.ts`.

---

## Documentação

| Arquivo | Conteúdo |
|---|---|
| [`START_HERE.md`](./START_HERE.md) | Caminho de leitura |
| [`docs/FUNCIONALIDADES.md`](./docs/FUNCIONALIDADES.md) | O que o sistema faz, tela por tela |
| [`docs/ROADMAP.md`](./docs/ROADMAP.md) | Fases do relançamento e o estado de cada uma |
| [`QUICK_START.md`](./QUICK_START.md) | Subir local rápido |
| [`INSTALL.md`](./INSTALL.md) | Instalação completa |
| [`POSTGRESQL_SETUP.md`](./POSTGRESQL_SETUP.md) | Banco e migrações |
| [`PROJECT_STRUCTURE.md`](./PROJECT_STRUCTURE.md) | Organização do código |
| [`API_DOCS.md`](./API_DOCS.md) | API REST |
| [`PLANOS.md`](./PLANOS.md) | Planos, recursos e assinatura |
| [`WHATSAPP_BOT.md`](./WHATSAPP_BOT.md) | WhatsApp: conexão, robô, fila, automações e campanhas |
| [`docs/google-configuracao.md`](./docs/google-configuracao.md) | Configurar login com Google e Google Agenda |
| [`DEPLOY.md`](./DEPLOY.md) | Produção |
| [`TROUBLESHOOTING.md`](./TROUBLESHOOTING.md) | Diagnóstico |
| [`docs/design/DESIGN.md`](./docs/design/DESIGN.md) | Design system |
| [`docs/design/SEGUIMENTO.md`](./docs/design/SEGUIMENTO.md) | Pendências de cada fase |

---

## Licença

Este projeto está licenciado sob a [Apache License 2.0](./LICENSE).

---

## Autores

**Ítallo Gonçalves**
Estudante de Engenharia de Software

[![LinkedIn](https://img.shields.io/badge/LinkedIn-Ítallo%20Gonçalves-blue?style=flat-square&logo=linkedin)](https://www.linkedin.com/in/itallo-gonçalves-3406a119a/)
[![GitHub](https://img.shields.io/badge/GitHub-DestroyerIG-black?style=flat-square&logo=github)](https://github.com/DestroyerIG)
[![Email](https://img.shields.io/badge/Email-igitallogabriel13@gmail.com-red?style=flat-square&logo=gmail)](mailto:igitallogabriel13@gmail.com)

**Pedro Lucas Barros Silva**
Colaborador

[![LinkedIn](https://img.shields.io/badge/LinkedIn-Pedro%20Lucas-blue?style=flat-square&logo=linkedin)](https://www.linkedin.com/in/pedro-lucas-barros-silva-9a28571a3/)
[![GitHub](https://img.shields.io/badge/GitHub-BarrosPL-black?style=flat-square&logo=github)](https://github.com/BarrosPL)
[![Email](https://img.shields.io/badge/Email-barros.pedro@academico.ifpb.edu.br-red?style=flat-square&logo=gmail)](mailto:barros.pedro@academico.ifpb.edu.br)

---

<p align="center">
  Desenvolvido com ✨ precisão, 🟢 Node.js e foco em produto.<br/>
  <i>"Boas ferramentas não apenas organizam — elas transformam negócios."</i>
</p>
