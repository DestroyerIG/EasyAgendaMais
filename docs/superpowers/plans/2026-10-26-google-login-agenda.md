# Login com Google e Google Agenda — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** a dona entra e cria a conta com Google. A dona e as profissionais conectam o Google Agenda: os agendamentos vão para lá, e os compromissos pessoais bloqueiam horário.

**Architecture:**
- **Login:** usa o provedor Google do Supabase. O backend troca o token do Supabase pela sessão própria, reaproveitando a reconciliação do cadastro (`pending_registrations` + `reconcileSupabaseConfirmedUser`).
- **Agenda:** é um módulo novo, `backend/src/modules/googleAgenda`, com OAuth próprio (`access_type=offline`), refresh token cifrado e dois jobs no `cronService`:
  - saída, a cada minuto: varredura por `appointments.updated_at`;
  - entrada, a cada 5 minutos: `freeBusy`.
- **Bloqueio de horário:** o ocupado do Google entra como `blockedRanges` nos três cálculos de disponibilidade.

**Tech Stack:** Express + Prisma 5 + node-cron + vitest (backend); Next.js + React + Supabase JS + vitest/RTL (frontend). A API do Google é chamada por `fetch` REST, sem `googleapis`.

**Spec:** `docs/superpowers/specs/2026-10-26-google-login-agenda-design.md`

## Global Constraints
- **Branch:** `feat/google`. Código vai por PR para a `main`.
- **Migração:** a migração é criada, mas **não é aplicada**. O `backend/.env` aponta para produção, e aplicar exige autorização explícita do dono.
- **Idioma:** textos de tela em PT-BR, no vocabulário do segmento (`useVocabulario`) onde falar de profissional ou cliente.
- **Escopos:**
  - login: só `openid email profile`;
  - agenda: só `https://www.googleapis.com/auth/calendar.app.created` e `https://www.googleapis.com/auth/calendar.freebusy`.
- **Janelas:** saída de ontem a +90 dias; ocupado de agora a +60 dias; cópia inicial de hoje a +90 dias.
- **Cadência:** saída a cada minuto (com sincronização imediata best-effort após gravar); ocupado a cada 5 minutos e na hora ao conectar.
- **Nome da agenda:** "EasyAgenda+" para a profissional e "EasyAgenda+ · <nome do negócio>" para a dona.
- **Evento:**
  - título: "<primeiro nome da cliente> · <serviço>", com " · <profissional>" só na conexão do negócio;
  - descrição: link `${FRONTEND_URL}/agendamentos?id=<id>`;
  - sem telefone.
- **Status:** cancelado apaga o evento; qualquer outro status mantém.
- **Sem configuração do Google, nada aparece e nada quebra:**
  - backend: sem `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_AGENDA_REDIRECT_URI` e `GOOGLE_TOKEN_KEY`;
  - frontend: com `NEXT_PUBLIC_GOOGLE_LOGIN_ATIVO` diferente de `'1'`.
- **Testes:** a API do Google é sempre mockada nos testes.

## Review Focus
1. **Dona com conta por senha entra pelo Google com o mesmo e-mail:** cai na conta existente, sem criar negócio novo (Task 1, teste `oauthSessao liga conta existente pelo e-mail`).
2. **O mesmo `state` do OAuth é usado duas vezes, ou depois de 10 minutos:** a segunda tentativa é recusada (Task 4, teste `state repetido ou vencido é recusado`).
3. **Compromisso do Google que atravessa a meia-noite, ou de dia inteiro:** bloqueia só a parte daquele dia, no fuso do negócio (Task 6, teste `faixasDoDia recorta pelo dia no fuso`).
4. **Agendamento muda de profissional:** o evento sai da conexão antiga e vai para a nova (Task 5, teste `troca de profissional move o evento`).
5. **Plano cai para o Solo com profissional conectada:** o ocupado dela para de bloquear e a saída para ela para (Task 4, teste `profissional em plano sem app fica pausada`).

---

### Task 1: Backend — sessão e cadastro pelo Google

**Files:**
- Modify: `backend/src/services/authService.ts` (novos métodos no `authService`; mensagem no `login`)
- Modify: `backend/src/validators/schemas/authSchemas.ts`
- Modify: `backend/src/routes/auth.ts` (e o controller de auth onde ficam `register`/`login`)
- Test: `backend/src/__tests__/authOAuth.test.ts`

**Interfaces:**
- Produces:
  - `POST /api/v1/auth/oauth/sessao` `{ accessToken }` → `{ completarCadastro: false, user, desiredPlan, paymentRequired }` com cookies de sessão, ou `{ completarCadastro: true, email, nome }`.
  - `POST /api/v1/auth/oauth/completar` `{ accessToken, businessName, ownerName, whatsapp, cpfCnpj, desiredPlan }` → `{ user, desiredPlan, paymentRequired }` com cookies.
  - `authService.oauthSessao(res, accessToken)` e `authService.oauthCompletar(res, input)`.

