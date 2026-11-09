# Recebimentos pela InfinitePay: plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O profissional conecta a InfinitePay com a InfiniteTag e uma chave de API. O sinal da reserva pública é pago num link da InfinitePay, e a reserva é confirmada sozinha pelo webhook ou pela volta do cliente.

**Architecture:**
- O adaptador novo `gateways/infinitePay.ts` fala com a API por `fetch`, sem SDK, e fica ao lado do Mercado Pago.
- **Conexão:** a conexão da InfinitePay é gravada na mesma tabela `conexoes_recebimento`:
  - a chave vai cifrada em `access_token_cifrado`;
  - o handle vai em `conta_externa_id`;
  - grava `aceitaPix=false` e `aceitaCartao=true`, com `aceiteCartaoEm` preenchido.

  Com isso, `formas()` devolve `['cartao']`, e a reserva pública usa o caminho do Checkout de cartão que já existe.
- **Confirmação:** o webhook e a volta do cliente chamam `payment_check` e só então passam pelo `decidirPagamento` atual. Nada é gravado antes da conferência.

**Tech Stack:** Express + Prisma + Zod + Vitest (backend), Next.js + React Testing Library + Vitest (frontend).

**Spec:** `docs/superpowers/specs/2026-11-09-recebimentos-infinitepay-design.md`

## Global Constraints

- Sem migração de banco.
- API: `https://api.checkout.infinitepay.io`.
  - Criar: `POST /links`.
  - Conferir: `POST /payment_check`.
  - Cabeçalho `X-Api-Key: <chave>`, sempre que houver chave.
  - Tempo limite de 8000 ms, igual ao Mercado Pago.
- Preço em centavos inteiros (`centavos()` de `recebimentos.rules.ts`).
- `options` do link:
  - `valid_until` = `venceEm.toISOString()`;
  - `single_payment: true`;
  - `assured_installments: 0`.
- `webhook_url` = `${BACKEND_URL}/api/v1/recebimentos/webhook/infinitepay/<cobrancaId>`, com `BACKEND_URL` sem barra no final.
- A InfinitePay fica disponível com `RECEBIMENTOS_TOKEN_KEY` (32 bytes em base64) e `BACKEND_URL`. O Mercado Pago continua exigindo as quatro variáveis atuais.
- A chave nunca entra em log, mensagem de erro, URL ou resposta de API.
- **Webhook:**
  - se a conferência falhar porque a InfinitePay está fora do ar, responde **400**;
  - em qualquer outro caso, responde **200**.
- Nada vindo do webhook ou da volta é gravado antes de o `payment_check` responder `paid: true`.
- Textos de tela e alertas em PT-BR. Onde hoje está escrito "Mercado Pago", entra o nome do gateway conectado.
- **Commits:** terminam com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Testes:** backend com `cd backend && npx vitest run <arquivo>`, frontend com `cd frontend && npx vitest run <arquivo>`.
- **Banco:** nunca rodar migração nem script contra o banco de `backend/.env`, que aponta para PRODUÇÃO.

## Review Focus

1. Webhook com o `order_nsu` do corpo diferente do id da URL: ignora, responde 200 e não chama a InfinitePay.
2. `payment_check` com `paid: true` e `amount` diferente do sinal: não confirma, porque `decidirPagamento` já ignora valor diferente. O teste da Task 5 cobre esse caso.
3. A volta do cliente repetida, ou chegando depois do webhook: não confirma duas vezes nem manda duas mensagens. Os índices e o `updateMany` atuais já garantem isso. O teste da Task 5 cobre esse caso.
4. InfiniteTag colada com `$`, espaço ou maiúsculas: é normalizada (`trim`, sem `$` inicial, minúsculas) antes de conferir e gravar. O teste da Task 3 cobre esse caso.
5. Sinal pago por Pix pela InfinitePay: a cobrança tem `forma: 'cartao'`, mas o Caixa e o CRM mostram "Sinal Pix". O teste da Task 4 cobre esse caso.

---

### Task 1: Disponibilidade por gateway e tipos

