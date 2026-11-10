# Onboarding: etapa Recebimentos Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tirar a chave Pix e o sinal da etapa Serviços e criar a etapa 4 "Recebimentos" (Mercado Pago, InfinitePay, Pix manual, pular), com retorno do OAuth direto ao onboarding; e oferecer o Google Agenda como card opcional na etapa Horários.

**Architecture:** Backend ganha `PUT /onboarding/recebimentos` e o `state` do OAuth carrega a origem. Frontend ganha `EtapaRecebimentos`, reaproveita o catálogo de gateways e o formulário da InfinitePay (extraído). A numeração das etapas sobe (cap 6, concluído 7) com migração SQL.

**Tech Stack:** Express + Prisma + zod + vitest (backend); Next.js + React + vitest/testing-library (frontend).

**Spec:** `docs/superpowers/specs/2026-11-10-onboarding-recebimentos-design.md`

## Global Constraints
- Textos em português do Brasil. Mesma casca `CascaOnboarding`; componentes de `@/components/ui`.
- `ETAPAS` (frontend) = `['Seu negócio','Horários','Serviços','Recebimentos','Sua página','WhatsApp e link']`.
- Obrigatórias continuam 1 a 3 (`ULTIMA_OBRIGATORIA = 3`); Recebimentos é pulável com o rótulo "Configurar depois".
- Asaas e PagBank aparecem desabilitados com "Em breve".
- Trabalhar em branch nova a partir de `main` (`feat/onboarding-recebimentos`); a branch atual é outra.

## Review Focus
- Voltar à etapa Serviços e salvar de novo não pode zerar o sinal já definido em Recebimentos (teste na Task 2).
- `state` antigo (sem origem) ou adulterado no OAuth: deve cair em Ajustes / ser rejeitado (Task 3).
- `?recebimento=confirmar&t=...` com StrictMode não pode confirmar duas vezes (Task 7).
- Sinal em serviço de outro negócio (id de outra conta) é ignorado (Task 2).
- Quem estava pendente na etapa 4 ou 5 antes do deploy não cai na tela errada (Task 1, migração).
- `state` do Google sem origem (conexões iniciadas antes do deploy) volta para Ajustes; o `toEqual` antigo de `lerState` precisa ser atualizado (Task 8).
- Google não configurado no ambiente: a etapa Horários não mostra o card nem quebra (Task 8).

---

### Task 1: Numeração das etapas e migração

**Files:**
- Modify: `backend/src/modules/onboarding/onboarding.rules.ts` (`ETAPA_CONCLUIDA` = 7; teto 6 em `estadoOnboarding` e `etapaDepoisDe`)
- Create: `backend/prisma/migrations/20261110120000_onboarding_recebimentos/migration.sql`
- Modify: `frontend/src/lib/onboarding.ts` (`ETAPAS` com 6 nomes)
- Test: `backend/src/__tests__/onboarding.test.ts`

**Interfaces:**
- Produces: `ETAPA_CONCLUIDA = 7`, `etapaDepoisDe(atual, salva)` com teto 6, `estadoOnboarding` com etapa limitada a 6; `ETAPAS` com 6 itens.

- [ ] **Step 1: Atualizar os testes existentes e acrescentar** em `onboarding.test.ts`: `estadoOnboarding({ onboardingEtapa: 6, onboardingConcluidoEm: null })` → `{ pendente: true, bloqueante: false, etapa: 6 }`; concluído → `etapa: 7`; `rules.etapaDepoisDe(4, 4)` → `5`; `rules.etapaDepoisDe(6, 3)` → `6`; `rules.etapaDepoisDe(3, 3)` → `4`.
- [ ] **Step 2:** Rodar `cd backend && npx vitest run src/__tests__/onboarding.test.ts` → FAIL.
- [ ] **Step 3:** Ajustar `onboarding.rules.ts`; trocar `Math.min(..., 5)` por `6` nas duas funções e o `ETAPA_CONCLUIDA`.
- [ ] **Step 4:** Migração: `UPDATE "businesses" SET "onboarding_etapa" = "onboarding_etapa" + 1 WHERE "onboarding_concluido_em" IS NULL AND "onboarding_etapa" >= 4;` com comentário no topo dizendo que só desloca quem ainda está no onboarding.
- [ ] **Step 5:** `ETAPAS` no frontend com "Recebimentos" na posição 4. Rodar o teste do backend → PASS.
- [ ] **Step 6: Commit** `feat(onboarding): numeração com a etapa Recebimentos (cap 6, concluído 7)`

