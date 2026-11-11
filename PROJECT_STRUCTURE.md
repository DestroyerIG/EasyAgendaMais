# Estrutura do projeto — EasyAgenda+

Stack: Node.js 20 + Express 4 + TypeScript + Prisma 5 + PostgreSQL (Supabase) no backend, e Next.js 15 (App Router) + React 18 + Tailwind no frontend. Atualizado em 11/11/2026.

```
EasyAgendaMais/
├── backend/            # API Express (/api/v1)
├── frontend/           # Next.js: painel, bancada, páginas públicas e BFF
├── docs/               # Funcionalidades, roadmap, design, specs e planos
├── docker-compose.yml  # Ambiente local: Postgres + migrate + backend + frontend
└── package.json        # Scripts que rodam backend e frontend
```

---

## Backend (`backend/`)

```
backend/
├── prisma/
│   ├── schema.prisma              # Fonte de verdade do banco
│   ├── migrations/                # 0_init (baseline) + migrações incrementais
│   ├── legacy-migrations/         # SQL antigo (histórico, não executar)
│   ├── local/supabase-stub.sql    # Mínimo do Supabase para aplicar as migrações num Postgres local
│   └── rollback/                  # SQL de reversão manual de migrações específicas
├── src/
│   ├── server.ts                  # Entrada: middlewares, rotas e rotinas
│   ├── telemetry.ts               # OpenTelemetry (OTEL_ENABLED)
│   ├── config/
│   │   ├── planCatalog.ts         # Planos: preço, limite, matriz (fonte única)
│   │   ├── planPermissions.ts     # Plano mínimo por recurso e efeito do status
│   │   ├── trial.ts               # Teste de 7 dias sem cartão ou 14 com cartão
│   │   ├── valorPlano.ts          # Valor mensal do negócio (Salão sob consulta)
│   │   ├── contingencia.ts        # Carência de 7 dias e conta bloqueada
│   │   ├── vocabulario.ts         # Termos por segmento
│   │   ├── scheduleDefaults.ts    # Horário padrão do negócio
│   │   ├── appointmentStatus.ts   # Status e transições do agendamento
│   │   ├── prisma.ts
│   ├── middleware/                # auth, rbac (requireRole), subscriptionGuard (requireFeature), validate, errorHandler
│   ├── modules/                   # Um diretório por domínio (abaixo)
│   ├── routes/                    # Rotas antigas: auth, business, clients, dashboard, finance, whatsapp, admin
│   ├── controllers/ services/ repositories/   # Camadas das rotas antigas
│   ├── services/
│   │   ├── cronService.ts         # Todas as rotinas agendadas (node-cron)
│   │   ├── billing/               # Provedor Asaas (único) e mapeamento de status
│   │   └── whatsapp/              # Robô, cliente Evolution, handlers do webhook, tenant, vocabulário
│   ├── integrations/asaas/        # Cliente HTTP do Asaas
│   ├── bot/botOrchestrator.ts     # Orquestrador do robô do WhatsApp
│   ├── utils/                     # Erros, logger, datas no fuso do negócio, BR Code Pix, retry, circuit breaker
│   ├── validators/schemas/        # Schemas Zod das rotas antigas
│   ├── scripts/                   # db-sync, seeds, migração de usuários legados
│   └── __tests__/                 # Testes Vitest
├── vitest.config.ts
└── tsconfig.json                  # strict + noUncheckedIndexedAccess
```

### Módulos (`backend/src/modules/`)

Cada módulo novo segue o padrão `<nome>.routes.ts`, `.controller.ts`, `.service.ts`, `.repository.ts`, `.rules.ts` (regras puras, testadas sem banco) e `.types.ts` (schemas Zod).