**Files:**
- Modify: `backend/src/modules/recebimentos/recebimentos.rules.ts`
- Modify: `backend/src/modules/recebimentos/recebimentos.types.ts`
- Modify: `backend/src/modules/recebimentos/conexao.service.ts` (só as chamadas a `recebimentosConfigurado`)
- Modify: `backend/src/modules/recebimentos/pagamentos.service.ts` (só as chamadas a `recebimentosConfigurado`)
- Modify: `backend/.env.example` (acrescentar `BACKEND_URL=` com comentário)
- Modify: `frontend/src/lib/recebimentos.ts` (tipos)
- Test: `backend/src/__tests__/recebimentosRules.test.ts`

**Interfaces:**
- Produces:
  - `type GatewayId = 'mercadopago' | 'infinitepay'`.
  - `gatewayDisponivel(g: GatewayId): boolean`:
    - `mercadopago` exige as 4 variáveis atuais;
    - `infinitepay` exige `RECEBIMENTOS_TOKEN_KEY` e `BACKEND_URL`.
  - `recebimentosConfigurado(): boolean`: algum gateway disponível.
  - `backendUrl(): string`: `BACKEND_URL` sem barra final.
  - `EstadoRecebimentos.disponiveis: GatewayId[]`, também no tipo do frontend.
  - `GatewayParamSchema` aceita os dois ids. O novo `GatewayOAuthParamSchema = z.object({ gateway: z.literal('mercadopago') })`.
  - `lerEstado` continua aceitando só `mercadopago`.

- [ ] **Step 1: Escreva os testes que falham.** Em `recebimentosRules.test.ts`, com `process.env` ajustado em cada caso:
  - `gatewayDisponivel('infinitepay')` vale `true` só com `RECEBIMENTOS_TOKEN_KEY` e `BACKEND_URL`;
  - `gatewayDisponivel('mercadopago')` vale `false` sem `MERCADOPAGO_CLIENT_ID`;
  - `recebimentosConfigurado()` vale `true` só com as variáveis da InfinitePay;
  - `backendUrl()` com `'https://x.com/'` devolve `'https://x.com'`.
- [ ] **Step 2: Rode os testes e confira que falham.** `cd backend && npx vitest run src/__tests__/recebimentosRules.test.ts`. Esperado: FAIL, `gatewayDisponivel is not a function`.
- [ ] **Step 3: Implemente o código.**
  - Escreva as funções acima.
  - Em `conexao.service.ts`, `conectarUrl` e `callback` passam a usar `gatewayDisponivel('mercadopago')`. `formas` e `cartaoForaDoAr` passam a usar `gatewayDisponivel(c.gateway)`.
  - `verConexao` preenche `disponiveis`.
  - Em `pagamentos.service.ts`, `processarAviso` usa `gatewayDisponivel('mercadopago')`.
  - Em `recebimentos.routes.ts`, `/callback` e `/conectar` usam `GatewayOAuthParamSchema`.
- [ ] **Step 4: Rode todos os testes de recebimentos.** `cd backend && npx vitest run src/__tests__/recebimentos` e `npx tsc --noEmit`. Esperado: PASS e sem erros de tipo.
- [ ] **Step 5: Commit.** `feat(recebimentos): disponibilidade por gateway`.

### Task 2: Adaptador da InfinitePay

**Files:**
- Create: `backend/src/modules/recebimentos/gateways/infinitePay.ts`
- Modify: `backend/src/modules/recebimentos/gateways/tipos.ts` (nova classe de erro)
- Test: `backend/src/__tests__/recebimentosInfinitePay.test.ts`, no estilo de `recebimentosMercadoPago.test.ts`, com `fetch` simulado

**Interfaces:**
- Produces, em `infinitePay.ts`:
  ```ts
  export interface CredencialInfinitePay { handle: string; chave: string }
  export const infinitePay: {
    conferirChave(cred: CredencialInfinitePay): Promise<void>;
    criarLink(cred: CredencialInfinitePay, c: NovaCobranca, urls: { volta: string; webhook: string }): Promise<{ checkoutUrl: string }>;
    conferirPagamento(cred: CredencialInfinitePay, d: { cobrancaId: string; transactionNsu: string; fatura: string }): Promise<PagamentoGateway | null>;
  };
  export function normalizarHandle(texto: string): string; // trim, sem '$' inicial, minúsculas
  ```