### Task 2: Backend — sinal e chave Pix saem de Serviços; nova rota Recebimentos

**Files:**
- Modify: `backend/src/modules/onboarding/onboarding.types.ts` (tirar `chavePix` e `sinalPct` de `ServicosSchema`; criar `RecebimentosSchema`; `OnboardingDto.recebimentos`)
- Modify: `backend/src/modules/onboarding/onboarding.repository.ts` (`salvarServicos` não grava `depositPercentage` na atualização e cria sem sinal; novo `salvarRecebimentos`; novo `conexaoAtiva`)
- Modify: `backend/src/modules/onboarding/onboarding.service.ts`, `onboarding.controller.ts`, `onboarding.routes.ts`
- Modify: `backend/src/modules/onboarding/onboarding.rules.ts` (remover `precisaDePix` de lá se ficar sem uso; criar `precisaDeFormaDeReceber`)
- Test: `backend/src/__tests__/onboarding.test.ts`

**Interfaces:**
- Produces:
  - `RecebimentosSchema = z.object({ chavePix: z.object({ chave, tipo: PixKeyTypeSchema }).optional(), servicos: z.array(z.object({ id: z.string().uuid(), sinalPct: z.number().min(1).max(100).nullable() })).max(40) })` com o mesmo `validatePixKeyFormat` da chave (reaproveitar o que `ServicosSchema` fazia).
  - `RecebimentosInput = z.infer<typeof RecebimentosSchema>`.
  - `onboardingService.salvarRecebimentos(businessId: string, d: RecebimentosInput): Promise<OnboardingDto>`.
  - `onboardingRepository.salvarRecebimentos(businessId, d)` (transação: grava `pixKey`/`pixKeyType` se houver `chavePix`; `service.updateMany({ where: { id, businessId }, data: { depositPercentage: sinalPct } })` por item — id de outro negócio não atualiza nada; chama `avancar(tx, businessId, 4)`).
  - `onboardingRepository.conexaoAtiva(businessId): Promise<boolean>` (`prisma.conexaoRecebimento.count({ where: { businessId, situacao: 'ativa' } }) > 0`).
  - `OnboardingDto.recebimentos: { conexao: { gateway: 'mercadopago' | 'infinitepay'; contaNome: string; situacao: 'ativa' | 'precisa_reconectar' } | null; temChavePix: boolean }` (mantém `temChavePix` no nível de cima).
  - `PUT /onboarding/recebimentos` (dona, `validate({ body: RecebimentosSchema })`).
- Regra: se algum item tem `sinalPct > 0` e não há `b.pixKey`, nem `d.chavePix`, nem `conexaoAtiva` → `ValidationError('Escolha como receber o sinal', ['Conecte uma conta ou informe a chave Pix, ou tire o sinal dos serviços.'])`. Etapa salva < 4 → `ConflictError('Conclua a etapa "Serviços" antes')`.

- [ ] **Step 1: Escrever os testes** (mockando `repo` como os demais): (a) `salvarRecebimentos` com sinal, sem chave e sem conexão → `ValidationError`; (b) com `chavePix` → chama `repo.salvarRecebimentos`; (c) com conexão ativa e sem chave → passa; (d) `onboardingEtapa: 3` → `ConflictError`; (e) `salvarServicos` com serviços e **sem** `chavePix` não lança mesmo com `depositPercentage` já salvo, e `repo.salvarServicos` é chamado sem sinal; (f) `ServicosSchema.safeParse` ignora `sinalPct`/`chavePix` extras; (g) `ver()` devolve `recebimentos.conexao` e `temChavePix`.
- [ ] **Step 2:** Rodar `npx vitest run src/__tests__/onboarding.test.ts` → FAIL.
- [ ] **Step 3:** Implementar. No repositório, `salvarServicos` na atualização grava só nome, preço e duração (nunca `depositPercentage`); na criação, `depositPercentage` fica nulo. `ver()` busca `conexaoAtiva`/conexão com `repo.conexao(businessId)` (select `gateway`, `contaNome`, `situacao`).
- [ ] **Step 4:** `npx vitest run src/__tests__/onboarding.test.ts` e `npm run typecheck` → PASS.
- [ ] **Step 5: Commit** `feat(onboarding): sinal e chave Pix passam para a rota de recebimentos`