| Módulo | Rota | Fase | O que faz |
|---|---|---|---|
| `appointments` | `/appointments` | 2A | Agenda, disponibilidade, status e abertura da comanda |
| `comandas` | `/comandas` | 2A | Comanda, comissão por item, comprovante e cobertura do clube |
| `products` | `/products` | 2A | Catálogo de produtos |
| `cash` | `/cash` | 2A | Caixa do dia |
| `dashboard` | `/dashboard` | 2B | Tela Hoje |
| `crm` | `/clients` | 2B | Fases, métricas, ficha técnica, consentimento e CSV |
| `clientPhotos` | `/clients/:id/photos` | 2B | Fotos em bucket privado |
| `tags` | `/tags` | 2B | Etiquetas manuais |
| `waitlist` | `/waitlist` | 2B | Lista de espera |
| `whatsapp` | `/whatsapp` | — | Conexão Evolution, webhook e robô |
| `whatsappInbox` | `/whatsapp/conversations` | 2C-1 | Central de conversas, gravação de mensagens e opt-out |
| `whatsappFila` | — | 2C-2a | Fila de envios cadenciada (`whatsapp_envios`) |
| `whatsappAvatar` | — | 2C-2a | Fotos de perfil |
| `whatsappRetorno` | `/whatsapp/retorno` | 2C-2a | Hora de voltar |
| `whatsappAutomacoes` | `/whatsapp/automacoes` | 2C-2b | 7 regras, rotinas, respostas e métricas |
| `whatsappCampanhas` | `/whatsapp/campanhas` | 2C-2c | Campanhas e público |
| `billing` | `/billing` | 2D | Checkout, faturas, troca de plano e webhooks |
| `reports` | `/reports` | 3 | Relatórios, comissões, repasses e adiantamentos |
| `clube` | `/clube`, `/public/:slug/clube` | 4 | Clube e pacotes, cobrança e adesão pública |
| `equipe` | `/equipe`, `/convites` | 5 | Convite e acesso das profissionais |
| `bancada` | `/bancada` | 5 | API do app da profissional |
| `avaliacoes` | `/avaliacoes` | 5 | Avaliação da cliente |
| `push` | `/push` | 5 | Web Push (VAPID) |
| `onboarding` | `/onboarding` | 6 | Onboarding guiado e catálogo de serviços por segmento |
| `googleAgenda` | `/google-agenda` | 7 | OAuth, envio de eventos e ocupado/livre (token cifrado) |
| `notifications` | `/notifications` | — | Sino |
| `businessPublicPage` | `/business-public-page` | — | Configuração da Minha página |
| `publicBooking` | `/public` | — | Página pública e reserva com sinal (Pix, Mercado Pago ou InfinitePay) |
| `busca` | `/busca` | — | Busca geral do painel |
| `conta` | `/conta` | H1 | Estado da conta (contingência), carência e backup |
| `depoimentos` | `/depoimentos`, `/admin/depoimentos` | — | Depoimentos das donas e moderação no SuperAdmin |
| `recebimentos` | `/recebimentos` | — | Gateways (Mercado Pago, InfinitePay), cobrança do sinal e do saldo, maquininha Point |
| `admin` | `/admin` | H2 | Painel do SuperAdmin (`painel.*`) e rotas antigas |
| `core` | — | — | requestId, log HTTP, sanitização, Helmet e limite por negócio |
| `auth`, `business`, `clients`, `finance` | — | — | Reexportam as rotas antigas de `src/routes/` |

### Fluxo de uma requisição

```
Request
  → server.ts (requestId, httpLogger, sanitize, helmet, CORS, rate limit)
  → modules/*/routes.ts (authMiddleware, requireRole, requireFeature, validate)
  → controller → service (+ rules) → repository (Prisma)
  → PostgreSQL
```

### Rotinas agendadas

Todas em `startReminderCron()` de `services/cronService.ts`, dentro do mesmo processo. A tabela completa está em `docs/FUNCIONALIDADES.md` › Rotinas automáticas.

---

## Frontend (`frontend/`)