- [ ] **Step 1: Write the failing tests** em `authOAuth.test.ts`, mockando `supabaseAuthService.getVerifiedIdentityFromAccessToken`, o `authRepository` e o `refreshTokenRepository` como nos testes de auth existentes:
  - `oauthSessao liga conta existente pelo e-mail`: identidade `{ email: 'dona@x.com', emailVerified: true, user: { id: 'sb1', user_metadata: { full_name: 'Ana Souza' } } }`; `findUserBySupabaseUserId` → null; `findUserByEmailIncludingBlocked` → usuário `u1`. Espera `completarCadastro: false`, cookies setados e `createBusiness` não chamado.
  - `oauthSessao sem conta pede completar`: os dois finds → null. Espera `{ completarCadastro: true, email: 'dona@x.com', nome: 'Ana Souza' }`.
  - `oauthSessao recusa conta bloqueada`: usuário com `blocked: true` → rejeita com status 401.
  - `oauthSessao recusa e-mail não verificado`: `emailVerified: false` → 403 `EMAIL_NOT_VERIFIED`.
  - `oauthCompletar grava o pendente e cria a conta`: espera `upsertPendingRegistration` com os dados do formulário, `supabaseUserId: 'sb1'` e `passwordHash` do `senhaPlaceholder()`. Em seguida o fluxo de reconciliação e a sessão, e a conta marcada com `auth_provider = 'google'`.
  - `oauthCompletar valida como o cadastro`: CPF inválido → 400 (validação do schema na rota, via supertest, como nos testes de rota existentes).
  - `login de conta só do Google explica`: Supabase recusa a senha e o usuário local tem `auth_provider: 'google'` → 401 com code `CONTA_GOOGLE` e mensagem `Essa conta entra com o Google. Use "Continuar com Google" ou crie uma senha em "Esqueci minha senha".`

- [ ] **Step 2: Run** `cd backend && npx vitest run src/__tests__/authOAuth.test.ts` — Expected: FAIL (métodos inexistentes).

- [ ] **Step 3: Implement**
  - **`oauthSessao`:**
    - Usa `getVerifiedIdentityFromAccessToken`. Procura o usuário por `supabase_user_id` e depois por e-mail.
    - **Achou:** grava `supabase_user_id` se faltar (`updateUserIdentitySync`), marca verificado (`markEmailAsVerifiedWithSupabaseIdentity`) e chama `createInternalSessionForConfirmedUser`. `desiredPlan` e `paymentRequired` saem como no `confirmSignup`.
    - **Não achou:** devolve o pedido de completar, com `nome` de `user_metadata.full_name ?? name ?? ''`.
  - **`oauthCompletar`:**
    - Valida a identidade de novo e grava `upsertPendingRegistration`. O upsert por e-mail substitui um pendente de senha não confirmado.
    - Chama `reconcileSupabaseConfirmedUser({ email, supabaseUser: identity.user, reason: 'oauth_google' })` e grava `auth_provider = 'google'` no usuário criado.
    - Abre a sessão. Se já existir usuário para a identidade, apenas abre a sessão, sem duplicar.
  - **Schemas:**
    - `oauthSessaoSchema = z.object({ accessToken: z.string().min(20) })`;
    - `oauthCompletarSchema` = `registerSchema.omit({ email: true, password: true })` (e o que mais for só de senha) `.extend({ accessToken: z.string().min(20) })`.
  - **Mensagem `CONTA_GOOGLE`:** fica no `login` quando a senha é recusada.

- [ ] **Step 4: Run** o mesmo comando — Expected: PASS. Depois `npx vitest run src/__tests__/auth*` — Expected: PASS (nada antigo quebrou).

- [ ] **Step 5: Commit** `feat(google): sessão e cadastro pelo Google no backend`

---

### Task 2: Frontend — botão, callback e completar cadastro

**Files:**
- Create: `frontend/src/components/auth/BotaoGoogle.tsx`
- Create: `frontend/src/app/auth/callback/page.tsx` e `frontend/src/components/auth/OAuthCallbackView.tsx`
- Create: `frontend/src/app/cadastro/completar/page.tsx` e `frontend/src/components/auth/CompletarCadastroView.tsx`
- Modify: `frontend/src/components/auth/AuthForm.tsx` (botão + divisor "ou" no login e no cadastro)
- Modify: `frontend/src/components/auth/AuthConfirmView.tsx` (exportar a função que monta o destino `/pagamento?...` ou `/dashboard` como `destinoAposConfirmar(payload)`)
- Modify: `frontend/src/lib/auth*` ou onde ficam as chamadas de auth: `oauthApi.sessao(accessToken)` e `oauthApi.completar(input)`
- Test: `frontend/src/components/auth/__tests__/LoginGoogle.test.tsx`