### Task 3: Backend — origem do OAuth no `state`

**Files:**
- Modify: `backend/src/modules/recebimentos/recebimentos.rules.ts` (`assinarEstado`, `lerEstado`)
- Modify: `backend/src/modules/recebimentos/conexao.service.ts` (`conectarUrl`, `telaDe`, `callback`)
- Modify: `backend/src/modules/recebimentos/recebimentos.controller.ts` (`conectar` lê `req.query.origem`) e `recebimentos.routes.ts` / types (validar query `origem?: 'onboarding'`)
- Test: `backend/src/__tests__/recebimentosRules.test.ts`, `backend/src/__tests__/recebimentosConexao.test.ts`

**Interfaces:**
- Produces:
  - `type OrigemConexao = 'ajustes' | 'onboarding'`
  - `assinarEstado(userId, gateway, agora = Date.now(), origem: OrigemConexao = 'ajustes'): string` (carga ganha `o`).
  - `lerEstado(estado, agora?)` devolve `{ userId, gateway, nonce, origem: OrigemConexao }`; ausência de `o` ou valor desconhecido → `'ajustes'`.
  - `conexaoService.conectarUrl(user, gateway, origem: OrigemConexao = 'ajustes')`.
  - Retorno do `callback`: com origem `onboarding` → `${frontend()}/onboarding?recebimento=confirmar&t=<t>` (ou `?recebimento=erro`); caso contrário a tela atual de Ajustes.

- [ ] **Step 1: Testes:** `assinarEstado(..., 'onboarding')` → `lerEstado(...).origem === 'onboarding'`; `assinarEstado('u1','mercadopago', AGORA)` → `origem === 'ajustes'`; estado antigo montado à mão sem `o` → `'ajustes'`; adulterar a carga continua `null`. No conexão: `callback` com estado de origem onboarding termina em `/onboarding?recebimento=confirmar&t=`; com estado inválido e sem origem conhecida → continua em `/dashboard/configuracoes/recebimentos/mercadopago?recebimento=erro`.
- [ ] **Step 2:** Rodar `npx vitest run src/__tests__/recebimentosRules.test.ts src/__tests__/recebimentosConexao.test.ts` → FAIL.
- [ ] **Step 3:** Implementar. Atenção: no erro do callback, a origem só é conhecida se o estado for lido com sucesso; se não for, usar a tela de Ajustes.
- [ ] **Step 4:** Mesmos testes + `npm run typecheck` → PASS.
- [ ] **Step 5: Commit** `feat(recebimentos): o retorno do Mercado Pago pode voltar ao onboarding`

### Task 4: Frontend — tipos, API e formulário da InfinitePay reutilizável

**Files:**
- Modify: `frontend/src/lib/onboarding.ts` (`Onboarding.recebimentos`, `ServicoOnboarding` mantém `sinalPct` só para leitura; novo `ServicoEntrada = Omit<ServicoOnboarding, 'sinalPct'>`; `salvarServicos(servicos: ServicoEntrada[])`; `salvarRecebimentos(d)`)
- Modify: `frontend/src/lib/recebimentos.ts` (`conectar(origem?: 'onboarding')` → `GET /recebimentos/mercadopago/conectar` com `params: { origem }`)
- Create: `frontend/src/components/recebimentos/InfinitePayFormulario.tsx` (formulário atual extraído de `InfinitePayPassos`)
- Modify: `frontend/src/components/recebimentos/InfinitePayPassos.tsx` (usa o componente)
- Test: `frontend/src/components/recebimentos/__tests__/InfinitePayPassos.test.tsx` (deve continuar passando sem edição de asserções)

