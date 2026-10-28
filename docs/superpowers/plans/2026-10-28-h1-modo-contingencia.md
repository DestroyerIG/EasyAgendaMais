# H1: Modo de contingência (plano de implementação)

> **Para agentes:** SUB-SKILL OBRIGATÓRIA: use superpowers:subagent-driven-development (recomendado) ou superpowers:executing-plans para implementar este plano tarefa por tarefa. Os passos usam checkbox (`- [ ]`) para acompanhamento.

**Objetivo:** quando a cobrança de quem já pagou falha, o negócio entra numa carência de 7 dias com o painel em leitura, os atendimentos de hoje liberados, os envios automáticos de marketing pausados, o link público e o robô sem agendamento novo, o backup sempre disponível e uma tela de pagamento fiel ao Stitch. Depois da carência, o bloqueio vale em todos os canais.

**Arquitetura:**
- Uma regra pura (`calcularEstadoConta`) decide o estado da conta (`ativa`, `carencia` ou `bloqueada`) a partir do status, de `inadimplente_desde`, de "já pagou" e do fim do período.
- O middleware de autenticação, a vitrine pública, o robô, a fila e as rotinas consultam o mesmo serviço (`estadoContaService`).
- `inadimplente_desde` é mantido por um trigger no banco. Assim, os vários pontos que gravam `subscription_status` não precisam mudar.

**Tecnologia:** Express + Prisma (SQL cru onde o projeto já usa), Vitest com repositórios mockados, Next.js (App Router) + Tailwind com tokens do DESIGN.md e Material Symbols, `jszip` para o backup.

**Spec:** `docs/superpowers/specs/2026-10-28-item-h-superadmin-contingencia-venda-design.md` (parte H1).

## Restrições globais

- Textos em português do Brasil, em frase normal com maiúscula só na primeira palavra.
- Prazo da carência: `CARENCIA_DIAS = 7`, em `backend/src/config/contingencia.ts`. É a fonte única, como `TRIAL_DAYS` em `config/trial.ts`.
- Status de contingência: `past_due`, `unpaid` e `pending`. Entram só negócios que já pagaram alguma vez.
- `pending` com o fim do período pago ainda no futuro continua `ativa`. É a cobrança Pix do mês seguinte gerada antes do vencimento (pendência da 2D no `SEGUIMENTO.md`).
- Origens da fila liberadas na carência: `lembrete`, `confirmacao`, `pix_recibo`, `sinal_pix`, `clube`. **(Decisão do plano:** `sinal_pix` e `clube` cobram compromissos que já existiam, como o lembrete.)
- Nada sobre pagamento atrasado aparece para a cliente final. Frase do link público e do robô: `A agenda online está pausada no momento. Fale direto com {nome do negócio} pelo WhatsApp.`
- Erro de escrita bloqueada: `402 SUBSCRIPTION_REQUIRED`, com `details.estado` (`'carencia'` ou `'bloqueada'`) e a mensagem `Disponível depois de regularizar a assinatura.` na carência.
- Frontend:
  - só tokens do DESIGN.md e ícones Material Symbols;
  - todo arquivo novo em `src/app/dashboard` ou `src/components` entra em `frontend/src/lib/themedPaths.ts`, senão o `themeCompliance.test.ts` reprova.
- Migração em produção só com autorização explícita do dono. O `backend/.env` aponta para produção: não rode `migrate deploy` nem `migrate dev` contra ele.
- O PR não abre ao fim deste plano. O dono pediu o PR só no final.

## Pontos de atenção na revisão

1. **Webhook de pagamento atrasado ou repetido.** `pending` → `active` → `pending` no mesmo dia não pode dar uma carência nova a cada volta: o trigger só grava a data quando ela está nula. Teste na Tarefa 1 (SQL) e na Tarefa 2 (regra).
2. **Stripe não grava `last_payment_date`.** "Já pagou" também precisa olhar `subscription_events` (`invoice.paid` com `amount_paid > 0`). Sem isso, toda cliente do cartão iria direto para "fim do teste". Teste na Tarefa 3.
3. **Rotas GET com efeito colateral ou rotas de escrita fora da lista.** Toda escrita fora da lista responde 402 na carência. Teste por tabela na Tarefa 4.
4. **Virada do dia no fuso do negócio.** "Atendimento de hoje" usa o fuso do negócio, não UTC. Às 22h em São Paulo, hoje ainda é hoje. Teste na Tarefa 5.
5. **O 402 da carência não pode redirecionar.** A dona clica em "Salvar" na carência e precisa ver a mensagem, não ser jogada para `/pagamento`. Teste na Tarefa 9.

---

### Tarefa 1: Coluna `inadimplente_desde` e trigger

**Arquivos:**
- Criar: `backend/prisma/migrations/20261030120000_contingencia/migration.sql`
- Modificar: `backend/prisma/schema.prisma` (model `Business`, depois de `subscriptionUpdatedAt`)