**Interfaces:**
- Consumes: os endpoints da Task 1.
- Produces: rotas `/auth/callback` e `/cadastro/completar`. O `BotaoGoogle` chama `supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: \`${origin}/auth/callback${plano ? \`?plano=${plano}\` : ''}\` } })`.

- [ ] **Step 1: Write the failing tests:**
  - `mostra Continuar com Google quando ativo`: com `NEXT_PUBLIC_GOOGLE_LOGIN_ATIVO='1'`, o login e o cadastro têm o botão `Continuar com Google`. Sem a variável, o botão não aparece.
  - `botão leva o plano para o callback`: no cadastro com `?plano=premium`, `signInWithOAuth` é chamado com `redirectTo` terminando em `/auth/callback?plano=premium`.
  - `callback com conta existente vai para o destino`: `sessao` → `{ completarCadastro: false, paymentRequired: false }` → `router.replace('/dashboard')`.
  - `callback sem conta vai para completar`: → `router.replace('/cadastro/completar?plano=premium')`, guardando `email` e `nome` em `sessionStorage` (`easyagenda:oauth-completar`).
  - `completar envia os dados sem e-mail e senha`: e-mail fixo exibido, nome pré-preenchido, envia `{ accessToken, businessName, ownerName, whatsapp, cpfCnpj, desiredPlan: 'premium' }` e redireciona para `destinoAposConfirmar(resposta)`. Mostra também o aviso `Já tem conta com outro e-mail? Entre com ele.` com link para `/login`.
  - `completar sem sessão do Google volta ao cadastro`: sem sessão Supabase → `router.replace('/cadastro')`.

- [ ] **Step 2: Run** `cd frontend && npx vitest run src/components/auth/__tests__/LoginGoogle.test.tsx` — Expected: FAIL.

- [ ] **Step 3: Implement**
  - O botão segue o padrão visual do Google: fundo branco, borda, logo "G" em SVG inline, texto `Continuar com Google`.
  - O completar reutiliza os campos e validações do `AuthForm` de cadastro (nome do negócio, nome, WhatsApp, CPF/CNPJ, plano), sem e-mail e senha.
  - O segmento já fica no `localStorage` (`easyagenda:segmento-cadastro`) e não precisa de nada.
  - O access token vem de `supabase.auth.getSession()`.

- [ ] **Step 4: Run** o teste — Expected: PASS. Depois `npx vitest run src/components/auth` — Expected: PASS.

- [ ] **Step 5: Commit** `feat(google): login e cadastro com Google no frontend`

---