**Interfaces:**
- Produces:
  - `onboardingApi.salvarRecebimentos(d: { chavePix?: { chave: string; tipo: TipoChavePix }; servicos: Array<{ id: string; sinalPct: number | null }> }): Promise<Onboarding>` → `PUT /onboarding/recebimentos`.
  - `Onboarding.recebimentos: { conexao: { gateway: GatewayId; contaNome: string; situacao: 'ativa' | 'precisa_reconectar' } | null; temChavePix: boolean }`.
  - `InfinitePayFormulario({ onConectado }: { onConectado: (estado: EstadoRecebimentos) => void })` — tem InfiniteTag, Chave de API, o aceite e o botão "Conectar", com o mesmo texto e erros de hoje.

- [ ] **Step 1:** Rodar `cd frontend && npx vitest run src/components/recebimentos` (linha de base verde).
- [ ] **Step 2:** Extrair o formulário (estados `handle`, `chave`, `aceite`, `conectando`, `erro` e `conectar`) para `InfinitePayFormulario`; `InfinitePayPassos` passa a renderizá-lo e, em `onConectado`, faz `setEstado(novo)` e o toast "InfinitePay conectada.".
- [ ] **Step 3:** Rodar os testes de recebimentos → PASS sem alterar as asserções. Rodar `npx tsc --noEmit` (os usos antigos de `salvarServicos(servicos, pix)` quebram: ajustar na Task 5).
- [ ] **Step 4: Commit** `refactor(recebimentos): extrai o formulário da InfinitePay e acrescenta a API de recebimentos do onboarding`

### Task 5: Frontend — etapa Serviços sem sinal nem Pix

**Files:**
- Modify: `frontend/src/components/onboarding/EtapaServicos.tsx`
- Modify: `frontend/src/components/onboarding/OnboardingFlow.tsx` (chamada de `salvarServicos` sem Pix; próxima etapa continua 4)
- Test: `frontend/src/components/onboarding/__tests__/Onboarding.test.tsx`

**Interfaces:**
- Consumes: `ServicoEntrada` (Task 4).
- Produces: `EtapaServicos({ segmento, jaSalvos, salvando, onVoltar, onSalvar: (servicos: ServicoEntrada[]) => void })` (props `temChavePix` removida); `erroDosServicos` perde o campo `comSinal` dos tipos aceitos.

- [ ] **Step 1: Testes:** a etapa Serviços não renderiza "Exigir sinal via Pix" nem "Chave Pix para receber o sinal"; `onSalvar` recebe só `{ nome, duracaoMinutos, preco }`.
- [ ] **Step 2:** Rodar `npx vitest run src/components/onboarding` → FAIL.
- [ ] **Step 3:** Remover `TIPOS_PIX`, `SINAL_PADRAO`, `comSinal`, `chave`, `tipo`, `precisaPix`, o bloco "Chave Pix…" e o checkbox de sinal; ajustar descrição se citar sinal.
- [ ] **Step 4:** Rodar os testes de onboarding → PASS; `npx tsc --noEmit` → PASS.
- [ ] **Step 5: Commit** `feat(onboarding): serviços sem sinal nem chave Pix`

### Task 6: Frontend — componente `EtapaRecebimentos`

**Files:**
- Create: `frontend/src/components/onboarding/EtapaRecebimentos.tsx`
- Modify: `frontend/src/components/recebimentos/catalogo.ts` (acrescentar `descricaoCurta` por gateway para os cartões: "Confirma o sinal sozinho. Pix e cartão." / "Confirma o sinal sozinho. Pix e cartão em até 12x." / "Em breve")
- Test: `frontend/src/components/onboarding/__tests__/EtapaRecebimentos.test.tsx`

