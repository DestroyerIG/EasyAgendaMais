# Cobrança do saldo — PR 1 (núcleo + Pix do Mercado Pago) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cobrar o saldo da comanda por Pix do Mercado Pago, perceber o pagamento sozinho e fechar a comanda sozinha, com o manual guiado para maquininhas sem integração.

**Architecture:** `cobrancas_sinal` ganha `tipo` (`sinal`|`saldo`) e `usuario_id`; toda consulta por reserva passa a filtrar `tipo='sinal'`. O aviso do gateway cai no mesmo `avaliar` de hoje, que ramifica por `tipo` para uma regra pura nova (`decidirSaldo`) e chama `comandasService.fecharPorPagamento`. A comanda fica travada enquanto há cobrança pendente. Um painel compartilhado (`PainelCobrar`) serve o painel e a Bancada.

**Tech Stack:** Express + Prisma + vitest (backend); Next.js + React Testing Library + vitest (frontend).

**Spec:** `docs/superpowers/specs/2026-11-10-cobranca-do-saldo-design.md` (PRs 2 e 3: Point e link InfinitePay, fora deste plano).

## Global Constraints

- Textos ao usuário em português do Brasil. Tokens nunca em log, URL ou mensagem de erro.
- Migração `20261111120000_cobranca_saldo`: **não aplicar em produção** sem autorização do dono; o Render não aplica no deploy.
- Webhook responde 200 primeiro e nunca lança. Valores comparados em **centavos** (`centavos()` de `recebimentos.rules.ts`).
- Prazo do Pix do saldo: **15 min** (`venceEm = agora + 15 min`). Referência no gateway: `external_reference = cobrancaId`.
- Frontend: só tokens de cor (`bg-surface`, `border-line`; `themeCompliance.test.ts` proíbe cor fixa).
- Testes: backend `cd backend && npx vitest run <arquivo>`; frontend `cd frontend && npx vitest run <arquivo> --maxWorkers=2 --testTimeout=60000`. Suítes completas só em lotes por pasta (a máquina estoura a memória). Backend completo: `--pool=forks --poolOptions.forks.singleFork=true`.
- Commits em português, estilo `feat(comanda): ...`, terminando com `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Desvio do desenho (decisão de quem constrói): as opções disponíveis (`gateway`) vêm de `GET /comandas/:id/cobranca`, não do `GET /comandas/:id`, para não tocar o DTO da comanda.

## Review Focus

- Webhook repetido ou dois pagamentos aprovados da mesma cobrança: fecha **uma** vez, alerta duplicado, um comprovante só.
- Cliente paga um Pix antigo (cobrança `substituida`/`expirada`) com a comanda ainda aberta: quita e fecha; com a comanda já fechada: alerta, o pagamento não se perde.
- Pago com o caixa fechado ou nunca aberto: cobrança `paga`, comanda aberta, notificação ao dono, fechamento manual depois sem cobrar de novo.
- Cobrança pendente **já vencida** (rotina ainda não marcou) não trava a comanda.
- Sinal pago + saldo pago na mesma reserva: sem alerta de "pago em dobro"; cancelar/expirar a reserva não mexe no saldo; "aguardando Pix" e selos de cartão do sinal não contam o saldo; pagamento repetido de saldo é gravado como `saldo`.
- Pagamento aprovado de valor diferente do saldo: não fecha, alerta.

---

### Task 1: Esquema, migração e tipos

**Files:**
- Modify: `backend/prisma/schema.prisma` (modelo `CobrancaSinal`), `backend/src/modules/recebimentos/recebimentos.types.ts`
- Create: `backend/prisma/migrations/20261111120000_cobranca_saldo/migration.sql`

**Interfaces:**
- Produces: `TipoCobranca = 'sinal' | 'saldo'`; `SituacaoCobranca` inclui `'cancelada'`; `CobrancaSinal.tipo: string` (default `'sinal'`), `CobrancaSinal.usuarioId: string | null`.

- [ ] **Step 1:** Em `CobrancaSinal`, adicionar `tipo String @default("sinal") @db.VarChar(10)`, `usuarioId String? @map("usuario_id") @db.Uuid` e `@@index([appointmentId, tipo])`.
- [ ] **Step 2:** Escrever a migração SQL à mão: `ADD COLUMN tipo VARCHAR(10) NOT NULL DEFAULT 'sinal'`, `ADD COLUMN usuario_id UUID`, `CREATE INDEX cobrancas_sinal_appointment_id_tipo_idx ON cobrancas_sinal (appointment_id, tipo)`.
- [ ] **Step 3:** Em `recebimentos.types.ts`, exportar `TipoCobranca` e acrescentar `'cancelada'` a `SituacaoCobranca`.
- [ ] **Step 4:** `cd backend && npx prisma generate && npx tsc --noEmit` → sem erros.
- [ ] **Step 5:** Commit `feat(recebimentos): cobrança ganha tipo (sinal ou saldo) e usuário que iniciou`.

### Task 2: Consultas do sinal passam a filtrar `tipo = 'sinal'`

**Files:**
- Modify: `backend/src/modules/recebimentos/recebimentos.repository.ts`
- Test: `backend/src/__tests__/recebimentosTipoSaldo.test.ts` (novo; `vi.mock('../config/prisma.js')` com `cobrancaSinal` e `$transaction`, no padrão de `recebimentosPagamentos.test.ts`)

**Interfaces:**
- Consumes: `TipoCobranca` (Task 1).
- Produces: nenhuma assinatura nova; só mudam os `where`.

- [ ] **Step 1: Testes que falham.** Para cada função abaixo, chamar e afirmar que o `where` enviado ao Prisma contém `tipo: 'sinal'`: `reservasComSinalNoCartao`, `reservasComCobrancaPendente`, `reservasPendentes`, `marcarSubstituidas`, `cobrancasDaReserva`, `outraCobrancaPaga`, `expirarReserva` (o `updateMany` da cobrança), `lembrarDevolucaoAoCancelar`, e o `updateMany` das irmãs `expirada` dentro de `marcarPagaEReativar`. Mais um teste: `registrarPagamentoRepetido({..., tipo: 'saldo'}, p)` grava `tipo: 'saldo'` (o parâmetro `c` ganha `tipo`; sem ele a linha repetida nasceria como `sinal`).
- [ ] **Step 2:** `npx vitest run src/__tests__/recebimentosTipoSaldo.test.ts` → FAIL (where sem `tipo`).
- [ ] **Step 3:** Acrescentar `tipo: 'sinal'` aos `where` listados; `registrarPagamentoRepetido` recebe `tipo` em `c` e o grava. Não filtrar `ultimaConfirmacaoEm`, `cobrancasParaConferir` nem `cobrancasDoNegocioParaConferir` (a conferência vale para os dois tipos).
- [ ] **Step 4:** Rodar o arquivo novo e `recebimentosPagamentos.test.ts`, `publicBookingCobranca.test.ts` → PASS. Ajustar os mocks existentes só se algum assert de `where` exato quebrar.
- [ ] **Step 5:** Commit `fix(recebimentos): consultas da reserva só olham cobranças de sinal`.

### Task 3: Regra pura `decidirSaldo`

**Files:**
- Modify: `backend/src/modules/recebimentos/recebimentos.rules.ts`
- Test: `backend/src/__tests__/recebimentosRules.test.ts`

**Interfaces:**
- Produces: `type DecisaoSaldo = 'ignorar' | 'quitar' | 'marcar_recusada' | 'marcar_devolvida' | 'marcar_contestada' | 'alertar_duplicado' | 'alertar_valor_diferente'` e `decidirSaldo(e: { cobranca: { id: string; situacao: string; valor: unknown; pagamentoExternoId: string | null }; pagamento: PagamentoGateway }): DecisaoSaldo`.

- [ ] **Step 1: Testes que falham** (`describe('decidirSaldo')`): referência diferente → `ignorar`; `refunded` → `marcar_devolvida`; `charged_back` → `marcar_contestada`; `rejected` com cobrança `pendente` → `marcar_recusada`, com `paga` → `ignorar`; `pending` → `ignorar`; `approved` valor igual em centavos (`80` vs `'80.00'`) e cobrança `pendente`/`expirada`/`substituida`/`recusada` → `quitar`; `approved` com a cobrança já `paga` pelo mesmo pagamento → `ignorar`, por outro id → `alertar_duplicado`; `approved` de valor diferente → `alertar_valor_diferente`.
- [ ] **Step 2:** Rodar → FAIL. **Step 3:** implementar na ordem dos testes (diferente de `decidirPagamento`: valor diferente alerta em vez de ignorar; nada de reserva). **Step 4:** PASS.
- [ ] **Step 5:** Commit `feat(recebimentos): regra de decisão do pagamento do saldo`.

### Task 4: Repositório das cobranças de saldo

**Files:**
- Modify: `backend/src/modules/recebimentos/recebimentos.repository.ts`
- Test: `backend/src/__tests__/recebimentosTipoSaldo.test.ts`

**Interfaces:**
- Produces (em `recebimentosRepository`):
  - `criarCobrancaSaldo(d: { businessId: string; appointmentId: string; usuarioId: string; gateway: GatewayId; valor: number; venceEm: Date }): Promise<{ id: string }>` (`tipo: 'saldo'`, `forma: 'pix'`, `situacao: 'pendente'`)
  - `cobrancaSaldoPendente(appointmentId: string, agora: Date): Promise<boolean>` (`tipo:'saldo'`, `situacao:'pendente'`, `venceEm > agora`)
  - `ultimaCobrancaSaldo(appointmentId: string)`: a mais recente de `tipo:'saldo'` (select `id, gateway, forma, situacao, valor, codigoPix, venceEm, pagoEm, criadoEm`)
  - `substituirSaldoPendente(appointmentId: string): Promise<void>` (`pendente`→`substituida`, só `saldo`)
  - `cancelarSaldoPendente(appointmentId: string): Promise<number>` (`pendente`→`cancelada`, só `saldo`)
  - `expirarSaldosVencidos(limite: Date): Promise<number>` (`pendente` com `venceEm < limite` → `expirada`, só `saldo`)
- Reaproveita: `marcarPaga`, `marcarRecusada`, `marcarEstorno`, `completarCobranca`, `apagarCobranca`.

- [ ] **Step 1: Testes que falham:** um por função, afirmando o `where`/`data` (inclui `tipo: 'saldo'`; `criarCobrancaSaldo` grava `valor.toFixed(2)`). **Step 2:** FAIL. **Step 3:** implementar. **Step 4:** PASS.
- [ ] **Step 5:** Commit `feat(recebimentos): repositório das cobranças de saldo`.

### Task 5: Comanda: travar durante a cobrança e `fecharPorPagamento`

**Files:**
- Modify: `backend/src/modules/comandas/comandas.service.ts`
- Test: `backend/src/__tests__/comandasService.test.ts`, `backend/src/__tests__/bancada.test.ts` (adicionar `vi.mock('../modules/recebimentos/recebimentos.repository.js', () => ({ recebimentosRepository: { cobrancaSaldoPendente: vi.fn().mockResolvedValue(false) } }))`)

**Interfaces:**
- Consumes: `recebimentosRepository.cobrancaSaldoPendente` (Task 4).
- Produces: `comandasService.fecharPorPagamento(a: { appointmentId: string; businessId: string; userId: string | null; valor: number; forma: PaymentMethod | null }): Promise<'fechada' | 'ja_fechada' | 'sem_comanda' | 'valor_diferente' | 'caixa_fechado' | 'erro'>`; erro 409 `COBRANCA_EM_ANDAMENTO` em `save`/`close`.

- [ ] **Step 1: Testes que falham** (`describe('cobrança do saldo na comanda')`): (a) `save` com `cobrancaSaldoPendente → true` lança `AppError` 409 `COBRANCA_EM_ANDAMENTO` e não chama `saveDraft`; `close` idem; (b) `fecharPorPagamento` feliz: comanda em rascunho, `valor` = saldo → chama `repo.closeComandaTx` com `paymentMethod: 'pix'` e `userId` recebido, devolve `'fechada'`; (c) comanda já `fechada` → `'ja_fechada'` sem fechar; (d) `valor` ≠ saldo (em centavos) → `'valor_diferente'`, não fecha; (e) `repo.findCashSession → null` (`CASH_CLOSED`) → `'caixa_fechado'`, sem lançar; (f) caixa já fechado (`closedAt`) → `'caixa_fechado'`; (g) `userId: null` → `'erro'`; (h) sem comanda para o agendamento → `'sem_comanda'`.
- [ ] **Step 2:** FAIL. **Step 3:** em `save`, antes de gravar, `if (await recebimentosRepository.cobrancaSaldoPendente(c.appointment.id, new Date())) throw new AppError('Há uma cobrança em andamento nesta comanda. Cancele a cobrança para alterar.', 409, 'COBRANCA_EM_ANDAMENTO')`. `fecharPorPagamento`: achar a comanda por `comandasRepository.findComandaByAppointment`, montar a entrada a partir do `get` (extras não principais, desconto, gorjeta, `usarCobertura` quando disponível, `paymentMethod: forma ?? dto.paymentMethod`), conferir o saldo e chamar `comandasService.close`; traduzir `AppError` `CASH_CLOSED`/`CASH_ALREADY_CLOSED` em `'caixa_fechado'` e qualquer outro erro em `'erro'` (log com `logger.warn`, sem lançar). **Step 4:** PASS (os dois arquivos inteiros).
- [ ] **Step 5:** Commit `feat(comanda): trava durante a cobrança e fechamento por pagamento`.

### Task 6: Confirmação do saldo e expiração

**Files:**
- Modify: `backend/src/modules/recebimentos/pagamentos.service.ts`
- Test: `backend/src/__tests__/recebimentosPagamentos.test.ts` (adicionar `vi.mock('../modules/comandas/comandas.service.js', () => ({ comandasService: { fecharPorPagamento: vi.fn() } }))` e as funções novas do `repo` mockado)

**Interfaces:**
- Consumes: `decidirSaldo` (T3), repo (T4), `comandasService.fecharPorPagamento` (T5), `alertarNegocio` (existente no arquivo).
- Produces: `avaliar` ramifica por `c.tipo === 'saldo'`; `conferirPendentes` também chama `repo.expirarSaldosVencidos(agora - 2 min)` depois das conferências.

- [ ] **Step 1: Testes que falham:** (a) `approved` de saldo → `marcarPaga` e `fecharPorPagamento` com `{ appointmentId, businessId, userId: cobranca.usuarioId, valor, forma: 'pix' }`; (b) mesmo aviso repetido (`marcarPaga → false`) → não fecha de novo e não notifica; (c) `caixa_fechado` → notifica "Pagamento de R$ X recebido; abra o caixa para fechar a comanda de {cliente}"; (d) `ja_fechada`, `valor_diferente` e `erro` → cada um notifica o dono com texto próprio; (e) `rejected` → `marcarRecusada`; `refunded` → `marcarEstorno` e alerta; (f) `alertar_duplicado` → `registrarPagamentoRepetido` com `tipo: 'saldo'` e alerta; (g) cobrança de sinal continua usando `decidirPagamento` (teste existente permanece verde); (h) `conferirPendentes` chama `expirarSaldosVencidos`.
- [ ] **Step 2:** FAIL. **Step 3:** implementar `avaliarSaldo(c, pagamento)` ao lado de `aplicar`; `avaliar` desvia quando `c.tipo === 'saldo'`. **Step 4:** PASS.
- [ ] **Step 5:** Commit `feat(recebimentos): confirmação e fechamento automático do saldo da comanda`.

### Task 7: Serviço da cobrança do saldo (Pix MP)

**Files:**
- Create: `backend/src/modules/recebimentos/cobrancaSaldo.service.ts`
- Modify: `backend/src/modules/recebimentos/cobrancas.service.ts` (extrair e exportar o tratamento de falha do gateway e o `dominio()` para reuso)
- Test: `backend/src/__tests__/cobrancaSaldo.test.ts`

**Interfaces:**
- Produces:
  - `interface CobrancaSaldoDto { id: string; via: 'pix'; situacao: SituacaoCobranca; valor: number; codigoPix: string | null; venceEm: string | null; pagoEm: string | null }`
  - `interface EstadoCobranca { gateway: 'mercadopago' | null; cobranca: CobrancaSaldoDto | null }`
  - `cobrancaSaldoService.estado(comandaId: string, businessId: string): Promise<EstadoCobranca>`
  - `cobrancaSaldoService.criar(comandaId: string, businessId: string, userId: string, input: Omit<SaveComandaInput, 'paymentMethod'>): Promise<CobrancaSaldoDto>`
  - `cobrancaSaldoService.cancelar(comandaId: string, businessId: string): Promise<EstadoCobranca>`

- [ ] **Step 1: Testes que falham:** (a) `criar` feliz: salva o rascunho com `paymentMethod: 'pix'`, cria a linha com `valor` = saldo e `usuarioId`, chama `gateway.criarPix` com `cobrancaId` e `venceEm` ≈ +15 min, completa com `idExterno` e `codigoPix`, devolve o DTO; (b) comanda fechada → 409; (c) sem conexão ativa ou gateway ≠ `mercadopago` → 409 `SEM_GATEWAY`, sem criar linha; (d) saldo ≤ 0 → 409; (e) cobrança pendente anterior vira `substituida` **antes** de gravar o rascunho (senão a trava bloquearia); (f) falha do gateway → linha apagada, 502 `GATEWAY_INDISPONIVEL`, e `GatewayRecusou` dispara o alerta existente; (g) `estado` devolve `gateway` e a última cobrança; (h) `cancelar` marca `cancelada` e devolve o estado.
- [ ] **Step 2:** FAIL. **Step 3:** implementar (comanda via `comandasService.get`; `appointmentId` é `dto.appointment.id`). **Step 4:** PASS e `cobrancasService` (testes existentes) continuam verdes.
- [ ] **Step 5:** Commit `feat(recebimentos): cobrança do saldo da comanda por Pix do Mercado Pago`.

### Task 8: Rotas e controllers (painel e Bancada)

**Files:**
- Modify: `backend/src/modules/comandas/comandas.routes.ts`, `comandas.controller.ts`, `comandas.types.ts` (`CobrarSchema = SaveComandaSchema.omit({ paymentMethod: true }).extend({ via: z.literal('pix') })`), `backend/src/modules/bancada/bancada.routes.ts`, `bancada.controller.ts`, `bancada.service.ts`, `bancada.types.ts`
- Test: `backend/src/__tests__/bancada.test.ts`, `backend/src/__tests__/comandaCobrancaRotas.test.ts`

**Interfaces:**
- Produces: `GET /comandas/:id/cobranca`, `POST /comandas/:id/cobranca` (corpo `CobrarSchema`), `POST /comandas/:id/cobranca/cancelar`; espelho em `/bancada/comandas/:id/cobranca[...]` via `bancadaService.cobrar(businessId, userId, p, id, input)`, `bancadaService.cobranca(businessId, p, id)`, `bancadaService.cancelarCobranca(businessId, p, id)`.

- [ ] **Step 1: Testes que falham:** painel: três rotas chamam o serviço com `businessId` e `userId` do login; corpo com `via` ≠ `'pix'` → 400; Bancada: `cobrar` sem "a profissional cobra" → 403 e não chama o serviço; comanda de outra profissional → 404; com a chave, chama `cobrancaSaldoService.criar` com `discount`/`tip` mesclados como em `gerarPix`; `cobranca` e `cancelarCobranca` exigem a comanda dela.
- [ ] **Step 2:** FAIL. **Step 3:** implementar, com os mesmos guards das rotas vizinhas (`requireFeature('finance')`, `comandaDeHojeNaCarencia`). **Step 4:** PASS; `cd backend && npx tsc --noEmit` limpo.
- [ ] **Step 5:** Commit `feat(comanda): rotas da cobrança do saldo no painel e na Bancada`.

### Task 9: Frontend — API e `PainelCobrar`

**Files:**
- Modify: `frontend/src/lib/comanda.ts`, `frontend/src/lib/bancada.ts`
- Create: `frontend/src/components/comanda/PainelCobrar.tsx`, `frontend/src/components/comanda/GuiaMaquininha.tsx`
- Test: `frontend/src/components/comanda/__tests__/PainelCobrar.test.tsx`

**Interfaces:**
- Produces (`lib/comanda.ts`): `interface CobrancaSaldo { id: string; via: 'pix'; situacao: 'pendente'|'paga'|'recusada'|'expirada'|'cancelada'|'substituida'|'devolvida'|'contestada'; valor: number; codigoPix: string|null; venceEm: string|null; pagoEm: string|null }`, `interface EstadoCobranca { gateway: 'mercadopago'|null; cobranca: CobrancaSaldo|null }`, `buscarCobranca(id)`, `cobrarComanda(id, input)`, `cancelarCobranca(id)`, `ehCobrancaEmAndamento(e)` (409 `COBRANCA_EM_ANDAMENTO`); `bancadaApi.cobranca/cobrar/cancelarCobranca` espelhados.
- Produces (componente): `PainelCobrar({ forma: PaymentMethod | null; total: number; gerarPixManual: () => Promise<PixComanda>; api: { estado: () => Promise<EstadoCobranca>; cobrar: () => Promise<CobrancaSaldo>; cancelar: () => Promise<EstadoCobranca> }; onPendente: (pendente: boolean) => void; onPaga: () => void })`; `GuiaMaquininha({ total })`.

- [ ] **Step 1: Testes que falham:** forma `pix` com `gateway: 'mercadopago'` mostra "Gerar Pix"; clicar chama `cobrar` e mostra o QR, o copia-e-cola e "Cancelar cobrança"; durante `pendente` chama `onPendente(true)` e consulta o estado a cada 3 s (fake timers) até `paga`, quando chama `onPaga` e `onPendente(false)`; `expirada`/`recusada`/`cancelada` → "Tentar de novo"; link "usar minha chave Pix" troca para o `PainelCobrarPix` manual; `gateway: null` e forma `pix` → `PainelCobrarPix` manual; forma `debito`/`credito` → `GuiaMaquininha` ("Digite na maquininha", valor e botão "Copiar valor" que copia `80,00`); forma `dinheiro` ou nula → nada; `ehCobrancaEmAndamento` mostra "Cancele a cobrança para alterar".
- [ ] **Step 2:** FAIL. **Step 3:** implementar (QR com `qrcode`, `toDataURL`, como o `PainelCobrarPix`; só tokens de cor). **Step 4:** PASS; `themeCompliance.test.ts` verde.
- [ ] **Step 5:** Commit `feat(comanda): painel de cobrança com Pix do gateway e guia da maquininha`.

### Task 10: Integrar no `ComandaModal` e no `AtendimentoBancada`

**Files:**
- Modify: `frontend/src/components/comanda/ComandaModal.tsx`, `frontend/src/components/bancada/AtendimentoBancada.tsx`
- Test: `frontend/src/components/comanda/__tests__/ComandaModal.test.tsx`, `frontend/src/components/bancada/__tests__/Bancada.test.tsx`

**Interfaces:**
- Consumes: `PainelCobrar` (T9), `buscarCobranca`/`cobrarComanda`/`cancelarCobranca`, `bancadaApi.*` (T9), `gerarPixComanda` (Fase 1).

- [ ] **Step 1: Testes que falham:** (a) no modal, forma `pix` e `gateway: 'mercadopago'`: "Gerar Pix" chama `cobrarComanda('k1', { extras: [], discount: 0, tip: 0, via: 'pix' })`; (b) com cobrança pendente, o `fieldset` da comanda fica desabilitado e o botão de fechar também; (c) quando o estado vira `paga`, o modal recarrega a comanda (`abrirComanda`), chama `onAtualizada` e passa a somente leitura (fechada); com a comanda ainda aberta (caixa fechado), mostra o aviso para abrir o caixa e o fechamento manual segue funcionando; (d) Bancada com "a profissional cobra" e Pix: mesmo fluxo via `bancadaApi.cobrar`; sem a chave não há painel; (e) o teste da Fase 1 do `gerarPix` manual continua passando quando `gateway` é `null`.
- [ ] **Step 2:** FAIL. **Step 3:** trocar o uso de `PainelCobrarPix` por `PainelCobrar` nos dois lugares, ligando `onPendente` (trava) e `onPaga` (recarrega). **Step 4:** PASS; `npx tsc --noEmit` no frontend limpo.
- [ ] **Step 5:** Commit `feat(comanda): comanda e Bancada usam o painel de cobrança do saldo`.

### Task 11: Verificação final e PR

- [ ] **Step 1:** Backend: `npx tsc --noEmit` e suíte completa (`--pool=forks --poolOptions.forks.singleFork=true`); frontend: `npx tsc --noEmit`, `next lint` nas pastas alteradas e a suíte **em lotes por pasta** (`--maxWorkers=2 --testTimeout=60000`). Tudo verde antes de seguir; falha que não é minha vai no relatório com o nome.
- [ ] **Step 2:** `git fetch` e simular a junção com `origin/main` (`git merge-tree --write-tree HEAD origin/main`); sem conflito.
- [ ] **Step 3:** Abrir o PR contra `main` listando: migração `20261111120000_cobranca_saldo` **a aplicar com autorização** (conferir `migrate status` depois do merge), o teste real pendente (Pix de R$ 1 pelo Mercado Pago) e que PRs 2 e 3 (Point, link InfinitePay) ficam para depois.