### Task 3: Backend — dados, cifra e cliente da API do Google

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/20261029120000_google_agenda/migration.sql`
- Create: `backend/src/modules/googleAgenda/googleAgenda.crypto.ts`
- Create: `backend/src/modules/googleAgenda/googleAgenda.api.ts`
- Test: `backend/src/__tests__/googleAgendaCrypto.test.ts`, `backend/src/__tests__/googleAgendaApi.test.ts`

**Interfaces:**
- Produces:
  - **Prisma:**
    - `GoogleAgendaConexao`: `id`, `businessId`, `userId` @unique, `tipo` ('negocio' | 'profissional'), `professionalId?`, `googleEmail`, `refreshTokenCifrado`, `calendarioId`, `status` ('ativa' | 'reconectar'), `ultimoErro?`, `ultimaSyncEm?`, `criadaEm`.
    - Índice único parcial: uma conexão `negocio` por `businessId`, em SQL na migração.
    - `GoogleAgendaEvento`: `conexaoId`, `appointmentId`, `googleEventId`, `versao` DateTime; @@unique([conexaoId, appointmentId]).
    - `GoogleAgendaOcupado`: `conexaoId`, `inicio`, `fim` (timestamptz).
    - Tudo em cascata ao apagar negócio, conexão ou agendamento.
  - **Cifra:**
    - `googleConfigurado(): boolean`: as 4 variáveis presentes.
    - `cifrar(texto: string): string` e `decifrar(cifrado: string): string`: AES-256-GCM, chave = `Buffer.from(GOOGLE_TOKEN_KEY, 'base64')` (32 bytes), formato `iv.tag.dados` em base64url.
  - **`googleApi`:**
    - `urlConsentimento(state: string): string`;
    - `trocarCodigo(code: string): Promise<{ refreshToken: string; email: string }>`;
    - `accessToken(refreshToken: string): Promise<string>`;
    - `criarAgenda(token: string, nome: string, fuso: string): Promise<string>`;
    - `salvarEvento(token, calendarioId, evento: EventoGoogle, googleEventId?: string): Promise<string>`;
    - `apagarEvento(token, calendarioId, googleEventId): Promise<void>`;
    - `ocupado(token, de: Date, ate: Date): Promise<Array<{ inicio: Date; fim: Date }>>` (calendário `primary`);
    - `revogar(refreshToken): Promise<void>`.
  - **Tipos:** `EventoGoogle = { titulo: string; descricao: string; inicio: string; fim: string; fuso: string }`.
  - **Erros:** `GoogleTokenInvalido` (401/`invalid_grant`) e `GoogleIndisponivel` (429/5xx).

- [ ] **Step 1: Write the failing tests:**
  - cifra: `cifra e decifra ida e volta`; `decifrar com dado adulterado lança`; `googleConfigurado é false sem GOOGLE_TOKEN_KEY`.
  - api (mock de `global.fetch`):
    - `urlConsentimento pede offline, consent e só os dois escopos`: a URL contém `access_type=offline`, `prompt=consent`, os dois escopos e `state`.
    - `accessToken com invalid_grant lança GoogleTokenInvalido`.
    - `ocupado converte busy em datas`.
    - `apagarEvento ignora 404 e 410`.
    - `429 lança GoogleIndisponivel`.

- [ ] **Step 2: Run** `cd backend && npx vitest run src/__tests__/googleAgendaCrypto.test.ts src/__tests__/googleAgendaApi.test.ts` — Expected: FAIL.

- [ ] **Step 3: Implement**
  - Schema, migração (SQL escrito à mão no padrão das migrações existentes) e os dois arquivos.
  - Endpoints REST: `https://oauth2.googleapis.com/token`, `https://oauth2.googleapis.com/revoke`, `https://www.googleapis.com/calendar/v3/calendars`, `.../calendars/{id}/events[/{eventId}]` e `https://www.googleapis.com/calendar/v3/freeBusy`.
  - O e-mail sai do `id_token` devolvido na troca. Por isso inclua `openid email` na URL de consentimento da agenda, além dos dois escopos de agenda.
  - Rode `npx prisma generate` (local, sem banco). **Não rode `migrate`.**

- [ ] **Step 4: Run** os testes — Expected: PASS. `npx tsc --noEmit -p .` — Expected: sem erros.

- [ ] **Step 5: Commit** `feat(google-agenda): modelo de dados, cifra do token e cliente da API`

---

### Task 4: Backend — conectar, desconectar e estado da conexão

**Files:**
- Create: `backend/src/modules/googleAgenda/googleAgenda.rules.ts` (`assinarState`, `lerState`, `conexaoEfetiva`)
- Create: `backend/src/modules/googleAgenda/googleAgenda.repository.ts`, `googleAgenda.service.ts`, `googleAgenda.controller.ts`, `googleAgenda.routes.ts`, `googleAgenda.types.ts`
- Modify: `backend/src/server.ts` (`app.use(\`${API_V1}/google-agenda\`, googleAgendaRoutes)`)
- Modify: `backend/src/modules/notifications/notifications.types.ts` (tipo `google_agenda` em `NOTIFICATION_TYPES`)
- Test: `backend/src/__tests__/googleAgendaConexao.test.ts`

**Interfaces:**
- Consumes: Task 3.
- Produces:
  - `assinarState({ userId, para, nonce, exp }): string` e `lerState(state): { userId, para } | null`.
    - HMAC-SHA256 com `GOOGLE_TOKEN_KEY` e validade de 10 minutos.
    - Uso único por `nonce`, guardado num `Map` em memória com expiração. O servidor é uma instância só; anote isso no código.
  - `conexaoEfetiva(c, plano): 'ativa' | 'reconectar' | 'pausada_plano'`: `profissional` em plano sem `app_profissional` (via `FEATURE_REQUIREMENTS`) → `pausada_plano`.
  - **Rotas:**
    - `GET /google-agenda/conexao` (tenant_admin, employee, professional) → `{ configurado, conexao: { tipo, googleEmail, status, ultimaSyncEm, professionalId } | null, profissionais?: Array<{ professionalId, nome, status | null }> }`. A lista `profissionais` vai só para a dona.
    - `GET /google-agenda/conectar?para=negocio|profissional` → `{ url }`:
      - `negocio`: só `tenant_admin`, em qualquer plano;
      - `profissional`: só `professional`, com `requireFeature('app_profissional')`.
    - `GET /google-agenda/callback?code&state` (público) → redireciona para `${FRONTEND_URL}/configuracoes?google=ok|erro` (dona) ou `${FRONTEND_URL}/bancada?google=ok|erro` (profissional).
    - `PUT /google-agenda/conexao` `{ professionalId: uuid | null }`: só a dona; o profissional precisa ser do negócio.
    - `DELETE /google-agenda/conexao`: revoga no Google (ignorando falha), apaga a conexão em cascata e não mexe na agenda do Google.
  - **Serviço:** `googleAgendaService.conectarUrl`, `callback`, `minhaConexao`, `definirProfissional`, `desconectar` e `avisarReconectar(conexao)`.
    - `avisarReconectar` notifica o sino da dona e manda push com `pushService.paraEquipe`.
    - Para a conexão de profissional, usa `pushService.paraProfissional`.
    - Avisa uma vez por mudança de status.