**Interfaces:**
- Consumes: `GATEWAYS`, `GatewayLogo`, `InfinitePayFormulario`, `recebimentosApi.conectar('onboarding')`, `Onboarding['recebimentos']`, `Onboarding['servicos']`.
- Produces:
  - `type EscolhaRecebimento = 'mercadopago' | 'infinitepay' | 'pix' | 'nenhum'`
  - `erroDosRecebimentos(a: { escolha: EscolhaRecebimento | null; conectado: boolean; chave: string; servicosComSinal: number }): string | null` — `null` quando pode continuar; mensagens: nenhuma escolha → "Escolha como receber ou toque em Configurar depois."; `pix` sem chave → "Informe a chave Pix."; gateway escolhido sem conexão ativa e com sinal → "Conecte a conta para cobrar o sinal."
  - `EtapaRecebimentos({ servicos, recebimentos, salvando, onVoltar, onPular, onSalvar, onConexaoMudou }: { servicos: Onboarding['servicos']; recebimentos: Onboarding['recebimentos']; salvando: boolean; onVoltar: () => void; onPular: () => void; onSalvar: (d: Parameters<typeof onboardingApi.salvarRecebimentos>[0]) => void; onConexaoMudou: () => void })`.
- Comportamento: `CascaOnboarding etapa={4}` com título "Como você quer receber o sinal?" e descrição que explica o sinal (cliente paga uma parte para reservar o horário; com integração a confirmação é automática; com Pix manual a dona confere). Cartões das 5 opções + "Não vou cobrar sinal agora"; Asaas/PagBank desabilitados com "Em breve". Mercado Pago: passos/avisos de `GATEWAYS` + botão "Conectar com o Mercado Pago" (chama `conectar('onboarding')` e `window.location.assign(url)`); já conectado mostra `contaNome` e "Conectado". InfinitePay: passos/avisos + `InfinitePayFormulario` (em `onConectado` chama `onConexaoMudou`). Pix: `Select` de tipo + `Input` de chave (mesmos tipos de hoje). Lista de serviços com checkbox "Exigir sinal" e campo de % (padrão 30), só quando há forma de receber (conexão ativa, ou Pix com chave preenchida). Rodapé: Voltar, "Configurar depois" (`onPular`) e Continuar (desabilitado enquanto `erroDosRecebimentos`). Estado inicial: `escolha` = gateway da conexão ativa, ou `pix` se `temChavePix`, ou nulo; sinais iniciais vêm de `servicos[].sinalPct`.

- [ ] **Step 1: Testes:** (a) `erroDosRecebimentos` para cada caso acima, e `nenhum` → `null`; (b) renderizar com `conexao: null`: aparecem as 5 opções, Asaas e PagBank com "Em breve" e `aria-disabled`/`disabled`; (c) escolher Pix, preencher chave → lista de serviços com "Exigir sinal" aparece; marcar um e Continuar chama `onSalvar` com `{ chavePix: { chave, tipo }, servicos: [{ id, sinalPct: 30 }, ...] }` (os não marcados com `sinalPct: null`); (d) conexão ativa do Mercado Pago → mostra "Conectado" e a lista de sinal sem pedir Pix, e `onSalvar` não leva `chavePix`; (e) "Configurar depois" chama `onPular`; (f) "Conectar com o Mercado Pago" chama `recebimentosApi.conectar` com `'onboarding'`.
- [ ] **Step 2:** `npx vitest run src/components/onboarding/__tests__/EtapaRecebimentos.test.tsx` → FAIL.
- [ ] **Step 3:** Implementar seguindo os estilos de `EtapaServicos` e `GatewayPassos` (classes de cartão `rounded-card border bg-surface p-4`, mesmo `Banner`/`Button`).
- [ ] **Step 4:** Rodar o teste → PASS; `npx tsc --noEmit` → PASS.
- [ ] **Step 5: Commit** `feat(onboarding): etapa Recebimentos`

### Task 7: Frontend — ligar a etapa ao fluxo e ao retorno do Mercado Pago

**Files:**
- Modify: `frontend/src/components/onboarding/OnboardingFlow.tsx`
- Modify: `frontend/src/components/onboarding/EtapaPagina.tsx` e `EtapaWhatsapp.tsx` (`etapa={5}` e `etapa={6}`; o `onVoltar` de Sua página volta à 4)
- Test: `frontend/src/components/onboarding/__tests__/Onboarding.test.tsx`