- Produces, em `tipos.ts`: `class GatewayCheckoutDesligado extends GatewayRecusou`, para o erro `external_checkout_not_enabled`.
- **Mapeamento de erros:**
  - 401 ou 403 viram `GatewayTokenInvalido`;
  - 429, 5xx, rede ou tempo limite viram `GatewayIndisponivel`;
  - um corpo com `external_checkout_not_enabled` (em qualquer campo de texto) vira `GatewayCheckoutDesligado`;
  - os outros 4xx viram `GatewayRecusou`.

- [ ] **Step 1: Escreva os testes que falham.**
  - **`criarLink`:**
    - chama `POST https://api.checkout.infinitepay.io/links` com `X-Api-Key` e o corpo `{ handle, order_nsu: ID, items: [{ quantity: 1, price: 1550, description }], redirect_url: volta, webhook_url: webhook, options: { valid_until: venceEm.toISOString(), single_payment: true, assured_installments: 0 } }`;
    - devolve `{ checkoutUrl: corpo.url }`;
    - quando a resposta vem sem `url`, lança `GatewayRecusou`.
  - **`conferirPagamento`:**
    - envia `{ handle, order_nsu, transaction_nsu, slug: fatura }`;
    - `{ success: true, paid: true, amount: 1550, capture_method: 'pix' }` vira `{ id: transactionNsu, status: 'approved', valor: 15.5, referencia: ID, formaPaga: 'pix' }`;
    - `capture_method: 'credit_card'` vira `formaPaga: 'credito'`;
    - `paid: false` devolve `null`.
  - **`conferirChave`:**
    - manda `payment_check` com `order_nsu` e `transaction_nsu` aleatórios;
    - uma resposta 200 resolve;
    - 403 lança `GatewayTokenInvalido`;
    - um corpo com `external_checkout_not_enabled` lança `GatewayCheckoutDesligado`.
  - **Erros em geral:**
    - uma falha de rede lança `GatewayIndisponivel`;
    - a chave não aparece em nenhuma `message` de erro.
  - **`normalizarHandle`:** `' $Studio_Ana '` vira `'studio_ana'`.
- [ ] **Step 2: Rode os testes e confira que falham.** `cd backend && npx vitest run src/__tests__/recebimentosInfinitePay.test.ts`. Esperado: FAIL, módulo não existe.
- [ ] **Step 3: Implemente `infinitePay.ts`.** Use a mesma estrutura de `chamar()` e `lerJson()` de `mercadoPago.ts`, com o mapeamento de erros acima. Na resposta, o valor em reais é `amount / 100`.
- [ ] **Step 4: Rode os testes.** Esperado: PASS.
- [ ] **Step 5: Commit.** `feat(recebimentos): adaptador da InfinitePay`.

### Task 3: Conexão por chave

**Files:**
- Modify: `backend/src/modules/recebimentos/conexao.service.ts`
- Modify: `backend/src/modules/recebimentos/recebimentos.controller.ts`, `recebimentos.routes.ts`, `recebimentos.types.ts`
- Test: `backend/src/__tests__/recebimentosConexao.test.ts`

**Interfaces:**
- Consumes: `infinitePay.conferirChave` e `normalizarHandle` (Task 2), e `gatewayDisponivel` (Task 1).
- Produces:
  - `ChaveSchema = z.object({ handle: z.string().min(1).max(64), chave: z.string().min(10).max(200), aceite: z.literal(true) })`.
  - `POST /api/v1/recebimentos/infinitepay/chave` (só `tenant_admin`), que chama `conexaoService.conectarChave(user, { handle, chave })` e devolve `EstadoRecebimentos`. Depois de responder, dispara `void pagamentosService.conferirAoReconectar(businessId)`, como `confirmar` já faz.
  - `conexaoService.credencial(businessId): Promise<{ gateway: 'infinitepay'; cred: CredencialInfinitePay } | null>` devolve a conexão ativa da InfinitePay. Para outro gateway ou sem conexão, devolve `null`.
  - `nomeDoGateway(g: GatewayId): string` devolve `'Mercado Pago'` ou `'InfinitePay'`. Fica em `recebimentos.rules.ts`.
  - `tokenAtivo` passa a devolver `null` para a InfinitePay, porque não há token OAuth. Quem precisa da chave usa `credencial`.