- [ ] **Step 1: Write the failing tests** (repo, `googleApi` e notificações mockados):
  - `state repetido ou vencido é recusado`: `lerState` do mesmo state duas vezes → a segunda é `null`; state com `exp` passado → `null`; assinatura trocada → `null`.
  - `callback cria conexão, agenda e dispara a cópia`:
    - `trocarCodigo` → `{ refreshToken: 'r1', email: 'ana@gmail.com' }`;
    - espera `criarAgenda(token, 'EasyAgenda+ · Studio Aurora', 'America/Sao_Paulo')` para `para: 'negocio'`;
    - conexão salva com `refreshTokenCifrado !== 'r1'`;
    - `sincronizarSaida({ conexaoId })` e `atualizarOcupado(conexaoId)` chamados (Tasks 5 e 6).
  - `callback de profissional usa o nome curto e liga o professionalId do usuário`: `criarAgenda(..., 'EasyAgenda+', ...)` e `professionalId` = `users.professional_id`.
  - `no Solo com uma profissional, a dona já vem ligada a ela`: callback `negocio` num negócio com exatamente 1 profissional ativa grava `professionalId` dela. Com 2 ou mais, grava `null`.
  - `profissional em plano sem app fica pausada`: `conexaoEfetiva({ tipo: 'profissional', status: 'ativa' }, 'basico')` → `'pausada_plano'`; a mesma com `'profissional'` → `'ativa'`; `tipo: 'negocio'` em `'basico'` → `'ativa'`.
  - `definirProfissional recusa profissional de outro negócio` → 404.
  - `desconectar revoga e apaga mesmo se o Google falhar`.
  - `conectar responde 404 sem configuração`: `googleConfigurado()` false → `NotFoundError('Google Agenda')`.

- [ ] **Step 2: Run** `npx vitest run src/__tests__/googleAgendaConexao.test.ts` — Expected: FAIL.

- [ ] **Step 3: Implement** os arquivos no padrão de `modules/equipe`: routes, controller, service, repository e types, com Zod no `types` e `validate` nas rotas. Coloque um rate limit no callback, como o do convite.

- [ ] **Step 4: Run** — Expected: PASS. `npx tsc --noEmit -p .` — Expected: sem erros.

- [ ] **Step 5: Commit** `feat(google-agenda): conectar, desconectar e estado da conexão`

---

### Task 5: Backend — agendamentos para o Google (saída)

**Files:**
- Modify: `backend/src/modules/googleAgenda/googleAgenda.rules.ts` (`conexoesQueVeem`, `montarEvento`)
- Modify: `backend/src/modules/googleAgenda/googleAgenda.service.ts` (`sincronizarSaida`)
- Modify: `backend/src/services/cronService.ts` (job a cada minuto)
- Modify: `backend/src/modules/appointments/appointments.service.ts`, `backend/src/modules/publicBooking/publicBooking.service.ts`, `backend/src/services/whatsapp/whatsappBookingService.ts`: depois de gravar, `void googleAgendaService.sincronizarSaida({ appointmentId })`
- Test: `backend/src/__tests__/googleAgendaSaida.test.ts`

**Interfaces:**
- Consumes: Tasks 3 e 4.
- Produces:
  - `conexoesQueVeem(ag: { businessId, professionalId }, conexoes): Conexao[]`: a `negocio` do negócio, mais a `profissional` cujo `professionalId` bate, só as com `conexaoEfetiva === 'ativa'`.
  - `montarEvento(ag, tipo, { fuso, frontendUrl }): EventoGoogle`.
  - `sincronizarSaida(opts?: { appointmentId?: string; conexaoId?: string }): Promise<void>`. Nunca lança; loga e segue.