**Interfaces:**
- Consumes: `EtapaRecebimentos` (Task 6), `recebimentosApi.confirmar(t)`, `onboardingApi.salvarRecebimentos`.
- Comportamento: etapa 4 → `<EtapaRecebimentos>`; `onSalvar` usa `executar(() => onboardingApi.salvarRecebimentos(d), 5)`; `onPular` faz `setEtapa(5)` e rola ao topo; `onConexaoMudou` refaz `onboardingApi.ver()` e `setDados`. Sua página `onVoltar` → 4, `onContinuar` → 6; WhatsApp `onVoltar` → 5. Retorno do OAuth: no primeiro efeito do fluxo (depois do `ver()` ok), se `location.search` tem `recebimento=confirmar&t=...`, chamar `recebimentosApi.confirmar(t)` **uma vez** (guardar em `useRef`), limpar `recebimento` e `t` com `history.replaceState`, mostrar toast "Mercado Pago conectado." e recarregar `ver()`; `recebimento=erro` ou falha → toast de erro "Não foi possível conectar o Mercado Pago. Tente de novo." e continua na etapa 4. O fluxo precisa abrir a etapa 4 nesse caso (a etapa salva já é 4).

- [ ] **Step 1: Testes** (mock de `next/navigation`, `recebimentosApi` e `onboardingApi` como o arquivo já faz): (a) `dados(4)` mostra o título "Como você quer receber o sinal?"; (b) "Configurar depois" leva à etapa de Sua página; (c) com `window.history.pushState({}, '', '/onboarding?recebimento=confirmar&t=abc')` renderizar o fluxo chama `confirmar('abc')` **uma única vez** mesmo com re-render e mostra "Mercado Pago conectado."; (d) com `recebimento=erro` mostra o toast de erro e fica na etapa 4; (e) o indicador mostra "Etapa 4 de 6" na etapa Recebimentos; atualizar o helper `dados(etapa)` para `bloqueante: pendente && etapa <= 3` e os demais valores de `Onboarding` (campo `recebimentos`).
- [ ] **Step 2:** `npx vitest run src/components/onboarding` → FAIL.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** `npx vitest run` (frontend inteiro) e `npx tsc --noEmit` → PASS.
- [ ] **Step 5: Commit** `feat(onboarding): liga a etapa Recebimentos e o retorno do Mercado Pago`

### Task 8: Google Agenda como card opcional na etapa Horários

**Files:**
- Modify: `backend/src/modules/googleAgenda/googleAgenda.rules.ts` (`assinarState`, `lerState`)
- Modify: `backend/src/modules/googleAgenda/googleAgenda.service.ts` (`conectarUrl`, `callback`), `googleAgenda.controller.ts` (`conectar` lê `req.query.origem`), `googleAgenda.types.ts` (`ConectarQuerySchema` aceita `origem` opcional)
- Modify: `frontend/src/lib/googleAgenda.ts` (`conectar(para, origem?)`)
- Modify: `frontend/src/components/googleAgenda/GoogleAgendaCard.tsx` (prop `origem`)
- Modify: `frontend/src/components/onboarding/EtapaHorarios.tsx` (embute o card)
- Test: `backend/src/__tests__/googleAgendaConexao.test.ts`, `frontend/src/components/googleAgenda/__tests__/GoogleAgendaCard.test.tsx`, `frontend/src/components/onboarding/__tests__/Onboarding.test.tsx`

**Interfaces:**
- Produces:
  - `type OrigemGoogle = 'ajustes' | 'onboarding'` (backend, em `googleAgenda.types.ts`).
  - `assinarState(userId, para, agora = Date.now(), origem: OrigemGoogle = 'ajustes'): string` (carga ganha `o`).
  - `lerState(state, agora?)` devolve `{ userId, para, origem }`; sem `o` ou valor desconhecido → `'ajustes'`.
  - `googleAgendaService.conectarUrl(user, para, origem: OrigemGoogle = 'ajustes')`.
  - `callback`: com `para = 'negocio'` e origem `onboarding`, o retorno é `${frontend()}/onboarding?google=confirmar&t=<t>` (ou `?google=erro`); nos demais casos, o destino atual. Estado ilegível → Ajustes.
  - `googleAgendaApi.conectar(para: ParaGoogle, origem?: 'onboarding')` envia `params: { para, origem }`.
  - `GoogleAgendaCard({ para, origem }: { para: ParaGoogle; origem?: 'onboarding' })`; com `origem`, `conectar` repassa a origem e o card não muda de resto.