- [ ] **Step 1: Escreva os testes que falham.** No estilo dos testes atuais de `confirmar`, com o repositório e o adaptador simulados:
  - **Conexão bem-sucedida:**
    - `conectarChave` com `' $Ana '` grava `contaExternaId: 'ana'`, `contaNome: '$ana'`, `accessTokenCifrado` (que decifrado devolve a chave) e `refreshTokenCifrado` (vazio cifrado);
    - grava também `tokenExpiraEm` no ano 9999, `aceitaPix: false`, `aceitaCartao: true` e `aceiteCartaoEm` preenchido.
  - **Erros na conexão:**
    - `GatewayTokenInvalido` vira `ValidationError('A InfinitePay recusou a chave. Confira se a chave e a InfiniteTag são da mesma conta.')`;
    - `GatewayCheckoutDesligado` vira `ValidationError('Ligue o Checkout integrado na InfinitePay e tente de novo.')`;
    - `GatewayIndisponivel` vira `ValidationError('A InfinitePay não respondeu. Tente de novo em alguns minutos.')`;
    - um handle já conectado a outro negócio vira `ConflictError('Esta conta da InfinitePay já está conectada a outro negócio.')`;
    - sem `gatewayDisponivel('infinitepay')`, lança `NotFoundError`.
  - **Formas e textos:**
    - `formas()` de uma conexão InfinitePay ativa devolve `['cartao']`;
    - `definirFormas` para a InfinitePay lança `ValidationError('A InfinitePay não permite escolher as formas de pagamento.')`;
    - `marcarReconectar` de uma conexão InfinitePay manda o título `'Reconecte a InfinitePay'` e o link `/dashboard/configuracoes/recebimentos/infinitepay`;
    - `alertarRecusa` usa o nome do gateway da conexão.
  - **`acessoRevogado`:** quando o gateway é `infinitepay`, chama `conferirChave` e só devolve `true` para `GatewayTokenInvalido`.
- [ ] **Step 2: Rode os testes e confira que falham.**
- [ ] **Step 3: Implemente o código.**
  - **`acessoRevogado`:** passa a receber `businessId`. Com a InfinitePay, usa `credencial` e `conferirChave`. Com o Mercado Pago, faz o mesmo de hoje.
  - **Chamadas atuais:** ajuste as que já existem em `cobrancas.service.ts` e `pagamentos.service.ts`.
  - **`renovarVencendo`:** pula conexões que não são do Mercado Pago.
- [ ] **Step 4: Rode os testes.** `npx vitest run src/__tests__/recebimentos` e `npx tsc --noEmit`. Esperado: PASS.
- [ ] **Step 5: Commit.** `feat(recebimentos): conexão da InfinitePay por chave`.

### Task 4: Link de pagamento na reserva e sinal no Caixa

**Files:**
- Modify: `backend/src/modules/recebimentos/cobrancas.service.ts`
- Modify: `backend/src/modules/recebimentos/recebimentos.repository.ts`: `reservasComSinalNoCartao`, `cobrancasParaConferir` e `cobrancasDoNegocioParaConferir`
- Modify: `backend/src/modules/publicBooking/publicBooking.service.ts` e `publicBooking.types.ts`: `gatewayPagamento` no storefront e no status
- Test: `backend/src/__tests__/recebimentosSinalCartao.test.ts`, `backend/src/__tests__/publicBookingCobranca.test.ts`

**Interfaces:**
- Consumes: `conexaoService.credencial` (Task 3), `infinitePay.criarLink` (Task 2) e `backendUrl()` (Task 1).
- Produces:
  - `conexaoService.gatewayAtivo(businessId): Promise<GatewayId | null>`: gateway da conexão ativa e disponível; nunca lança (devolve `null` em erro).
  - Storefront: `gatewayPagamento: GatewayId | null`, vindo de `gatewayAtivo`.
  - Status da reserva: `reserva.gateway: GatewayId | null`, o gateway da cobrança atual.
  - A volta da InfinitePay é `${frontend}/agendar/${slug}?reserva=${appointmentId}&retorno=infinitepay`.