- [ ] **Step 1: Write the failing tests:**
  - `montarEvento`:
    - agendamento de "Mariana Lima", "Design de Sobrancelha", com "Camila", 14:00 às 14:45;
    - na conexão `negocio`, o título é `Mariana · Design de Sobrancelha · Camila`;
    - na `profissional`, é `Mariana · Design de Sobrancelha`;
    - a descrição contém `/agendamentos?id=`, e o telefone não aparece.
  - `cria evento para agendamento sem evento e grava a versao`.
  - `não regrava quando a versao não mudou`.
  - `atualiza quando updated_at mudou`: `salvarEvento` chamado com o `googleEventId` existente.
  - `cancelado apaga o evento e o registro`.
  - `troca de profissional move o evento`: o registro na conexão da profissional antiga é apagado no Google, e a nova recebe o evento.
  - `fora da janela não sincroniza`: agendamentos de antes de ontem ou depois de +90 dias.
  - `token inválido marca reconectar e avisa uma vez`: `accessToken` lança `GoogleTokenInvalido` → status `reconectar`, `avisarReconectar` uma vez; uma segunda rodada não avisa de novo.
  - `GoogleIndisponivel não muda status`.

- [ ] **Step 2: Run** `npx vitest run src/__tests__/googleAgendaSaida.test.ts` — Expected: FAIL.

- [ ] **Step 3: Implement**
  - A varredura busca, por conexão ativa, os agendamentos de ontem a +90 dias do negócio, filtrados por profissional quando for `profissional`. Em seguida cruza com `google_agenda_eventos` por `versao = updated_at`.
  - Também apaga eventos cujo agendamento sumiu ou deixou de pertencer à conexão.
  - Um access token por conexão por rodada.
  - O job do cron segue o padrão dos outros, com guarda contra rodada simultânea.

- [ ] **Step 4: Run** — Expected: PASS. Depois `npx vitest run` no backend inteiro — Expected: PASS (as chamadas novas nos serviços de agendamento não quebram os testes existentes; mocke `googleAgendaService` onde precisar).

- [ ] **Step 5: Commit** `feat(google-agenda): agendamentos vão para o Google`

---

### Task 6: Backend — compromissos do Google bloqueiam horário (entrada)

**Files:**
- Modify: `backend/src/modules/googleAgenda/googleAgenda.rules.ts` (`faixasDoDia`)
- Modify: `backend/src/modules/googleAgenda/googleAgenda.service.ts` (`atualizarOcupado`, `bloqueiosDoDia`, `ocupadoDoDia`)
- Modify: `backend/src/modules/googleAgenda/googleAgenda.routes.ts` (`GET /google-agenda/ocupado?data=YYYY-MM-DD`, dona e recepção)
- Modify: `backend/src/services/cronService.ts` (job `*/5 * * * *`)
- Modify: `backend/src/modules/appointments/appointments.service.ts:236-246`, `backend/src/modules/publicBooking/publicBooking.service.ts:40-48`, `backend/src/services/whatsapp/whatsappFlowService.ts:1426-1433`
- Test: `backend/src/__tests__/googleAgendaOcupado.test.ts`

**Interfaces:**
- Consumes: Tasks 3 e 4.
- Produces:
  - `faixasDoDia(ocupados: Array<{ inicio: Date; fim: Date }>, data: string, fuso: string): Array<{ start: string; end: string }>`: HH:mm recortado ao dia; dia inteiro vira `00:00` a `23:59`.
  - `atualizarOcupado(conexaoId?: string): Promise<void>`: todas as conexões ativas com `professionalId`, ou só uma.
  - `bloqueiosDoDia(businessId, professionalId, data): Promise<Array<{ start: string; end: string }>>`: vazio se não houver conexão efetiva ativa para esse profissional.
  - `ocupadoDoDia(businessId, data): Promise<Record<professionalId, Array<{ start, end }>>>` e a rota `GET /google-agenda/ocupado`, que devolve esse objeto.

- [ ] **Step 1: Write the failing tests:**
  - `faixasDoDia recorta pelo dia no fuso`, em `America/Sao_Paulo`:
    - 22:00 de 10/11 às 02:00 de 11/11 (horário local), pedido para `2026-11-10` → `[{ start: '22:00', end: '23:59' }]`; para `2026-11-11` → `[{ start: '00:00', end: '02:00' }]`;
    - evento das 13:00Z às 14:00Z em 10/11 → `10:00`–`11:00`.
  - `atualizarOcupado substitui o ocupado da conexão`: apaga os antigos e grava os do `freeBusy` de agora a +60 dias.
  - `conexão sem professionalId não consulta o Google`.
  - `bloqueiosDoDia ignora conexão em reconectar ou pausada_plano`.
  - `disponibilidade junta pausa e Google`: com pausa 12:00–13:00 e Google 15:00–16:00, `appointmentsService.getAvailableSlots` passa os dois em `blockedRanges`. Teste igual para `publicBooking` e para o fluxo do WhatsApp, com `generateAvailableTimeSlots` espionado.
  - `ocupado da conexão de outro profissional não bloqueia`.