- Comportamento: `EtapaHorarios` mostra, depois dos campos de horário e antes do erro, o título "Já usa o Google Agenda?" com a frase "Conecte para que seus compromissos pessoais bloqueiem esses horários na sua página. Dá para fazer depois, em Ajustes." e `<GoogleAgendaCard para="negocio" origem="onboarding" />`. Não altera o Continuar nem `erroDosHorarios`. O card some sozinho quando o Google não está configurado no ambiente. A pergunta "Você também atende?" aparece só quando já há profissionais (quem escolheu "sozinha"), sem mudança no card.
- A volta do Google cai em `/onboarding?google=confirmar&t=...`; o `OnboardingFlow` abre na etapa salva (a pessoa só chega ao card depois de salvar a etapa 1, então a etapa salva é 2) e o card montado na etapa Horários confirma a conexão sozinho.

- [ ] **Step 1: Testes** no backend: `assinarState('u1','negocio', agora, 'onboarding')` → `lerState(...)` igual a `{ userId: 'u1', para: 'negocio', origem: 'onboarding' }`; sem origem → `origem: 'ajustes'` (atualizar o `toEqual` existente em `googleAgendaConexao.test.ts:81`); carga sem `o` montada à mão → `'ajustes'`; `callback` com estado de origem onboarding termina em `/onboarding?google=confirmar&t=`; estado inválido → `/configuracoes?google=erro`. No frontend: `GoogleAgendaCard` com `origem="onboarding"` chama `googleAgendaApi.conectar('negocio', 'onboarding')` ao tocar em "Conectar Google Agenda"; a etapa Horários renderiza o título "Já usa o Google Agenda?" e o botão "Conectar Google Agenda" (com `googleAgendaApi.conexao` mockado para `{ configurado: true, conexao: null }`), e quando `configurado: false` não renderiza o card; "Continuar" segue funcionando sem conectar.
- [ ] **Step 2:** `cd backend && npx vitest run src/__tests__/googleAgendaConexao.test.ts` e `cd frontend && npx vitest run src/components/googleAgenda src/components/onboarding` → FAIL.
- [ ] **Step 3:** Implementar. O `Onboarding.test.tsx` precisa mockar `@/lib/googleAgenda` (`conexao` devolvendo `{ configurado: false, conexao: null }` por padrão) para as outras etapas não dependerem de rede.
- [ ] **Step 4:** Os mesmos testes + `npm run typecheck` (backend) e `npx tsc --noEmit` (frontend) → PASS.
- [ ] **Step 5: Commit** `feat(onboarding): Google Agenda opcional na etapa Horários`

### Task 9: Docs e verificação final

**Files:**
- Modify: `docs/FUNCIONALIDADES.md`, `docs/ROADMAP.md` (onde descrevem o onboarding de 5 etapas, a chave Pix em Serviços e o Google Agenda), `docs/superpowers/specs/2026-10-25-onboarding-design.md` (nota "Atualizado em 2026-11-10: etapa Recebimentos e Google Agenda em Horários")

- [ ] **Step 1:** `grep -n "5 etapas\|chave Pix" docs/FUNCIONALIDADES.md docs/ROADMAP.md` e ajustar os trechos.
- [ ] **Step 2:** Rodar `cd backend && npm run typecheck && npx vitest run` e `cd frontend && npx tsc --noEmit && npx vitest run && npm run lint` → tudo verde.
- [ ] **Step 3:** Subir o app localmente (backend + frontend) e percorrer o onboarding de uma conta nova: etapa Horários com o card do Google Agenda (só aparece com as credenciais do Google no ambiente), etapa Serviços sem Pix, etapa Recebimentos (Pix manual, "Configurar depois"; Mercado Pago só se as credenciais de teste existirem no ambiente), conferir o layout em celular e desktop.
- [ ] **Step 4: Commit** `docs(onboarding): etapa Recebimentos`