- [ ] **Step 1: Escreva os testes que falham.**
  - **`cobrancasService.criar`:**
    - com `forma: 'cartao'` e uma conexão InfinitePay, chama `criarLink` com `volta` igual à URL acima e `webhook` = `https://api.x.com/api/v1/recebimentos/webhook/infinitepay/<cobrancaId>`, com `BACKEND_URL=https://api.x.com/`;
    - grava `completarCobranca(id, { idExterno: id, checkoutUrl })` e devolve `{ forma: 'cartao', pixPayload: null, checkoutUrl }`;
    - um `GatewayTokenInvalido` com `acessoRevogado` verdadeiro marca reconectar.
  - **Repositório:**
    - `cobrancasParaConferir` e `cobrancasDoNegocioParaConferir` filtram com `gateway: 'mercadopago'`;
    - `reservasComSinalNoCartao` deixa de fora a cobrança `forma: 'cartao'` paga com `formaPaga: 'pix'` e mantém a paga com `formaPaga: 'credito'`. A condição é `forma: 'cartao'` mais `OR: [{ formaPaga: null }, { formaPaga: { not: 'pix' } }]`.
  - **Storefront:** traz `gatewayPagamento: 'infinitepay'` para um negócio com a InfinitePay conectada.
- [ ] **Step 2: Rode os testes e confira que falham.**
- [ ] **Step 3: Implemente o código.**
  - Em `criar`, a InfinitePay vem antes do `tokenAtivo`: se `credencial(businessId)` existir, cria o link. Caso contrário, segue o caminho atual do Mercado Pago.
  - **WhatsApp:** a InfinitePay não manda mensagem de sinal, igual ao cartão de hoje. O modelo `sinal_pix` só tem a variável do código Pix. Essa decisão muda a frase do spec e está registrada na Task 8.
- [ ] **Step 4: Rode os testes.** `npx vitest run src/__tests__/recebimentos src/__tests__/publicBooking` e `npx tsc --noEmit`. Esperado: PASS.
- [ ] **Step 5: Commit.** `feat(recebimentos): link da InfinitePay no sinal da reserva`.

### Task 5: Confirmação pelo webhook e pela volta

**Files:**
- Modify: `backend/src/modules/recebimentos/pagamentos.service.ts`
- Modify: `backend/src/modules/recebimentos/recebimentos.controller.ts` e `recebimentos.routes.ts` (webhook)
- Modify: `backend/src/modules/publicBooking/publicBooking.routes.ts`, o controller e `publicBooking.types.ts` (volta)
- Create: `frontend/src/app/api/public/[slug]/appointments/[id]/infinitepay/route.ts`, igual à rota `pix` ao lado, apontando para `/public/${slug}/appointments/${id}/infinitepay`
- Test: `backend/src/__tests__/recebimentosPagamentos.test.ts`, `backend/src/__tests__/publicBookingCobranca.test.ts`

**Interfaces:**
- Consumes: `infinitePay.conferirPagamento` (Task 2) e `conexaoService.credencial` (Task 3).
- Produces:
  - `pagamentosService.confirmarInfinitePay(d: { cobrancaId: string; transactionNsu: string; fatura: string; orderNsu: string }): Promise<'ok' | 'tentar_de_novo'>`. Nunca lança.
    - Devolve `'tentar_de_novo'` só para `GatewayIndisponivel`.
    - Ignora e devolve `'ok'` nestes casos:
      - `orderNsu !== cobrancaId`;
      - cobrança inexistente ou de outro gateway;
      - negócio sem credencial ativa;
      - `paid: false`.
    - Com pagamento, chama o `avaliar` atual.
    - `GatewayTokenInvalido` passa pelo `acessoRevogado` e por `marcarReconectar`, como hoje.
  - `POST /api/v1/recebimentos/webhook/infinitepay/:cobrancaId`:
    - público, com o `webhookLimiter` atual;
    - valida `cobrancaId` como UUID;
    - lê do corpo `order_nsu`, `transaction_nsu` e `invoice_slug`, que precisam ser texto de 1 a 100 caracteres com `[A-Za-z0-9_-]`;
    - fora do formato, responde 200 sem chamar nada;
    - responde 400 para `'tentar_de_novo'` e 200 para o resto.
  - `POST /api/v1/public/:slug/appointments/:id/infinitepay`:
    - recebe `{ orderNsu, transactionNsu, fatura }` no mesmo formato;
    - tem limite próprio de 20 chamadas a cada 15 minutos por IP;
    - confere que a cobrança `orderNsu` é da reserva `id` do negócio `slug` e chama `confirmarInfinitePay`;
    - devolve o mesmo corpo de `GET .../status`, para a página se atualizar numa chamada só.
  - O webhook espera a conferência antes de responder (diferente do Mercado Pago), porque o código da resposta depende dela.