**Interfaces:**
- Produz: coluna `businesses.inadimplente_desde timestamptz NULL`, mapeada como `inadimplenteDesde DateTime? @map("inadimplente_desde") @db.Timestamptz(6)`.

- [ ] **Passo 1: escrever a migração**
  - `ALTER TABLE businesses ADD COLUMN IF NOT EXISTS inadimplente_desde timestamptz;`
  - Função `marcar_inadimplente_desde()` e trigger `BEFORE UPDATE OF subscription_status ON businesses FOR EACH ROW`:
    - se `NEW.subscription_status IN ('past_due','unpaid','pending')`: `NEW.inadimplente_desde := COALESCE(OLD.inadimplente_desde, now())`;
    - senão: `NEW.inadimplente_desde := NULL`.
  - Backfill: `UPDATE businesses SET inadimplente_desde = COALESCE(subscription_updated_at, now()) WHERE subscription_status IN ('past_due','unpaid','pending') AND inadimplente_desde IS NULL;`
  - Comentário no topo, no estilo das migrações anteriores: o trigger fica fora do `schema.prisma`, e todo `migrate dev` futuro deve ser conferido para não removê-lo (mesmo aviso dos índices do 2B e do 2C).
- [ ] **Passo 2: validar**
  - Rode `cd backend && npx prisma validate && npx prisma generate`.
  - Esperado: `The schema at prisma/schema.prisma is valid` e o client gerado sem erro.
- [ ] **Passo 3: registrar o aviso do trigger no `SEGUIMENTO.md`**, na seção nova "Item H1" (criada na Tarefa 12). Por ora, anote o texto no próprio commit.
- [ ] **Passo 4: commit:** `feat(contingencia): coluna inadimplente_desde mantida por trigger`

### Tarefa 2: Regra pura do estado da conta

**Arquivos:**
- Criar: `backend/src/config/contingencia.ts`
- Criar: `backend/src/modules/conta/estadoConta.rules.ts`
- Teste: `backend/src/__tests__/estadoContaRules.test.ts`

**Interfaces:**
- Produz:
  ```ts
  // config/contingencia.ts
  export const CARENCIA_DIAS = 7;
  export const STATUS_CONTINGENCIA = ['past_due', 'unpaid', 'pending'] as const;
  export const ORIGENS_NA_CARENCIA = ['lembrete', 'confirmacao', 'pix_recibo', 'sinal_pix', 'clube'] as const;

  // estadoConta.rules.ts
  export type MotivoBloqueio = 'cobranca' | 'teste' | 'cancelada';
  export type EstadoConta =
    | { tipo: 'ativa' }
    | { tipo: 'carencia'; desde: Date; ate: Date; diasRestantes: number }
    | { tipo: 'bloqueada'; motivo: MotivoBloqueio };
  export interface EntradaEstado {
    status: string; inadimplenteDesde: Date | null; jaPagou: boolean; fimDoPeriodo: Date | null; agora: Date;
  }
  export function calcularEstadoConta(e: EntradaEstado): EstadoConta;
  ```

- [ ] **Passo 1: escrever os testes que falham.** Use `agora = new Date('2026-10-28T15:00:00Z')`.
  - `active` e `trialing` → `{ tipo: 'ativa' }`.
  - `past_due`, já pagou, desde `2026-10-25T15:00:00Z` → `carencia`, com `ate = 2026-11-01T15:00:00Z` e `diasRestantes = 4`.
  - Mesmo caso com desde `2026-10-21T15:00:00Z` (exatamente 7 dias) → `{ tipo: 'bloqueada', motivo: 'cobranca' }`.
  - `diasRestantes` arredonda para cima: desde `2026-10-22T16:00:00Z` → `1`.
  - `pending`, já pagou, `fimDoPeriodo` em `2026-11-02` → `ativa`.
  - `pending` sem pagamento anterior → `bloqueada` / `teste`.
  - `incomplete` → `bloqueada` / `teste`.
  - `canceled`, mesmo tendo pago → `bloqueada` / `cancelada`.
  - `unpaid`, já pagou, `inadimplenteDesde` nulo → `carencia` contada a partir de `agora`, com `diasRestantes = 7`. É a defesa contra linha sem backfill.
  - Status desconhecido (`'xyz'`) → `bloqueada` / `teste`, como `normalizeSubscriptionStatus` faz.
- [ ] **Passo 2:** rode `cd backend && npx vitest run src/__tests__/estadoContaRules.test.ts`. Esperado: FAIL (módulo inexistente).
- [ ] **Passo 3:** implemente `calcularEstadoConta` e as constantes.
- [ ] **Passo 4:** rode o mesmo comando. Esperado: PASS.
- [ ] **Passo 5: commit:** `feat(contingencia): regra do estado da conta`

### Tarefa 3: Leitura do estado no banco

