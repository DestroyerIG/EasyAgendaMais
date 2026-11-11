# Cobrança do saldo — PR 3 (link de pagamento da InfinitePay) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Com a InfinitePay conectada, cobrar o saldo da comanda por um link de pagamento (QR do link; o cliente paga Pix ou cartão no celular), com confirmação por webhook e fechamento automático da comanda.

**Architecture:** Reaproveita o PR 1 e o PR 2: a cobrança é uma linha `cobrancas_sinal` de `tipo='saldo'`, `gateway='infinitepay'`, `forma='link'` (a coluna `checkout_url` já existe: **sem migração**). O webhook `/webhook/infinitepay/:cobrancaId` e `confirmarInfinitePay` já levam ao `avaliar`, que desvia o saldo para `decidirSaldo`. O que muda: o serviço da cobrança aceita `via: 'link'`, o estado informa a InfinitePay como gateway, o painel mostra o link com QR, e o link volta para uma página pública "Pagamento recebido".

**Tech Stack:** Express + Prisma + vitest (backend); Next.js + React Testing Library (frontend).

**Spec:** `docs/superpowers/specs/2026-11-10-cobranca-do-saldo-design.md` (Gateways › InfinitePay; Telas). PRs anteriores: `2026-11-10-cobranca-do-saldo-pr1.md` e `2026-11-11-cobranca-do-saldo-pr2-point.md`.

## Global Constraints