- [ ] **Step 1: Escreva os testes que falham.**
  - **Casos do webhook e de `confirmarInfinitePay`:**
    - **`paid: true` com valor igual:** confirma a reserva e grava `pagamentoExternoId = transactionNsu` e `formaPaga`.
    - **`order_nsu` trocado:** não chama `conferirPagamento` e devolve `'ok'`.
    - **`paid: false`:** não grava nada.
    - **Valor diferente:** `decidirPagamento` ignora, e a reserva continua aguardando.
    - **Mesma confirmação duas vezes:** a segunda não muda nada e não manda outra mensagem (`avisarSinalConfirmado` chamado uma vez).
    - **`GatewayIndisponivel`:** devolve `'tentar_de_novo'`, e o webhook responde 400.
    - **Corpo fora do formato:** o webhook responde 200 sem chamar o serviço.
  - **Rotina:** `conferirPendentes` não chama a InfinitePay. O teste confere o filtro do repositório da Task 4.
  - **Rota pública da volta:** com `orderNsu` de outra reserva, responde 404 e não chama `confirmarInfinitePay`.
- [ ] **Step 2: Rode os testes e confira que falham.**
- [ ] **Step 3: Implemente o código.**
- [ ] **Step 4: Rode os testes.** `npx vitest run src/__tests__/recebimentos src/__tests__/publicBooking` e `npx tsc --noEmit`. Esperado: PASS.
- [ ] **Step 5: Commit.** `feat(recebimentos): confirmação da InfinitePay`.

### Task 6: Tela da InfinitePay em Ajustes

**Files:**
- Modify: `frontend/src/components/recebimentos/catalogo.ts`
  - Na InfinitePay, `situacao: 'disponivel'` e `conexao: 'chave'`.
  - Passos e avisos com o texto do spec.
  - `URL_INFINITEPAY = 'https://www.infinitepay.io/'` e `URL_TAXAS_INFINITEPAY = 'https://www.infinitepay.io/taxas'`.
- Create: `frontend/src/components/recebimentos/InfinitePayPassos.tsx`
- Modify: `frontend/src/app/dashboard/configuracoes/recebimentos/[gateway]/page.tsx`: renderiza `InfinitePayPassos` quando `gateway === 'infinitepay'`.
- Modify: `frontend/src/components/settings/RecebimentosSection.tsx`
  - Um cartão só fica "Disponível" se estiver em `estado.disponiveis`.
  - O cartão do gateway conectado mostra a situação. Os outros aparecem como "Disponível", sem abrir, enquanto houver uma conexão.
- Modify: `frontend/src/lib/recebimentos.ts`: `conectarChave(d: { handle: string; chave: string; aceite: true })` e `desconectar(gateway: GatewayId)`.
- Test: `frontend/src/components/recebimentos/__tests__/InfinitePayPassos.test.tsx` e `frontend/src/components/settings/__tests__/RecebimentosSection.test.tsx`

**Interfaces:**
- Consumes: `POST /recebimentos/infinitepay/chave` (Task 3), `EstadoRecebimentos.disponiveis` (Task 1) e `DELETE /recebimentos/infinitepay/conexao` (rota atual).

- [ ] **Step 1: Escreva os testes que falham.**
  - **Sem conexão:**
    - mostra os 5 passos, os campos "InfiniteTag" e "Chave de API" (com `type="password"`) e a caixa de aceite;
    - "Conectar" fica desabilitado sem o aceite.
  - **Conectar:**
    - chama `conectarChave` com o texto digitado e `aceite: true`;
    - um erro da API aparece com `getApiErrorMessage`;
    - depois de conectar, a chave some do campo.
  - **Conectado:** mostra `contaNome`, a última confirmação e "Desconectar". Sem a escolha de formas.
  - **Precisa reconectar:** mostra o aviso e os campos para colar uma chave nova.
  - **Ajustes:** em `RecebimentosSection`, a InfinitePay aparece "Disponível" quando `disponiveis` inclui `'infinitepay'`.
- [ ] **Step 2: Rode os testes e confira que falham.**
- [ ] **Step 3: Implemente `InfinitePayPassos`.** Siga o estilo de `GatewayPassos`: `Card`, `Banner`, `Button` e `Modal` de `@/components/ui`, com o mesmo modal de Desconectar mostrando `reservasPendentes`.
- [ ] **Step 4: Rode os testes, o lint e os tipos.** `cd frontend && npx vitest run src/components/recebimentos src/components/settings`, `npx tsc --noEmit` e `npm run lint`. Esperado: PASS.
- [ ] **Step 5: Commit.** `feat(recebimentos): tela da InfinitePay em Ajustes`.