**Arquivos:**
- Modificar: `backend/src/repositories/subscriptionRepository.ts` (`getBusinessBillingContext`: novas colunas)
- Modificar: `backend/src/types/domain.ts` (`BusinessBillingContext`: `inadimplente_desde?: Date | null; ja_pagou?: boolean`)
- Criar: `backend/src/modules/conta/estadoConta.service.ts`
- Teste: `backend/src/__tests__/estadoContaService.test.ts`

**Interfaces:**
- Consome: `calcularEstadoConta` (Tarefa 2).
- Produz:
  ```ts
  export function estadoDoContexto(ctx: BusinessBillingContext | null, agora?: Date): EstadoConta;
  export const estadoContaService: {
    doNegocio(businessId: string, agora?: Date): Promise<EstadoConta>; // cache de 60 s por negócio
    limparCache(): void; // para testes
  };
  ```

- [ ] **Passo 1: escrever os testes que falham.** Mocke `subscriptionRepository.getBusinessBillingContext`.
  - Contexto com `subscription_status: 'past_due'`, `ja_pagou: true` e `inadimplente_desde` há 2 dias → `carencia`.
  - `ctx = null` → `bloqueada` / `teste`.
  - `fimDoPeriodo` vem de `current_period_end ?? subscription_current_period_end`.
  - Duas chamadas de `doNegocio` no mesmo minuto consultam o repositório uma vez; depois de 61 s (passando `agora`), consultam de novo.
- [ ] **Passo 2:** rode `npx vitest run src/__tests__/estadoContaService.test.ts`. Esperado: FAIL.
- [ ] **Passo 3: acrescentar no `SELECT` de `getBusinessBillingContext`:**
  - `inadimplente_desde`;
  - `ja_pagou`, calculado como:
    ```sql
    (last_payment_date IS NOT NULL
      OR EXISTS (SELECT 1 FROM billing_payments bp WHERE bp.business_id = businesses.id AND bp.paid_at IS NOT NULL)
      OR EXISTS (SELECT 1 FROM subscription_events se WHERE se.business_id = businesses.id
                 AND se.event_type IN ('invoice.paid','invoice.payment_succeeded')
                 AND COALESCE((se.payload->'data'->'object'->>'amount_paid')::numeric, 0) > 0)) AS ja_pagou
    ```
  
  Antes, confira em um `payload` de `subscription_events` gravado pelo webhook (`services/subscriptionService.ts`) se o caminho `data.object.amount_paid` é o que fica salvo. Se o webhook salvar só `data.object`, troque para `payload->>'amount_paid'`.
- [ ] **Passo 4: implementar `estadoDoContexto` e `estadoContaService`.** O cache é um `Map<businessId, { em: number; estado }>`.
- [ ] **Passo 5:** rode o teste. Esperado: PASS.
- [ ] **Passo 6: commit:** `feat(contingencia): estado da conta lido do banco`

### Tarefa 4: Painel em leitura na carência (middleware)

**Arquivos:**
- Criar: `backend/src/modules/conta/carencia.rules.ts`
- Modificar: `backend/src/middleware/auth.ts` (`enforceActiveSubscription`, `SUBSCRIPTION_EXEMPT_ROUTES`)
- Modificar: `backend/src/middleware/subscriptionGuard.ts` (`requireFeature`)
- Modificar: `backend/src/utils/errors.ts` (`SubscriptionRequiredError` aceita `estado` e `message`)
- Modificar: o tipo do `Request` do Express (onde `req.subscriptionAccess` é declarado), acrescentando `estadoConta?: EstadoConta`
- Teste: `backend/src/__tests__/carenciaMiddleware.test.ts`

**Interfaces:**
- Consome: `estadoDoContexto` (Tarefa 3).
- Produz:
  ```ts
  // carencia.rules.ts
  export function escritaLiberadaNaCarencia(method: string, path: string): boolean; // path sem query, com /api/v1
  // auth.ts: req.estadoConta preenchido em toda requisição autenticada de negócio
  ```