```
frontend/
├── public/
│   ├── sw.js                      # Service worker do PWA (só a casca) e push
│   ├── offline.html               # Tela offline do PWA
│   └── icons/, images/
├── src/
│   ├── middleware.ts              # Proteção das rotas e reescrita /agendamentos → /dashboard/agendamentos
│   ├── app/
│   │   ├── page.tsx               # Landing
│   │   ├── nail-designers/        # Landing por segmento
│   │   ├── login/, cadastro/, cadastro/completar/, esqueci-senha/, verificar-email/
│   │   ├── auth/confirm/, auth/callback/ (Google), auth/redefinir-senha/
│   │   ├── onboarding/            # 6 etapas
│   │   ├── pagamento/             # Checkout da assinatura
│   │   ├── pagamento-recebido/    # Retorno do link de pagamento da InfinitePay
│   │   ├── dashboard/             # Painel da dona (Hoje, agenda, clientes, financeiro, clube, whatsapp, relatórios, minha página, ajustes, planos)
│   │   ├── bancada/               # App da profissional (PWA)
│   │   ├── convite/[token]/       # Aceite do convite
│   │   ├── agendar/[slug]/        # Página pública e adesão ao clube
│   │   ├── avaliar/[token]/       # Avaliação da cliente
│   │   ├── admin/                 # SuperAdmin
│   │   ├── termos/, privacidade/
│   │   ├── dev/ui/                # Vitrine dos componentes (desenvolvimento)
│   │   └── api/                   # BFF: repassa para o backend com os cookies
│   ├── components/
│   │   ├── shell/                 # AppShell, Sidebar, TopBar, BottomNav, MoreSheet, NotificationsPanel, TrialBanner
│   │   ├── ui/                    # Design system: Button, Card, Modal, SidePanel, Tabs, Table, StatusChip, Icon...
│   │   ├── appointments/, comanda/, caixa/, clientes/, clube/, whatsapp/, relatorios/
│   │   ├── bancada/, convite/, avaliacao/, onboarding/, googleAgenda/, push/
│   │   ├── settings/, planos/, billing/, services/, waitlist/, publicBooking/
│   │   ├── marketing/             # Landing, navbar, rodapé e planos
│   │   └── admin/                 # SuperAdmin
│   ├── hooks/                     # useVocabulario, useSubscriptionAccess, useRequireRole...
│   ├── lib/                       # Clientes de API por domínio, PDFs (relatoriosPdf, bancadaPdf), navigation, plans
│   │   ├── server/                # Proxy do BFF (proxy, catchAllProxy, authBff, oauthBff)
│   │   └── supabase/              # Cliente do Supabase no navegador (login com Google)
│   ├── contexts/AuthContext.tsx
│   └── styles/globals.css         # Tokens do DESIGN.md (claro e escuro)
├── next.config.js                 # CSP (BACKEND_ORIGIN) e cabeçalhos
├── tailwind.config.js
└── vitest.config.ts
```

### BFF (`frontend/src/app/api/`)

As páginas nunca chamam o backend direto. Elas chamam `/api/...` no próprio Next.js, e a rota repassa para `BACKEND_API_URL` com os cookies (`lib/server/proxy.ts`). Os grupos mais novos usam uma rota curinga (`[...path]`) com `catchAllProxy`: `bancada`, `equipe`, `push`, `google-agenda`, `avaliacoes` e `onboarding`.

---

## Documentação (`docs/`)

| Caminho | Conteúdo |
|---|---|
| `docs/FUNCIONALIDADES.md` | O que o sistema faz, tela por tela |
| `docs/ROADMAP.md` | Fases e estado |
| `docs/google-configuracao.md` | Google Cloud, Supabase e variáveis do Google |
| `docs/mercado-pago-configuracao.md`, `docs/infinitepay-configuracao.md` | Configuração dos recebimentos |
| `docs/images/` | Logo usada no README |
| `docs/design/DESIGN.md` | Design system |
| `docs/design/SEGUIMENTO.md` | Pendências de cada fase |
| `docs/design/stitch/` | Telas de referência do Google Stitch |
| `docs/superpowers/specs/` | Spec de cada fase |
| `docs/superpowers/plans/` | Plano de implementação de cada fase |
| `docs/PUBLICACAO-FUNDACAO.md`, `docs/RUNBOOK-DOMINIO.md` | Publicação da Fundação e troca de domínio |

---

## Serviços externos

| Serviço | Uso |
|---|---|
| Supabase | Auth (senha e Google), Postgres e Storage (fotos, logo e galeria) |
| Asaas | Assinatura do sistema, por cartão (Checkout) e Pix |
| Mercado Pago | Recebimentos do negócio: Pix, cartão e maquininha Point |
| InfinitePay | Recebimentos do negócio: link de Pix ou cartão |
| Resend (ou SMTP) | E-mail do convite da profissional |
| Evolution API v2 | WhatsApp |
| Google Calendar API | Google Agenda |
| Web Push (VAPID) | Notificações no navegador |
| Render | Backend |
| Vercel | Frontend |

Sem gateway conectado, o sinal Pix da página pública e a cobrança Pix da comanda usam o BR Code gerado com a chave Pix do próprio negócio (`utils/pixPayload.ts`), com confirmação manual. A mensalidade do clube segue sempre assim.

---

## Testes

Backend: Vitest + Supertest em `backend/src/__tests__/`. Frontend: Vitest + Testing Library em `__tests__/` ao lado dos componentes.

```bash
cd backend && npm test          # também: npm run test:watch, npm run test:cov, npm run typecheck
cd frontend && npm test
```