### Task 7: Página pública com a InfinitePay

**Files:**
- Modify: `frontend/src/components/publicBooking/PublicBookingFlow.tsx`
- Modify: `frontend/src/lib/publicBooking.ts` (ou onde está `publicBookingApi`): `confirmarInfinitePay(slug, id, d)` e os tipos `gatewayPagamento` e `reserva.gateway`
- Test: `frontend/src/components/publicBooking/__tests__/PublicBookingCartao.test.tsx`

**Interfaces:**
- Consumes: `storefront.gatewayPagamento` e `reserva.gateway` (Task 4), e `POST /api/public/[slug]/appointments/[id]/infinitepay` (Task 5).

- [ ] **Step 1: Escreva os testes que falham.**
  - **Antes de pagar**, com `gatewayPagamento: 'infinitepay'`:
    - o resumo mostra `'Sinal'`, sem "cartão";
    - o título é `'Pagamento do sinal na InfinitePay'`;
    - o botão final é `'Pagar o sinal na InfinitePay (Pix ou cartão)'`;
    - aparece a linha `'Você escolhe Pix ou cartão na página da InfinitePay.'`.
  - **Na volta:**
    - com `?reserva=R&retorno=infinitepay&order_nsu=C&transaction_nsu=T&slug=F`, chama `confirmarInfinitePay(slug, R, { orderNsu: 'C', transactionNsu: 'T', fatura: 'F' })` uma vez e mostra a situação devolvida;
    - sem `transaction_nsu`, só consulta o status, como hoje.
  - **Mercado Pago:** os rótulos continuam os de hoje.
- [ ] **Step 2: Rode os testes e confira que falham.**
- [ ] **Step 3: Implemente o código.**
  - **Volta da InfinitePay:**
    - `retorno === 'infinitepay'` é tratado como `'pendente'` até a resposta chegar;
    - se a reserva voltar confirmada, a tela de confirmação de sempre aparece;
    - se não voltar, aparece o botão "Ir para o pagamento" com `checkoutUrl`.
  - **URL:** os parâmetros da InfinitePay saem da URL com `history.replaceState` depois da leitura.
- [ ] **Step 4: Rode os testes, o lint e os tipos.** `cd frontend && npx vitest run src/components/publicBooking`, `npx tsc --noEmit` e `npm run lint`. Esperado: PASS.
- [ ] **Step 5: Commit.** `feat(pagina-publica): sinal pela InfinitePay`.

### Task 8: Documentação

**Files:**
- Create: `docs/infinitepay-configuracao.md`
  - **Implantação:** criar `BACKEND_URL` no Render.
  - **Passo a passo do profissional**, igual à tela.
  - **Teste real:**
    - R$ 1,00 por Pix e R$ 1,00 por cartão;
    - fechar a página antes de voltar;
    - conferir o Caixa;
    - devolver pelo app.
  - **Problemas comuns:** chave e InfiniteTag de contas diferentes, Checkout integrado desligado e reserva que não confirmou.
  - **Pontos a confirmar no teste:** `payment_check` exige a chave? Qual é o corpo do webhook?
- Modify: `docs/superpowers/specs/2026-11-09-recebimentos-infinitepay-design.md`
  - A frase do WhatsApp passa a ser: "A InfinitePay não manda mensagem de sinal pelo WhatsApp, como o cartão do Mercado Pago."
  - O `slug` não é guardado: depois de pago, `id_externo` continua com o id da cobrança, porque nada mais consulta a InfinitePay.
- Modify: `docs/ROADMAP.md` e `docs/design/SEGUIMENTO.md`: InfinitePay em PR, aguardando `BACKEND_URL` e o teste real.

- [ ] **Step 1: Escreva os documentos.**
- [ ] **Step 2: Rode tudo.** `cd backend && npx vitest run && npx tsc --noEmit`, depois `cd frontend && npx vitest run && npx tsc --noEmit && npm run lint`. Esperado: tudo PASS.
- [ ] **Step 3: Commit.** `docs: InfinitePay no guia, roadmap e seguimento`.