- [ ] **Passo 1: escrever os testes que falham** (tabela com `it.each`).
  - **`escritaLiberadaNaCarencia`** devolve `true` para:
    - `PUT /api/v1/appointments/:id/status`
    - `POST /api/v1/appointments/:id/comanda`
    - `PUT /api/v1/comandas/:id`
    - `POST /api/v1/comandas/:id/close`
    - `POST /api/v1/comandas/:id/receipt`
    - `POST /api/v1/cash/open`
    - `POST /api/v1/cash/movements`
    - `POST /api/v1/cash/close`
    - `POST /api/v1/whatsapp/conversations/:id/messages`
    - `POST /api/v1/whatsapp/conversations/lidas`
    - `POST /api/v1/whatsapp/conversations/:id/assumir`
    - `POST /api/v1/whatsapp/conversations/:id/devolver`
    - `POST /api/v1/bancada/agendamentos/:id/iniciar`
    - `PUT /api/v1/bancada/comandas/:id`
    - `POST /api/v1/bancada/comandas/:id/enviar`
    - `POST /api/v1/bancada/comandas/:id/fechar`
    - `PATCH /api/v1/notifications/...` e `POST /api/v1/notifications/...`

    Os `:id` são UUIDs.
  - Devolve `false` para:
    - `POST /api/v1/appointments`
    - `PUT /api/v1/appointments/:id`
    - `DELETE /api/v1/appointments/:id`
    - `POST /api/v1/clients`
    - `POST /api/v1/whatsapp/campanhas`
    - `POST /api/v1/cash/reopen`
    - `POST /api/v1/bancada/agendamentos/:id/reagendar`
    - `PUT /api/v1/comandas/settings`
  - **`authMiddleware`** (contexto mockado em carência):
    - `GET /api/v1/clients` passa e preenche `req.estadoConta.tipo === 'carencia'`;
    - `POST /api/v1/clients` dá 402 com `details.estado === 'carencia'` e a mensagem `Disponível depois de regularizar a assinatura.`.
  - Contexto bloqueado: `GET /api/v1/clients` dá 402 com `details.estado === 'bloqueada'`.
  - Rotas isentas, que passam em qualquer estado:
    - `GET /api/v1/conta/estado`
    - `GET /api/v1/conta/backup`
    - `GET /api/v1/billing/invoices`
    - `GET /api/v1/billing/payment-method`
    - `POST /api/v1/billing/reactivate`
    - `POST /api/v1/subscriptions/portal`
  - **`requireFeature('clients')`** com `req.user.subscriptionStatus = 'past_due'` e `req.estadoConta.tipo === 'carencia'` passa. Com `bloqueada`, barra como hoje.
- [ ] **Passo 2:** rode `npx vitest run src/__tests__/carenciaMiddleware.test.ts`. Esperado: FAIL.
- [ ] **Passo 3: implementar.**
  - **`enforceActiveSubscription`:**
    - calcula `estadoDoContexto(context)` e grava em `req.estadoConta` sempre;
    - quando `decision.granted` é falso e o estado é `carencia`, deixa passar se o método for `GET`/`HEAD` ou se `escritaLiberadaNaCarencia` for verdadeiro;
    - nos outros casos, lança `SubscriptionRequiredError` com `estado`.
  - **`requireFeature`:** com carência, avalia a feature com `subscriptionStatus: 'active'`. Só o plano continua contando.
  - **`SubscriptionRequiredError`:** passa `estado` em `details`, para o `errorHandler` devolver (confira o formato que o `api.ts` lê em `details`).
- [ ] **Passo 4:** rode o teste e depois `npx vitest run src/__tests__/auth.test.ts`. Esperado: PASS nos dois.
- [ ] **Passo 5: commit:** `feat(contingencia): painel em leitura durante a carência`

### Tarefa 5: Só os atendimentos de hoje na carência

**Arquivos:**
- Criar: `backend/src/modules/conta/somenteHoje.middleware.ts`
- Modificar:
  - `backend/src/modules/appointments/appointments.routes.ts` (rotas `PUT /:id/status` e `POST /:id/comanda`)
  - `backend/src/modules/bancada/bancada.routes.ts` (`POST /agendamentos/:id/iniciar`)
- Teste: `backend/src/__tests__/somenteHojeNaCarencia.test.ts`

**Interfaces:**
- Consome: `req.estadoConta` (Tarefa 4), `getBusinessScheduleSettings(businessId).timezone`.
- Produz: `export const somenteHojeNaCarencia: RequestHandler`. Lê `req.params.id` como id do agendamento e não faz nada quando `req.estadoConta?.tipo !== 'carencia'`.

- [ ] **Passo 1: escrever os testes que falham.** Mocke o Prisma `appointment.findFirst` (por `id` e `businessId`) e as configurações (fuso `America/Sao_Paulo`). Na carência, com `desde = 2026-10-27T12:00:00Z` e `agora = 2026-10-29T01:00:00Z` (22h do dia 28 em São Paulo):
  - agendamento com `date` 28/10, criado em 26/10 → `next()` sem erro;
  - `date` 29/10 → 402 `Disponível depois de regularizar a assinatura.`;
  - `date` 28/10, criado em 27/10 às 13:00Z (depois de `desde`) → 402;
  - agendamento de outro negócio → 404, pelo `NotFoundError` do projeto;
  - estado `ativa` → `next()` sem consultar o banco.
- [ ] **Passo 2:** rode `npx vitest run src/__tests__/somenteHojeNaCarencia.test.ts`. Esperado: FAIL.
- [ ] **Passo 3:** implemente o middleware, comparando `dateInTz(agora, tz)` com a data do agendamento. Use o utilitário de data que `cronService` já importa. Depois coloque o middleware nas três rotas, logo depois do `guard`.
- [ ] **Passo 4:** rode o teste e depois `npx vitest run src/__tests__/appointments.test.ts src/__tests__/bancada.test.ts`. Esperado: PASS.
- [ ] **Passo 5: commit:** `feat(contingencia): só os atendimentos de hoje durante a carência`

