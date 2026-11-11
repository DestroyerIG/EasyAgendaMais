# Cobrança do saldo — PR 2 (maquininha Point do Mercado Pago) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Com o Mercado Pago conectado e uma maquininha Point em modo PDV, cobrar débito ou crédito do saldo da comanda direto no terminal, com confirmação e fechamento automáticos.

**Architecture:** Reaproveita tudo do PR 1 (#69): a cobrança é uma linha `cobrancas_sinal` de `tipo='saldo'` com `forma='point'`, o webhook `order` cai no mesmo `processarAviso` e `decidirSaldo` decide. O adaptador do Mercado Pago ganha as chamadas da Point; a conferência de cobranças `point` consulta a ordem (`/v1/orders/{id}`), não `payments/search`. Recebimentos ganha um cartão para escolher o terminal e ativar o modo PDV.

**Tech Stack:** Express + Prisma + vitest (backend); Next.js + React Testing Library (frontend).

**Spec:** `docs/superpowers/specs/2026-11-10-cobranca-do-saldo-design.md` (seções Gateways e Telas; PR 1 em `docs/superpowers/plans/2026-11-10-cobranca-do-saldo-pr1.md`).

## Global Constraints

- Textos ao usuário em português do Brasil. Tokens nunca em log, URL ou mensagem de erro.
- Migração `20261111130000_cobranca_point`: **não aplicar em produção** sem autorização do dono; o Render não aplica no deploy.
- Valor da ordem sempre em texto com duas casas (`"80.00"`). `external_reference = cobrancaId` (UUID, ≤ 64). Prazo da ordem: `expiration_time` = tempo até `venceEm` (15 min), em ISO 8601 (`PT15M`), mínimo `PT30S`.
- O `terminal_id` vai ao Mercado Pago **exatamente como o `GET /terminals/v1/list` devolveu** (`TIPO__SERIAL`); nunca normalizar. Não enviar parcelas (`default_installments`): o terminal pergunta.
- Cancelar ordem já no terminal só funciona em Point Smart 1 e 2; nos outros (409 `cannot_cancel_order`) a cobrança é cancelada aqui e a tela avisa para cancelar também na maquininha.
- Frontend: só tokens de cor (o `themeCompliance` proíbe cor fixa). Telas novas fora de `lib/themedPaths.ts` não entram: conferir se o cartão novo cai numa pasta já listada.
- Testes: backend `cd backend && npx vitest run <arquivo>`; frontend `cd frontend && npx vitest run <arquivo> --maxWorkers=2 --testTimeout=60000`. Suítes completas só em lotes (backend: `--pool=forks --poolOptions.forks.singleFork=true`).
- Commits em português, estilo `feat(recebimentos): ...`, terminando com `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## Review Focus

- Terminal ocupado (409 `already_queued_order_for_terminal`): mensagem clara ("esta maquininha já tem uma cobrança aguardando"), linha apagada, e **sem** alerta de "conta recusou".
- Ordem cancelada, expirada ou recusada no terminal destrava a comanda na hora (não espera os 15 min); cancelamento que o terminal não aceita deixa a cobrança cancelada aqui com aviso, e um pagamento que ainda entrar quita ou alerta.
- `order.processed` repetido, ou de valor diferente: mesmas garantias do Pix (fecha uma vez; valor diferente alerta).
- Sem terminal escolhido ou terminal fora do modo PDV: a tela não oferece "Enviar para a maquininha" e cai no guia manual; ativar o PDV que falha mostra recado.
- Débito e crédito mandam o `default_type` certo (`debit_card`/`credit_card`), e a forma paga vem do pagamento da ordem.

---

### Task 1: Esquema e migração

**Files:**
- Modify: `backend/prisma/schema.prisma` (`CobrancaSinal`, `ConexaoRecebimento`)
- Create: `backend/prisma/migrations/20261111130000_cobranca_point/migration.sql`

**Interfaces:**
- Produces: `CobrancaSinal.terminalId: string | null`; `ConexaoRecebimento.terminalPadraoId: string | null`.

- [ ] **Step 1:** Em `CobrancaSinal` adicionar `terminalId String? @map("terminal_id") @db.VarChar(100)`; em `ConexaoRecebimento`, `terminalPadraoId String? @map("terminal_padrao_id") @db.VarChar(100)`.
- [ ] **Step 2:** Migração: `ALTER TABLE "cobrancas_sinal" ADD COLUMN "terminal_id" VARCHAR(100);` e `ALTER TABLE "conexoes_recebimento" ADD COLUMN "terminal_padrao_id" VARCHAR(100);`.
- [ ] **Step 3:** `cd backend && npx prisma generate && npx tsc --noEmit` → sem erros.
- [ ] **Step 4:** Commit `feat(recebimentos): colunas do terminal Point (terminal da cobrança e terminal padrão)`.

### Task 2: Adaptador do Mercado Pago: terminais e ordem Point

**Files:**
- Modify: `backend/src/modules/recebimentos/gateways/tipos.ts`, `backend/src/modules/recebimentos/gateways/mercadoPago.ts`
- Test: `backend/src/__tests__/recebimentosMercadoPago.test.ts` (mesmo `fetch` simulado do arquivo)

**Interfaces:**
- Produces (em `tipos.ts`): `class GatewayTerminalOcupado extends GatewayRecusou`; `interface Terminal { id: string; modo: 'PDV' | 'STANDALONE' | 'UNDEFINED' }`; no `Gateway`: `listarTerminais(accessToken: string): Promise<Terminal[]>`, `ativarPdv(accessToken: string, terminalId: string): Promise<void>`, `criarOrdemPoint(accessToken: string, c: NovaCobranca, p: { terminalId: string; tipo: 'debit_card' | 'credit_card' }): Promise<{ idExterno: string }>`, `cancelarOrdem(accessToken: string, idExterno: string, cobrancaId: string): Promise<'cancelada' | 'pedir_no_terminal'>`, `consultarOrdem(accessToken: string, idExterno: string): Promise<PagamentoGateway | null>`.

- [ ] **Step 1: Testes que falham** (um por comportamento, afirmando URL, método, cabeçalhos e corpo):
  - `listarTerminais`: `GET /terminals/v1/list`; devolve `[{ id: 'NEWLAND_N950__ABC', modo: 'PDV' }]` a partir de `data.terminals[].{id, operating_mode}`; modo desconhecido vira `UNDEFINED`.
  - `ativarPdv`: `PATCH /terminals/v1/setup` com corpo `{"terminals":[{"id":"NEWLAND_N950__ABC","operating_mode":"PDV"}]}`.
  - `criarOrdemPoint`: `POST /v1/orders`, cabeçalho `X-Idempotency-Key = cobrancaId`, corpo com `type:'point'`, `external_reference`, `transactions.payments[0].amount === '80.00'`, `config.point.terminal_id` igual ao informado, `config.payment_method.default_type === 'debit_card'`, `expiration_time` como `PT15M` (e `PT30S` quando faltam menos de 30 s), **sem** `default_installments`; devolve `idExterno` do `id` da resposta; resposta sem `id` → `GatewayRecusou`.
  - Erro 409 com `errors[0].code === 'already_queued_order_for_terminal'` → `GatewayTerminalOcupado`; 401 → `GatewayTokenInvalido`; 5xx → `GatewayIndisponivel`.
  - `cancelarOrdem`: `POST /v1/orders/{id}/cancel`, cabeçalhos `X-Idempotency-Key = <cobrancaId>:cancel` e `x-allow-cancelable-status: at_terminal`; 200 → `'cancelada'`; 202 → `'pedir_no_terminal'`; 409 `cannot_cancel_order` → `'pedir_no_terminal'`.
  - `consultarOrdem`: `GET /v1/orders/{id}`; traduz `status` da ordem para o do `PagamentoGateway`: `processed`→`approved`, `failed`→`rejected`, `canceled`→`cancelled`, `expired`→`expired`, `refunded`→`refunded`, `created`/`at_terminal`/`action_required`→`pending`; `valor` = `Number(transactions.payments[0].amount)`; `id` = `transactions.payments[0].id`; `referencia` = `external_reference`; `formaPaga`: `credit_card`→`credito`, `debit_card`→`debito`, demais `null`; 404 → `null`.
- [ ] **Step 2:** Rodar → FAIL. **Step 3:** Implementar em `mercadoPago.ts` com o `chamar`/`cabecalhoJson` existentes; ler o código de erro de `errors[0].code` no corpo para `GatewayTerminalOcupado`; tratar 202 como sucesso. **Step 4:** PASS e `tsc` limpo.
- [ ] **Step 5:** Commit `feat(recebimentos): adaptador do Mercado Pago para a maquininha Point`.

### Task 3: Confirmação do pagamento da Point

**Files:**
- Modify: `backend/src/modules/recebimentos/recebimentos.rules.ts` (`decidirSaldo`), `backend/src/modules/recebimentos/recebimentos.repository.ts`, `backend/src/modules/recebimentos/pagamentos.service.ts`
- Test: `backend/src/__tests__/recebimentosRules.test.ts`, `backend/src/__tests__/recebimentosTipoSaldo.test.ts`, `backend/src/__tests__/recebimentosPagamentos.test.ts` (acrescentar `consultarOrdem` ao mock `gw`)

**Interfaces:**
- Consumes: `Gateway.consultarOrdem` (T2).
- Produces: `DecisaoSaldo` ganha `'marcar_cancelada'`; `recebimentosRepository.marcarCancelada(cobrancaId: string): Promise<void>` (`pendente`→`cancelada`, só `tipo:'saldo'`).

- [ ] **Step 1: Testes que falham:** (a) `decidirSaldo`: `cancelled` ou `expired` com cobrança `pendente` → `marcar_cancelada`; com outra situação → `ignorar`; (b) repo: `marcarCancelada` faz `updateMany` com `{ id, tipo:'saldo', situacao:'pendente' }` → `{ situacao:'cancelada' }`; (c) serviço, com cobrança `tipo:'saldo'`, `forma:'point'`, `idExterno:'ORD1'`: o aviso `type:'order'` chama `consultarOrdem` (e **não** `buscarPorReferencia`) e `processed` quita e fecha a comanda com `forma: 'debito'`; `canceled` marca `cancelada` (destrava); `failed` marca `recusada`; `processed` repetido não fecha de novo; `processed` de valor diferente alerta e não fecha.
- [ ] **Step 2:** FAIL. **Step 3:** `conferirCobranca` desvia quando `c.forma === 'point'` para `consultarOrdem(token.accessToken, c.idExterno)` (sem `idExterno`, não faz nada); `decidirSaldo` e `avaliarSaldo` ganham o ramo `marcar_cancelada`. **Step 4:** PASS (os três arquivos).
- [ ] **Step 5:** Commit `feat(recebimentos): confirmação do pagamento da maquininha Point`.

### Task 4: Cobrança do saldo na maquininha (serviço)

**Files:**
- Modify: `backend/src/modules/recebimentos/recebimentos.repository.ts`, `backend/src/modules/recebimentos/cobrancas.service.ts` (`avisarFalhaDoGateway` não alerta `GatewayTerminalOcupado`), `backend/src/modules/recebimentos/cobrancaSaldo.service.ts`
- Test: `backend/src/__tests__/cobrancaSaldo.test.ts`

**Interfaces:**
- Consumes: T2 (`criarOrdemPoint`, `cancelarOrdem`, `GatewayTerminalOcupado`), T1 (`terminalId`, `terminalPadraoId`).
- Produces: `type ComoCobrar = { via: 'pix' } | { via: 'maquininha'; forma: 'debito' | 'credito' }`; `CobrancaSaldoDto.via: 'pix' | 'maquininha'`; `EstadoCobranca` ganha `terminal: { id: string; nome: string } | null` e `avisoMaquininha: boolean`; `cobrancaSaldoService.criar(comandaId, businessId, userId, input, como: ComoCobrar)`; repo: `criarCobrancaSaldo` aceita `forma?: 'pix' | 'point'` (padrão `'pix'`) e `terminalId?: string`; `terminalPadrao(businessId): Promise<string | null>`; `ultimaCobrancaSaldo` seleciona `terminalId` e `idExterno`.

- [ ] **Step 1: Testes que falham:** (a) `criar` com `{via:'maquininha', forma:'debito'}`: salva o rascunho com `paymentMethod: 'debito'`, cria a linha `forma:'point'` com `terminalId` do terminal padrão, chama `criarOrdemPoint` com `tipo:'debit_card'` (e `'credit_card'` para crédito), completa com `{ idExterno }` e devolve `via:'maquininha'` sem `codigoPix`; (b) sem terminal padrão → 409 `SEM_MAQUININHA`, sem linha criada; (c) `GatewayTerminalOcupado` → linha apagada, 409 `MAQUININHA_OCUPADA`, e **não** chama `alertarRecusa`; (d) `via:'pix'` continua como no PR 1; (e) `estado` devolve `terminal` (`nome` = `"Point " + últimos 4 do serial`) quando há padrão e `avisoMaquininha:false`; (f) `cancelar` de cobrança `point` pendente chama `cancelarOrdem(token, idExterno, cobrancaId)`, marca `cancelada`, e com `'pedir_no_terminal'` devolve `avisoMaquininha: true`; falha do gateway ao cancelar também cancela aqui com `avisoMaquininha: true`.
- [ ] **Step 2:** FAIL. **Step 3:** Implementar; `criar` escolhe `paymentMethod` pelo `como` (`pix` → `'pix'`; maquininha → a forma). **Step 4:** PASS e os testes antigos de `criar` (ajustados ao novo parâmetro `como`) verdes.
- [ ] **Step 5:** Commit `feat(recebimentos): cobrança do saldo na maquininha Point`.

### Task 5: Maquininhas em Recebimentos (serviço e rotas)

**Files:**
- Create: `backend/src/modules/recebimentos/maquininhas.service.ts`
- Modify: `backend/src/modules/recebimentos/recebimentos.routes.ts`, `recebimentos.controller.ts`, `recebimentos.types.ts`, `recebimentos.repository.ts` (`definirTerminalPadrao`)
- Test: `backend/src/__tests__/recebimentosMaquininhas.test.ts` (rotas com o mesmo `auth` simulado de `recebimentosConexao.test.ts`)

**Interfaces:**
- Produces: `maquininhasService.listar(user: UsuarioLogado): Promise<{ padrao: string | null; terminais: Array<{ id: string; nome: string; modo: 'PDV' | 'STANDALONE' | 'UNDEFINED' }> }>`, `maquininhasService.ativarPdv(user, terminalId): Promise<void>`, `maquininhasService.definirPadrao(user, terminalId: string | null): Promise<void>`; rotas só para `tenant_admin`: `GET /recebimentos/maquininhas`, `POST /recebimentos/maquininhas/:id/pdv`, `PUT /recebimentos/maquininhas/padrao` com corpo `{ terminalId: string | null }`. `TerminalIdSchema = z.string().regex(/^[A-Za-z0-9_-]{1,100}$/)`.

- [ ] **Step 1: Testes que falham:** `listar` sem conexão do Mercado Pago ativa → 409 `SEM_GATEWAY`; com ela, devolve os terminais com `nome` e o `padrao`; `ativarPdv` chama o gateway e propaga falha como 409 com recado ("Associe a maquininha a uma loja e a um caixa no app do Mercado Pago, depois tente de novo"); `definirPadrao` só aceita um id que está na lista de terminais da conta (senão 404) e aceita `null` para limpar; rotas: não-dono → 403, `:id` fora do formato → 400.
- [ ] **Step 2:** FAIL. **Step 3:** Implementar; rotas declaradas antes das `/:gateway/...`. **Step 4:** PASS; `tsc` limpo.
- [ ] **Step 5:** Commit `feat(recebimentos): terminais Point em Recebimentos (listar, ativar PDV, escolher o padrão)`.

### Task 6: Rotas de cobrança aceitam a maquininha

**Files:**
- Modify: `backend/src/modules/comandas/comandas.types.ts` (`CobrarSchema`), `comandas.controller.ts`, `backend/src/modules/bancada/bancada.types.ts` (`BancadaCobrarSchema`), `bancada.controller.ts`, `bancada.service.ts`
- Test: `backend/src/__tests__/bancada.test.ts`

**Interfaces:**
- Consumes: `ComoCobrar` e `cobrancaSaldoService.criar(..., como)` (T4).
- Produces: corpo `{ ...comanda, via: 'pix' | 'maquininha', forma?: 'debito' | 'credito' }`, 400 quando `via:'maquininha'` sem `forma`; `bancadaService.cobrar(businessId, userId, p, id, input, como)`.

- [ ] **Step 1: Testes que falham:** painel e Bancada: `via:'maquininha'` com `forma:'credito'` chama `criar(..., { via:'maquininha', forma:'credito' })`; `via:'maquininha'` sem `forma` → 400; `via:'pix'` segue como antes; `via` desconhecida → 400.
- [ ] **Step 2:** FAIL. **Step 3:** Implementar (`.superRefine`); o controller monta o `ComoCobrar` e o repassa. **Step 4:** PASS (`bancada.test.ts` inteiro) e `tsc` limpo.
- [ ] **Step 5:** Commit `feat(comanda): rotas de cobrança do saldo aceitam a maquininha`.

### Task 7: Frontend — `PainelCobrar` com a maquininha

**Files:**
- Modify: `frontend/src/lib/comanda.ts`, `frontend/src/lib/bancada.ts`, `frontend/src/components/comanda/PainelCobrar.tsx`, `frontend/src/components/comanda/ComandaModal.tsx`, `frontend/src/components/bancada/AtendimentoBancada.tsx`
- Test: `frontend/src/components/comanda/__tests__/PainelCobrar.test.tsx`, `ComandaModal.test.tsx`, `frontend/src/components/bancada/__tests__/Bancada.test.tsx`

**Interfaces:**
- Consumes: respostas de T4/T6.
- Produces: `CobrancaSaldo.via: 'pix' | 'maquininha'`; `EstadoCobranca` ganha `terminal: { id: string; nome: string } | null` e `avisoMaquininha?: boolean`; `type ComoCobrar = { via: 'pix' } | { via: 'maquininha'; forma: 'debito' | 'credito' }`; `cobrarComanda(id, input, como)` e `bancadaApi.cobrar(id, body, como)`; `PainelCobrar.api.cobrar: (como: ComoCobrar) => Promise<CobrancaSaldo>`.

- [ ] **Step 1: Testes que falham** (`PainelCobrar`): forma `debito` com `gateway:'mercadopago'` e `terminal` → botão "Enviar para a maquininha"; clicar chama `api.cobrar({ via:'maquininha', forma:'debito' })` e mostra "Aguardando o cliente passar o cartão na maquininha" com "Cancelar cobrança" (sem QR); ao pagar chama `onPaga`; cancelamento com `avisoMaquininha:true` mostra "Cancele também na maquininha"; `409 MAQUININHA_OCUPADA` mostra "Esta maquininha já tem uma cobrança aguardando"; forma `credito` sem `terminal` (ou sem gateway) mostra o guia manual como hoje; o Pix continua chamando `api.cobrar({ via:'pix' })`. `ComandaModal` e Bancada: o substituto do painel chama `api.cobrar({ via:'pix' })` e os testes esperam `cobrarComanda('k1', {...}, { via:'pix' })` / `bancadaApi.cobrar('k1', {...}, { via:'pix' })`.
- [ ] **Step 2:** FAIL. **Step 3:** Implementar (o `estado()` também é lido para `debito`/`credito`; só o Pix mostra QR). **Step 4:** PASS (`src/components/comanda` e `src/components/bancada`) e `tsc`/lint limpos.
- [ ] **Step 5:** Commit `feat(comanda): painel de cobrança envia o débito e o crédito para a maquininha Point`.

### Task 8: Frontend — cartão "Maquininha Point" em Recebimentos

**Files:**
- Create: `frontend/src/components/recebimentos/PointCard.tsx`
- Modify: `frontend/src/lib/recebimentos.ts`, `frontend/src/components/settings/RecebimentosSection.tsx`
- Test: `frontend/src/components/recebimentos/__tests__/PointCard.test.tsx`

**Interfaces:**
- Produces: `recebimentosApi.maquininhas(): Promise<{ padrao: string | null; terminais: Terminal[] }>`, `recebimentosApi.ativarPdv(id: string)`, `recebimentosApi.definirTerminalPadrao(id: string | null)`; `Terminal = { id: string; nome: string; modo: 'PDV' | 'STANDALONE' | 'UNDEFINED' }`; `<PointCard />` sem props, renderizado em `RecebimentosSection` só com `estado.conexao?.gateway === 'mercadopago'` e `situacao === 'ativa'`.

- [ ] **Step 1: Testes que falham:** lista os terminais com o modo ("Modo PDV" / "Precisa ativar o modo PDV"); "Ativar modo PDV" chama `ativarPdv` e relê a lista; escolher o terminal chama `definirTerminalPadrao`; "Usar nenhuma" chama com `null`; sem terminais mostra o passo a passo (criar loja e caixa no app do Mercado Pago, associar a maquininha, ativar o PDV); erro 409 mostra o recado do servidor; `RecebimentosSection` mostra o cartão só com Mercado Pago ativo.
- [ ] **Step 2:** FAIL. **Step 3:** Implementar com `Card`, `Button`, `Banner` de `@/components/ui`. **Step 4:** PASS; `themeCompliance` e `tsc` verdes.
- [ ] **Step 5:** Commit `feat(recebimentos): cartão da maquininha Point em Recebimentos`.

### Task 9: Verificação final e PR

- [ ] **Step 1:** Backend: `npx tsc --noEmit` e suíte completa (`--pool=forks --poolOptions.forks.singleFork=true`); frontend: `npx tsc --noEmit`, lint nas pastas alteradas e a suíte **em lotes** (`--maxWorkers=2 --testTimeout=60000`). Falha que não é minha vai no relatório com o nome.
- [ ] **Step 2:** `git fetch` e simular a junção com `origin/main`; sem conflito.
- [ ] **Step 3:** Push e PR contra `main` avisando: migração `20261111130000_cobranca_point` **a aplicar com autorização**, o teste real no **sandbox** da Point (terminal `NEWLAND_N950__SBX0000001`, `POST /v1/orders/{id}/events` para simular status) e depois uma maquininha real, e que escopos de OAuth e valor mínimo não foram encontrados na documentação.