- [ ] **Step 2: Run** `npx vitest run src/__tests__/googleAgendaOcupado.test.ts` — Expected: FAIL.

- [ ] **Step 3: Implement**
  - Nos três cálculos: `blockedRanges: [...(pausa ? [pausa] : []), ...(await googleAgendaService.bloqueiosDoDia(businessId, professionalId, date))]`.
  - O fuso vem de `getBusinessScheduleSettings(businessId).timezone`.
  - Os erros do Google seguem a regra da Task 5.

- [ ] **Step 4: Run** — Expected: PASS. Depois a suíte inteira do backend e o `tsc` — Expected: PASS e sem erros.

- [ ] **Step 5: Commit** `feat(google-agenda): compromissos do Google bloqueiam horário`

---

### Task 7: Frontend — cartão do Google Agenda em Ajustes e no app

**Files:**
- Create: `frontend/src/lib/googleAgenda.ts`
- Create: `frontend/src/components/googleAgenda/GoogleAgendaCard.tsx`
- Create: `frontend/src/components/settings/GoogleAgendaSection.tsx`
- Modify: `frontend/src/components/SettingsModule.tsx` (seção depois de `ScheduleSection`, só para `tenant_admin`)
- Modify: `frontend/src/components/bancada/HojeBancada.tsx` (cartão perto de `AtivarNotificacoes`, no dia de hoje)
- Modify: o tipo de notificação no frontend, onde o sino mapeia ícones, para incluir `google_agenda`
- Test: `frontend/src/components/googleAgenda/__tests__/GoogleAgendaCard.test.tsx`

**Interfaces:**
- Consumes: as rotas da Task 4.
- Produces:
  - `googleAgendaApi = { conexao(), conectar(para: 'negocio' | 'profissional'): Promise<{ url: string }>, definirProfissional(id: string | null), desconectar(), ocupado(data: string): Promise<Record<string, Array<{ start: string; end: string }>>> }`.
  - `<GoogleAgendaCard para="negocio" | "profissional" />`.

- [ ] **Step 1: Write the failing tests:**
  - `não aparece sem configuração`: `conexao` → `{ configurado: false }` → nada renderizado.
  - `desconectado mostra Conectar Google Agenda e redireciona`: clicar chama `conectar('negocio')` e faz `window.location.assign(url)`.
  - `conectado mostra e-mail, última sincronização e Desconectar`: confirmar o desconectar chama `desconectar()` e volta ao estado desconectado.
  - `dona escolhe quem ela é na grade`:
    - `Você também atende?` com o select das profissionais, mais a opção `Não atendo`;
    - mudar chama `definirProfissional(id)`;
    - no vocabulário de barbearia, o rótulo diz `barbeiro`.
  - `precisa reconectar`: status `reconectar` mostra o aviso e o botão `Reconectar`.
  - `lista das profissionais para a dona`: no Equipe, mostra cada profissional com `Conectada`, `Não conectada`, `Precisa reconectar` ou `Pausada pelo plano`.
  - `volta do Google mostra o resultado`: `?google=ok` mostra o toast `Google Agenda conectado.`; `?google=erro` mostra `Não foi possível conectar o Google Agenda. Tente de novo.`

- [ ] **Step 2: Run** `cd frontend && npx vitest run src/components/googleAgenda` — Expected: FAIL.

- [ ] **Step 3: Implement** com os componentes de `@/components/ui` (Card, Button, Banner, Select) e o padrão das seções de Ajustes existentes. Os textos de explicação são curtos:
  - dona: `Os agendamentos aparecem no seu Google Agenda, numa agenda separada chamada EasyAgenda+. Seus compromissos pessoais bloqueiam o horário na sua página.`
  - profissional: a mesma frase com "seus agendamentos".

- [ ] **Step 4: Run** — Expected: PASS. Depois `npx vitest run src/components/settings src/components/bancada` — Expected: PASS.

- [ ] **Step 5: Commit** `feat(google-agenda): cartão de conexão em Ajustes e no app da profissional`

---

### Task 8: Frontend — "Ocupado (Google)" na agenda do painel

**Files:**
- Modify: `frontend/src/components/AppointmentModule.tsx` (busca `googleAgendaApi.ocupado(data)` junto com os agendamentos do dia e passa para a grade)
- Modify: `frontend/src/components/appointments/LinhaDoTempo.tsx` (prop `ocupadoGoogle?: Record<string, Array<{ start: string; end: string }>>` e bloco hachurado por coluna)
- Modify: `frontend/src/components/appointments/CreateAppointmentModal.tsx` e o modal de remarcar do painel (aviso)
- Test: `frontend/src/components/appointments/__tests__/OcupadoGoogle.test.tsx`