### Tarefa 6: Link público, adesão ao clube e robô

**Arquivos:**
- Modificar:
  - `backend/src/modules/publicBooking/publicBooking.service.ts` (`getStorefront`, `createPendingAppointment`, adesão ao clube; confira onde a adesão é criada, pela rota `/:slug/clube/:ofertaId/adesao`)
  - `backend/src/modules/publicBooking/publicBooking.types.ts` (`Storefront.agendaPausada: boolean`, `Storefront.whatsapp: string | null`)
  - `backend/src/services/whatsapp/whatsappFlowService.ts` (depois do bloco de fora do horário, perto da linha 2100)
- Teste: `backend/src/__tests__/contingenciaCanaisPublicos.test.ts`

**Interfaces:**
- Consome: `estadoContaService.doNegocio` (Tarefa 3).
- Produz:
  - `Storefront.agendaPausada`, que é `true` quando o estado não é `ativa`;
  - a constante `textoAgendaPausada(nomeNegocio: string): string` em `backend/src/modules/conta/estadoConta.rules.ts`.

- [ ] **Passo 1: escrever os testes que falham.**
  - `getStorefront` com estado `carencia` → `agendaPausada: true` e `whatsapp` do negócio; com `ativa` → `false`.
  - `createPendingAppointment` com estado diferente de `ativa` → `ConflictError` (409) com `textoAgendaPausada('Studio Aurora')`. Se o projeto não tiver `ConflictError`, use a classe com 409 que já existe em `utils/errors.ts` ou crie uma no mesmo padrão.
  - A adesão pública ao clube tem o mesmo comportamento.
  - `handleIncomingMessage` com estado `bloqueada`, sessão ativa e texto `oi`: envia `A agenda online está pausada no momento. Fale direto com Studio Aurora pelo WhatsApp.`, apaga a sessão e não monta o menu.
  - Com `simulationMode: true`, segue o fluxo normal: o simulador da dona continua funcionando.
  - Mensagem que não é saudação, sem sessão ativa → nada é enviado, igual à regra 5 de hoje.
- [ ] **Passo 2:** rode o teste. Esperado: FAIL.
- [ ] **Passo 3: implementar.**
  - **No robô:** quando o estado não é `ativa`, responde só se for saudação ou se houver sessão ativa. Fora disso, ignora, para não responder a toda mensagem **(decisão do plano)**.
  - **O que fica de fora:** as respostas de confirmação e de avaliação ("1/2", notas) são interceptadas antes do robô pelo módulo de respostas e continuam funcionando.
- [ ] **Passo 4:** rode o teste e depois `npx vitest run src/__tests__/publicBooking*.test.ts src/__tests__/whatsappFlow*.test.ts`. Esperado: PASS.
- [ ] **Passo 5: commit:** `feat(contingencia): link público e robô sem agendamento novo`

### Tarefa 7: Fila, rotinas e lembrete de 2 h

**Arquivos:**
- Modificar:
  - `backend/src/modules/whatsappFila/fila.repository.ts` (`proximoVencido`: opção `apenasOrigens?: string[]`)
  - `backend/src/modules/whatsappFila/fila.service.ts` (`processarNegocio`, logo no início)
  - `backend/src/modules/whatsappAutomacoes/rotinas.service.ts` (`porNegocio` recebe `{ naCarencia: boolean }`)
  - `backend/src/services/cronService.ts` (`runReminderJob`, por agendamento)
- Teste: `backend/src/__tests__/contingenciaEnvios.test.ts`

**Interfaces:**
- Consome: `estadoContaService.doNegocio`, `ORIGENS_NA_CARENCIA`.

- [ ] **Passo 1: escrever os testes que falham.**
  - **`processarNegocio`:**
    - estado `bloqueada` → devolve `'nada'` sem chamar `proximoVencido`;
    - `carencia` → chama `proximoVencido` com `apenasOrigens` igual a `ORIGENS_NA_CARENCIA`;
    - `ativa` → sem `apenasOrigens`.
  - **`proximoVencido`** com `apenasOrigens` monta `origin: { in: [...] }` no `where`, junto com o filtro de lote.
  - **Rotinas:**
    - `confirmacoes` e `lembretesVespera` rodam para negócio em `carencia` e pulam o `bloqueada`;
    - `radarRetorno` e `aniversarios` pulam `carencia` e `bloqueada`.
    - Confira as outras rotinas exportadas por `automacoesRotinas` e classifique cada uma pela lista `ORIGENS_NA_CARENCIA`.
  - **`runReminderJob`:** não envia o lembrete de 2 h de negócio `bloqueado`; envia o de negócio em `carencia`.
