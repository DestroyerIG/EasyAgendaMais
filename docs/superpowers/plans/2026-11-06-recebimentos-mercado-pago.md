# Recebimentos automáticos pelo Mercado Pago: plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O dono do negócio conecta o Mercado Pago sozinho, e o sinal pago por Pix ou cartão confirma a reserva sem ação humana.

**Architecture:** Novo módulo `backend/src/modules/recebimentos`, com um adaptador por gateway e regras puras que decidem o que fazer com cada pagamento. O webhook e uma rotina periódica passam pelo mesmo caminho, e o pagamento é sempre reconsultado no gateway. No frontend, uma tela de passos é montada por um catálogo de dados, e a página pública ganha a escolha de forma e a volta do Checkout.

**Tech Stack:** Express, Prisma, PostgreSQL, Zod, Vitest, Next.js, React. Chamadas REST com `fetch`, sem SDK do Mercado Pago, como em `googleAgenda.api.ts`.

**Spec:** `docs/superpowers/specs/2026-11-05-recebimentos-mercado-pago-design.md`

## Global Constraints

- Trabalhar numa worktree nova a partir de `origin/main`, na branch `feat/recebimentos-mercado-pago`. Nunca trocar de branch nem usar stash na pasta principal. A pasta principal está numa branch antiga.
- `backend/.env` aponta para PRODUÇÃO. Não rodar `prisma migrate dev`, `migrate deploy` nem `db push`. A migração é escrita à mão e só o dono autoriza aplicar.
- Testes do backend: exportar `DATABASE_URL` e `DIRECT_URL` para um endereço inexistente. Conferir se a linha "Tests" apareceu na saída.
- Frontend: rodar só os arquivos de teste da task. A suíte completa leva mais de 8 minutos e roda sem `next dev` no ar, com `--testTimeout=60000`.
- Nunca registrar em log, devolver em API ou mostrar em tela um token do Mercado Pago.
- Valores em dinheiro são comparados em centavos inteiros.
- Só `tenant_admin` vê e altera Recebimentos.
- Identificador do gateway em banco, API e URL: `mercadopago`. Formas: `pix` e `cartao`.
- Textos da interface em português do Brasil, falando com "você", sem "dono" ou "dona".
- Novas tabelas com RLS ligado na própria migração.
- Commits em português, no padrão `feat(recebimentos): ...`. O código vai por PR para a `main`, e o dono junta.

## Review Focus

1. Cliente volta do Checkout depois do prazo da reserva: vê "O prazo acabou", nunca uma tela de pagamento ativa. Teste na Task 9.
2. A volta do Checkout abre em outro navegador, sem nenhum estado salvo: a tela é remontada só pelo id da reserva. Teste na Task 9.
3. O negócio desconecta com cobrança pendente e o aviso chega depois: sem token, nada é confirmado, nada quebra, e a reserva fica para confirmação manual. Teste na Task 6.
4. Sinal de R$ 15,50 vem do banco como `Decimal` e do gateway como número `15.5`: os dois batem em centavos. Teste na Task 2.
5. Webhook e rotina processam o mesmo pagamento ao mesmo tempo: uma confirmação e um WhatsApp só. Teste na Task 6.

---

### Task 1: Conferir o Mercado Pago no ambiente de teste (feita em 06/11/2026)

Resultado em `docs/design/mercado-pago-verificacoes.md`. Commitar esse arquivo junto com a spec e o plano no primeiro commit da branch. As decisões já estão aplicadas nas tasks abaixo.

### Task 2: Banco, cifra e regras puras

**Files:**
- Create: `backend/prisma/migrations/20261108120000_recebimentos/migration.sql`
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/src/utils/cifra.ts`
- Modify: `backend/src/modules/googleAgenda/googleAgenda.crypto.ts`
- Create: `backend/src/modules/recebimentos/recebimentos.types.ts`
- Create: `backend/src/modules/recebimentos/recebimentos.rules.ts`
- Test: `backend/src/__tests__/recebimentosRules.test.ts`

**Interfaces:**
- Produces:
  - Modelos Prisma `ConexaoRecebimento` e `CobrancaSinal`.
  - `cifrarCom(chave: Buffer, texto: string): string` e `decifrarCom(chave: Buffer, cifrado: string): string`.
  - Tipos `GatewayId = 'mercadopago'`, `FormaSinal = 'pix' | 'cartao'`, `SituacaoCobranca`, `PagamentoGateway`.
  - `recebimentosConfigurado(): boolean`, `chaveRecebimentos(): Buffer`, `assinarEstado(userId, gateway, agora?)`, `lerEstado(estado, agora?)`, `verificadorPkce(nonce): string`, `desafioPkce(verificador): string`, `centavos(v: unknown): number`, `decidirPagamento(entrada): Decisao`, `tokenPertoDeVencer(expiraEm, agora): boolean`.

- [ ] **Step 1: Escrever os testes das regras**

```ts
const base = {
  cobranca: { id: 'c1', situacao: 'pendente', valor: '15.50', pagamentoExternoId: null },
  pagamento: { id: 'p1', status: 'approved', valor: 15.5, referencia: 'c1', formaPaga: 'pix' },
  reserva: { status: 'aguardando_pagamento', expiresAt: new Date(FUTURO) },
  outraCobrancaPaga: false, agora: new Date(AGORA),
};