**Interfaces:**
- Consumes: `googleAgendaApi.ocupado` (Task 7).
- Produces: a função `cruzaOcupado(ocupado, hora: string, duracaoMin: number): boolean` em `frontend/src/lib/googleAgenda.ts`.

- [ ] **Step 1: Write the failing tests:**
  - `bloco Ocupado (Google) na coluna da profissional`: `ocupadoGoogle = { p1: [{ start: '15:00', end: '16:00' }] }` → a coluna de `p1` tem um bloco com o texto `Ocupado (Google)`, sem título de compromisso, e a coluna de `p2` não tem.
  - `cruzaOcupado`: `('15:30', 30)` → true; `('16:00', 30)` → false; `('14:45', 30)` → true.
  - `aviso ao criar por cima`: escolher a profissional `Camila` às 15:30 mostra `Esse horário está ocupado no Google Agenda de Camila`, e o botão de salvar continua habilitado.
  - `sem Google não busca nada que quebre`: `ocupado` rejeitando 404 → a agenda renderiza normalmente.

- [ ] **Step 2: Run** `npx vitest run src/components/appointments/__tests__/OcupadoGoogle.test.tsx` — Expected: FAIL.

- [ ] **Step 3: Implement** o bloco com as classes de bloqueio da grade (o mesmo visual da pausa, se houver; senão, listras com `bg-surface-2` e borda tracejada) e posicionado pelo mesmo cálculo de minutos dos blocos de agendamento.

- [ ] **Step 4: Run** — Expected: PASS. Depois a suíte inteira do frontend, `npx tsc --noEmit -p .` e `npx next lint` — Expected: PASS, sem erros. Rode testes que deram timeout isolados antes de concluir que algo quebrou.

- [ ] **Step 5: Commit** `feat(google-agenda): ocupado do Google na agenda do painel`

---

### Task 9: Privacidade, guia de configuração e documentação

**Files:**
- Modify: `frontend/src/app/privacidade/page.tsx` (nova seção `Dados do Google`)
- Create: `docs/google-configuracao.md`
- Modify: `docs/ROADMAP.md` (fase 7 "🔄 Implementada, aguardando migração e PR", branch `feat/google`), `docs/design/SEGUIMENTO.md` (pendências da fase 7)
- Modify: `docs/superpowers/specs/2026-10-26-google-login-agenda-design.md` (seção "Ajustes feitos na implementação")
- Test: `frontend/src/app/privacidade/__tests__/` (se houver teste da página; senão um teste simples de render)

- [ ] **Step 1: Write the failing test** `privacidade explica os dados do Google`: a página contém `Google Agenda`, `ocupado ou livre`, `EasyAgenda+`, `desconectar` e `Limited Use`.

- [ ] **Step 2: Run** — Expected: FAIL.

- [ ] **Step 3: Write**
  - **Seção de privacidade:** lê só ocupado/livre da agenda principal; escreve só na agenda "EasyAgenda+" que o app cria; como desconectar; o token fica cifrado e é apagado ao desconectar; cumpre a Google API Services User Data Policy, incluindo os requisitos de Limited Use.
  - **Guia `docs/google-configuracao.md`:**
    1. Google Cloud: projeto, tela de consentimento externa (logo, domínio, links), Calendar API ativada e cliente OAuth Web com os redirects `https://<projeto>.supabase.co/auth/v1/callback` e `${BACKEND}/api/v1/google-agenda/callback`.
    2. Supabase: provedor Google com o mesmo cliente, e `${FRONTEND}/auth/callback` na lista de redirects.
    3. Variáveis: backend `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_AGENDA_REDIRECT_URI` e `GOOGLE_TOKEN_KEY` (gerar com `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`); frontend `NEXT_PUBLIC_GOOGLE_LOGIN_ATIVO=1`.
    4. Verificação do Google para os escopos de agenda: vídeo, política publicada e usuários de teste enquanto não aprova.
  - **Ajustes na spec:**
    - `password_hash` continua obrigatório: a conta do Google usa o `senhaPlaceholder()`, como as outras.
    - `pausada_plano` é calculado (`conexaoEfetiva`), não gravado.
    - O ocupado do painel vem de `GET /google-agenda/ocupado`, não do `/appointments`.

- [ ] **Step 4: Run** o teste — Expected: PASS.

- [ ] **Step 5: Commit** `docs(google): privacidade, guia de configuração e roadmap da fase 7`

---

## Depois das tasks
- Rodar a suíte inteira, `tsc` e lint no backend e no frontend.
- Abrir o PR de `feat/google` para a `main`, avisando que a migração `20261029120000_google_agenda` precisa ser aplicada, com autorização do dono, antes do deploy do backend.