- Textos ao usuário em português do Brasil. Chaves e tokens nunca em log, URL ou mensagem de erro.
- **Sem migração.** `forma = 'link'` cabe em `VARCHAR(10)`.
- Prazo do link: **60 min** (`venceEm = agora + 60 min`; vai como `options.valid_until`). `order_nsu = cobrancaId`. A InfinitePay não tem consulta por referência: **só o webhook confirma** (a rotina de cada minuto só expira localmente).
- URLs: volta `${FRONTEND_URL}/pagamento-recebido`; webhook `${BACKEND_URL}/api/v1/recebimentos/webhook/infinitepay/${cobrancaId}` (o mesmo formato do sinal).
- A InfinitePay não permite cancelar o link: cancelar marca `cancelada` aqui e a tela avisa que o link já enviado ainda pode ser pago. Pagamento que ainda entrar quita a comanda (ou alerta, se já estiver fechada).
- Página pública nova entra em `PUBLIC_AUTH_PATHS` (`lib/publicRoutes.ts`) e em `lib/themedPaths.ts`; só tokens de cor.
- Testes: backend `cd backend && npx vitest run <arquivo>`; frontend `cd frontend && npx vitest run <arquivo> --maxWorkers=2 --testTimeout=60000`. Suítes completas só em lotes (backend: `--pool=forks --poolOptions.forks.singleFork=true`).
- Commits em português, estilo `feat(recebimentos): ...`, terminando com `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## Review Focus

- Pagamento do link pelo webhook: quita e fecha **uma** vez (webhook repetido não fecha de novo); valor diferente alerta; link pago depois de cancelado ou vencido ainda quita; link pago com a comanda já fechada alerta.
- A forma real do pagamento (Pix, débito, crédito) fecha a comanda; sem forma no pagamento, vale a forma que o dono escolheu.
- Conta sem checkout por link liberado (`GatewayCheckoutDesligado`): recado claro, linha apagada.
- Cancelar o link não promete o que não pode: a tela avisa que ele ainda pode ser pago.
- Com Mercado Pago ativo, nada muda; com InfinitePay ativa, o Pix/maquininha do Mercado Pago não são oferecidos (`SEM_GATEWAY`).

---

### Task 1: Serviço da cobrança aceita o link da InfinitePay

**Files:**
- Modify: `backend/src/modules/recebimentos/cobrancas.service.ts` (exportar `urlDoSite()`), `backend/src/modules/recebimentos/recebimentos.repository.ts`, `backend/src/modules/recebimentos/cobrancaSaldo.service.ts`
- Test: `backend/src/__tests__/cobrancaSaldo.test.ts`, `backend/src/__tests__/recebimentosTipoSaldo.test.ts`

**Interfaces:**
- Consumes: `conexaoService.credencial(businessId): Promise<{ gateway: 'infinitepay'; cred } | null>`, `conexaoService.gatewayAtivo(businessId)`, `infinitePay.criarLink(cred, c, { volta, webhook }): Promise<{ checkoutUrl: string }>`, `backendUrl()` (rules).
- Produces: `ComoCobrar` ganha `{ via: 'link'; forma: 'pix' | 'debito' | 'credito' }`; `CobrancaSaldoDto` ganha `checkoutUrl: string | null` e `via: 'pix' | 'maquininha' | 'link'`; `EstadoCobranca.gateway: 'mercadopago' | 'infinitepay' | null`; repo: `criarCobrancaSaldo` aceita `gateway: GatewayId` já existente e `forma?: 'pix' | 'point' | 'link'`; `ultimaCobrancaSaldo` seleciona `checkoutUrl`.

- [ ] **Step 1: Testes que falham** (`cobrancaSaldo.test.ts`, mocks: `conexao.credencial`, `conexao.gatewayAtivo`, `infinitePay.criarLink`): (a) `criar` com `{via:'link', forma:'debito'}`: salva o rascunho com `paymentMethod: 'debito'`, cria a linha `gateway:'infinitepay'`, `forma:'link'`, `venceEm` ≈ +60 min, chama `criarLink` com `volta` terminando em `/pagamento-recebido` e `webhook` terminando em `/webhook/infinitepay/<id>`, completa com `{ idExterno: <id>, checkoutUrl }` e devolve `via:'link'` com `checkoutUrl` e sem `codigoPix`; (b) sem credencial da InfinitePay → 409 `SEM_GATEWAY`, sem linha criada; (c) `GatewayCheckoutDesligado` → linha apagada, 409 `LINK_DESLIGADO`; outra falha → 502 `GATEWAY_INDISPONIVEL`; `GatewayRecusou` alerta a conta; (d) com InfinitePay ativa, `via:'pix'` e `via:'maquininha'` → 409 `SEM_GATEWAY` (e com Mercado Pago ativo, `via:'link'` → 409 `SEM_GATEWAY`); (e) `estado` com InfinitePay ativa devolve `gateway:'infinitepay'`, `terminal:null` e a cobrança `via:'link'` com `checkoutUrl`; (f) `cancelar` de link pendente não chama gateway nenhum, marca `cancelada` e `avisoMaquininha:false`. Em `recebimentosTipoSaldo.test.ts`: `criarCobrancaSaldo` com `forma:'link'` e `gateway:'infinitepay'` grava os dois; `ultimaCobrancaSaldo` seleciona `checkoutUrl`.
- [ ] **Step 2:** Rodar → FAIL. **Step 3:** Implementar; `criar` escolhe o pré-requisito pela via (`pix`/`maquininha` exigem token do Mercado Pago como hoje; `link` exige `credencial`); `estado` usa `tokenAtivo` para o Mercado Pago e `gatewayActivo === 'infinitepay'` para a InfinitePay. **Step 4:** PASS e `tsc` limpo.
- [ ] **Step 5:** Commit `feat(recebimentos): cobrança do saldo por link da InfinitePay`.

### Task 2: Rotas aceitam o link

**Files:**
- Modify: `backend/src/modules/comandas/comandas.types.ts`, `comandas.controller.ts`, `backend/src/modules/bancada/bancada.types.ts`, `bancada.service.ts`
- Test: `backend/src/__tests__/bancada.test.ts`

**Interfaces:**
- Consumes: `ComoCobrar` com `link` (T1).
- Produces: corpo `{ ...comanda, via: 'pix' | 'maquininha' | 'link', forma?: 'pix' | 'debito' | 'credito' }`; `via:'maquininha'` exige `forma` débito ou crédito; `via:'link'` exige `forma` (qualquer das três).

- [ ] **Step 1: Testes que falham** (painel e Bancada): `via:'link'` com `forma:'pix'` chama `criar(..., { via:'link', forma:'pix' })`; `via:'link'` sem `forma` → 400; `via:'maquininha'` com `forma:'pix'` → 400; as vias antigas seguem como antes.
- [ ] **Step 2:** FAIL. **Step 3:** Implementar (`forma` passa a aceitar `pix`; a regra por via fica no `superRefine`). **Step 4:** PASS e `tsc` limpo.
- [ ] **Step 5:** Commit `feat(comanda): rotas de cobrança do saldo aceitam o link da InfinitePay`.

### Task 3: Confirmação do link pelo webhook da InfinitePay

**Files:**
- Modify (só se os testes mostrarem lacuna): `backend/src/modules/recebimentos/pagamentos.service.ts`
- Test: `backend/src/__tests__/recebimentosPagamentos.test.ts` (descrever `confirmarInfinitePay` com cobrança de saldo)

**Interfaces:**
- Consumes: `pagamentosService.confirmarInfinitePay({ cobrancaId, transactionNsu, fatura, orderNsu })`, `infinitePay.conferirPagamento` (mock `ip`), `comandasService.fecharPorPagamento` (mock `comandaSrv`).

- [ ] **Step 1: Testes que falham ou que travam o comportamento** (cobrança `tipo:'saldo'`, `gateway:'infinitepay'`, `forma:'link'`, `usuarioId:'u1'`, `valor:'80.00'`): (a) pago (`conferirPagamento` → `approved`, valor 80, `formaPaga:'credito'`) quita e chama `fecharPorPagamento` com `forma:'credito'`; (b) o mesmo webhook duas vezes fecha uma só; (c) pagamento de valor diferente: não fecha, alerta; (d) cobrança já `cancelada` ou `expirada` que ainda recebe o pagamento: quita e fecha; (e) comanda já fechada (`ja_fechada`): alerta o dono; (f) `formaPaga: null`: fecha com `forma: null` (o serviço da comanda usa a forma escolhida); (g) `orderNsu` diferente da cobrança: ignora; cobrança do Mercado Pago com o mesmo id: ignora.
- [ ] **Step 2:** Rodar; o que falhar mostra a lacuna. **Step 3:** Corrigir só o que os testes exigirem. **Step 4:** PASS no arquivo inteiro.
- [ ] **Step 5:** Commit `test(recebimentos): confirmação do link da InfinitePay para o saldo da comanda`.

### Task 4: Frontend — `PainelCobrar` com o link

**Files:**
- Modify: `frontend/src/lib/comanda.ts`, `frontend/src/lib/bancada.ts` (só tipos, se preciso), `frontend/src/components/comanda/PainelCobrar.tsx`
- Test: `frontend/src/components/comanda/__tests__/PainelCobrar.test.tsx`

**Interfaces:**
- Consumes: respostas de T1/T2.
- Produces: `CobrancaSaldo.via: 'pix' | 'maquininha' | 'link'` e `checkoutUrl: string | null`; `EstadoCobranca.gateway: 'mercadopago' | 'infinitepay' | null`; `ComoCobrar` ganha `{ via: 'link'; forma: 'pix' | 'debito' | 'credito' }`; `ehLinkDesligado(e): boolean` (409 `LINK_DESLIGADO`).

- [ ] **Step 1: Testes que falham** (`gateway:'infinitepay'`): para as formas `pix`, `debito` e `credito` o painel oferece "Gerar link de pagamento" e chama `api.cobrar({ via:'link', forma })`; com o link pendente mostra o QR do link (img "QR Code do link de pagamento"), o endereço e "Copiar link", aguarda ("Aguardando o pagamento...") e consulta a cada 3 s até `paga` (aí chama `onPaga` uma vez e libera a comanda); "Cancelar cobrança" chama `api.cancelar` e mostra "O link já enviado ainda pode ser pago"; link vencido → "O link venceu. Gere de novo." e "Tentar de novo"; `409 LINK_DESLIGADO` → recado da conta sem checkout liberado; no Pix, "Usar minha chave Pix" troca para o Pix manual; no cartão, "Digitar manualmente" mostra o guia; com Mercado Pago o comportamento anterior não muda.
- [ ] **Step 2:** FAIL. **Step 3:** Implementar o ramo do link dentro do `PainelCobrar` (QR com `qrcode`, só tokens de cor). **Step 4:** PASS (arquivo inteiro) e `tsc`/lint limpos.
- [ ] **Step 5:** Commit `feat(comanda): painel de cobrança com link de pagamento da InfinitePay`.

### Task 5: Frontend — página pública "Pagamento recebido"

**Files:**
- Create: `frontend/src/app/pagamento-recebido/page.tsx`, `frontend/src/components/comanda/PagamentoRecebido.tsx`
- Modify: `frontend/src/lib/publicRoutes.ts`, `frontend/src/lib/themedPaths.ts`
- Test: `frontend/src/components/comanda/__tests__/PagamentoRecebido.test.tsx`, `frontend/src/lib/__tests__/publicRoutes.test.ts` (novo ou existente)

**Interfaces:**
- Produces: rota pública `/pagamento-recebido` (sem login); `<PagamentoRecebido />` sem props.

- [ ] **Step 1: Testes que falham:** `isPublicAuthPath('/pagamento-recebido')` é `true` e `'/pagamento'` continua `false`; o componente mostra "Pagamento recebido" e "Obrigado" e não faz chamada de API nenhuma.
- [ ] **Step 2:** FAIL. **Step 3:** Implementar com `CascaPublica` (`cor={null}`) e metadata `{ title: 'Pagamento recebido', robots: { index: false } }`; incluir `src/app/pagamento-recebido` e o componente em `themedPaths`. **Step 4:** PASS e `themeCompliance` verde.
- [ ] **Step 5:** Commit `feat(comanda): página pública de retorno do link de pagamento`.

### Task 6: Verificação final e PR

- [ ] **Step 1:** Backend: `npx tsc --noEmit` e suíte completa; frontend: `npx tsc --noEmit`, lint nas pastas alteradas e a suíte **em lotes** (`--maxWorkers=2 --testTimeout=60000`, lotes de no máximo ~30 arquivos). Falha que não é minha vai no relatório com o nome.
- [ ] **Step 2:** `git fetch` e simular a junção com `origin/main`; sem conflito.
- [ ] **Step 3:** Push e PR contra `main` avisando: **sem migração**, o teste real pendente (link de R$ 1: Pix e cartão, fechar a página antes de voltar, estorno no app) e a lacuna da API (sem cancelar link, sem estorno por API, sem consulta por referência).