- [ ] **Passo 2:** rode o teste. Esperado: FAIL.
- [ ] **Passo 3:** implemente. Os itens da fila não mudam de status: ficam `na_fila` e voltam a sair quando a conta é regularizada.
- [ ] **Passo 4:** rode `npx vitest run src/__tests__/contingenciaEnvios.test.ts` e depois a suíte da fila e das automações (`npx vitest run src/__tests__/fila* src/__tests__/automacoes* src/__tests__/cron*`). Esperado: PASS.
- [ ] **Passo 5: commit:** `feat(contingencia): envios automáticos pausados fora do ar`

### Tarefa 8: Rotas da conta (estado e backup)

**Arquivos:**
- Criar:
  - `backend/src/modules/conta/conta.routes.ts`
  - `backend/src/modules/conta/conta.controller.ts`
  - `backend/src/modules/conta/backup.service.ts`
  - `backend/src/modules/conta/backup.csv.ts`
- Modificar:
  - `backend/src/server.ts`: `app.use(\`${API_V1}/conta\`, contaRoutes)` junto das montagens das linhas 489–505
  - `backend/package.json`: dependência `jszip`
- Teste: `backend/src/__tests__/contaBackup.test.ts`

**Interfaces:**
- Consome: `estadoContaService`, `linhaCsv` de `modules/crm/csv.ts`, `AuditLog` (o mesmo serviço de auditoria usado pelo `adminService`).
- Produz:
  - `GET /api/v1/conta/estado` → `{ tipo, desde?, ate?, diasRestantes?, motivo? }`, com as datas em ISO. Vale para `tenant_admin` e para a equipe.
  - `GET /api/v1/conta/backup` → `application/zip`, com `Content-Disposition: attachment; filename="backup-{slug ou id}-{AAAA-MM-DD}.zip"`. Só `tenant_admin`.
  - Arquivos do zip: `clientes.csv`, `agendamentos.csv`, `servicos.csv`, `profissionais.csv`, `comandas.csv` (uma linha por item), `caixa.csv` (movimentos e sessões) e `despesas.csv`.
  - Formato: `;` como separador, decimal com vírgula, BOM, igual a `comissoes.csv.ts`.

- [ ] **Passo 1: escrever os testes que falham.**
  - **Backup:**
    - `backupService.gerar(businessId)` devolve um `Buffer`;
    - aberto com `JSZip.loadAsync`, ele contém exatamente os 7 nomes de arquivo;
    - `clientes.csv` começa com o BOM e tem o cabeçalho `Nome;Telefone;E-mail;Aniversário;Cadastrada em`;
    - com o repositório mockado, um cliente vira uma linha.
  - **Isolamento:** toda consulta do backup recebe o `businessId`, conferido nos mocks.
  - **Rota:** `GET /conta/backup` com papel de profissional → 403. Com `tenant_admin` → 200, o `content-type` do zip e uma linha no `AuditLog` com a ação `conta_backup`.
- [ ] **Passo 2:** rode `npx vitest run src/__tests__/contaBackup.test.ts`. Esperado: FAIL.
- [ ] **Passo 3: implementar.**
  - `npm install jszip` em `backend/`.
  - As consultas ficam em `backup.service.ts`, pelo Prisma, sempre com `where: { businessId }`.
  - Os cabeçalhos dos outros CSVs ficam a critério de quem implementa, em português e com as colunas que a dona reconheceria nas telas.
- [ ] **Passo 4:** rode o teste e `npm run typecheck`. Esperado: PASS e nenhum erro de tipo.
- [ ] **Passo 5: commit:** `feat(contingencia): estado da conta e backup em CSV`

### Tarefa 9: Frontend: estado da conta, redirecionamento e faixa

**Arquivos:**
- Criar:
  - `frontend/src/lib/conta.ts`
  - `frontend/src/hooks/useEstadoConta.ts`
  - `frontend/src/components/assinatura/FaixaContingencia.tsx`
- Modificar:
  - `frontend/src/lib/api.ts` (bloco do 402, linhas 165–172)
  - `frontend/src/components/shell/AppShell.tsx`
  - `frontend/src/lib/themedPaths.ts`
- Teste:
  - `frontend/src/components/assinatura/__tests__/FaixaContingencia.test.tsx`
  - `frontend/src/lib/__tests__/apiContingencia.test.ts`

**Interfaces:**
- Consome: `GET /conta/estado` (Tarefa 8).
- Produz:
  ```ts
  // lib/conta.ts
  export type EstadoConta =
    | { tipo: 'ativa' }
    | { tipo: 'carencia'; desde: string; ate: string; diasRestantes: number }
    | { tipo: 'bloqueada'; motivo: 'cobranca' | 'teste' | 'cancelada' };
  export const contaApi: { estado(): Promise<EstadoConta>; baixarBackup(): Promise<void> }; // baixarBackup dispara o download do blob
  // hooks/useEstadoConta.ts
  export function useEstadoConta(): { estado: EstadoConta | null; recarregar(): Promise<void> };
  ```