it('confirma pagamento aprovado dentro do prazo, comparando em centavos', () => {
  expect(decidirPagamento(base)).toBe('confirmar');
});
it('ignora referência de outra cobrança', () => {
  expect(decidirPagamento({ ...base, pagamento: { ...base.pagamento, referencia: 'c2' } })).toBe('ignorar');
});
it('ignora valor diferente', () => {
  expect(decidirPagamento({ ...base, pagamento: { ...base.pagamento, valor: 15.49 } })).toBe('ignorar');
});
it('repetição do mesmo pagamento não faz nada', () => {
  expect(decidirPagamento({ ...base, cobranca: { ...base.cobranca, situacao: 'paga', pagamentoExternoId: 'p1' } })).toBe('ignorar');
});
it('reserva vencida, ainda aguardando ou cancelada pela rotina, tenta reativar', () => {
  const vencida = { status: 'aguardando_pagamento', expiresAt: new Date(PASSADO) };
  expect(decidirPagamento({ ...base, reserva: vencida })).toBe('reativar');
  expect(decidirPagamento({ ...base, cobranca: { ...base.cobranca, situacao: 'expirada' }, reserva: { ...vencida, status: 'cancelado' } })).toBe('reativar');
});
it('cancelada por pessoa nunca reativa', () => {
  expect(decidirPagamento({ ...base, reserva: { status: 'cancelado', expiresAt: new Date(FUTURO) } })).toBe('alertar_atrasado');
});
it('já confirmada, ou com outra cobrança paga, alerta duplicidade', () => {
  expect(decidirPagamento({ ...base, reserva: { status: 'confirmado', expiresAt: null } })).toBe('alertar_duplicado');
  expect(decidirPagamento({ ...base, outraCobrancaPaga: true })).toBe('alertar_duplicado');
});
it('mapeia recusa, devolução e contestação', () => {
  const paga = { ...base.cobranca, situacao: 'paga', pagamentoExternoId: 'p1' };
  expect(decidirPagamento({ ...base, pagamento: { ...base.pagamento, status: 'rejected' } })).toBe('marcar_recusada');
  expect(decidirPagamento({ ...base, cobranca: paga, pagamento: { ...base.pagamento, status: 'refunded' } })).toBe('marcar_devolvida');
  expect(decidirPagamento({ ...base, cobranca: paga, pagamento: { ...base.pagamento, status: 'charged_back' } })).toBe('marcar_contestada');
});
it('centavos aceita Decimal, texto e número', () => {
  expect(centavos('15.50')).toBe(1550);
  expect(centavos(15.5)).toBe(1550);
  expect(centavos(new Prisma.Decimal('15.50'))).toBe(1550);
  expect(centavos(19.99)).toBe(1999);
});
it('renova a menos de 30 dias do vencimento', () => {
  expect(tokenPertoDeVencer(new Date(AGORA + 29 * DIA), new Date(AGORA))).toBe(true);
  expect(tokenPertoDeVencer(new Date(AGORA + 31 * DIA), new Date(AGORA))).toBe(false);
});
it('estado assinado vale uma vez e recusa adulteração', () => {
  const estado = assinarEstado('u1', 'mercadopago', AGORA);
  expect(lerEstado(`${estado}x`, AGORA)).toBeNull();
  expect(lerEstado(estado, AGORA)?.userId).toBe('u1');
  expect(lerEstado(estado, AGORA)).toBeNull();
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test --prefix backend -- src/__tests__/recebimentosRules.test.ts`
Expected: FAIL, módulo inexistente.

- [ ] **Step 3: Escrever a migração e os modelos**

Tabelas `conexoes_recebimento` e `cobrancas_sinal` com os campos da spec. Acrescentar `ultimo_alerta_em` (timestamptz) em `conexoes_recebimento`, e três campos em `cobrancas_sinal`, necessários para retomar a cobrança na volta do Checkout: `codigo_pix` (text), `checkout_url` (text) e `vence_em` (timestamptz, o vencimento enviado ao gateway).

Tokens em `access_token_cifrado` e `refresh_token_cifrado`. Índice único em (`gateway`, `pagamento_externo_id`), índices em `appointment_id`, em (`situacao`, `vence_em`) e em (`gateway`, `conta_externa_id`). FKs com `ON DELETE CASCADE` para `businesses` e `appointments`. As duas tabelas com `ENABLE ROW LEVEL SECURITY`, como em `20261105120000_depoimentos`.

Rodar `npx prisma generate` e `npx prisma validate` no backend.

- [ ] **Step 4: Implementar `cifra.ts` e fazer o Google delegar**

Mover o corpo de `cifrar` e `decifrar` para `cifrarCom` e `decifrarCom`. As assinaturas de `googleAgenda.crypto.ts` não mudam.

- [ ] **Step 5: Implementar tipos e regras**

`chaveRecebimentos` lê `RECEBIMENTOS_TOKEN_KEY` (32 bytes em base64). `recebimentosConfigurado` exige as quatro variáveis da spec. `assinarEstado` e `lerEstado` seguem `assinarState` e `lerState` do Google, com HMAC derivado dessa chave, validade de 10 minutos e nonce de uso único, e devolvem `{ userId, gateway, nonce }`.

`verificadorPkce(nonce)` é o HMAC-SHA256 de `pkce:${nonce}` em base64url, para o verificador sobreviver a um reinício sem guardar estado.

`decidirPagamento` retorna `Decisao`: `ignorar`, `confirmar`, `reativar`, `alertar_atrasado`, `alertar_duplicado`, `marcar_recusada`, `marcar_devolvida` ou `marcar_contestada`. Ordem de avaliação:

1. Referência diferente: `ignorar`.
2. `refunded` ou `charged_back`: marca, se a cobrança estiver `paga`. Senão, `ignorar`.
3. `rejected`: `marcar_recusada`, se a cobrança não estiver `paga`. Senão, `ignorar`.
4. Qualquer outro status que não seja `approved`: `ignorar`.
5. Valor diferente em centavos: `ignorar`.
6. Cobrança `paga` com o mesmo pagamento: `ignorar`. Com outro pagamento: `alertar_duplicado`.
7. `outraCobrancaPaga` ou reserva em `confirmado`, `em_atendimento` ou `concluido`: `alertar_duplicado`.
8. Reserva `aguardando_pagamento` no prazo: `confirmar`.
9. Reserva `aguardando_pagamento` vencida: `reativar`.
10. Reserva `cancelado` com cobrança `expirada`: `reativar`.
11. Demais: `alertar_atrasado`.

Cobrança `expirada` com reserva `cancelado` identifica o cancelamento por vencimento, porque a Task 6 marca os dois juntos na rotina. Assim, não é preciso coluna nova na reserva.

- [ ] **Step 6: Rodar os testes de regras e do Google**

Run: `npm test --prefix backend -- src/__tests__/recebimentosRules.test.ts src/__tests__/googleAgendaCrypto.test.ts`
Expected: PASS. `googleAgendaCrypto.test.ts` é instável em cerca de 1 a cada 256 rodadas: repetir antes de investigar.

- [ ] **Step 7: Commit**

```bash
git add backend/prisma backend/src/utils/cifra.ts backend/src/modules/googleAgenda/googleAgenda.crypto.ts backend/src/modules/recebimentos backend/src/__tests__/recebimentosRules.test.ts
git commit -m "feat(recebimentos): tabelas, cifra e regras de decisão do pagamento"
```

### Task 3: Adaptador do Mercado Pago

**Files:**
- Create: `backend/src/modules/recebimentos/gateways/tipos.ts`
- Create: `backend/src/modules/recebimentos/gateways/mercadoPago.ts`
- Create: `backend/src/modules/recebimentos/gateways/index.ts`
- Test: `backend/src/__tests__/recebimentosMercadoPago.test.ts`

**Interfaces:**
- Consumes: resultado da Task 1, tipos da Task 2.
- Produces:

```ts
export class GatewayTokenInvalido extends Error {}
export class GatewayIndisponivel extends Error {}
/** O gateway recusou a cobrança (4xx que não é 401), como conta sem chave Pix. */
export class GatewayRecusou extends Error {}

export interface Tokens { accessToken: string; refreshToken: string; expiraEm: Date; contaId: string }
export interface NovaCobranca {
  cobrancaId: string; valor: number; descricao: string; venceEm: Date;
  pagadorEmail: string;
}
export interface Gateway {
  urlAutorizacao(estado: string, desafio: string): string;
  trocarCodigo(codigo: string, verificador: string): Promise<Tokens>;
  renovar(refreshToken: string): Promise<Tokens>;
  conta(accessToken: string): Promise<{ id: string; nome: string }>;
  criarPix(accessToken: string, c: NovaCobranca): Promise<{ idExterno: string; codigoPix: string }>;
  criarCheckoutCartao(accessToken: string, c: NovaCobranca, voltas: { sucesso: string; pendente: string; falha: string }): Promise<{ idExterno: string; checkoutUrl: string }>;
  referenciaDoRecurso(accessToken: string, recurso: { tipo: 'order' | 'payment'; id: string }): Promise<string | null>;
  buscarPorReferencia(accessToken: string, cobrancaId: string): Promise<PagamentoGateway[]>;
}
export const gateways: Record<GatewayId, Gateway>;
```

- [ ] **Step 1: Escrever os testes com `fetch` simulado**

Nomes e asserções:

- `criarPix`: faz `POST /v1/orders` com `type: 'online'`, `processing_mode: 'automatic'`, `total_amount: '15.50'`, `external_reference` igual a `cobrancaId`, `payer.email`, `transactions.payments[0]` com `amount: '15.50'`, `payment_method: { id: 'pix', type: 'bank_transfer' }` e `expiration_time: 'PT15M'`, cabeçalho `X-Idempotency-Key` igual a `cobrancaId` e token em `Authorization`. Devolve `transactions.payments[0].payment_method.qr_code` como `codigoPix` e o `id` da ordem como `idExterno`.
- `criarPix`: não envia `notification_url`, que a API recusa com 400.
- `criarPix`: nunca envia o token na URL.
- `criarCheckoutCartao`: faz `POST /checkout/preferences` com `back_urls`, `auto_return: 'approved'`, `external_reference`, `expires: true`, `expiration_date_to`, `payment_methods.installments: 1` e `excluded_payment_types` com `ticket`, `bank_transfer`, `atm` e `digital_currency`. Devolve `init_point`.
- `buscarPorReferencia`: faz `GET /v1/payments/search?external_reference=` e traduz `id` (numérico, como texto), `transaction_amount`, `status`, `external_reference` e `payment_type_id` (`credit_card` vira `credito`, `debit_card` vira `debito`, `bank_transfer` vira `pix`).
- `referenciaDoRecurso`: `order` lê `GET /v1/orders/:id`, e `payment` lê `GET /v1/payments/:id`. Recurso inexistente devolve `null`.
- 401 lança `GatewayTokenInvalido`. 5xx, 429 e estouro de tempo lançam `GatewayIndisponivel`. Outros 4xx lançam `GatewayRecusou`.
- Cada chamada usa `AbortSignal.timeout(8000)`.
- `renovar` usa `grant_type=refresh_token` e devolve o novo `refreshToken`, com `expiraEm` calculado por `expires_in`.

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test --prefix backend -- src/__tests__/recebimentosMercadoPago.test.ts`
Expected: FAIL, módulo inexistente.

- [ ] **Step 3: Implementar**

Base `https://api.mercadopago.com` e autorização em `https://auth.mercadopago.com/authorization`, com `code_challenge_method=S256`. `expiration_time` é calculado em minutos a partir de `venceEm`. Valores na ordem vão como texto com duas casas.

- [ ] **Step 4: Rodar os testes**

Run: `npm test --prefix backend -- src/__tests__/recebimentosMercadoPago.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/recebimentos/gateways backend/src/__tests__/recebimentosMercadoPago.test.ts
git commit -m "feat(recebimentos): adaptador do Mercado Pago"
```

### Task 4: Conexão do negócio

**Files:**
- Create: `backend/src/modules/recebimentos/recebimentos.repository.ts`
- Create: `backend/src/modules/recebimentos/conexao.service.ts`
- Create: `backend/src/modules/recebimentos/recebimentos.controller.ts`
- Create: `backend/src/modules/recebimentos/recebimentos.routes.ts`
- Modify: `backend/src/server.ts`, `backend/src/services/cronService.ts`, `backend/.env.example`
- Modify: `backend/src/modules/notifications/notifications.types.ts`, `frontend/src/lib/notifications.ts`, `frontend/src/components/shell/NotificationsPanel.tsx`
- Test: `backend/src/__tests__/recebimentosConexao.test.ts`

**Interfaces:**
- Consumes: `gateways`, regras da Task 2.
- Produces:
  - `conexaoService.tokenAtivo(businessId): Promise<{ gateway: GatewayId; accessToken: string } | null>`
  - `conexaoService.formas(businessId): Promise<FormaSinal[]>`, que devolve `['pix']` sem conexão ativa e nunca lança.
  - `conexaoService.marcarReconectar(businessId, motivo): Promise<void>`
  - `conexaoService.renovarVencendo(agora?): Promise<void>`
  - `conexaoService.alertarRecusa(businessId): Promise<void>`, no máximo um alerta a cada 24 horas por `ultimo_alerta_em`
  - `conexaoService.porContaExterna(gateway, contaId): Promise<{ businessId: string } | null>`
  - Notificação nova `recebimento_alerta`.
  - Rotas em `/api/v1/recebimentos`:

| Rota | Quem | Faz |
|---|---|---|
| `GET /conexoes` | dono | `EstadoRecebimentos` |
| `GET /:gateway/conectar` | dono | `{ url }` |
| `GET /:gateway/callback` | público, com limitador | redireciona para a tela |
| `POST /:gateway/confirmar` | dono | body `{ t }`, grava a conexão |
| `PUT /:gateway/formas` | dono | body `{ aceitaPix, aceitaCartao, aceiteCartao? }` |
| `DELETE /:gateway/conexao` | dono | apaga a conexão |

```ts
export interface EstadoRecebimentos {
  configurado: boolean;
  conexao: {
    gateway: GatewayId; situacao: 'ativa' | 'precisa_reconectar'; contaNome: string;
    aceitaPix: boolean; aceitaCartao: boolean; aceiteCartaoEm: string | null;
    ultimaConfirmacaoEm: string | null; reservasPendentes: number;
  } | null;
}
```

- [ ] **Step 1: Escrever os testes**

- `conectarUrl` devolve 404 sem configuração e inclui `code_challenge`.
- `callback` com estado inválido, sem código ou com falha na troca redireciona para `...?recebimento=erro` e não lança.
- `callback` válido redireciona para `/dashboard/configuracoes/recebimentos/mercadopago?recebimento=confirmar&t=...`, e o token não aparece na URL.
- `confirmar` recusa quando o usuário logado é outro, como no Google.
- `confirmar` grava tokens cifrados: o valor no repositório é diferente do token e `decifrar` devolve o original.
- `formas` recusa as duas desligadas, e recusa ligar cartão sem `aceiteCartao` nem aceite salvo.
- `desconectar` apaga a conexão e mantém as cobranças.
- `verConexao` nunca devolve campo com token: `expect(JSON.stringify(estado)).not.toMatch(/token/i)`.
- `alertarRecusa` notifica uma vez e não repete antes de 24 horas.
- `renovarVencendo` salva o novo `refreshToken`. Com `GatewayTokenInvalido`, marca `precisa_reconectar` e notifica `recebimento_alerta`. Com `GatewayIndisponivel`, não muda nada e tenta no próximo dia.
- Papéis: `employee` e `professional` recebem 403 nas rotas do dono.

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test --prefix backend -- src/__tests__/recebimentosConexao.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar**

Seguir `googleAgenda.service.ts` para `conectar`, `callback` e `confirmar`, com `pendentes` em memória por 10 minutos. `callback` usa `verificadorPkce(nonce)`.

Ao confirmar, chamar `conta`. A conexão nova nasce com `aceita_pix = true` e `aceita_cartao = false`.

No `server.ts`, montar `recebimentosRoutes` em `${API_V1}/recebimentos` e adicionar `${API_V1}/recebimentos/webhook` a `webhookPaths`. No `cronService.ts`, rodar `renovarVencendo` às `0 4 * * *`. Documentar as quatro variáveis no `.env.example`.

- [ ] **Step 4: Rodar os testes e o `tsc`**

Run: `npm test --prefix backend -- src/__tests__/recebimentosConexao.test.ts` e `npm run typecheck --prefix backend`
Expected: PASS e nenhum erro.

- [ ] **Step 5: Commit**

```bash
git add backend/src backend/.env.example frontend/src/lib/notifications.ts frontend/src/components/shell/NotificationsPanel.tsx
git commit -m "feat(recebimentos): conexão do negócio com o Mercado Pago"
```

### Task 5: Confirmação única do sinal

**Files:**
- Create: `backend/src/modules/appointments/sinalConfirmado.ts`
- Modify: `backend/src/modules/appointments/appointments.service.ts`
- Test: `backend/src/__tests__/sinalConfirmado.test.ts`

**Interfaces:**
- Produces: `avisarSinalConfirmado(a: AppointmentWithRelations): Promise<void>`, que nunca lança. `avisarProfissional` passa a ser exportada do novo arquivo, sem que ele importe `appointments.service.ts`.

- [ ] **Step 1: Escrever o teste**

`avisarSinalConfirmado` envia a mesma mensagem de hoje, com `origin: 'pix_recibo'`, notifica `pagamento_confirmado`, avisa o profissional e sincroniza a agenda. Falha no WhatsApp não impede a notificação.

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test --prefix backend -- src/__tests__/sinalConfirmado.test.ts`
Expected: FAIL.

- [ ] **Step 3: Extrair de `updateStatus`, sem mudar texto nem comportamento do botão manual**

- [ ] **Step 4: Rodar os testes existentes da agenda**

Run: `npm test --prefix backend -- src/__tests__/sinalConfirmado.test.ts src/__tests__/appointmentStatusFlow.test.ts src/__tests__/appointmentStatusTransitions.test.ts src/__tests__/appointmentsPush.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/appointments backend/src/__tests__/sinalConfirmado.test.ts
git commit -m "refactor(agenda): confirmação do sinal em função única"
```

### Task 6: Processar pagamentos: webhook e rede de segurança

**Files:**
- Create: `backend/src/modules/recebimentos/pagamentos.service.ts`
- Modify: `backend/src/modules/recebimentos/recebimentos.repository.ts`, `recebimentos.controller.ts`, `recebimentos.routes.ts`
- Modify: `backend/src/services/cronService.ts`
- Modify: `backend/src/modules/appointments/appointments.service.ts`
- Test: `backend/src/__tests__/recebimentosPagamentos.test.ts`, `backend/src/__tests__/expirePendingAppointmentsCron.test.ts`

**Interfaces:**
- Consumes: `decidirPagamento`, `conexaoService`, `gateways`, `avisarSinalConfirmado`, `withProfessionalDayLock`, `hasConflict`.
- Produces:
  - `pagamentosService.processarAviso(aviso: { contaId: string; tipo: 'order' | 'payment'; recursoId: string }): Promise<void>`, que nunca lança.
  - `pagamentosService.processarCobranca(cobrancaId: string): Promise<void>`, que busca os pagamentos por referência e aplica `decidirPagamento`. É o caminho comum do aviso e da rotina.
  - `pagamentosService.conferirPendentes(agora?: Date): Promise<void>`
  - `recebimentosRepository.marcarPagaEConfirmar(cobrancaId, pagamento): Promise<{ confirmou: boolean }>`
  - `recebimentosRepository.reservaDaCobranca(cobrancaId)`
  - `POST /api/v1/recebimentos/webhook/mercadopago`

- [ ] **Step 1: Escrever os testes**

- Aviso aprovado dentro do prazo confirma e chama `avisarSinalConfirmado` uma vez.
- O corpo do aviso nunca é usado como prova: pagamento que a busca devolve como `pending` não confirma.
- Aviso de `user_id` sem conexão não faz nada.
- Aviso cuja referência é cobrança de outro negócio não confirma.
- Aviso `order` e rotina veem o mesmo pagamento com o mesmo id numérico: nenhum alerta de duplicidade.
- Dois `processarAviso` simultâneos, com `marcarPagaEConfirmar` devolvendo `confirmou: true` só no primeiro: `avisarSinalConfirmado` chamado uma vez.
- `P2002` no pagamento externo é tratado como repetição.
- Conexão apagada: `porContaExterna` nulo no aviso e `tokenAtivo` nulo na rotina não confirmam, registram `warn` e não lançam.
- `GatewayTokenInvalido` chama `marcarReconectar`.
- `reativar` com horário livre confirma, zera `expiresAt` e avisa.
- `reativar` com horário ocupado marca a cobrança como `paga`, mantém a reserva, notifica `recebimento_alerta` com nome e valor, e envia ao cliente "O negócio vai entrar em contato com você sobre o seu sinal".
- `alertar_duplicado` grava a cobrança como `paga` e notifica, sem mexer na reserva.
- `marcar_devolvida` e `marcar_contestada` notificam e não cancelam a reserva.
- `conferirPendentes` consulta cobranças `pendente` e `expirada` com `vence_em` até 30 minutos atrás, via `buscarPorReferencia`, e pula negócios sem conexão.
- Webhook: responde 200 antes de processar. Tipo diferente de `order` e `payment`, ou sem `user_id` ou `data.id`, responde 200 sem chamar o serviço. `user_id` numérico vira texto. Lê `data.id` do corpo ou da query.
- Em `expirePendingAppointmentsCron.test.ts`: a rotina marca as cobranças `pendente` das reservas vencidas como `expirada`, na mesma transação do cancelamento.
- Cancelar reserva com cobrança `paga` notifica `recebimento_alerta` com o lembrete de devolver, se for o caso.

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test --prefix backend -- src/__tests__/recebimentosPagamentos.test.ts src/__tests__/expirePendingAppointmentsCron.test.ts`
Expected: FAIL nos testes novos.

- [ ] **Step 3: Implementar `marcarPagaEConfirmar`**

Numa transação: `updateMany` da cobrança onde `situacao` é diferente de `paga`. Se nada mudou, devolve `confirmou: false`. Depois, `updateMany` da reserva com `status: 'aguardando_pagamento'` e `expiresAt > agora`. As mensagens saem depois da transação, e só para quem recebeu `confirmou: true`. Essa ordem aceita perder um aviso numa queda, mas nunca envia dois.

- [ ] **Step 4: Implementar o caminho de `reativar`**

Dentro de `withProfessionalDayLock`, chamar `hasConflict`. Com horário livre, atualizar a reserva onde `status` está em `aguardando_pagamento` ou `cancelado`, com `status: 'confirmado'` e `expiresAt: null`. Esse é o único lugar que sai de `cancelado`, e só chega aqui pela regra da Task 2.

- [ ] **Step 5: Implementar serviço, rota, rotina e aviso de cancelamento**

`conferirPendentes` roda a cada minuto, com `noOverlap: true`. O aviso de cancelamento fica numa função do repositório de recebimentos, chamada de `updateStatus` quando `newStatus === 'cancelado'`, sem importar `pagamentos.service.ts`. Isso evita ciclo entre os módulos.

- [ ] **Step 6: Rodar os testes**

Run: `npm test --prefix backend -- src/__tests__/recebimentosPagamentos.test.ts src/__tests__/expirePendingAppointmentsCron.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/src
git commit -m "feat(recebimentos): confirmação automática por webhook e rotina"
```

### Task 7: Reserva pública com cobrança automática

**Files:**
- Create: `backend/src/modules/recebimentos/cobrancas.service.ts`
- Modify: `backend/src/modules/publicBooking/publicBooking.service.ts`, `publicBooking.repository.ts`, `publicBooking.types.ts`, `publicBooking.controller.ts`, `publicBooking.routes.ts`
- Test: `backend/src/__tests__/publicBookingCobranca.test.ts`

**Interfaces:**
- Consumes: `conexaoService`, `gateways`.
- Produces:
  - `cobrancasService.criar(entrada): Promise<CobrancaCriada | null>`, que devolve `null` em qualquer falha e nunca lança.
  - `CreatePublicAppointmentSchema` ganha `formaPagamento: z.enum(['pix', 'cartao']).optional()`, com padrão `pix`.
  - Resposta da criação: `{ appointmentId, depositAmount, pixPayload: string | null, checkoutUrl: string | null, forma: FormaSinal, automatica: boolean, cartaoIndisponivel: boolean, expiresAt }`.
  - `Storefront` ganha `formasPagamento: FormaSinal[]`.
  - `GET /public/:slug/appointments/:id/status` passa a devolver:

```ts
{
  situacao: SituacaoReserva;
  reserva: {
    servico: { name: string; price: number; durationMinutes: number };
    profissional: string | null; data: string; horario: string; sinal: number;
    forma: FormaSinal; pixPayload: string | null; checkoutUrl: string | null; expiresAt: string | null;
  };
}
```

  - `POST /public/:slug/appointments/:id/pix`, com limitador de 10 pedidos em 15 minutos por IP. Devolve `{ pixPayload, forma: 'pix', expiresAt }`.

- [ ] **Step 1: Escrever os testes**

- Sem conexão: resposta igual à de hoje, com `pixPayload` do `buildPixPayload` e `automatica: false`.
- Conexão e Pix: `pixPayload` vem do gateway, `automatica: true`, e a cobrança nasce `pendente`.
- Conexão e cartão: `checkoutUrl` preenchido, `pixPayload` nulo, e o WhatsApp com código Pix não é disparado.
- `GatewayRecusou` no Pix chama `alertarRecusa`. `GatewayIndisponivel` não chama.
- Gateway lança erro no Pix: reserva criada com o código manual, sem cobrança. Teste com a trava: `criar` só é chamado depois de `withProfessionalDayLock` terminar.
- Gateway lança erro no cartão: reserva criada, `forma: 'pix'`, `cartaoIndisponivel: true`, código manual.
- Cartão pedido sem o negócio liberar: `ValidationError` antes de criar a reserva.
- Voltas do Checkout: `${FRONTEND_URL}/agendar/${slug}?reserva=${id}&retorno=sucesso`, `pendente` e `falha`.
- `pagadorEmail` é `reserva-${cobrancaId}@${dominio}`, com o domínio de `FRONTEND_URL` sem `www`.
- `/status` não devolve nome, telefone nem e-mail: `expect(JSON.stringify(r)).not.toContain('Maria')`, com um cliente chamado Maria no mock.
- `/pix` em reserva vencida ou confirmada dá 409.
- `/pix` repetido devolve o mesmo código, sem criar outra cobrança Pix.
- `/pix` com gateway fora do ar devolve o código manual.
- `getStorefront` devolve `['pix']` quando `formas` falha.

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test --prefix backend -- src/__tests__/publicBookingCobranca.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar**

`buildPixPayload` continua rodando antes da reserva, como validação e plano B. `cobrancasService.criar` roda depois de `withProfessionalDayLock`, cria a linha `pendente` para ter o id, chama o gateway e grava `id_externo`, `codigo_pix`, `checkout_url` e `vence_em`. Em falha, apaga a linha e devolve `null`.

`aoCriarReservaComSinal` recebe o código do gateway no Pix e não é chamado no cartão. Atualizar os mocks de `publicBooking.test.ts` e `publicBookingFase2.test.ts` que o `formas` e o `/status` quebrarem.

- [ ] **Step 4: Rodar os testes da reserva pública**

Run: `npm test --prefix backend -- src/__tests__/publicBookingCobranca.test.ts src/__tests__/publicBooking.test.ts src/__tests__/publicBookingFase2.test.ts src/__tests__/publicBookingConsent.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src
git commit -m "feat(recebimentos): cobrança automática na reserva pública"
```

### Task 8: Tela de Recebimentos e tela de passos

**Files:**
- Create: `frontend/src/app/api/recebimentos/[...path]/route.ts`
- Create: `frontend/src/lib/recebimentos.ts`
- Create: `frontend/src/components/recebimentos/catalogo.ts`
- Create: `frontend/src/components/recebimentos/GatewayLogo.tsx`
- Create: `frontend/src/components/recebimentos/GatewayPassos.tsx`
- Create: `frontend/src/components/settings/RecebimentosSection.tsx`
- Create: `frontend/src/app/dashboard/configuracoes/recebimentos/[gateway]/page.tsx`
- Create: `frontend/public/images/gateways/` com as quatro logos
- Modify: `frontend/src/components/SettingsModule.tsx`
- Test: `frontend/src/components/recebimentos/__tests__/GatewayPassos.test.tsx`, `frontend/src/components/settings/__tests__/RecebimentosSection.test.tsx`

**Interfaces:**
- Consumes: rotas e `EstadoRecebimentos` da Task 4.
- Produces:

```ts
export interface GatewayCatalogo {
  id: string; nome: string; logo: string; situacao: 'disponivel' | 'em_breve';
  conexao: 'autorizacao' | 'chave' | 'usuario';
  passos: Array<{ titulo: string; texto: string; links?: Array<{ rotulo: string; url: string }> }>;
  avisos: string[]; campos?: Array<{ id: string; rotulo: string; ajuda: string }>;
}
export const GATEWAYS: GatewayCatalogo[];
```

- [ ] **Step 1: Escrever os testes**

`RecebimentosSection`:
- Não renderiza para quem não é `tenant_admin` nem com `configurado: false`.
- Mostra as quatro logos com `alt` do nome. Só Mercado Pago é link, e os demais mostram "Em breve".
- Mostra a situação "Conectado" quando há conexão.

`GatewayPassos`:
- Sem conexão: mostra os cinco passos da spec, os avisos de taxa e o botão "Conectar com o Mercado Pago".
- O clique busca `/recebimentos/mercadopago/conectar` e navega para a `url`.
- `?recebimento=confirmar&t=x` chama `confirmar` e limpa a URL. `?recebimento=erro` mostra erro.
- Conectado: mostra conta, formas e última confirmação.
- Ligar cartão exige marcar o aceite do aviso de contestação.
- Desligar as duas formas é recusado na tela.
- `precisa_reconectar`: mostra "Reconectar".
- Desconectar pede confirmação com o número de reservas pendentes.
- Gateway inexistente na URL mostra "Gateway não encontrado".

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/components/recebimentos src/components/settings/__tests__/RecebimentosSection.test.tsx --testTimeout=60000` em `frontend`
Expected: FAIL.

- [ ] **Step 3: Baixar as logos oficiais**

Usar os kits de marca de cada empresa, sem redesenhar. Se algum kit não estiver disponível, ou as regras de uso proibirem, parar e perguntar ao dono. Registrar a origem de cada logo no `SEGUIMENTO.md` na Task 11.

- [ ] **Step 4: Implementar**

Proxy com `catchAllProxy('recebimentos')`. Usar `Button`, `Card`, `Banner`, `Modal`, `Switch` e `Skeleton` de `@/components/ui`, seguindo `GoogleAgendaCard.tsx`. `RecebimentosSection` entra em `SettingsModule` logo depois de `GoogleAgendaSection`. Os textos de taxa vêm da Task 1, com link para a tabela do Mercado Pago, sem valores fixos que possam envelhecer.

Textos fixos dos avisos:

- "As taxas são cobradas pelo Mercado Pago e saem do valor do sinal."
- "No cartão, o dinheiro pode levar mais tempo para ficar disponível."
- "No cartão, o cliente pode contestar a compra no banco, e o valor pode voltar para ele."

- [ ] **Step 5: Rodar os testes**

Run: mesmo comando do Step 2.
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src frontend/public/images/gateways
git commit -m "feat(recebimentos): tela de gateways e passos da conexão"
```

### Task 9: Página pública com escolha de forma e volta do Checkout

**Files:**
- Create: `frontend/src/components/publicBooking/EscolhaFormaPagamento.tsx`
- Modify: `frontend/src/lib/publicBooking.ts`
- Modify: `frontend/src/components/publicBooking/PublicBookingFlow.tsx`
- Modify: `frontend/src/components/publicBooking/ConfirmacaoReserva.tsx`
- Test: `frontend/src/components/publicBooking/__tests__/PublicBookingCartao.test.tsx`, `frontend/src/components/publicBooking/__tests__/PublicBookingFlow.test.tsx`

**Interfaces:**
- Consumes: contrato da Task 7.
- Produces: `publicBookingApi.getAppointmentStatus` passa a devolver `{ situacao, reserva }`. Nova `publicBookingApi.trocarParaPix(slug, id)`. `ConfirmacaoReserva` ganha `forma: 'pix' | 'cartao'` e aceita `cliente` vazio.

- [ ] **Step 1: Escrever os testes**

- Só Pix liberado: nenhuma escolha aparece, e o fluxo fica igual ao de hoje.
- Pix e cartão: escolha aparece com Pix marcado e primeiro.
- Cartão: `createAppointment` recebe `formaPagamento: 'cartao'`, e a página navega para `checkoutUrl`.
- `cartaoIndisponivel: true`: mostra "O pagamento com cartão está indisponível agora. Use o Pix para garantir seu horário." junto do código.
- Rótulos: "Sinal cartão" e "Sinal pago no cartão" quando `forma` for `cartao`.
- Abrir `?reserva=id&retorno=sucesso` sem nenhum estado anterior: busca `/status` e mostra a confirmação sem saudação por nome.
- `retorno=pendente` com `situacao: aguardando`: mostra "Estamos aguardando a confirmação do pagamento" e segue consultando.
- `retorno=falha` com `situacao: aguardando`: mostra "Tentar de novo", que abre `checkoutUrl`, e "Pagar com Pix", que chama `trocarParaPix` e mostra o QR Code.
- `?reserva=id` com `situacao: expirado`: mostra `ReservaEncerrada`, nunca a tela de pagamento.
- `?reserva=id` inexistente: abre a página normal, com aviso.
- O `sessionStorage` não é usado para remontar a reserva.

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/components/publicBooking --testTimeout=60000` em `frontend`
Expected: FAIL nos testes novos.

- [ ] **Step 3: Implementar**

`PublicBookingFlow` lê `reserva` e `retorno` na montagem e preenche `pixResult` e os dados da tela pelo `/status`. A escolha de forma fica na seção de dados, antes do envio. Remontar a tela não depende de `selectedService`, porque o resumo vem de `reserva`.

- [ ] **Step 4: Rodar os testes**

Run: mesmo comando do Step 2.
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src
git commit -m "feat(recebimentos): cartão e volta do Checkout na página pública"
```

### Task 10: Aguardando Pix, Caixa e ficha do cliente

**Files:**
- Modify: `backend/src/modules/appointments/appointments.service.ts`, `appointments.controller.ts`
- Modify: `backend/src/modules/cash/cash.service.ts`, `cash.repository.ts`, `cash.types.ts`
- Modify: `backend/src/modules/crm/crm.service.ts`
- Modify: `frontend/src/components/appointments/PendingPaymentList.tsx`, `frontend/src/lib/caixa.ts`
- Test: `backend/src/__tests__/cashService.test.ts`, `backend/src/__tests__/appointments.test.ts`, `frontend/src/components/appointments/__tests__/PendingPaymentList.test.tsx`

**Interfaces:**
- Consumes: `CobrancaSinal`.
- Produces: `GET /appointments/pending-payment` devolve `cobranca_automatica: boolean` em cada item. `CashDayDto['formas']` ganha a chave `sinal_cartao`.

- [ ] **Step 1: Escrever os testes**

- `pending-payment`: `cobranca_automatica` é `true` com cobrança `pendente` e `false` sem ela.
- `PendingPaymentList`: mostra o selo "Automático" e mantém o botão manual.
- Caixa: sinal com cobrança `paga` de forma `cartao` soma em `sinal_cartao`, e não em `sinal_pix`. Sinal sem cobrança e sinal Pix automático ficam em `sinal_pix`. O total do dia não muda.
- Ficha do cliente: o texto usa "Sinal no cartão de R$ ..." quando a cobrança paga for de cartão.

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test --prefix backend -- src/__tests__/cashService.test.ts src/__tests__/appointments.test.ts`
Expected: FAIL nos testes novos.

- [ ] **Step 3: Implementar**

Buscar as cobranças pagas de cartão por lista de `appointmentId`, numa consulta só em cada serviço. Em `frontend/src/lib/caixa.ts`, adicionar `sinal_cartao` com o rótulo "Sinais cartão". Conferir o PDF do Caixa e os relatórios que percorrem `formas`.

- [ ] **Step 4: Rodar os testes**

Run: comando do Step 2 e `npx vitest run src/components/appointments/__tests__/PendingPaymentList.test.tsx --testTimeout=60000` em `frontend`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src frontend/src
git commit -m "feat(recebimentos): selo automático e sinal no cartão no Caixa e na ficha"
```

### Task 11: Guia, documentação e conferência final

**Files:**
- Create: `docs/mercado-pago-configuracao.md`
- Modify: `docs/ROADMAP.md`, `docs/design/SEGUIMENTO.md`, `docs/FUNCIONALIDADES.md`

- [ ] **Step 1: Escrever o guia do dono da EasyAgenda+**

Criar a aplicação, URL de retorno, webhook com os tópicos `order` e `payment`, as quatro variáveis no Render, como gerar `RECEBIMENTOS_TOKEN_KEY`, migração, teste real com valor baixo e troca de domínio. Avisar que `RECEBIMENTOS_TOKEN_KEY` não pode mudar depois de haver conexões, porque os tokens deixam de abrir.

- [ ] **Step 2: Atualizar roadmap, funcionalidades e seguimento**

Incluir pendências: testes em produção, Asaas, InfinitePay e PagBank, devolução automática e Clube. Corrigir a linha da confirmação manual do sinal.

- [ ] **Step 3: Rodar tudo**

Run, sem servidor local no ar: `npm run typecheck --prefix backend`, `npm test --prefix backend`, `npx tsc --noEmit` e `npx vitest run --testTimeout=60000` em `frontend`.
Expected: nenhum erro, e a linha "Tests" aparece nas duas suítes.

- [ ] **Step 4: Conferência visual local**

Com o mock em node na porta 5000 e `next dev` em porta diferente da 3000, conferir no computador e no celular: Ajustes, tela de passos conectada e sem conexão, escolha de forma, volta `sucesso`, `pendente` e `falha`, e Aguardando Pix. Partir de `/dashboard/configuracoes`, porque telas com mock genérico podem cair no ErrorBoundary.

- [ ] **Step 5: Teste completo no ambiente de testes do Mercado Pago**

Conectar pela autorização com PKCE, reservar com Pix (`payer.first_name: 'APRO'` aprova) e cartão de teste, e simular aviso perdido. Registrar em `docs/design/mercado-pago-verificacoes.md` se o aviso de conta conectada chegou e se o débito apareceu no Checkout. No teste real, confirmar que o endereço técnico do pagador é aceito. Se for recusado, parar e levar a decisão ao dono.

- [ ] **Step 6: Commit e PR**

```bash
git add docs
git commit -m "docs(recebimentos): guia do Mercado Pago, roadmap e seguimento"
git push -u origin feat/recebimentos-mercado-pago
```

Abrir o PR para a `main`, avisando que a migração `20261108120000_recebimentos` precisa de autorização e deve ser aplicada antes do deploy do backend. Se as variáveis não estiverem no Render, a seção fica escondida, mas as consultas às tabelas novas continuam rodando na reserva pública.