- [ ] **Passo 1: escrever os testes que falham.**
  - **`FaixaContingencia`** com `diasRestantes: 4` mostra `Modo contingência · 4 dias para regularizar` e o link `Regularizar` para `/dashboard/assinatura`. Com `diasRestantes: 1`, mostra `1 dia`.
  - **Interceptor do `api.ts`:**
    - 402 com `details.estado === 'carencia'` → não chama `window.location.replace`;
    - 402 com `details.estado === 'bloqueada'` → `replace('/dashboard/assinatura')`;
    - 402 sem `details.estado` → `replace('/pagamento')`, como hoje.
- [ ] **Passo 2:** rode `cd frontend && npx vitest run src/components/assinatura src/lib/__tests__/apiContingencia.test.ts`. Esperado: FAIL.
- [ ] **Passo 3: implementar.**
  - **`api.ts`:** a página `/dashboard/assinatura` entra em `shouldRedirectToBilling` como página de cobrança, para não entrar em laço.
  - **`AppShell`:**
    - carrega o estado;
    - em `carencia`, mostra a faixa acima do conteúdo;
    - na primeira tela da sessão, redireciona para `/dashboard/assinatura`, com a marca `easyagenda:contingenciaVista` no `sessionStorage` (leitura e escrita em try/catch);
    - em `bloqueada`, redireciona sempre, exceto em `/dashboard/assinatura` e `/dashboard/planos`.
- [ ] **Passo 4:** rode o teste e depois `npx vitest run src/__tests__/themeCompliance.test.ts`. Esperado: PASS.
- [ ] **Passo 5: commit:** `feat(contingencia): faixa e redirecionamento no painel`

### Tarefa 10: Tela `/dashboard/assinatura`

**Referências:**
- `docs/design/stitch/projeto/studio-aurora-assinatura-vencida-modo-de-contingencia-corrigida--2f4a56.html`
- `docs/design/stitch/projeto/studio-aurora-assinatura-vencida-modo-de-contingencia-mobile--702444.html`

**Arquivos:**
- Criar:
  - `frontend/src/app/dashboard/assinatura/page.tsx`
  - `frontend/src/components/assinatura/TelaContingencia.tsx`
  - `frontend/src/components/assinatura/PagamentoContingencia.tsx`
- Modificar: `frontend/src/lib/themedPaths.ts`
- Teste: `frontend/src/components/assinatura/__tests__/TelaContingencia.test.tsx`

**Interfaces:**
- Consome:
  - `useEstadoConta`, `contaApi.baixarBackup` (Tarefa 9);
  - `billingApi.getStatus`, `billingApi.getPlans`, `billingApi.reactivateSubscription` (Pix) e `useDashboardBilling().openBillingPortal` (cartão);
  - o modal de Pix que `app/dashboard/planos/page.tsx` já usa (`setPixAberto`), extraído para um componente se ainda for local.

- [ ] **Passo 1: escrever os testes que falham.** Mocke as APIs.
  - **Carência, Pix, Equipe, vencimento em 15/10/2026:**
    - mostra `Carência: 4 dias restantes`;
    - mostra `A mensalidade de {nome} (Plano Equipe · R$ 99,90) venceu em 15 de outubro de 2026.`;
    - mostra o bloco `O que continua liberado`, com os três itens: agenda e atendimentos de hoje, backup, lembretes já marcados;
    - mostra o aviso `Novos agendamentos pelo link público e campanhas estão pausados até a regularização.`;
    - o botão `Gerar Pix` chama `reactivateSubscription`;
    - não mostra `Pagar com outro cartão`.
  - **Carência, cartão:** mostra `Pagar com outro cartão`, que chama `openBillingPortal`, e não mostra Pix **(decisão do plano:** gerar Pix para uma assinatura de cartão criaria uma segunda assinatura em paralelo, pendência da 2D).
  - **Bloqueada por cobrança:** não mostra `O que continua liberado` e mostra `Seu acesso está pausado até a regularização.`.
  - **Teste encerrado** e **cancelada:** mostram o texto de cada caso e o botão `Ver planos` (`/dashboard/planos/comparar`).
  - **Backup:** `Baixar backup completo (CSV, abre no Excel)` aparece em todos os estados e chama `baixarBackup`. Para a equipe (papel diferente de `tenant_admin`), o botão não aparece.
  - **Suporte:** `Falar com o suporte no WhatsApp` só aparece com `NEXT_PUBLIC_SUPPORT_WHATSAPP` definido.
  - **"Já paguei":** chama `billingApi.getStatus()` e recarrega o estado da conta. Se voltou a `ativa`, vai para `/dashboard`.
  - **Textos vetados:** a tela não contém `24 horas`, `1 minuto` nem `nunca são deletados`.
- [ ] **Passo 2:** rode `npx vitest run src/components/assinatura`. Esperado: FAIL.
- [ ] **Passo 3: implementar, fiel ao Stitch.**
  - Layout em duas colunas no computador e uma no celular.
  - Ícones Material Symbols do Stitch: `credit_card_off`, `check_circle`, `calendar_today`, `download_for_offline`, `forum`, `info`, `support_agent`, `lock_reset`.
  - A validade do Pix vem da resposta do Asaas quando houver. Sem ela, a linha da validade não aparece.
- [ ] **Passo 4:** rode o teste e `npx vitest run src/__tests__/themeCompliance.test.ts && npx tsc --noEmit`. Esperado: PASS e nenhum erro.
- [ ] **Passo 5: commit:** `feat(contingencia): tela da assinatura vencida`

### Tarefa 11: Página pública pausada, bancada e botões principais

**Arquivos:**
- Modificar:
  - `frontend/src/app/agendar/[slug]/page.tsx` (e o tipo do storefront no frontend)
  - `frontend/src/app/bancada/layout.tsx`
  - os botões "Novo agendamento" (`components/AppointmentModule.tsx` e `components/dashboard/SaudacaoDia.tsx`), "Novo cliente" (`components/clientes/ListaClientes.tsx`) e "Nova campanha" (aba Campanhas do WhatsApp)
- Teste:
  - `frontend/src/app/agendar/[slug]/__tests__/AgendaPausada.test.tsx`
  - testes existentes desses componentes

**Interfaces:**
- Consome: `Storefront.agendaPausada` e `Storefront.whatsapp` (Tarefa 6), `useEstadoConta` (Tarefa 9).

- [ ] **Passo 1: escrever os testes que falham.**
  - **Página pública** com `agendaPausada: true`:
    - mostra `A agenda online está pausada no momento. Fale direto com {nome} pelo WhatsApp.` e um botão para `https://wa.me/55{whatsapp}`;
    - não mostra a lista de serviços para agendar;
    - não contém as palavras `pagamento` nem `assinatura`.
  - **Bancada** em `carencia`: mostra a faixa `Agenda em modo restrito: só os atendimentos de hoje podem ser concluídos.`, sem valores nem a palavra `pagamento`.
  - **Botões principais:** em `carencia`, ficam `disabled`, com o `title` `Disponível depois de regularizar`. Os outros botões de escrita do painel contam com a mensagem do 402 **(decisão do plano:** desabilitar um a um todos os botões do painel não cabe nesta entrega; fica registrado no `SEGUIMENTO.md`).
- [ ] **Passo 2:** rode os testes. Esperado: FAIL.
- [ ] **Passo 3:** implemente.
- [ ] **Passo 4:** rode `npx vitest run` (frontend inteiro) e `npx tsc --noEmit`. Esperado: PASS e nenhum erro.
- [ ] **Passo 5: commit:** `feat(contingencia): página pública pausada e avisos no painel e na bancada`

### Tarefa 12: Documentação, conferência visual e verificação final

**Arquivos:**
- Modificar:
  - `docs/design/SEGUIMENTO.md` (seção "Item H1 (modo de contingência), pendências conhecidas")
  - `docs/ROADMAP.md` (linha H1 na tabela, como "Implementada, aguardando migração")
  - `docs/FUNCIONALIDADES.md` (o que acontece quando a cobrança falha)

- [ ] **Passo 1: registrar no `SEGUIMENTO.md`:**
  - o trigger fora do `schema.prisma`;
  - os botões não desabilitados um a um;
  - o Pix só para quem já paga no Pix;
  - a migração pendente de aplicação em produção;
  - o risco das contas hoje vencidas há mais de 7 dias, que perdem o link público. Inclua a consulta para contá-las:
    ```sql
    SELECT count(*) FROM businesses WHERE subscription_status IN ('past_due','unpaid','pending') AND subscription_updated_at < now() - interval '7 days';
    ```
- [ ] **Passo 2:** rode `cd backend && npm run typecheck && npm test` e `cd frontend && npx tsc --noEmit && npx vitest run`. Esperado: tudo passa. Anote a contagem de testes.
- [ ] **Passo 3: conferência visual local** (regra do projeto, como na memória do projeto):
  - backend mock na porta 5000 respondendo `/conta/estado` nos três estados, e `next dev`;
  - capturas de `/dashboard/assinatura` (carência no Pix, carência no cartão, bloqueada), da faixa no `/dashboard` e da página pública pausada, no computador e no celular, nos temas claro e escuro.
- [ ] **Passo 4: commit:** `docs(contingencia): seguimento, roadmap e funcionalidades da H1`
- [ ] **Passo 5:** não abrir o PR. O dono pediu o PR só no final. Informe o estado do branch e a migração pendente de autorização.
