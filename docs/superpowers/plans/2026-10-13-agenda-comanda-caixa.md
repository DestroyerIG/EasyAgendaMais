# Agenda, Comanda e Caixa (sub-projeto 2A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A dona conclui o atendimento por uma comanda real (serviço + produtos, desconto, gorjeta, forma de pagamento, repasse da profissional), a cliente recebe o comprovante no WhatsApp e o Caixa do dia abre, recebe sangrias e fecha batendo com a gaveta — tudo com dado real e visual fiel às versões novas do Stitch.

**Architecture:** Backend Express + Prisma ganha dois módulos novos no padrão `modules/<nome>/{types,repository,service,controller,routes}.ts` (`comandas`, `cash`) e um de catálogo (`products`); o cálculo da comanda é uma função pura (`comandaMath.ts`) usada pelo serviço e espelhada no frontend para a prévia. O frontend Next.js troca os blocos de `conteudoDemo.agenda`/`conteudoDemo.caixa` por chamadas reais (via proxies em `src/app/api/`) e ganha `ComandaModal` e um `CaixaModule` novo.

**Tech Stack:** Node/Express, Prisma 5 (PostgreSQL/Supabase), Zod, Vitest; Next.js 15 App Router, React, Tailwind (tokens do design system), Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-10-13-agenda-comanda-caixa-design.md`

## Global Constraints

- Idioma de toda a interface, mensagens de erro e commits: português do Brasil.
- Textos de botão em frase normal (maiúscula só na primeira palavra), regra do `docs/design/DESIGN.md`.
- Nomes de plano visíveis: Solo / Equipe / Salão. Nunca "Pro".
- Cores só por token do design system (`bg-brand`, `text-ink`, `text-muted`, `bg-surface`, `border-line`, `text-success-text`, `text-warning-text`, `text-danger`, `bg-status-confirmed`, `bg-tertiary`…). O teste `frontend/src/__tests__/themeCompliance.test.ts` reprova cor fixa e reprova arquivo novo em `src/components` ou `src/app/dashboard` que não esteja cadastrado nele — **todo arquivo novo de componente precisa ser registrado lá** (ver passo de cada tarefa).
- Ícones: Material Symbols Outlined via `<Icon name="..." />` de `@/components/ui`. Não usar `lucide-react` em arquivo novo.
- Referência visual: só as versões novas do Stitch em `docs/design/stitch/projeto/`:
  - Agenda desktop `studio-aurora-agenda-diaria-timeline-desktop-corrigida--44833f.html`
  - Agenda mobile `studio-aurora-agenda-mobile-lista-e-gesto-de-deslizar--7ec58f.html`
  - Drawer `studio-aurora-detalhes-do-agendamento-drawer-completo--7ba488.html`
  - Comanda `studio-aurora-fechamento-de-comanda-e-comissao-ajustada--a9945c.html`
  - Caixa `studio-aurora-caixa-do-dia-e-fechamento--baf21f.html`
- Nenhum valor de exemplo na tela: bloco sem dado mostra estado vazio ou some. Não aparecem: "Mesa", "Clube" como forma de pagamento, "Pausa química", "recibo fiscal".
- Dinheiro: cálculos em centavos inteiros; arredondamento half-up para 2 casas.
- Faturamento = serviços + produtos − desconto. Gorjeta não é faturamento.
- Status de agendamento: `aguardando_pagamento`, `confirmado`, `em_atendimento`, `concluido`, `faltou`, `cancelado`.
- Toda tabela nova precisa de `ENABLE ROW LEVEL SECURITY` (sem policy = nega acesso pela API pública do Supabase; o backend usa a conexão de serviço).
- Comandos: backend `cd backend && npx vitest run <arquivo>` / `npx tsc --noEmit`; frontend `cd frontend && npx vitest run <arquivo>` / `npx tsc --noEmit`. A máquina é lenta: rodando a suíte inteira do frontend, testes podem estourar 5 s por carga; reexecute o arquivo isolado antes de concluir que falhou.
- Commits terminam com a linha `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Duas abas fechando a mesma comanda ao mesmo tempo** — a segunda tem de receber 409 e nada pode ser lançado em dobro no caixa ou no `earnings` (teste em Task 7: fechamento usa `updateMany` com `status: 'rascunho'` como compare-and-set).
2. **Comanda aberta de um dia e fechada no dia seguinte (atendimento que passa da meia-noite)** — entra no caixa do dia em que foi fechada, e o `earning` usa a data do agendamento (teste em Task 7).
3. **Agendamento `em_atendimento` precisa continuar ocupando o horário** — sem isso, a página pública e o bot oferecem o horário de quem está na cadeira (teste em Task 2 para `hasConflict` e `getBookedSlots`; o SQL próprio do bot muda no Task 2 Step 5 e roda sob `whatsappFlowService.test.ts`).
4. **Desconto maior que o restante após o sinal, ou sinal maior que o subtotal** — total a cobrar nunca negativo e comissão nunca negativa (teste em Task 4).
5. **Caixa do dia anterior esquecido aberto** — abrir o caixa de hoje não pode falhar por causa do de ontem, e comandas de hoje entram no de hoje (teste em Task 8: unicidade é por `(business_id, date)`).

---

## File Structure

**Backend — novos**
- `backend/prisma/migrations/20261013120000_agenda_comanda_caixa/migration.sql` — toda a mudança de banco da 2A.
- `backend/src/config/appointmentStatus.ts` — conjunto de status e quais ocupam horário.
- `backend/src/modules/comandas/comandaMath.ts` — cálculo puro da comanda.
- `backend/src/modules/comandas/comandas.{types,repository,service,controller,routes}.ts` — comanda, atalhos, regra de comissão.
- `backend/src/modules/comandas/receipt.ts` — texto do comprovante e envio.
- `backend/src/modules/products/products.{types,repository,service,controller,routes}.ts` — catálogo.
- `backend/src/modules/cash/cash.{types,repository,service,controller,routes}.ts` — caixa do dia.
- Testes em `backend/src/__tests__/`: `appointmentStatusFlow.test.ts`, `availabilityBreaks.test.ts`, `comandaMath.test.ts`, `products.test.ts`, `comandasService.test.ts`, `cashService.test.ts`, `appointmentDetails.test.ts`.

**Backend — alterados**
- `backend/prisma/schema.prisma`, `backend/src/types/domain.ts`
- `backend/src/modules/appointments/*` (status, detalhes, DTO, origem)
- `backend/src/services/scheduleSettingsService.ts` (intervalos bloqueados)
- `backend/src/modules/publicBooking/publicBooking.{service,repository}.ts`, `backend/src/services/whatsapp/whatsappFlowService.ts`
- `backend/src/repositories/professionalRepository.ts`, `backend/src/services/professionalService.ts`, `backend/src/validators/schemas/professionalSchemas.ts`
- `backend/src/validators/schemas/financeSchemas.ts`, `backend/src/repositories/financeRepository.ts`
- `backend/src/server.ts` (registrar rotas)

**Frontend — novos**
- `frontend/src/lib/comanda.ts` — tipos, cliente de API e espelho do cálculo.
- `frontend/src/lib/caixa.ts` — tipos e cliente de API do caixa.
- `frontend/src/lib/produtos.ts` — tipos e cliente de API de produtos.
- `frontend/src/components/comanda/ComandaModal.tsx` (+ `__tests__/ComandaModal.test.tsx`)
- `frontend/src/components/caixa/CaixaModule.tsx`, `AbrirCaixaForm.tsx`, `MovimentoCaixaModal.tsx`, `FecharCaixaModal.tsx` (+ `__tests__/CaixaModule.test.tsx`)
- `frontend/src/components/services/ProdutosTab.tsx`
- Proxies: `frontend/src/app/api/comandas/...`, `frontend/src/app/api/cash/...`, `frontend/src/app/api/products/...`, `frontend/src/app/api/appointments/[id]/details/route.ts`, `frontend/src/app/api/appointments/[id]/comanda/route.ts`.

**Frontend — alterados**
- `frontend/src/types/index.ts`
- `frontend/src/components/AppointmentModule.tsx`, `appointments/{LinhaDoTempo,AppointmentCard,PainelDetalhesAgendamento,CreateAppointmentModal}.tsx`
- `frontend/src/app/dashboard/financeiro/page.tsx`, `frontend/src/components/FinanceModule.tsx` (perde o bloco de caixa de exemplo)
- `frontend/src/components/ServiceProfessionalModule.tsx`, `services/ServiceProfessionalModal.tsx`, `SettingsModule.tsx`
- `frontend/src/app/dashboard/page.tsx`, `frontend/src/lib/conteudoDemo.ts`, `frontend/src/__tests__/themeCompliance.test.ts`, `docs/design/SEGUIMENTO.md`

---

### Task 1: Migração, schema Prisma e tipos de status

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/20261013120000_agenda_comanda_caixa/migration.sql`
- Create: `backend/src/config/appointmentStatus.ts`
- Modify: `backend/src/types/domain.ts:22`
- Test: `backend/src/__tests__/appointmentStatusFlow.test.ts`

**Interfaces:**
- Produces: modelos Prisma `Product`, `Comanda`, `ComandaItem`, `CashSession`, `CashMovement`; campos `Appointment.startedAt/finishedAt/depositAmount`, `Expense.paymentMethod`, `Professional.commissionServicePct/commissionProductPct/breakStart/breakEnd`, `BusinessSettings.commissionServicePct/commissionProductPct`.
- Produces: `APPOINTMENT_STATUSES`, `OCCUPYING_STATUSES` (`['confirmado','em_atendimento']`), `type AppointmentStatus` com os 6 valores.

- [ ] **Step 1: Copiar o schema atual para comparar depois**

```bash
cp backend/prisma/schema.prisma "$TMP/schema.before.prisma"
```
(`$TMP` = pasta de rascunho da sessão; em PowerShell use `$env:TEMP`.)

- [ ] **Step 2: Editar `backend/prisma/schema.prisma`**

No `model Appointment`, depois de `source`:
```prisma
  startedAt     DateTime? @map("started_at")
  finishedAt    DateTime? @map("finished_at")
  depositAmount Decimal?  @map("deposit_amount") @db.Decimal(10, 2)
```
e nas relações do `Appointment`: `comanda        Comanda?`.

No `model Expense`, depois de `date`:
```prisma
  paymentMethod String?  @map("payment_method") @db.VarChar(20)
```

No `model Professional`, depois de `active`:
```prisma
  commissionServicePct Decimal? @map("commission_service_pct") @db.Decimal(5, 2)
  commissionProductPct Decimal? @map("commission_product_pct") @db.Decimal(5, 2)
  breakStart           DateTime? @map("break_start") @db.Time(6)
  breakEnd             DateTime? @map("break_end") @db.Time(6)
```
e nas relações: `comandas     Comanda[]`.

No `model BusinessSettings`, depois de `whatsappReminders`:
```prisma
  commissionServicePct     Decimal  @default(0) @map("commission_service_pct") @db.Decimal(5, 2)
  commissionProductPct     Decimal  @default(0) @map("commission_product_pct") @db.Decimal(5, 2)
```

No `model Business` (bloco de relações): `products Product[]`, `comandas Comanda[]`, `cashSessions CashSession[]`.
No `model Client` (relações): `comandas Comanda[]`. No `model Service` (relações): `comandaItems ComandaItem[]`. No `model User` (relações): `cashSessionsOpened CashSession[] @relation("CashOpenedBy")`, `cashSessionsClosed CashSession[] @relation("CashClosedBy")`, `cashMovements CashMovement[]`, `comandasClosed Comanda[] @relation("ComandaClosedBy")`.

No fim do arquivo:
```prisma
// ─── Comanda, produtos e caixa (sub-projeto 2A) ──────────────────────────────

model Product {
  id          String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  businessId  String   @map("business_id") @db.Uuid
  name        String   @db.VarChar(255)
  description String?  @db.VarChar(255)
  price       Decimal  @db.Decimal(10, 2)
  active      Boolean  @default(true)
  createdAt   DateTime @default(now()) @map("created_at")
  updatedAt   DateTime @default(now()) @updatedAt @map("updated_at")

  business     Business      @relation(fields: [businessId], references: [id], onDelete: Cascade)
  comandaItems ComandaItem[]

  @@index([businessId, active])
  @@map("products")
}

model Comanda {
  id             String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  businessId     String    @map("business_id") @db.Uuid
  number         Int
  appointmentId  String    @unique @map("appointment_id") @db.Uuid
  clientId       String    @map("client_id") @db.Uuid
  professionalId String    @map("professional_id") @db.Uuid
  status         String    @default("rascunho") @db.VarChar(20)
  servicesTotal  Decimal   @default(0) @map("services_total") @db.Decimal(10, 2)
  productsTotal  Decimal   @default(0) @map("products_total") @db.Decimal(10, 2)
  depositApplied Decimal   @default(0) @map("deposit_applied") @db.Decimal(10, 2)
  discountAmount Decimal   @default(0) @map("discount_amount") @db.Decimal(10, 2)
  tipAmount      Decimal   @default(0) @map("tip_amount") @db.Decimal(10, 2)
  totalCharged   Decimal   @default(0) @map("total_charged") @db.Decimal(10, 2)
  paymentMethod  String?   @map("payment_method") @db.VarChar(20)
  commissionTotal Decimal  @default(0) @map("commission_total") @db.Decimal(10, 2)
  cashSessionId  String?   @map("cash_session_id") @db.Uuid
  closedAt       DateTime? @map("closed_at")
  closedBy       String?   @map("closed_by") @db.Uuid
  receiptSentAt  DateTime? @map("receipt_sent_at")
  createdAt      DateTime  @default(now()) @map("created_at")
  updatedAt      DateTime  @default(now()) @updatedAt @map("updated_at")

  business     Business      @relation(fields: [businessId], references: [id], onDelete: Cascade)
  appointment  Appointment   @relation(fields: [appointmentId], references: [id], onDelete: Cascade)
  client       Client        @relation(fields: [clientId], references: [id], onDelete: Cascade)
  professional Professional  @relation(fields: [professionalId], references: [id], onDelete: Cascade)
  cashSession  CashSession?  @relation(fields: [cashSessionId], references: [id], onDelete: SetNull)
  closedByUser User?         @relation("ComandaClosedBy", fields: [closedBy], references: [id], onDelete: SetNull)
  items        ComandaItem[]

  @@unique([businessId, number])
  @@index([businessId, closedAt])
  @@map("comandas")
}

model ComandaItem {
  id               String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  comandaId        String   @map("comanda_id") @db.Uuid
  kind             String   @db.VarChar(10)
  serviceId        String?  @map("service_id") @db.Uuid
  productId        String?  @map("product_id") @db.Uuid
  name             String   @db.VarChar(255)
  unitPrice        Decimal  @map("unit_price") @db.Decimal(10, 2)
  quantity         Int      @default(1)
  durationMinutes  Int?     @map("duration_minutes")
  commissionPct    Decimal  @default(0) @map("commission_pct") @db.Decimal(5, 2)
  commissionAmount Decimal  @default(0) @map("commission_amount") @db.Decimal(10, 2)
  isMain           Boolean  @default(false) @map("is_main")
  createdAt        DateTime @default(now()) @map("created_at")

  comanda Comanda  @relation(fields: [comandaId], references: [id], onDelete: Cascade)
  service Service? @relation(fields: [serviceId], references: [id], onDelete: SetNull)
  product Product? @relation(fields: [productId], references: [id], onDelete: SetNull)

  @@index([comandaId])
  @@map("comanda_items")
}

model CashSession {
  id             String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  businessId     String    @map("business_id") @db.Uuid
  date           DateTime  @db.Date
  openedAt       DateTime  @default(now()) @map("opened_at")
  openedBy       String    @map("opened_by") @db.Uuid
  openingBalance Decimal   @map("opening_balance") @db.Decimal(10, 2)
  closedAt       DateTime? @map("closed_at")
  closedBy       String?   @map("closed_by") @db.Uuid
  countedBalance Decimal?  @map("counted_balance") @db.Decimal(10, 2)
  expectedBalance Decimal? @map("expected_balance") @db.Decimal(10, 2)
  difference     Decimal?  @db.Decimal(10, 2)
  notes          String?   @db.Text

  business     Business       @relation(fields: [businessId], references: [id], onDelete: Cascade)
  openedByUser User           @relation("CashOpenedBy", fields: [openedBy], references: [id])
  closedByUser User?          @relation("CashClosedBy", fields: [closedBy], references: [id], onDelete: SetNull)
  movements    CashMovement[]
  comandas     Comanda[]

  @@unique([businessId, date])
  @@map("cash_sessions")
}

model CashMovement {
  id            String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  cashSessionId String   @map("cash_session_id") @db.Uuid
  businessId    String   @map("business_id") @db.Uuid
  kind          String   @db.VarChar(20)
  amount        Decimal  @db.Decimal(10, 2)
  description   String   @db.VarChar(255)
  createdBy     String   @map("created_by") @db.Uuid
  createdAt     DateTime @default(now()) @map("created_at")

  cashSession   CashSession @relation(fields: [cashSessionId], references: [id], onDelete: Cascade)
  createdByUser User        @relation(fields: [createdBy], references: [id])

  @@index([cashSessionId])
  @@map("cash_movements")
}
```

- [ ] **Step 3: Validar e gerar o SQL a partir da diferença dos dois schemas (não precisa de banco)**

```bash
cd backend
npx prisma validate
npx prisma migrate diff --from-schema-datamodel "$TMP/schema.before.prisma" --to-schema-datamodel prisma/schema.prisma --script > "$TMP/2a.sql"
```
Expected: `validate` diz "The schema at prisma/schema.prisma is valid"; `$TMP/2a.sql` contém `CREATE TABLE "products"`, `"comandas"`, `"comanda_items"`, `"cash_sessions"`, `"cash_movements"` e os `ALTER TABLE` das colunas novas.

- [ ] **Step 4: Montar `backend/prisma/migrations/20261013120000_agenda_comanda_caixa/migration.sql`**

Conteúdo = o SQL gerado no passo 3 **mais**, no fim:
```sql
-- Sinal já pago em reservas públicas antigas (antes só era calculado na hora).
UPDATE "appointments" a
   SET "deposit_amount" = ROUND(s."price" * s."deposit_percentage" / 100, 2)
  FROM "services" s
 WHERE a."service_id" = s."id"
   AND a."source" = 'publico'
   AND a."status" <> 'aguardando_pagamento'
   AND a."deposit_amount" IS NULL
   AND s."deposit_percentage" IS NOT NULL;

-- RLS sem policy = nenhuma leitura pela API pública do Supabase (o backend usa a
-- conexão de serviço). `notifications` (20261001140000) tinha ficado sem RLS.
ALTER TABLE public.products        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comandas        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comanda_items   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_sessions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_movements  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications   ENABLE ROW LEVEL SECURITY;
```
Conferir no SQL gerado que nenhum `DROP` apareceu (se aparecer, o schema foi editado errado — corrija o schema e gere de novo).

- [ ] **Step 5: Gerar o client Prisma**

Run: `cd backend && npx prisma generate`
Expected: "Generated Prisma Client".

- [ ] **Step 6: Escrever o teste de status**

`backend/src/__tests__/appointmentStatusFlow.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { VALID_STATUS_TRANSITIONS } from '../modules/appointments/appointments.types.js';
import { APPOINTMENT_STATUSES, OCCUPYING_STATUSES } from '../config/appointmentStatus.js';

describe('status de agendamento', () => {
  it('tem os seis status', () => {
    expect([...APPOINTMENT_STATUSES].sort()).toEqual(
      ['aguardando_pagamento', 'cancelado', 'concluido', 'confirmado', 'em_atendimento', 'faltou'].sort()
    );
  });

  it('em atendimento continua ocupando o horário', () => {
    expect(OCCUPYING_STATUSES).toEqual(['confirmado', 'em_atendimento']);
  });

  it('transições permitidas', () => {
    expect(VALID_STATUS_TRANSITIONS).toEqual({
      aguardando_pagamento: ['confirmado', 'cancelado'],
      confirmado: ['em_atendimento', 'concluido', 'faltou', 'cancelado'],
      em_atendimento: ['concluido', 'confirmado', 'cancelado'],
      concluido: [],
      faltou: [],
      cancelado: [],
    });
  });
});
```

- [ ] **Step 7: Rodar e ver falhar**

Run: `cd backend && npx vitest run src/__tests__/appointmentStatusFlow.test.ts`
Expected: FAIL — `Cannot find module '../config/appointmentStatus.js'`.

- [ ] **Step 8: Implementar**

`backend/src/config/appointmentStatus.ts`:
```ts
// Conjunto final de status do agendamento (sub-projeto 2A).
export const APPOINTMENT_STATUSES = [
  'aguardando_pagamento',
  'confirmado',
  'em_atendimento',
  'concluido',
  'faltou',
  'cancelado',
] as const;

export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number];

// Status que seguram o horário da profissional. `aguardando_pagamento` também segura,
// mas só enquanto `expires_at` não passou — por isso fica fora desta lista e é tratado
// à parte em cada consulta.
export const OCCUPYING_STATUSES: AppointmentStatus[] = ['confirmado', 'em_atendimento'];
```

`backend/src/types/domain.ts:22` — trocar a linha por:
```ts
export type { AppointmentStatus } from '../config/appointmentStatus.js';
```
(se algum arquivo importar `AppointmentStatus` como valor de `domain.ts`, `tsc` acusa; o tipo continua exportado com o mesmo nome).

`backend/src/modules/appointments/appointments.types.ts` — trocar `VALID_STATUS_TRANSITIONS` por:
```ts
export const VALID_STATUS_TRANSITIONS: Record<AppointmentStatus, AppointmentStatus[]> = {
  aguardando_pagamento: ['confirmado', 'cancelado'],
  confirmado: ['em_atendimento', 'concluido', 'faltou', 'cancelado'],
  em_atendimento: ['concluido', 'confirmado', 'cancelado'],
  concluido: [],
  faltou: [],
  cancelado: [],
};
```
e os dois `z.enum([...])` de `UpdateStatusSchema` e `GetAppointmentsQuerySchema` por `z.enum(APPOINTMENT_STATUSES)` (importar de `../../config/appointmentStatus.js`).

Atualizar `backend/src/__tests__/appointmentStatusTransitions.test.ts` se ele quebrar (as duas asserções existentes continuam verdadeiras; não deve quebrar).

- [ ] **Step 9: Rodar testes e tipos**

Run: `cd backend && npx vitest run src/__tests__/appointmentStatusFlow.test.ts src/__tests__/appointmentStatusTransitions.test.ts && npx tsc --noEmit`
Expected: PASS e `tsc` sem erros.

- [ ] **Step 10: Commit**

```bash
git add backend/prisma backend/src/config/appointmentStatus.ts backend/src/types/domain.ts backend/src/modules/appointments/appointments.types.ts backend/src/__tests__/appointmentStatusFlow.test.ts
git commit -m "feat(db): tabelas de comanda, produtos e caixa; status em atendimento e faltou

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Fluxo de status no backend (iniciar, faltou, conclusão só pela comanda, origem do bot)

**Files:**
- Modify: `backend/src/modules/appointments/appointments.service.ts` (`updateStatus`, `create`)
- Modify: `backend/src/modules/appointments/appointments.repository.ts` (`hasConflict`, `getBookedSlots`, `updateStatus`, `create`)
- Modify: `backend/src/services/whatsapp/whatsappFlowService.ts:1406-1414` e `:1570`
- Test: `backend/src/__tests__/appointmentStatusFlow.test.ts` (acrescentar)

**Interfaces:**
- Consumes: `OCCUPYING_STATUSES` (Task 1).
- Produces: `appointmentsService.updateStatus(id, businessId, status)` — aceita `em_atendimento` (grava `startedAt`), `faltou` (grava `finishedAt`), rejeita `concluido` com `ConflictError('Feche a comanda para concluir o atendimento')`; `appointmentsService.create(businessId, data, opts?: { source?: 'painel' | 'whatsapp' })`; `appointmentsPrismaRepository.updateStatus(id, businessId, status, expectedStatus, extra?: { startedAt?: Date | null; finishedAt?: Date })`.

- [ ] **Step 1: Escrever os testes**

Acrescentar em `backend/src/__tests__/appointmentStatusFlow.test.ts`:
```ts
import { vi, beforeEach } from 'vitest';

const repo = vi.hoisted(() => ({
  findById: vi.fn(),
  updateStatus: vi.fn(),
  hasConflict: vi.fn(),
  validateOwnership: vi.fn(),
  create: vi.fn(),
  getServiceDetails: vi.fn(),
}));
vi.mock('../modules/appointments/appointments.repository.js', () => ({ appointmentsPrismaRepository: repo }));
vi.mock('../services/whatsapp/index.js', () => ({ sendWhatsAppMessage: vi.fn() }));
vi.mock('../modules/notifications/notifications.service.js', () => ({ notificationsService: { notify: vi.fn() } }));
vi.mock('../config/prisma.js', () => ({ prisma: { $transaction: vi.fn(), earning: { create: vi.fn() } } }));

const { appointmentsService } = await import('../modules/appointments/appointments.service.js');

const agendamento = (status: string) => ({
  id: 'a1', businessId: 'b1', clientId: 'c1', professionalId: 'p1', serviceId: 's1',
  date: new Date('2026-10-13'), time: new Date('1970-01-01T10:00:00Z'), status,
  client: { name: 'Ana', phone: '83999990000' }, professional: { name: 'Camila' },
  service: { name: 'Corte', price: 50, durationMinutes: 60 },
});

describe('appointmentsService.updateStatus', () => {
  beforeEach(() => vi.clearAllMocks());

  it('iniciar atendimento grava started_at', async () => {
    repo.findById.mockResolvedValue(agendamento('confirmado'));
    repo.updateStatus.mockResolvedValue(agendamento('em_atendimento'));
    await appointmentsService.updateStatus('a1', 'b1', 'em_atendimento');
    expect(repo.updateStatus).toHaveBeenCalledWith('a1', 'b1', 'em_atendimento', 'confirmado', { startedAt: expect.any(Date) });
  });

  it('desfazer início limpa started_at', async () => {
    repo.findById.mockResolvedValue(agendamento('em_atendimento'));
    repo.updateStatus.mockResolvedValue(agendamento('confirmado'));
    await appointmentsService.updateStatus('a1', 'b1', 'confirmado');
    expect(repo.updateStatus).toHaveBeenCalledWith('a1', 'b1', 'confirmado', 'em_atendimento', { startedAt: null });
  });

  it('faltou grava finished_at e não gera receita', async () => {
    repo.findById.mockResolvedValue(agendamento('confirmado'));
    repo.updateStatus.mockResolvedValue(agendamento('faltou'));
    await appointmentsService.updateStatus('a1', 'b1', 'faltou');
    expect(repo.updateStatus).toHaveBeenCalledWith('a1', 'b1', 'faltou', 'confirmado', { finishedAt: expect.any(Date) });
    expect(repo.getServiceDetails).not.toHaveBeenCalled();
  });

  it('concluir direto é recusado: só a comanda conclui', async () => {
    repo.findById.mockResolvedValue(agendamento('confirmado'));
    await expect(appointmentsService.updateStatus('a1', 'b1', 'concluido')).rejects.toThrow('Feche a comanda para concluir o atendimento');
    expect(repo.updateStatus).not.toHaveBeenCalled();
  });
});

describe('appointmentsService.create', () => {
  beforeEach(() => vi.clearAllMocks());

  it('grava a origem informada (bot do WhatsApp)', async () => {
    repo.validateOwnership.mockResolvedValue({ clientOk: true, professionalOk: true, serviceOk: true });
    repo.hasConflict.mockResolvedValue(false);
    repo.create.mockResolvedValue(agendamento('confirmado'));
    const dados = { clientId: 'c1', professionalId: 'p1', serviceId: 's1', date: '2026-10-13', time: '10:00' };
    await appointmentsService.create('b1', dados, { source: 'whatsapp' });
    expect(repo.create).toHaveBeenCalledWith({ ...dados, businessId: 'b1', source: 'whatsapp' });
  });

  it('sem origem informada grava painel', async () => {
    repo.validateOwnership.mockResolvedValue({ clientOk: true, professionalOk: true, serviceOk: true });
    repo.hasConflict.mockResolvedValue(false);
    repo.create.mockResolvedValue(agendamento('confirmado'));
    const dados = { clientId: 'c1', professionalId: 'p1', serviceId: 's1', date: '2026-10-13', time: '10:00' };
    await appointmentsService.create('b1', dados);
    expect(repo.create).toHaveBeenCalledWith({ ...dados, businessId: 'b1', source: 'painel' });
  });
});
```

E um teste do repositório (ocupação) em `backend/src/__tests__/appointmentsRepositoryOccupying.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const prismaMock = vi.hoisted(() => ({ appointment: { findFirst: vi.fn(), findMany: vi.fn() } }));
vi.mock('../config/prisma.js', () => ({ prisma: prismaMock }));

const { appointmentsPrismaRepository } = await import('../modules/appointments/appointments.repository.js');

describe('ocupação de horário inclui quem está em atendimento', () => {
  beforeEach(() => vi.clearAllMocks());

  it('hasConflict considera em_atendimento', async () => {
    prismaMock.appointment.findFirst.mockResolvedValue(null);
    await appointmentsPrismaRepository.hasConflict('b1', 'p1', '2026-10-13', '10:00:00');
    const where = prismaMock.appointment.findFirst.mock.calls[0][0].where;
    expect(where.OR).toContainEqual({ status: { in: ['confirmado', 'em_atendimento'] } });
  });

  it('getBookedSlots considera em_atendimento', async () => {
    prismaMock.appointment.findMany.mockResolvedValue([]);
    await appointmentsPrismaRepository.getBookedSlots('b1', 'p1', '2026-10-13');
    const where = prismaMock.appointment.findMany.mock.calls[0][0].where;
    expect(where.OR).toContainEqual({ status: { in: ['confirmado', 'em_atendimento'] } });
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd backend && npx vitest run src/__tests__/appointmentStatusFlow.test.ts src/__tests__/appointmentsRepositoryOccupying.test.ts`
Expected: FAIL nos novos casos.

- [ ] **Step 3: Implementar no repositório**

Em `appointments.repository.ts`, importar `OCCUPYING_STATUSES` e:
- `hasConflict`: remover a linha `status: { in: ['confirmado', 'aguardando_pagamento'] },` e trocar o `OR` por
  ```ts
  OR: [
    { status: { in: OCCUPYING_STATUSES } },
    { status: 'aguardando_pagamento', expiresAt: { gt: now } },
  ],
  ```
- `getBookedSlots`: mesmo `OR`.
- `create(data: CreateAppointmentInput & { businessId: string; source?: string })`: acrescentar `source: data.source ?? 'painel',` no `data`.
- `updateStatus(id, businessId, status, expectedStatus, extra: { startedAt?: Date | null; finishedAt?: Date } = {})`: o `data` do `updateMany` vira `{ status, ...extra }`.

- [ ] **Step 4: Implementar no serviço**

Em `appointments.service.ts`:
- Assinatura: `async create(businessId: string, data: CreateAppointmentInput, opts: { source?: 'painel' | 'whatsapp' } = {})` e a chamada `appointmentsPrismaRepository.create({ ...data, businessId, source: opts.source ?? 'painel' })`.
- Em `updateStatus`, logo após `if (!appointment) throw ...`:
  ```ts
  if (newStatus === 'concluido') {
    throw new ConflictError('Feche a comanda para concluir o atendimento');
  }
  ```
- Antes de chamar o repositório, montar o extra:
  ```ts
  const extra =
    newStatus === 'em_atendimento' ? { startedAt: new Date() }
    : newStatus === 'confirmado' && currentStatus === 'em_atendimento' ? { startedAt: null }
    : newStatus === 'faltou' ? { finishedAt: new Date() }
    : {};
  const result = await appointmentsPrismaRepository.updateStatus(id, businessId, newStatus, currentStatus, extra);
  ```
- Apagar o bloco `if (newStatus === 'concluido') { ... prisma.earning.create ... }` (a receita passa a nascer no fechamento da comanda, Task 7) e o import de `prisma` se ficar sem uso.

Atenção: os testes existentes de `upsertStatus` sem `extra` (ex.: `appointmentsRepositoryUpdateStatus.test.ts`) chamam com 4 argumentos — o padrão `{}` mantém compatibilidade. Se algum teste esperava `toHaveBeenCalledWith(..., 'confirmado', 'aguardando_pagamento')` com 4 argumentos no serviço, atualize para incluir `{}`.

- [ ] **Step 5: Bot grava origem `whatsapp` e respeita quem está em atendimento**

Em `backend/src/services/whatsapp/whatsappFlowService.ts`:
- Linha ~1570: `appointmentService.create(businessId, appointmentPayload, { source: 'whatsapp' })`.
- Consulta de horários ocupados (linhas ~1406-1414): trocar `AND status != 'cancelado'` por
  ```sql
  AND (
    status IN ('confirmado', 'em_atendimento')
    OR (status = 'aguardando_pagamento' AND expires_at > NOW())
  )
  ```
  (antes, `concluido` e `faltou` também bloqueavam o horário — agora só o que ocupa de verdade).

- [ ] **Step 6: Rodar os testes de agendamento e do bot**

Run: `cd backend && npx vitest run src/__tests__/appointmentStatusFlow.test.ts src/__tests__/appointmentsRepositoryOccupying.test.ts src/__tests__/appointments.test.ts src/__tests__/appointmentsRepositoryUpdateStatus.test.ts src/__tests__/whatsappFlowService.test.ts && npx tsc --noEmit`
Expected: PASS. Se um teste antigo esperava `concluido` via `updateStatus` gerando `earning`, ele descreve o comportamento removido pela spec — atualize-o para esperar o `ConflictError`.

- [ ] **Step 7: Commit**

```bash
git add backend/src
git commit -m "feat(agenda): iniciar atendimento, faltou e conclusão só pela comanda

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Intervalo de almoço e comissão própria da profissional

**Files:**
- Modify: `backend/src/services/scheduleSettingsService.ts` (`generateAvailableTimeSlots`)
- Modify: `backend/src/validators/schemas/professionalSchemas.ts`, `backend/src/repositories/professionalRepository.ts`, `backend/src/services/professionalService.ts`
- Modify: `backend/src/modules/appointments/appointments.service.ts` (`getAvailableSlots`), `backend/src/modules/appointments/appointments.repository.ts` (novo `getProfessionalBreak`)
- Modify: `backend/src/modules/publicBooking/publicBooking.service.ts:39-44`, `backend/src/services/whatsapp/whatsappFlowService.ts:1418-1426`
- Test: `backend/src/__tests__/availabilityBreaks.test.ts`

**Interfaces:**
- Produces: `generateAvailableTimeSlots(settings, date, { serviceDurationMinutes, bookedTimes, currentDate, blockedRanges?: Array<{ start: string; end: string }> })` — exclui slot cujo intervalo `[slot, slot+duração)` cruza algum `[start, end)`.
- Produces: `appointmentsPrismaRepository.getProfessionalBreak(professionalId, businessId): Promise<{ start: string; end: string } | null>` (HH:MM).
- Produces: `professionalService.getProfessionals` devolve cada profissional com `breakStart: string | null`, `breakEnd: string | null` (HH:MM), `commissionServicePct: number | null`, `commissionProductPct: number | null`.
- Produces: schema de profissional aceita `breakStart`, `breakEnd` (`HH:MM` ou `null`), `commissionServicePct`, `commissionProductPct` (0–100 ou `null`).

- [ ] **Step 1: Escrever os testes**

`backend/src/__tests__/availabilityBreaks.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest';

vi.mock('../repositories/businessSettingsRepository.js', () => ({ businessSettingsRepository: {} }));
vi.mock('../utils/logger.js', () => ({ default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));

const { generateAvailableTimeSlots } = await import('../services/scheduleSettingsService.js');
const { createProfessionalSchema } = await import('../validators/schemas/professionalSchemas.js');

const settings = {
  openingTime: '09:00', closingTime: '15:00', slotIntervalMinutes: 30,
  allowWalkins: true, autoConfirmAppointments: false, timezone: 'America/Sao_Paulo',
  diasAbertos: { seg: true, ter: true, qua: true, qui: true, sex: true, sab: true, dom: true },
};
const amanha = '2026-10-14';
const agora = new Date('2026-10-13T08:00:00-03:00');

describe('intervalo de almoço bloqueia horários', () => {
  it('nenhum horário cruza o almoço de 12:00 às 13:00', () => {
    const slots = generateAvailableTimeSlots(settings, amanha, {
      serviceDurationMinutes: 60, currentDate: agora,
      blockedRanges: [{ start: '12:00', end: '13:00' }],
    });
    expect(slots).toContain('11:00');
    expect(slots).not.toContain('11:30');
    expect(slots).not.toContain('12:00');
    expect(slots).not.toContain('12:30');
    expect(slots).toContain('13:00');
  });

  it('sem intervalo, tudo continua como antes', () => {
    const slots = generateAvailableTimeSlots(settings, amanha, { serviceDurationMinutes: 60, currentDate: agora });
    expect(slots).toContain('12:00');
  });
});

describe('validação do cadastro da profissional', () => {
  it('aceita intervalo e comissão própria', () => {
    const r = createProfessionalSchema.safeParse({ name: 'Camila', breakStart: '12:00', breakEnd: '13:00', commissionServicePct: 50, commissionProductPct: 20 });
    expect(r.success).toBe(true);
  });

  it('recusa intervalo com fim antes do início', () => {
    const r = createProfessionalSchema.safeParse({ name: 'Camila', breakStart: '13:00', breakEnd: '12:00' });
    expect(r.success).toBe(false);
  });

  it('recusa intervalo pela metade', () => {
    const r = createProfessionalSchema.safeParse({ name: 'Camila', breakStart: '12:00' });
    expect(r.success).toBe(false);
  });

  it('recusa comissão acima de 100%', () => {
    const r = createProfessionalSchema.safeParse({ name: 'Camila', commissionServicePct: 120 });
    expect(r.success).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd backend && npx vitest run src/__tests__/availabilityBreaks.test.ts`
Expected: FAIL (slots `11:30`/`12:00` presentes; schema aceita campos desconhecidos sem validar).

- [ ] **Step 3: Implementar `blockedRanges`**

Em `scheduleSettingsService.ts`, na interface `GenerateSlotsOptions` acrescentar `blockedRanges?: Array<{ start: string; end: string }>;`, desestruturar `blockedRanges = []` e, dentro do `for`, trocar o `if` por:
```ts
const slot = fromMinutes(minute);
const cruzaBloqueio = blockedRanges.some(({ start, end }) => {
  const ini = toMinutes(start);
  const fim = toMinutes(end);
  return minute < fim && minute + duration > ini;
});
if (!normalizedBookedTimes.has(slot) && !cruzaBloqueio) {
  availableSlots.push(slot);
}
```

- [ ] **Step 4: Implementar o schema da profissional**

`backend/src/validators/schemas/professionalSchemas.ts`:
```ts
import { z } from 'zod';

const horaHHMM = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use o formato HH:MM');
const percentual = z.number().min(0, 'Mínimo 0%').max(100, 'Máximo 100%');

const baseProfessional = z.object({
  name: z.string().min(2, 'Nome do profissional deve ter pelo menos 2 caracteres').max(255),
  photo: z.string().url('URL da foto inválida').optional().nullable(),
  breakStart: horaHHMM.nullable().optional(),
  breakEnd: horaHHMM.nullable().optional(),
  commissionServicePct: percentual.nullable().optional(),
  commissionProductPct: percentual.nullable().optional(),
});

const intervaloValido = (d: { breakStart?: string | null; breakEnd?: string | null }) => {
  const temInicio = Boolean(d.breakStart);
  const temFim = Boolean(d.breakEnd);
  if (temInicio !== temFim) return false;
  if (!temInicio) return true;
  return (d.breakStart as string) < (d.breakEnd as string);
};
const mensagemIntervalo = { message: 'Informe início e fim do intervalo, com o fim depois do início', path: ['breakEnd'] };

export const createProfessionalSchema = baseProfessional.refine(intervaloValido, mensagemIntervalo);
export const updateProfessionalSchema = baseProfessional.partial().refine(intervaloValido, mensagemIntervalo);

export type CreateProfessional = z.infer<typeof createProfessionalSchema>;
export type UpdateProfessional = z.infer<typeof updateProfessionalSchema>;
```
(Comparar strings `HH:MM` funciona porque o formato tem largura fixa.)

- [ ] **Step 5: Repositório e serviço da profissional**

`professionalRepository.ts`:
- `create(data: { business_id: string; name: string; photo: string | null; breakStart?: string | null; breakEnd?: string | null; commissionServicePct?: number | null; commissionProductPct?: number | null })` grava os quatro campos novos (`breakStart: data.breakStart ? new Date(\`1970-01-01T${data.breakStart}:00Z\`) : null`, idem `breakEnd`; percentuais diretos).
- `update(id, businessId, data)` com o mesmo tipo opcional: incluir no `data` do `updateMany` só os campos `!== undefined` (para `PUT` parcial não apagar o que não veio), convertendo horas como acima.

`professionalService.ts`:
- `ProfessionalData` ganha os quatro campos opcionais e eles são repassados em `createProfessional`/`updateProfessional` (apagar o `as unknown as {...}` e chamar `professionalRepository.create/update` direto).
- `getProfessionals` passa a mapear:
  ```ts
  const hhmm = (t: Date | null) => (t ? t.toISOString().substring(11, 16) : null);
  const pct = (v: unknown) => (v === null || v === undefined ? null : Number(v));
  return (await professionalRepository.findAllActive(businessId)).map((p) => ({
    ...p,
    breakStart: hhmm(p.breakStart),
    breakEnd: hhmm(p.breakEnd),
    commissionServicePct: pct(p.commissionServicePct),
    commissionProductPct: pct(p.commissionProductPct),
  }));
  ```
- Validação de expediente (fim do intervalo dentro do horário do negócio): em `createProfessional` e `updateProfessional`, se `breakStart`/`breakEnd` vierem, carregar `getBusinessScheduleSettings(businessId)` e lançar `ValidationError('O intervalo precisa ficar dentro do horário de funcionamento')` se `breakStart < openingTime` ou `breakEnd > closingTime`.

- [ ] **Step 6: Levar o intervalo aos três canais**

`appointments.repository.ts` — novo método:
```ts
async getProfessionalBreak(professionalId: string, businessId: string): Promise<{ start: string; end: string } | null> {
  const p = await prisma.professional.findFirst({
    where: { id: professionalId, businessId },
    select: { breakStart: true, breakEnd: true },
  });
  if (!p?.breakStart || !p?.breakEnd) return null;
  return { start: p.breakStart.toISOString().substring(11, 16), end: p.breakEnd.toISOString().substring(11, 16) };
},
```
- Painel (`appointments.service.ts#getAvailableSlots`): buscar `const pausa = await appointmentsPrismaRepository.getProfessionalBreak(professionalId, businessId);` e passar `blockedRanges: pausa ? [pausa] : []`.
- Página pública (`publicBooking.service.ts`, função do topo que chama `generateAvailableTimeSlots`): mesma coisa.
- Bot (`whatsappFlowService.ts:1418`): importar `appointmentsPrismaRepository` e passar `blockedRanges` igual.

- [ ] **Step 7: Rodar**

Run: `cd backend && npx vitest run src/__tests__/availabilityBreaks.test.ts src/__tests__/scheduleSettingsService.test.ts src/__tests__/appointmentsAvailability.test.ts src/__tests__/publicBooking.test.ts src/__tests__/whatsappFlowService.test.ts && npx tsc --noEmit`
Expected: PASS. Se `appointmentsAvailability.test.ts`/`publicBooking.test.ts` mockam o repositório sem `getProfessionalBreak`, acrescentar `getProfessionalBreak: vi.fn().mockResolvedValue(null)` aos mocks.

- [ ] **Step 8: Commit**

```bash
git add backend/src
git commit -m "feat(agenda): intervalo de almoço por profissional bloqueia horário em todos os canais

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Cálculo puro da comanda

**Files:**
- Create: `backend/src/modules/comandas/comandaMath.ts`
- Test: `backend/src/__tests__/comandaMath.test.ts`

**Interfaces:**
- Produces:
```ts
export interface ComandaItemInput { kind: 'servico' | 'produto'; unitPrice: number; quantity: number }
export interface ComandaCalcInput {
  items: ComandaItemInput[];
  depositAvailable: number;   // sinal já pago (0 se não houver)
  discount: number;           // em R$
  tip: number;                // em R$
  serviceCommissionPct: number;
  productCommissionPct: number;
}
export interface ComandaCalc {
  servicesTotal: number; productsTotal: number; subtotal: number;
  depositApplied: number; discount: number; tip: number; totalCharged: number;
  revenue: number;            // subtotal − discount (faturamento)
  commissionService: number; commissionProduct: number; commissionTotal: number;
  houseRetention: number;
  serviceBase: number; productBase: number; // bases da comissão depois do rateio do desconto
}
export function calcularComanda(input: ComandaCalcInput): ComandaCalc
export const toCents: (v: number) => number
export const fromCents: (c: number) => number
```

- [ ] **Step 1: Escrever os testes**

`backend/src/__tests__/comandaMath.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { calcularComanda } from '../modules/comandas/comandaMath.js';

const base = { depositAvailable: 0, discount: 0, tip: 0, serviceCommissionPct: 50, productCommissionPct: 20 };

describe('calcularComanda', () => {
  it('reproduz a comanda do Stitch (R$ 110 serviço, R$ 25 produto, sinal 30, gorjeta 10)', () => {
    const r = calcularComanda({
      ...base,
      items: [{ kind: 'servico', unitPrice: 110, quantity: 1 }, { kind: 'produto', unitPrice: 25, quantity: 1 }],
      depositAvailable: 30,
      tip: 10,
    });
    expect(r).toMatchObject({
      servicesTotal: 110, productsTotal: 25, subtotal: 135, depositApplied: 30,
      totalCharged: 115, revenue: 135,
      commissionService: 55, commissionProduct: 5, commissionTotal: 70, houseRetention: 75,
    });
  });

  it('quantidade multiplica o preço do produto', () => {
    const r = calcularComanda({ ...base, items: [{ kind: 'produto', unitPrice: 12.5, quantity: 3 }] });
    expect(r.productsTotal).toBe(37.5);
  });

  it('sinal maior que o subtotal não deixa total negativo', () => {
    const r = calcularComanda({ ...base, items: [{ kind: 'servico', unitPrice: 20, quantity: 1 }], depositAvailable: 30 });
    expect(r.depositApplied).toBe(20);
    expect(r.totalCharged).toBe(0);
  });

  it('desconto fica limitado ao que sobra depois do sinal', () => {
    const r = calcularComanda({ ...base, items: [{ kind: 'servico', unitPrice: 100, quantity: 1 }], depositAvailable: 30, discount: 90 });
    expect(r.discount).toBe(70);
    expect(r.totalCharged).toBe(0);
    expect(r.revenue).toBe(30);
  });

  it('desconto é rateado entre serviço e produto antes da comissão', () => {
    const r = calcularComanda({
      ...base,
      items: [{ kind: 'servico', unitPrice: 80, quantity: 1 }, { kind: 'produto', unitPrice: 20, quantity: 1 }],
      discount: 10,
    });
    expect(r.serviceBase).toBe(72);
    expect(r.productBase).toBe(18);
    expect(r.commissionService).toBe(36);
    expect(r.commissionProduct).toBe(3.6);
  });

  it('gorjeta vai inteira para a profissional e fica fora do faturamento', () => {
    const r = calcularComanda({ ...base, items: [{ kind: 'servico', unitPrice: 50, quantity: 1 }], tip: 15 });
    expect(r.revenue).toBe(50);
    expect(r.totalCharged).toBe(65);
    expect(r.commissionTotal).toBe(25 + 15);
    expect(r.houseRetention).toBe(25);
  });

  it('arredonda centavos half-up', () => {
    const r = calcularComanda({ ...base, serviceCommissionPct: 33.33, items: [{ kind: 'servico', unitPrice: 10.01, quantity: 1 }] });
    expect(r.commissionService).toBe(3.34);
  });

  it('comanda vazia dá tudo zero', () => {
    const r = calcularComanda({ ...base, items: [] });
    expect(r.totalCharged).toBe(0);
    expect(r.commissionTotal).toBe(0);
  });

  it('nunca aceita valores negativos de entrada', () => {
    const r = calcularComanda({ ...base, items: [{ kind: 'servico', unitPrice: 50, quantity: 1 }], discount: -10, tip: -5 });
    expect(r.discount).toBe(0);
    expect(r.tip).toBe(0);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd backend && npx vitest run src/__tests__/comandaMath.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implementar**

`backend/src/modules/comandas/comandaMath.ts`:
```ts
/**
 * Cálculo da comanda, em centavos inteiros. Função pura: o serviço de comandas a usa
 * para gravar e o frontend tem uma cópia (frontend/src/lib/comanda.ts) para a prévia.
 * Qualquer mudança aqui precisa ser repetida lá — os dois têm os mesmos testes.
 */
export interface ComandaItemInput { kind: 'servico' | 'produto'; unitPrice: number; quantity: number }
export interface ComandaCalcInput {
  items: ComandaItemInput[];
  depositAvailable: number;
  discount: number;
  tip: number;
  serviceCommissionPct: number;
  productCommissionPct: number;
}
export interface ComandaCalc {
  servicesTotal: number; productsTotal: number; subtotal: number;
  depositApplied: number; discount: number; tip: number; totalCharged: number;
  revenue: number;
  commissionService: number; commissionProduct: number; commissionTotal: number;
  houseRetention: number;
  serviceBase: number; productBase: number;
}

export const toCents = (v: number): number => Math.round((Number(v) || 0) * 100);
export const fromCents = (c: number): number => c / 100;
const pos = (c: number) => Math.max(0, c);
// half-up em centavos: percentuais podem ter 2 casas (ex.: 33,33%)
const pctOf = (cents: number, pct: number) => Math.floor((cents * Math.round(pct * 100)) / 10000 + 0.5);

export function calcularComanda(input: ComandaCalcInput): ComandaCalc {
  let services = 0;
  let products = 0;
  for (const item of input.items) {
    const linha = toCents(item.unitPrice) * Math.max(1, Math.floor(item.quantity));
    if (item.kind === 'servico') services += linha; else products += linha;
  }
  const subtotal = services + products;
  const depositApplied = Math.min(pos(toCents(input.depositAvailable)), subtotal);
  const discount = Math.min(pos(toCents(input.discount)), subtotal - depositApplied);
  const tip = pos(toCents(input.tip));
  const totalCharged = subtotal - depositApplied - discount + tip;
  const revenue = subtotal - discount;

  const descontoServico = subtotal > 0 ? Math.round((discount * services) / subtotal) : 0;
  const serviceBase = services - descontoServico;
  const productBase = products - (discount - descontoServico);

  const commissionService = pctOf(serviceBase, input.serviceCommissionPct);
  const commissionProduct = pctOf(productBase, input.productCommissionPct);
  const commissionTotal = commissionService + commissionProduct + tip;
  const houseRetention = revenue - commissionService - commissionProduct;

  return {
    servicesTotal: fromCents(services),
    productsTotal: fromCents(products),
    subtotal: fromCents(subtotal),
    depositApplied: fromCents(depositApplied),
    discount: fromCents(discount),
    tip: fromCents(tip),
    totalCharged: fromCents(totalCharged),
    revenue: fromCents(revenue),
    commissionService: fromCents(commissionService),
    commissionProduct: fromCents(commissionProduct),
    commissionTotal: fromCents(commissionTotal),
    houseRetention: fromCents(houseRetention),
    serviceBase: fromCents(serviceBase),
    productBase: fromCents(productBase),
  };
}
```

Nota sobre o teste do Stitch: o Stitch mostra "Retenção Casa R$ 55,00", que só fecha se a gorjeta for descontada da casa — isso contradiz a decisão 5 da spec (gorjeta não é faturamento). O correto pela spec é `135 − 55 − 5 = 75`; o teste fixa 75 de propósito.

- [ ] **Step 4: Rodar**

Run: `cd backend && npx vitest run src/__tests__/comandaMath.test.ts`
Expected: PASS (9 testes).

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/comandas/comandaMath.ts backend/src/__tests__/comandaMath.test.ts
git commit -m "feat(comanda): cálculo de totais, sinal, desconto, gorjeta e repasse em centavos

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Catálogo de produtos (API)

**Files:**
- Create: `backend/src/modules/products/products.types.ts`, `products.repository.ts`, `products.service.ts`, `products.controller.ts`, `products.routes.ts`
- Modify: `backend/src/server.ts` (registrar `${API_V1}/products`)
- Test: `backend/src/__tests__/products.test.ts`

**Interfaces:**
- Produces: `GET /products` → `ProductDto[]` (ativos, por nome); `POST /products` `{ name, description?, price }` → `ProductDto`; `PUT /products/:id` (parcial) → `ProductDto`; `DELETE /products/:id` → desativa.
- `ProductDto = { id: string; name: string; description: string | null; price: number; active: boolean }`
- Produces: `productsRepository.findActiveByIds(businessId, ids): Promise<Array<{ id; name; price }>>` (usado na Task 7).

- [ ] **Step 1: Escrever os testes**

`backend/src/__tests__/products.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const repo = vi.hoisted(() => ({ list: vi.fn(), create: vi.fn(), update: vi.fn(), deactivate: vi.fn(), findActiveByIds: vi.fn() }));
vi.mock('../modules/products/products.repository.js', () => ({ productsRepository: repo }));

const { productsService } = await import('../modules/products/products.service.js');
const { CreateProductSchema } = await import('../modules/products/products.types.js');
const { NotFoundError } = await import('../utils/errors.js');

describe('productsService', () => {
  beforeEach(() => vi.clearAllMocks());

  it('lista convertendo preço para número', async () => {
    repo.list.mockResolvedValue([{ id: 'p1', name: 'Óleo', description: null, price: '25.00', active: true }]);
    await expect(productsService.list('b1')).resolves.toEqual([{ id: 'p1', name: 'Óleo', description: null, price: 25, active: true }]);
  });

  it('atualizar produto de outro negócio dá NotFound', async () => {
    repo.update.mockResolvedValue(null);
    await expect(productsService.update('p1', 'b1', { price: 30 })).rejects.toBeInstanceOf(NotFoundError);
  });

  it('remover só desativa', async () => {
    repo.deactivate.mockResolvedValue(true);
    await productsService.remove('p1', 'b1');
    expect(repo.deactivate).toHaveBeenCalledWith('p1', 'b1');
  });
});

describe('CreateProductSchema', () => {
  it('recusa preço zero ou negativo', () => {
    expect(CreateProductSchema.safeParse({ name: 'Óleo', price: 0 }).success).toBe(false);
  });
  it('aceita produto com descrição curta', () => {
    expect(CreateProductSchema.safeParse({ name: 'Óleo', description: 'Produto Home Care', price: 25 }).success).toBe(true);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd backend && npx vitest run src/__tests__/products.test.ts` → FAIL (módulo não existe).

- [ ] **Step 3: Implementar o módulo**

`products.types.ts`:
```ts
import { z } from 'zod';

export const CreateProductSchema = z.object({
  name: z.string().trim().min(2, 'Nome deve ter pelo menos 2 caracteres').max(255),
  description: z.string().trim().max(255).nullable().optional(),
  price: z.number().positive('Preço deve ser maior que zero').multipleOf(0.01),
});
export const UpdateProductSchema = CreateProductSchema.partial();

export type CreateProductInput = z.infer<typeof CreateProductSchema>;
export type UpdateProductInput = z.infer<typeof UpdateProductSchema>;

export interface ProductDto { id: string; name: string; description: string | null; price: number; active: boolean }
```

`products.repository.ts`:
```ts
import { prisma } from '../../config/prisma.js';
import type { CreateProductInput, UpdateProductInput } from './products.types.js';

const SELECT = { id: true, name: true, description: true, price: true, active: true } as const;

export const productsRepository = {
  list(businessId: string) {
    return prisma.product.findMany({ where: { businessId, active: true }, select: SELECT, orderBy: { name: 'asc' } });
  },
  create(businessId: string, data: CreateProductInput) {
    return prisma.product.create({ data: { businessId, name: data.name, description: data.description ?? null, price: data.price }, select: SELECT });
  },
  async update(id: string, businessId: string, data: UpdateProductInput) {
    const r = await prisma.product.updateMany({
      where: { id, businessId, active: true },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.price !== undefined && { price: data.price }),
      },
    });
    if (r.count === 0) return null;
    return prisma.product.findFirst({ where: { id }, select: SELECT });
  },
  async deactivate(id: string, businessId: string) {
    const r = await prisma.product.updateMany({ where: { id, businessId, active: true }, data: { active: false } });
    return r.count > 0;
  },
  findActiveByIds(businessId: string, ids: string[]) {
    return prisma.product.findMany({ where: { businessId, active: true, id: { in: ids } }, select: { id: true, name: true, price: true } });
  },
};
```

`products.service.ts`:
```ts
import { NotFoundError } from '../../utils/errors.js';
import { productsRepository } from './products.repository.js';
import type { CreateProductInput, UpdateProductInput, ProductDto } from './products.types.js';

const toDto = (p: { id: string; name: string; description: string | null; price: unknown; active: boolean }): ProductDto => ({
  id: p.id, name: p.name, description: p.description, price: Number(p.price), active: p.active,
});

export const productsService = {
  async list(businessId: string) {
    return (await productsRepository.list(businessId)).map(toDto);
  },
  async create(businessId: string, data: CreateProductInput) {
    return toDto(await productsRepository.create(businessId, data));
  },
  async update(id: string, businessId: string, data: UpdateProductInput) {
    const p = await productsRepository.update(id, businessId, data);
    if (!p) throw new NotFoundError('Produto');
    return toDto(p);
  },
  async remove(id: string, businessId: string) {
    const ok = await productsRepository.deactivate(id, businessId);
    if (!ok) throw new NotFoundError('Produto');
  },
};
```

`products.controller.ts` — quatro handlers no formato de `appointments.controller.ts` (`try { const data = await productsService.X(req.user.businessId!, ...); sendSuccess|sendCreated(res, data) } catch (e) { next(e) }`), com `String(req.params['id'])` para o id e `sendSuccess(res, { message: 'Produto removido' })` no delete.

`products.routes.ts`:
```ts
import express from 'express';
import { authMiddleware } from '../../middleware/auth.js';
import { requireTenantRoles } from '../../middleware/rbac.js';
import { requireFeature } from '../../middleware/subscriptionGuard.js';
import { validate } from '../../middleware/validate.js';
import { CreateProductSchema, UpdateProductSchema } from './products.types.js';
import { listProducts, createProduct, updateProduct, deleteProduct } from './products.controller.js';

const router = express.Router();
const guard = [authMiddleware, requireTenantRoles, requireFeature('services')];

router.get('/', ...guard, listProducts);
router.post('/', ...guard, validate({ body: CreateProductSchema }), createProduct);
router.put('/:id', ...guard, validate({ body: UpdateProductSchema }), updateProduct);
router.delete('/:id', ...guard, deleteProduct);

export default router;
```

`server.ts`: `import productRoutes from './modules/products/products.routes.js';` e, junto dos outros `app.use`, `app.use(\`${API_V1}/products\`, productRoutes);`.

- [ ] **Step 4: Rodar**

Run: `cd backend && npx vitest run src/__tests__/products.test.ts && npx tsc --noEmit` → PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src
git commit -m "feat(produtos): catálogo de produtos para a comanda

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 6: Regra de comissão do negócio

**Files:**
- Create: `backend/src/modules/comandas/commissionSettings.ts`
- Test: `backend/src/__tests__/commissionSettings.test.ts`

**Interfaces:**
- Produces: `commissionSettings.get(businessId): Promise<{ serviceCommissionPct: number; productCommissionPct: number }>` (0/0 quando não há linha).
- Produces: `commissionSettings.update(businessId, { serviceCommissionPct, productCommissionPct })` (upsert em `business_settings`).
- Produces: `resolveCommission(professional: { commissionServicePct: unknown; commissionProductPct: unknown }, negocio: { serviceCommissionPct: number; productCommissionPct: number }): { servicePct: number; productPct: number; origem: 'profissional' | 'negocio' }` — cada percentual da profissional, quando não nulo, substitui o do negócio; `origem` é `'profissional'` se pelo menos um veio dela.
- Produces: `CommissionSettingsSchema` (zod, dois números 0–100).

- [ ] **Step 1: Escrever os testes**

`backend/src/__tests__/commissionSettings.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const prismaMock = vi.hoisted(() => ({ businessSettings: { findUnique: vi.fn(), upsert: vi.fn() } }));
vi.mock('../config/prisma.js', () => ({ prisma: prismaMock }));

const { commissionSettings, resolveCommission } = await import('../modules/comandas/commissionSettings.js');

describe('commissionSettings', () => {
  beforeEach(() => vi.clearAllMocks());

  it('sem configuração salva devolve 0% e 0%', async () => {
    prismaMock.businessSettings.findUnique.mockResolvedValue(null);
    await expect(commissionSettings.get('b1')).resolves.toEqual({ serviceCommissionPct: 0, productCommissionPct: 0 });
  });

  it('converte Decimal para número', async () => {
    prismaMock.businessSettings.findUnique.mockResolvedValue({ commissionServicePct: '50.00', commissionProductPct: '20.00' });
    await expect(commissionSettings.get('b1')).resolves.toEqual({ serviceCommissionPct: 50, productCommissionPct: 20 });
  });

  it('salva com upsert por negócio', async () => {
    prismaMock.businessSettings.upsert.mockResolvedValue({ commissionServicePct: 40, commissionProductPct: 10 });
    await commissionSettings.update('b1', { serviceCommissionPct: 40, productCommissionPct: 10 });
    expect(prismaMock.businessSettings.upsert).toHaveBeenCalledWith({
      where: { businessId: 'b1' },
      create: { businessId: 'b1', commissionServicePct: 40, commissionProductPct: 10 },
      update: { commissionServicePct: 40, commissionProductPct: 10 },
      select: { commissionServicePct: true, commissionProductPct: true },
    });
  });
});

describe('resolveCommission', () => {
  const negocio = { serviceCommissionPct: 50, productCommissionPct: 20 };

  it('usa o padrão do negócio quando a profissional não tem regra própria', () => {
    expect(resolveCommission({ commissionServicePct: null, commissionProductPct: null }, negocio))
      .toEqual({ servicePct: 50, productPct: 20, origem: 'negocio' });
  });

  it('percentual próprio substitui só o campo preenchido', () => {
    expect(resolveCommission({ commissionServicePct: '60', commissionProductPct: null }, negocio))
      .toEqual({ servicePct: 60, productPct: 20, origem: 'profissional' });
  });

  it('zero próprio é regra válida (não cai no padrão)', () => {
    expect(resolveCommission({ commissionServicePct: 0, commissionProductPct: 0 }, negocio))
      .toEqual({ servicePct: 0, productPct: 0, origem: 'profissional' });
  });
});
```

- [ ] **Step 2: Rodar e ver falhar** — `cd backend && npx vitest run src/__tests__/commissionSettings.test.ts` → FAIL (módulo não existe).

- [ ] **Step 3: Implementar**

`backend/src/modules/comandas/commissionSettings.ts`:
```ts
import { z } from 'zod';
import { prisma } from '../../config/prisma.js';

export const CommissionSettingsSchema = z.object({
  serviceCommissionPct: z.number().min(0).max(100),
  productCommissionPct: z.number().min(0).max(100),
});
export type CommissionSettings = z.infer<typeof CommissionSettingsSchema>;

const num = (v: unknown) => (v === null || v === undefined ? 0 : Number(v));

export const commissionSettings = {
  async get(businessId: string): Promise<CommissionSettings> {
    const s = await prisma.businessSettings.findUnique({
      where: { businessId },
      select: { commissionServicePct: true, commissionProductPct: true },
    });
    return { serviceCommissionPct: num(s?.commissionServicePct), productCommissionPct: num(s?.commissionProductPct) };
  },

  async update(businessId: string, data: CommissionSettings): Promise<CommissionSettings> {
    const s = await prisma.businessSettings.upsert({
      where: { businessId },
      create: { businessId, commissionServicePct: data.serviceCommissionPct, commissionProductPct: data.productCommissionPct },
      update: { commissionServicePct: data.serviceCommissionPct, commissionProductPct: data.productCommissionPct },
      select: { commissionServicePct: true, commissionProductPct: true },
    });
    return { serviceCommissionPct: num(s.commissionServicePct), productCommissionPct: num(s.commissionProductPct) };
  },
};

export function resolveCommission(
  professional: { commissionServicePct: unknown; commissionProductPct: unknown },
  negocio: CommissionSettings,
): { servicePct: number; productPct: number; origem: 'profissional' | 'negocio' } {
  const temServ = professional.commissionServicePct !== null && professional.commissionServicePct !== undefined;
  const temProd = professional.commissionProductPct !== null && professional.commissionProductPct !== undefined;
  return {
    servicePct: temServ ? Number(professional.commissionServicePct) : negocio.serviceCommissionPct,
    productPct: temProd ? Number(professional.commissionProductPct) : negocio.productCommissionPct,
    origem: temServ || temProd ? 'profissional' : 'negocio',
  };
}
```
(As rotas `GET/PUT /comandas/settings` são registradas na Task 7, junto do resto do módulo.)

- [ ] **Step 4: Rodar** — mesmo comando → PASS; `npx tsc --noEmit` sem erros.

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/comandas/commissionSettings.ts backend/src/__tests__/commissionSettings.test.ts
git commit -m "feat(comanda): regra de comissão do negócio e da profissional

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Módulo de comandas (abrir, salvar rascunho, fechar, atalhos, comprovante)

**Files:**
- Create: `backend/src/utils/businessDate.ts`
- Create: `backend/src/modules/comandas/comandas.types.ts`, `comandas.repository.ts`, `comandas.service.ts`, `comandas.controller.ts`, `comandas.routes.ts`, `receipt.ts`
- Modify: `backend/src/modules/appointments/appointments.routes.ts` (rota `POST /:id/comanda`), `backend/src/server.ts` (registrar `${API_V1}/comandas`)
- Test: `backend/src/__tests__/comandasService.test.ts`, `backend/src/__tests__/receipt.test.ts`

**Interfaces:**
- Consumes: `calcularComanda`, `ComandaCalc` (Task 4); `commissionSettings`, `resolveCommission` (Task 6); `productsRepository.findActiveByIds` (Task 5).
- Produces: `todayInTimezone(timezone: string, now?: Date): string` (`YYYY-MM-DD`) em `utils/businessDate.ts` (usado também na Task 8).
- Produces: rotas
  - `POST /appointments/:id/comanda` → `ComandaDetailDto` (cria em rascunho ou devolve a existente; `confirmado` vira `em_atendimento`).
  - `GET /comandas/settings` → `CommissionSettings`; `PUT /comandas/settings` body `CommissionSettings`.
  - `GET /comandas/shortcuts` → `Array<{ kind: 'servico' | 'produto'; id: string; name: string; price: number }>` (máx. 3).
  - `GET /comandas/:id` → `ComandaDetailDto`.
  - `PUT /comandas/:id` body `SaveComandaInput` → `ComandaDetailDto`.
  - `POST /comandas/:id/close` body `SaveComandaInput` → `ComandaDetailDto` (409 `CASH_CLOSED`; 409 `CONFLICT` se já fechada; 400 sem forma de pagamento).
  - `POST /comandas/:id/receipt` → `{ sent: boolean }`.
- Produces tipos (em `comandas.types.ts`): `PaymentMethod`, `SaveComandaInput`, `ComandaItemDto`, `ComandaDetailDto`, `NewExtraItem` — definidos no Step 4 abaixo; o frontend (Task 10) espelha `ComandaDetailDto` campo a campo.

- [ ] **Step 1: Escrever os testes do serviço**

`backend/src/__tests__/comandasService.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const repo = vi.hoisted(() => ({
  findAppointmentForComanda: vi.fn(),
  findComandaByAppointment: vi.fn(),
  createComanda: vi.fn(),
  findComandaById: vi.fn(),
  replaceExtras: vi.fn(),
  updateDraftTotals: vi.fn(),
  findOpenCashSession: vi.fn(),
  closeComandaTx: vi.fn(),
  markReceiptSent: vi.fn(),
  topExtras: vi.fn(),
  findActiveServicesByIds: vi.fn(),
}));
vi.mock('../modules/comandas/comandas.repository.js', () => ({ comandasRepository: repo }));
const products = vi.hoisted(() => ({ findActiveByIds: vi.fn() }));
vi.mock('../modules/products/products.repository.js', () => ({ productsRepository: products }));
const settings = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('../modules/comandas/commissionSettings.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../modules/comandas/commissionSettings.js')>()),
  commissionSettings: settings,
}));
const receipt = vi.hoisted(() => ({ sendComandaReceipt: vi.fn() }));
vi.mock('../modules/comandas/receipt.js', () => receipt);
vi.mock('../modules/whatsapp/whatsapp.service.js', () => ({ whatsappService: { getStatus: vi.fn().mockResolvedValue({ status: 'connected' }) } }));
vi.mock('../services/scheduleSettingsService.js', () => ({ getBusinessScheduleSettings: vi.fn().mockResolvedValue({ timezone: 'America/Sao_Paulo' }) }));
vi.mock('../config/prisma.js', () => ({ prisma: { business: { findUnique: vi.fn().mockResolvedValue({ name: 'Studio Aurora' }) } } }));

const { comandasService } = await import('../modules/comandas/comandas.service.js');

const appt = (status = 'confirmado', deposit: number | null = null) => ({
  id: 'a1', businessId: 'b1', status, date: new Date('2026-10-13'), time: new Date('1970-01-01T10:00:00Z'), source: 'painel',
  depositAmount: deposit,
  client: { id: 'c1', name: 'Mariana Souza', phone: '83999990000' },
  professional: { id: 'p1', name: 'Camila Rocha', commissionServicePct: null, commissionProductPct: null },
  service: { id: 's1', name: 'Manutenção Fibra de Vidro', price: '110.00', durationMinutes: 90 },
});

const comanda = (over: Record<string, unknown> = {}) => ({
  id: 'k1', number: 1042, status: 'rascunho', businessId: 'b1',
  discountAmount: 0, tipAmount: 0, paymentMethod: null, closedAt: null, receiptSentAt: null,
  appointment: appt('em_atendimento', 30),
  items: [
    { id: 'i1', kind: 'servico', serviceId: 's1', productId: null, name: 'Manutenção Fibra de Vidro', unitPrice: '110.00', quantity: 1, durationMinutes: 90, isMain: true },
  ],
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
  settings.get.mockResolvedValue({ serviceCommissionPct: 50, productCommissionPct: 20 });
  repo.findActiveServicesByIds.mockResolvedValue([]);
  products.findActiveByIds.mockResolvedValue([]);
});

describe('abrir comanda', () => {
  it('cria em rascunho com o serviço principal e inicia o atendimento', async () => {
    repo.findAppointmentForComanda.mockResolvedValue(appt('confirmado'));
    repo.findComandaByAppointment.mockResolvedValue(null);
    repo.createComanda.mockResolvedValue({ id: 'k1' });
    repo.findComandaById.mockResolvedValue(comanda());
    const dto = await comandasService.open('a1', 'b1');
    expect(repo.createComanda).toHaveBeenCalledWith('b1', expect.objectContaining({ id: 'a1' }), { startAppointment: true });
    expect(dto.number).toBe(1042);
    expect(dto.items[0]).toMatchObject({ isMain: true, unitPrice: 110 });
    expect(dto.whatsappConnected).toBe(true);
  });

  it('devolve a comanda existente em vez de criar outra', async () => {
    repo.findAppointmentForComanda.mockResolvedValue(appt('em_atendimento'));
    repo.findComandaByAppointment.mockResolvedValue({ id: 'k1' });
    repo.findComandaById.mockResolvedValue(comanda());
    await comandasService.open('a1', 'b1');
    expect(repo.createComanda).not.toHaveBeenCalled();
  });

  it('agendamento cancelado ou faltou não abre comanda', async () => {
    repo.findAppointmentForComanda.mockResolvedValue(appt('faltou'));
    repo.findComandaByAppointment.mockResolvedValue(null);
    await expect(comandasService.open('a1', 'b1')).rejects.toThrow('Este agendamento não pode receber comanda');
  });
});

describe('salvar rascunho', () => {
  it('preço vem do banco, nunca do navegador', async () => {
    repo.findComandaById.mockResolvedValue(comanda());
    products.findActiveByIds.mockResolvedValue([{ id: 'pr1', name: 'Óleo Hidratante de Cutícula 10ml', price: '25.00' }]);
    await comandasService.save('k1', 'b1', { extras: [{ kind: 'produto', id: 'pr1', quantity: 2 }], discount: 0, tip: 10, paymentMethod: 'pix' });
    expect(repo.replaceExtras).toHaveBeenCalledWith('k1', [
      { kind: 'produto', serviceId: null, productId: 'pr1', name: 'Óleo Hidratante de Cutícula 10ml', unitPrice: 25, quantity: 2, durationMinutes: null },
    ]);
    expect(repo.updateDraftTotals).toHaveBeenCalledWith('k1', expect.objectContaining({ productsTotal: 50, tipAmount: 10, paymentMethod: 'pix' }));
  });

  it('produto inexistente ou de outro negócio é recusado', async () => {
    repo.findComandaById.mockResolvedValue(comanda());
    await expect(comandasService.save('k1', 'b1', { extras: [{ kind: 'produto', id: 'x', quantity: 1 }], discount: 0, tip: 0, paymentMethod: null }))
      .rejects.toThrow('Item não encontrado');
  });

  it('comanda fechada não aceita mais alteração', async () => {
    repo.findComandaById.mockResolvedValue(comanda({ status: 'fechada' }));
    await expect(comandasService.save('k1', 'b1', { extras: [], discount: 0, tip: 0, paymentMethod: null }))
      .rejects.toThrow('Esta comanda já foi fechada');
  });
});

describe('fechar comanda', () => {
  const entrada = { extras: [], discount: 0, tip: 0, paymentMethod: 'pix' as const };

  it('sem caixa aberto recusa com CASH_CLOSED', async () => {
    repo.findComandaById.mockResolvedValue(comanda());
    repo.findOpenCashSession.mockResolvedValue(null);
    await expect(comandasService.close('k1', 'b1', 'u1', entrada)).rejects.toMatchObject({ statusCode: 409, code: 'CASH_CLOSED' });
  });

  it('com valor a cobrar exige forma de pagamento', async () => {
    repo.findComandaById.mockResolvedValue(comanda());
    repo.findOpenCashSession.mockResolvedValue({ id: 'cx1' });
    await expect(comandasService.close('k1', 'b1', 'u1', { ...entrada, paymentMethod: null }))
      .rejects.toThrow('Escolha a forma de pagamento');
  });

  it('fecha copiando percentuais, liga ao caixa de hoje e grava receita sem gorjeta', async () => {
    repo.findComandaById
      .mockResolvedValueOnce(comanda())
      .mockResolvedValueOnce(comanda())
      .mockResolvedValue(comanda({ status: 'fechada', closedAt: new Date() }));
    repo.findOpenCashSession.mockResolvedValue({ id: 'cx1' });
    repo.closeComandaTx.mockResolvedValue(true);
    receipt.sendComandaReceipt.mockResolvedValue(true);

    await comandasService.close('k1', 'b1', 'u1', { ...entrada, tip: 10 });

    expect(repo.closeComandaTx).toHaveBeenCalledWith(expect.objectContaining({
      comandaId: 'k1', businessId: 'b1', userId: 'u1', cashSessionId: 'cx1',
      appointmentId: 'a1', appointmentDate: new Date('2026-10-13'),
      servicePct: 50, productPct: 20,
      calc: expect.objectContaining({ subtotal: 110, depositApplied: 30, tip: 10, totalCharged: 90, revenue: 110, commissionService: 55 }),
    }));
    expect(repo.markReceiptSent).toHaveBeenCalledWith('k1');
  });

  it('segunda pessoa fechando a mesma comanda recebe 409 e não envia comprovante', async () => {
    repo.findComandaById.mockResolvedValue(comanda());
    repo.findOpenCashSession.mockResolvedValue({ id: 'cx1' });
    repo.closeComandaTx.mockResolvedValue(false);
    await expect(comandasService.close('k1', 'b1', 'u1', entrada)).rejects.toThrow('Esta comanda já foi fechada');
    expect(receipt.sendComandaReceipt).not.toHaveBeenCalled();
  });

  it('caixa usado é o do dia do fechamento, não o do agendamento', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-13T01:30:00-03:00'));
    repo.findComandaById.mockResolvedValue(comanda({ appointment: { ...appt('em_atendimento'), date: new Date('2026-10-12') } }));
    repo.findOpenCashSession.mockResolvedValue(null);
    await expect(comandasService.close('k1', 'b1', 'u1', entrada)).rejects.toMatchObject({ code: 'CASH_CLOSED' });
    expect(repo.findOpenCashSession).toHaveBeenCalledWith('b1', '2026-10-13');
  });

  it('falha no comprovante não desfaz o fechamento', async () => {
    repo.findComandaById
      .mockResolvedValueOnce(comanda()).mockResolvedValueOnce(comanda())
      .mockResolvedValue(comanda({ status: 'fechada', closedAt: new Date() }));
    repo.findOpenCashSession.mockResolvedValue({ id: 'cx1' });
    repo.closeComandaTx.mockResolvedValue(true);
    receipt.sendComandaReceipt.mockRejectedValue(new Error('Evolution fora do ar'));
    await expect(comandasService.close('k1', 'b1', 'u1', entrada)).resolves.toMatchObject({ status: 'fechada' });
    expect(repo.markReceiptSent).not.toHaveBeenCalled();
  });
});

describe('atalhos', () => {
  it('devolve no máximo 3 itens extras mais usados, com preço numérico', async () => {
    repo.topExtras.mockResolvedValue([
      { kind: 'produto', id: 'pr1', name: 'Base Fortalecedora', price: '35' },
      { kind: 'servico', id: 's9', name: 'Remoção Express', price: '30' },
      { kind: 'servico', id: 's8', name: 'Nail Art Simples', price: '20' },
    ]);
    await expect(comandasService.shortcuts('b1')).resolves.toEqual([
      { kind: 'produto', id: 'pr1', name: 'Base Fortalecedora', price: 35 },
      { kind: 'servico', id: 's9', name: 'Remoção Express', price: 30 },
      { kind: 'servico', id: 's8', name: 'Nail Art Simples', price: 20 },
    ]);
    expect(repo.topExtras).toHaveBeenCalledWith('b1', 90, 3);
  });
});
```

`backend/src/__tests__/receipt.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest';
vi.mock('../services/whatsapp/index.js', () => ({ sendWhatsAppMessage: vi.fn() }));
const { montarComprovante } = await import('../modules/comandas/receipt.js');

describe('montarComprovante', () => {
  it('lista itens, sinal, desconto, gorjeta, total e forma de pagamento, sem falar em recibo fiscal', () => {
    const texto = montarComprovante({
      negocio: 'Studio Aurora', numero: 1042, cliente: 'Mariana Souza', profissional: 'Camila Rocha',
      itens: [{ name: 'Manutenção Fibra de Vidro', quantity: 1, unitPrice: 110 }, { name: 'Óleo Hidratante', quantity: 2, unitPrice: 25 }],
      calc: { depositApplied: 30, discount: 5, tip: 10, totalCharged: 135 },
      paymentMethod: 'pix',
    });
    expect(texto).toContain('Comanda #1042');
    expect(texto).toContain('Manutenção Fibra de Vidro');
    expect(texto).toContain('2x Óleo Hidratante');
    expect(texto).toContain('Sinal Pix: -R$ 30,00');
    expect(texto).toContain('Desconto: -R$ 5,00');
    expect(texto).toContain('Gorjeta para Camila: R$ 10,00');
    expect(texto).toContain('Total pago: R$ 135,00 (Pix)');
    expect(texto.toLowerCase()).not.toContain('fiscal');
  });

  it('formata milhar com ponto', () => {
    const texto = montarComprovante({
      negocio: 'X', numero: 1, cliente: 'Ana', profissional: 'Bia',
      itens: [{ name: 'Pacote', quantity: 1, unitPrice: 1250 }],
      calc: { depositApplied: 0, discount: 0, tip: 0, totalCharged: 1250 }, paymentMethod: 'credito',
    });
    expect(texto).toContain('Total pago: R$ 1.250,00 (Cartão de crédito)');
  });
});
```

- [ ] **Step 2: Rodar e ver falhar** — `cd backend && npx vitest run src/__tests__/comandasService.test.ts src/__tests__/receipt.test.ts` → FAIL (módulos não existem).

- [ ] **Step 3: `backend/src/utils/businessDate.ts`**

```ts
// Data "de hoje" no fuso do negócio, no formato YYYY-MM-DD (o locale en-CA formata assim).
export const todayInTimezone = (timezone: string, now: Date = new Date()): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
```

- [ ] **Step 4: `comandas.types.ts`**

```ts
import { z } from 'zod';
import type { ComandaCalc } from './comandaMath.js';

export const PAYMENT_METHODS = ['pix', 'debito', 'credito', 'dinheiro'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const SaveComandaSchema = z.object({
  extras: z.array(z.object({
    kind: z.enum(['servico', 'produto']),
    id: z.string().uuid(),
    quantity: z.number().int().min(1, 'Quantidade mínima é 1').max(99),
  })).max(30),
  discount: z.number().min(0).multipleOf(0.01),
  tip: z.number().min(0).multipleOf(0.01),
  paymentMethod: z.enum(PAYMENT_METHODS).nullable(),
});
export type SaveComandaInput = z.infer<typeof SaveComandaSchema>;

export interface ComandaItemDto {
  id: string | null; kind: 'servico' | 'produto'; refId: string | null; name: string;
  unitPrice: number; quantity: number; durationMinutes: number | null; isMain: boolean;
}

export interface ComandaDetailDto {
  id: string; number: number; status: 'rascunho' | 'fechada';
  appointment: { id: string; date: string; time: string; status: string; source: string };
  client: { id: string; name: string; phone: string };
  professional: { id: string; name: string };
  items: ComandaItemDto[];
  depositAvailable: number;
  discount: number; tip: number; paymentMethod: PaymentMethod | null;
  commission: { servicePct: number; productPct: number; origem: 'profissional' | 'negocio' };
  calc: ComandaCalc;
  whatsappConnected: boolean;
  closedAt: string | null; receiptSentAt: string | null;
}

export interface NewExtraItem {
  kind: 'servico' | 'produto'; serviceId: string | null; productId: string | null;
  name: string; unitPrice: number; quantity: number; durationMinutes: number | null;
}
```

- [ ] **Step 5: `comandas.repository.ts`**

```ts
import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma.js';
import type { ComandaCalc } from './comandaMath.js';
import type { NewExtraItem, PaymentMethod } from './comandas.types.js';

const APPOINTMENT_SELECT = {
  id: true, businessId: true, status: true, date: true, time: true, source: true, depositAmount: true,
  client: { select: { id: true, name: true, phone: true } },
  professional: { select: { id: true, name: true, commissionServicePct: true, commissionProductPct: true } },
  service: { select: { id: true, name: true, price: true, durationMinutes: true } },
} as const;

export type AppointmentForComanda = Prisma.AppointmentGetPayload<{ select: typeof APPOINTMENT_SELECT }>;

export const comandasRepository = {
  findAppointmentForComanda(appointmentId: string, businessId: string) {
    return prisma.appointment.findFirst({ where: { id: appointmentId, businessId }, select: APPOINTMENT_SELECT });
  },

  findComandaByAppointment(appointmentId: string, businessId: string) {
    return prisma.comanda.findFirst({ where: { appointmentId, businessId }, select: { id: true } });
  },

  /** Número sequencial por negócio sob advisory lock; serviço principal como 1º item. */
  createComanda(businessId: string, appt: AppointmentForComanda, opts: { startAppointment: boolean }) {
    return prisma.$transaction(async (tx) => {
      const chave = `comanda|${businessId}`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${chave}::text))`;
      const existente = await tx.comanda.findFirst({ where: { appointmentId: appt.id }, select: { id: true } });
      if (existente) return existente;
      const max = await tx.comanda.aggregate({ where: { businessId }, _max: { number: true } });
      const comanda = await tx.comanda.create({
        data: {
          businessId, number: (max._max.number ?? 1000) + 1, appointmentId: appt.id,
          clientId: appt.client.id, professionalId: appt.professional.id,
          items: { create: [{
            kind: 'servico', serviceId: appt.service.id, name: appt.service.name,
            unitPrice: appt.service.price, quantity: 1, durationMinutes: appt.service.durationMinutes, isMain: true,
          }] },
        },
        select: { id: true },
      });
      if (opts.startAppointment) {
        await tx.appointment.updateMany({ where: { id: appt.id, status: 'confirmado' }, data: { status: 'em_atendimento', startedAt: new Date() } });
      }
      return comanda;
    });
  },

  findComandaById(id: string, businessId: string) {
    return prisma.comanda.findFirst({
      where: { id, businessId },
      select: {
        id: true, number: true, status: true, businessId: true,
        discountAmount: true, tipAmount: true, paymentMethod: true, closedAt: true, receiptSentAt: true,
        appointment: { select: APPOINTMENT_SELECT },
        items: {
          select: { id: true, kind: true, serviceId: true, productId: true, name: true, unitPrice: true, quantity: true, durationMinutes: true, isMain: true },
          orderBy: [{ isMain: 'desc' }, { createdAt: 'asc' }],
        },
      },
    });
  },

  findActiveServicesByIds(businessId: string, ids: string[]) {
    if (ids.length === 0) return Promise.resolve([]);
    return prisma.service.findMany({
      where: { businessId, active: true, id: { in: ids } },
      select: { id: true, name: true, price: true, durationMinutes: true },
    });
  },

  replaceExtras(comandaId: string, extras: NewExtraItem[]) {
    return prisma.$transaction([
      prisma.comandaItem.deleteMany({ where: { comandaId, isMain: false } }),
      prisma.comandaItem.createMany({ data: extras.map((e) => ({ ...e, comandaId, isMain: false })) }),
    ]);
  },

  updateDraftTotals(comandaId: string, data: {
    servicesTotal: number; productsTotal: number; depositApplied: number; discountAmount: number;
    tipAmount: number; totalCharged: number; commissionTotal: number; paymentMethod: PaymentMethod | null;
  }) {
    return prisma.comanda.updateMany({ where: { id: comandaId, status: 'rascunho' }, data });
  },

  findOpenCashSession(businessId: string, date: string) {
    return prisma.cashSession.findFirst({ where: { businessId, date: new Date(date), closedAt: null }, select: { id: true } });
  },

  /**
   * Fecha numa transação: compare-and-set no status da comanda (rascunho → fechada),
   * fotografa percentuais nos itens, conclui o agendamento e grava/atualiza o earning.
   * Devolve false se outra requisição já fechou.
   */
  closeComandaTx(args: {
    comandaId: string; businessId: string; userId: string; cashSessionId: string;
    appointmentId: string; appointmentDate: Date; paymentMethod: PaymentMethod | null;
    servicePct: number; productPct: number; calc: ComandaCalc;
    items: Array<{ id: string; kind: 'servico' | 'produto'; lineTotal: number }>;
  }): Promise<boolean> {
    const { calc } = args;
    return prisma.$transaction(async (tx) => {
      const r = await tx.comanda.updateMany({
        where: { id: args.comandaId, businessId: args.businessId, status: 'rascunho' },
        data: {
          status: 'fechada', closedAt: new Date(), closedBy: args.userId, cashSessionId: args.cashSessionId,
          paymentMethod: args.paymentMethod,
          servicesTotal: calc.servicesTotal, productsTotal: calc.productsTotal, depositApplied: calc.depositApplied,
          discountAmount: calc.discount, tipAmount: calc.tip, totalCharged: calc.totalCharged,
          commissionTotal: calc.commissionTotal,
        },
      });
      if (r.count !== 1) return false;

      // Comissão por item, proporcional ao valor da linha dentro do seu tipo.
      for (const item of args.items) {
        const totalTipo = item.kind === 'servico' ? calc.servicesTotal : calc.productsTotal;
        const comissaoTipo = item.kind === 'servico' ? calc.commissionService : calc.commissionProduct;
        const parte = totalTipo > 0 ? Math.round((comissaoTipo * item.lineTotal / totalTipo) * 100) / 100 : 0;
        await tx.comandaItem.update({
          where: { id: item.id },
          data: { commissionPct: item.kind === 'servico' ? args.servicePct : args.productPct, commissionAmount: parte },
        });
      }

      await tx.appointment.updateMany({
        where: { id: args.appointmentId, status: { in: ['confirmado', 'em_atendimento'] } },
        data: { status: 'concluido', finishedAt: new Date() },
      });

      await tx.earning.upsert({
        where: { appointmentId: args.appointmentId },
        create: { businessId: args.businessId, appointmentId: args.appointmentId, amount: calc.revenue, date: args.appointmentDate },
        update: { amount: calc.revenue },
      });
      return true;
    });
  },

  markReceiptSent(comandaId: string) {
    return prisma.comanda.update({ where: { id: comandaId }, data: { receiptSentAt: new Date() } });
  },

  /** Itens extras (não principais) mais usados em comandas fechadas nos últimos `dias`. */
  topExtras(businessId: string, dias: number, limite: number) {
    return prisma.$queryRaw<Array<{ kind: 'servico' | 'produto'; id: string; name: string; price: unknown }>>(Prisma.sql`
      SELECT x.kind, x.id, x.name, x.price FROM (
        SELECT 'servico' AS kind, s.id::text AS id, s.name, s.price, COUNT(*) AS usos
          FROM comanda_items i
          JOIN comandas c ON c.id = i.comanda_id
          JOIN services s ON s.id = i.service_id AND s.active = true
         WHERE c.business_id = ${businessId}::uuid AND c.status = 'fechada' AND i.is_main = false
           AND c.closed_at >= NOW() - (${dias} * INTERVAL '1 day')
         GROUP BY s.id
        UNION ALL
        SELECT 'produto', p.id::text, p.name, p.price, COUNT(*)
          FROM comanda_items i
          JOIN comandas c ON c.id = i.comanda_id
          JOIN products p ON p.id = i.product_id AND p.active = true
         WHERE c.business_id = ${businessId}::uuid AND c.status = 'fechada' AND i.is_main = false
           AND c.closed_at >= NOW() - (${dias} * INTERVAL '1 day')
         GROUP BY p.id
      ) x
      ORDER BY x.usos DESC, x.name ASC
      LIMIT ${limite}
    `);
  },
};
```

- [ ] **Step 6: `receipt.ts`**

```ts
// @ts-ignore — serviço JS legado ainda não tipado
import { sendWhatsAppMessage } from '../../services/whatsapp/index.js';
import type { PaymentMethod } from './comandas.types.js';

const ROTULO_PAGAMENTO: Record<PaymentMethod, string> = {
  pix: 'Pix', debito: 'Cartão de débito', credito: 'Cartão de crédito', dinheiro: 'Dinheiro',
};
const brl = (v: number) => `R$ ${v.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;

export interface DadosComprovante {
  negocio: string; numero: number; cliente: string; profissional: string;
  itens: Array<{ name: string; quantity: number; unitPrice: number }>;
  calc: { depositApplied: number; discount: number; tip: number; totalCharged: number };
  paymentMethod: PaymentMethod | null;
}

export function montarComprovante(d: DadosComprovante): string {
  const primeiroNome = d.profissional.split(' ')[0];
  const linhas = [
    `*${d.negocio}* — Comanda #${d.numero}`,
    `Olá, ${d.cliente.split(' ')[0]}! Obrigado pela visita. Segue o comprovante do seu atendimento:`,
    '',
    ...d.itens.map((i) => `• ${i.quantity > 1 ? `${i.quantity}x ` : ''}${i.name} — ${brl(i.unitPrice * i.quantity)}`),
    '',
  ];
  if (d.calc.depositApplied > 0) linhas.push(`Sinal Pix: -${brl(d.calc.depositApplied)}`);
  if (d.calc.discount > 0) linhas.push(`Desconto: -${brl(d.calc.discount)}`);
  if (d.calc.tip > 0) linhas.push(`Gorjeta para ${primeiroNome}: ${brl(d.calc.tip)}`);
  const forma = d.paymentMethod ? ` (${ROTULO_PAGAMENTO[d.paymentMethod]})` : '';
  linhas.push(`*Total pago: ${brl(d.calc.totalCharged)}${forma}*`);
  return linhas.join('\n');
}

export async function sendComandaReceipt(businessId: string, phone: string, dados: DadosComprovante): Promise<boolean> {
  return Boolean(await sendWhatsAppMessage(phone, montarComprovante(dados), { businessId }));
}
```
(O teste procura `Total pago: R$ 135,00 (Pix)` dentro do texto — os asteriscos de negrito do WhatsApp ficam em volta e não atrapalham o `toContain`.)

- [ ] **Step 7: `comandas.service.ts`**

```ts
import { prisma } from '../../config/prisma.js';
import { AppError, ConflictError, NotFoundError, ValidationError } from '../../utils/errors.js';
import logger from '../../utils/logger.js';
import { todayInTimezone } from '../../utils/businessDate.js';
import { getBusinessScheduleSettings } from '../../services/scheduleSettingsService.js';
import { whatsappService } from '../whatsapp/whatsapp.service.js';
import { productsRepository } from '../products/products.repository.js';
import { calcularComanda } from './comandaMath.js';
import { commissionSettings, resolveCommission } from './commissionSettings.js';
import { comandasRepository } from './comandas.repository.js';
import { sendComandaReceipt } from './receipt.js';
import type { ComandaDetailDto, NewExtraItem, SaveComandaInput, PaymentMethod } from './comandas.types.js';

type ComandaRow = NonNullable<Awaited<ReturnType<typeof comandasRepository.findComandaById>>>;

const num = (v: unknown) => Number(v ?? 0);
const isoDate = (d: Date) => d.toISOString().substring(0, 10);
const hhmm = (d: Date) => d.toISOString().substring(11, 16);

async function whatsappConectado(businessId: string): Promise<boolean> {
  try {
    return (await whatsappService.getStatus(businessId)).status === 'connected';
  } catch {
    return false;
  }
}

async function nomeDoNegocio(businessId: string): Promise<string> {
  const b = await prisma.business.findUnique({ where: { id: businessId }, select: { name: true } });
  return b?.name ?? '';
}

async function montarDto(c: ComandaRow): Promise<ComandaDetailDto> {
  const negocio = await commissionSettings.get(c.businessId);
  const commission = resolveCommission(c.appointment.professional, negocio);
  const items = c.items.map((i) => ({
    id: i.id, kind: i.kind as 'servico' | 'produto', refId: i.serviceId ?? i.productId, name: i.name,
    unitPrice: num(i.unitPrice), quantity: i.quantity, durationMinutes: i.durationMinutes, isMain: i.isMain,
  }));
  const depositAvailable = num(c.appointment.depositAmount);
  const calc = calcularComanda({
    items, depositAvailable, discount: num(c.discountAmount), tip: num(c.tipAmount),
    serviceCommissionPct: commission.servicePct, productCommissionPct: commission.productPct,
  });
  return {
    id: c.id, number: c.number, status: c.status as 'rascunho' | 'fechada',
    appointment: {
      id: c.appointment.id, date: isoDate(c.appointment.date), time: hhmm(c.appointment.time),
      status: c.appointment.status, source: c.appointment.source,
    },
    client: c.appointment.client,
    professional: { id: c.appointment.professional.id, name: c.appointment.professional.name },
    items, depositAvailable,
    discount: calc.discount, tip: calc.tip, paymentMethod: (c.paymentMethod as PaymentMethod | null) ?? null,
    commission, calc,
    whatsappConnected: await whatsappConectado(c.businessId),
    closedAt: c.closedAt ? c.closedAt.toISOString() : null,
    receiptSentAt: c.receiptSentAt ? c.receiptSentAt.toISOString() : null,
  };
}

async function carregar(id: string, businessId: string): Promise<ComandaRow> {
  const c = await comandasRepository.findComandaById(id, businessId);
  if (!c) throw new NotFoundError('Comanda');
  return c;
}

async function resolverExtras(businessId: string, extras: SaveComandaInput['extras']): Promise<NewExtraItem[]> {
  const idsServ = extras.filter((e) => e.kind === 'servico').map((e) => e.id);
  const idsProd = extras.filter((e) => e.kind === 'produto').map((e) => e.id);
  const [servicos, produtos] = await Promise.all([
    comandasRepository.findActiveServicesByIds(businessId, idsServ),
    idsProd.length ? productsRepository.findActiveByIds(businessId, idsProd) : Promise.resolve([]),
  ]);
  return extras.map((e): NewExtraItem => {
    if (e.kind === 'servico') {
      const s = servicos.find((x) => x.id === e.id);
      if (!s) throw new ValidationError('Item não encontrado', [`Serviço ${e.id} não existe ou está inativo`]);
      return { kind: 'servico', serviceId: s.id, productId: null, name: s.name, unitPrice: num(s.price), quantity: e.quantity, durationMinutes: s.durationMinutes };
    }
    const p = produtos.find((x) => x.id === e.id);
    if (!p) throw new ValidationError('Item não encontrado', [`Produto ${e.id} não existe ou está inativo`]);
    return { kind: 'produto', serviceId: null, productId: p.id, name: p.name, unitPrice: num(p.price), quantity: e.quantity, durationMinutes: null };
  });
}

async function enviarComprovante(businessId: string, comandaId: string, dto: ComandaDetailDto, paymentMethod: PaymentMethod | null) {
  const enviado = await sendComandaReceipt(businessId, dto.client.phone, {
    negocio: await nomeDoNegocio(businessId), numero: dto.number, cliente: dto.client.name,
    profissional: dto.professional.name, itens: dto.items, calc: dto.calc, paymentMethod,
  });
  if (enviado) await comandasRepository.markReceiptSent(comandaId);
  return enviado;
}

export const comandasService = {
  async open(appointmentId: string, businessId: string): Promise<ComandaDetailDto> {
    const appt = await comandasRepository.findAppointmentForComanda(appointmentId, businessId);
    if (!appt) throw new NotFoundError('Agendamento');
    const existente = await comandasRepository.findComandaByAppointment(appointmentId, businessId);
    if (existente) return montarDto(await carregar(existente.id, businessId));
    if (!['confirmado', 'em_atendimento'].includes(appt.status)) {
      throw new ConflictError('Este agendamento não pode receber comanda');
    }
    const criada = await comandasRepository.createComanda(businessId, appt, { startAppointment: appt.status === 'confirmado' });
    return montarDto(await carregar(criada.id, businessId));
  },

  async get(id: string, businessId: string): Promise<ComandaDetailDto> {
    return montarDto(await carregar(id, businessId));
  },

  async save(id: string, businessId: string, input: SaveComandaInput): Promise<ComandaDetailDto> {
    const c = await carregar(id, businessId);
    if (c.status !== 'rascunho') throw new ConflictError('Esta comanda já foi fechada');
    const extras = await resolverExtras(businessId, input.extras);
    const negocio = await commissionSettings.get(businessId);
    const commission = resolveCommission(c.appointment.professional, negocio);
    const principal = c.items.filter((i) => i.isMain).map((i) => ({ kind: 'servico' as const, unitPrice: num(i.unitPrice), quantity: i.quantity }));
    const calc = calcularComanda({
      items: [...principal, ...extras.map((e) => ({ kind: e.kind, unitPrice: e.unitPrice, quantity: e.quantity }))],
      depositAvailable: num(c.appointment.depositAmount), discount: input.discount, tip: input.tip,
      serviceCommissionPct: commission.servicePct, productCommissionPct: commission.productPct,
    });
    await comandasRepository.replaceExtras(id, extras);
    await comandasRepository.updateDraftTotals(id, {
      servicesTotal: calc.servicesTotal, productsTotal: calc.productsTotal, depositApplied: calc.depositApplied,
      discountAmount: calc.discount, tipAmount: calc.tip, totalCharged: calc.totalCharged,
      commissionTotal: calc.commissionTotal, paymentMethod: input.paymentMethod,
    });
    return montarDto(await carregar(id, businessId));
  },

  async close(id: string, businessId: string, userId: string, input: SaveComandaInput): Promise<ComandaDetailDto> {
    const salvo = await comandasService.save(id, businessId, input);
    if (salvo.calc.totalCharged > 0 && !input.paymentMethod) {
      throw new ValidationError('Escolha a forma de pagamento');
    }
    const { timezone } = await getBusinessScheduleSettings(businessId);
    const caixa = await comandasRepository.findOpenCashSession(businessId, todayInTimezone(timezone));
    if (!caixa) throw new AppError('Abra o caixa de hoje para fechar a comanda', 409, 'CASH_CLOSED');

    const c = await carregar(id, businessId);
    const ok = await comandasRepository.closeComandaTx({
      comandaId: id, businessId, userId, cashSessionId: caixa.id,
      appointmentId: c.appointment.id, appointmentDate: c.appointment.date,
      paymentMethod: input.paymentMethod,
      servicePct: salvo.commission.servicePct, productPct: salvo.commission.productPct, calc: salvo.calc,
      items: c.items.map((i) => ({ id: i.id, kind: i.kind as 'servico' | 'produto', lineTotal: num(i.unitPrice) * i.quantity })),
    });
    if (!ok) throw new ConflictError('Esta comanda já foi fechada');

    if (salvo.whatsappConnected) {
      try {
        await enviarComprovante(businessId, id, salvo, input.paymentMethod);
      } catch (error) {
        logger.warn({ err: error, comandaId: id }, 'Comprovante da comanda não enviado');
      }
    }
    return montarDto(await carregar(id, businessId));
  },

  async resendReceipt(id: string, businessId: string): Promise<{ sent: boolean }> {
    const dto = await montarDto(await carregar(id, businessId));
    if (dto.status !== 'fechada') throw new ConflictError('Feche a comanda antes de enviar o comprovante');
    return { sent: await enviarComprovante(businessId, id, dto, dto.paymentMethod) };
  },

  async shortcuts(businessId: string) {
    return (await comandasRepository.topExtras(businessId, 90, 3)).map((r) => ({ kind: r.kind, id: r.id, name: r.name, price: num(r.price) }));
  },
};
```

- [ ] **Step 8: Controller, rotas e registro**

`comandas.controller.ts`:
```ts
import type { Request, Response, NextFunction } from 'express';
import { sendSuccess, sendCreated } from '../../utils/response.js';
import { comandasService } from './comandas.service.js';
import { commissionSettings } from './commissionSettings.js';

type H = (req: Request, res: Response, next: NextFunction) => Promise<void>;
const id = (req: Request) => String(req.params['id']);

export const openComanda: H = async (req, res, next) => {
  try { sendCreated(res, await comandasService.open(id(req), req.user.businessId!)); } catch (e) { next(e); }
};
export const getComanda: H = async (req, res, next) => {
  try { sendSuccess(res, await comandasService.get(id(req), req.user.businessId!)); } catch (e) { next(e); }
};
export const saveComanda: H = async (req, res, next) => {
  try { sendSuccess(res, await comandasService.save(id(req), req.user.businessId!, req.body)); } catch (e) { next(e); }
};
export const closeComanda: H = async (req, res, next) => {
  try { sendSuccess(res, await comandasService.close(id(req), req.user.businessId!, req.user.userId, req.body)); } catch (e) { next(e); }
};
export const resendReceipt: H = async (req, res, next) => {
  try { sendSuccess(res, await comandasService.resendReceipt(id(req), req.user.businessId!)); } catch (e) { next(e); }
};
export const getShortcuts: H = async (req, res, next) => {
  try { sendSuccess(res, await comandasService.shortcuts(req.user.businessId!)); } catch (e) { next(e); }
};
export const getCommissionSettings: H = async (req, res, next) => {
  try { sendSuccess(res, await commissionSettings.get(req.user.businessId!)); } catch (e) { next(e); }
};
export const updateCommissionSettings: H = async (req, res, next) => {
  try { sendSuccess(res, await commissionSettings.update(req.user.businessId!, req.body)); } catch (e) { next(e); }
};
```
(Se `req.user.userId` não existir no tipo de `req.user`, conferir `backend/src/types/express.d.ts` — o middleware de auth grava `userId`, ver `middleware/auth.ts:190`.)

`comandas.routes.ts`:
```ts
import express from 'express';
import { authMiddleware } from '../../middleware/auth.js';
import { requireTenantRoles } from '../../middleware/rbac.js';
import { requireFeature } from '../../middleware/subscriptionGuard.js';
import { validate } from '../../middleware/validate.js';
import { SaveComandaSchema } from './comandas.types.js';
import { CommissionSettingsSchema } from './commissionSettings.js';
import {
  getComanda, saveComanda, closeComanda, resendReceipt, getShortcuts,
  getCommissionSettings, updateCommissionSettings,
} from './comandas.controller.js';

const router = express.Router();
const guard = [authMiddleware, requireTenantRoles, requireFeature('finance')];

// Rotas fixas antes de "/:id"
router.get('/settings', ...guard, getCommissionSettings);
router.put('/settings', ...guard, validate({ body: CommissionSettingsSchema }), updateCommissionSettings);
router.get('/shortcuts', ...guard, getShortcuts);
router.get('/:id', ...guard, getComanda);
router.put('/:id', ...guard, validate({ body: SaveComandaSchema }), saveComanda);
router.post('/:id/close', ...guard, validate({ body: SaveComandaSchema }), closeComanda);
router.post('/:id/receipt', ...guard, resendReceipt);

export default router;
```
Em `appointments.routes.ts`: `import { openComanda } from '../comandas/comandas.controller.js';` e
`router.post('/:id/comanda', authMiddleware, requireTenantRoles, requireFeature('finance'), openComanda);`
Em `server.ts`: `import comandaRoutes from './modules/comandas/comandas.routes.js';` e `app.use(\`${API_V1}/comandas\`, comandaRoutes);`.

- [ ] **Step 9: Rodar**

Run: `cd backend && npx vitest run src/__tests__/comandasService.test.ts src/__tests__/receipt.test.ts src/__tests__/comandaMath.test.ts && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add backend/src
git commit -m "feat(comanda): abrir, salvar rascunho, fechar com repasse, atalhos e comprovante por WhatsApp

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 8: Caixa do dia (API) e forma de pagamento das despesas

**Files:**
- Create: `backend/src/modules/cash/cash.types.ts`, `cash.repository.ts`, `cash.service.ts`, `cash.controller.ts`, `cash.routes.ts`
- Modify: `backend/src/validators/schemas/financeSchemas.ts`, `backend/src/repositories/financeRepository.ts` (`createExpense`, `updateExpense`), `backend/src/server.ts`
- Test: `backend/src/__tests__/cashService.test.ts`

**Interfaces:**
- Consumes: `todayInTimezone` (Task 7), `getBusinessScheduleSettings`.
- Produces: rotas `GET /cash/today?date=YYYY-MM-DD`, `POST /cash/open` `{ openingBalance }`, `POST /cash/movements` `{ kind: 'sangria' | 'suprimento', amount, description }`, `POST /cash/close` `{ countedBalance, notes?, date? }` — todas devolvem `CashDayDto`.
- Produces `CashDayDto` (em `cash.types.ts`; o frontend espelha na Task 10):
```ts
export interface CashDayDto {
  date: string;                 // YYYY-MM-DD
  isToday: boolean;
  responsavel: string;          // business.ownerName (a tabela users não tem nome)
  session: null | {
    id: string; openedAt: string; openingBalance: number;
    closedAt: string | null; countedBalance: number | null; expectedBalance: number | null; difference: number | null;
  };
  totals: { entradas: number; entradasQtd: number; saidas: number; saidasQtd: number; saldo: number };
  comandasResumo: { total: number; fechadas: number; abertas: number; falta: number };
  formas: Array<{ chave: 'pix' | 'sinal_pix' | 'debito' | 'credito' | 'dinheiro'; valor: number; quantidade: number }>;
  linhas: Array<{
    appointmentId: string; comandaId: string | null; numero: number | null; hora: string;
    cliente: string; telefone: string; profissional: string; servicos: string;
    pagamento: 'pix' | 'debito' | 'credito' | 'dinheiro' | 'sinal' | 'em_atendimento' | 'faltou';
    depositApplied: number; total: number; status: 'Fechada' | 'Aberta' | 'Falta';
  }>;
  despesas: Array<{ id: string; descricao: string; categoria: string; valor: number; formaPagamento: string | null; criadoEm: string }>;
  movimentos: Array<{ id: string; kind: 'sangria' | 'suprimento'; valor: number; descricao: string; criadoEm: string }>;
  gaveta: { fundoInicial: number; entradasDinheiro: number; suprimentos: number; sangrias: number; saidasDinheiro: number; esperado: number };
}
```
Regras: "Entradas" = dinheiro que entrou no dia = Σ `total_charged` das comandas fechadas no caixa + Σ sinais Pix (linha "Sinais Pix" = sinais aplicados nas comandas fechadas + sinais retidos de quem faltou naquela data, quando há caixa aberto; o sistema não guarda o dia exato do pagamento do sinal, então o sinal retido entra no dia do atendimento perdido). "Saídas" = despesas da data (qualquer forma). Sangria/suprimento não são saídas: só mexem na gaveta. `total` de uma linha fechada = cobrado + sinal (o valor do atendimento, sem gorjeta separada).

- [ ] **Step 1: Escrever os testes**

`backend/src/__tests__/cashService.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const repo = vi.hoisted(() => ({
  findSession: vi.fn(), createSession: vi.fn(), closeSession: vi.fn(), addMovement: vi.fn(),
  findClosedComandas: vi.fn(), findAppointmentsByStatus: vi.fn(), findExpenses: vi.fn(),
  findMovements: vi.fn(), ownerName: vi.fn(),
}));
vi.mock('../modules/cash/cash.repository.js', () => ({ cashRepository: repo }));
vi.mock('../services/scheduleSettingsService.js', () => ({ getBusinessScheduleSettings: vi.fn().mockResolvedValue({ timezone: 'America/Sao_Paulo' }) }));

const { cashService, calcularGaveta } = await import('../modules/cash/cash.service.js');

const sessao = (over: Record<string, unknown> = {}) => ({
  id: 'cx1', openedAt: new Date('2026-10-13T07:45:00-03:00'), openingBalance: '150', closedAt: null,
  countedBalance: null, expectedBalance: null, difference: null, ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-13T12:00:00-03:00'));
  repo.ownerName.mockResolvedValue('Carla');
  repo.findClosedComandas.mockResolvedValue([]);
  repo.findAppointmentsByStatus.mockResolvedValue([]);
  repo.findExpenses.mockResolvedValue([]);
  repo.findMovements.mockResolvedValue([]);
});

describe('calcularGaveta', () => {
  it('fundo + entradas em dinheiro + suprimentos − sangrias − despesas em dinheiro', () => {
    expect(calcularGaveta({ fundoInicial: 150, entradasDinheiro: 120, suprimentos: 50, sangrias: 100, saidasDinheiro: 40 }).esperado).toBe(180);
  });
});

describe('cashService.open', () => {
  it('abre o caixa de hoje', async () => {
    repo.createSession.mockResolvedValue({ id: 'cx1' });
    repo.findSession.mockResolvedValue(sessao());
    await cashService.open('b1', 'u1', 150);
    expect(repo.createSession).toHaveBeenCalledWith('b1', '2026-10-13', 'u1', 150);
  });

  it('abrir duas vezes no mesmo dia dá 409', async () => {
    repo.createSession.mockRejectedValue(Object.assign(new Error('unique'), { code: 'P2002' }));
    await expect(cashService.open('b1', 'u1', 150)).rejects.toThrow('O caixa de hoje já está aberto');
  });

  it('caixa de ontem esquecido aberto não impede abrir o de hoje', async () => {
    repo.createSession.mockResolvedValue({ id: 'cx2' });
    repo.findSession.mockResolvedValue(sessao({ id: 'cx2', openingBalance: '0' }));
    await expect(cashService.open('b1', 'u1', 0)).resolves.toBeDefined();
    expect(repo.createSession).toHaveBeenCalledWith('b1', '2026-10-13', 'u1', 0);
  });
});

describe('cashService.addMovement', () => {
  it('sem caixa aberto hoje recusa', async () => {
    repo.findSession.mockResolvedValue(null);
    await expect(cashService.addMovement('b1', 'u1', { kind: 'sangria', amount: 50, description: 'Cofre' }))
      .rejects.toThrow('Abra o caixa de hoje antes de registrar movimentos');
  });

  it('caixa já fechado recusa', async () => {
    repo.findSession.mockResolvedValue(sessao({ closedAt: new Date() }));
    await expect(cashService.addMovement('b1', 'u1', { kind: 'sangria', amount: 50, description: 'Cofre' }))
      .rejects.toThrow('O caixa de hoje já foi fechado');
  });

  it('registra sangria no caixa aberto', async () => {
    repo.findSession.mockResolvedValue(sessao());
    await cashService.addMovement('b1', 'u1', { kind: 'sangria', amount: 50, description: 'Cofre' });
    expect(repo.addMovement).toHaveBeenCalledWith('cx1', 'b1', 'u1', { kind: 'sangria', amount: 50, description: 'Cofre' });
  });
});

describe('cashService.getDay', () => {
  it('soma formas de pagamento, separa sinais Pix e monta a gaveta', async () => {
    repo.findSession.mockResolvedValue(sessao());
    repo.findClosedComandas.mockResolvedValue([
      { id: 'k1', number: 1042, paymentMethod: 'pix', totalCharged: '115', depositApplied: '0', appointment: { id: 'a1', time: new Date('1970-01-01T10:00:00Z') }, client: { name: 'Mariana', phone: '1' }, professional: { name: 'Camila' }, items: [{ name: 'Manutenção' }] },
      { id: 'k2', number: 1043, paymentMethod: 'dinheiro', totalCharged: '120', depositApplied: '0', appointment: { id: 'a2', time: new Date('1970-01-01T13:15:00Z') }, client: { name: 'Renata', phone: '2' }, professional: { name: 'Camila' }, items: [{ name: 'Pé & mão' }] },
      { id: 'k3', number: 1044, paymentMethod: 'debito', totalCharged: '75', depositApplied: '30', appointment: { id: 'a3', time: new Date('1970-01-01T12:00:00Z') }, client: { name: 'Juliana', phone: '3' }, professional: { name: 'Bruna' }, items: [{ name: 'Sobrancelha' }, { name: 'Buço' }] },
    ]);
    repo.findAppointmentsByStatus.mockImplementation(async (_b: string, _d: string, status: string) =>
      status === 'faltou'
        ? [{ id: 'a9', time: new Date('1970-01-01T12:30:00Z'), client: { name: 'Camila Prado', phone: '9' }, professional: { name: 'Paula' }, service: { name: 'Corte', price: '140' } }]
        : []);
    repo.findExpenses.mockResolvedValue([
      { id: 'e1', description: 'Luvas', category: 'Materiais', amount: '80', paymentMethod: 'debito', createdAt: new Date() },
      { id: 'e2', description: 'Café', category: 'Copa', amount: '40', paymentMethod: 'dinheiro', createdAt: new Date() },
    ]);
    repo.findMovements.mockResolvedValue([{ id: 'm1', kind: 'sangria', amount: '50', description: 'Cofre', createdAt: new Date() }]);

    const dia = await cashService.getDay('b1');

    expect(dia.responsavel).toBe('Carla');
    expect(dia.isToday).toBe(true);
    expect(dia.comandasResumo).toEqual({ total: 4, fechadas: 3, abertas: 0, falta: 1 });
    expect(dia.formas).toEqual([
      { chave: 'pix', valor: 115, quantidade: 1 },
      { chave: 'sinal_pix', valor: 30, quantidade: 1 },
      { chave: 'debito', valor: 75, quantidade: 1 },
      { chave: 'credito', valor: 0, quantidade: 0 },
      { chave: 'dinheiro', valor: 120, quantidade: 1 },
    ]);
    expect(dia.totals).toEqual({ entradas: 340, entradasQtd: 4, saidas: 120, saidasQtd: 2, saldo: 220 });
    expect(dia.gaveta).toEqual({ fundoInicial: 150, entradasDinheiro: 120, suprimentos: 0, sangrias: 50, saidasDinheiro: 40, esperado: 180 });
    expect(dia.linhas.map((l) => l.hora)).toEqual(['10:00', '12:00', '12:30', '13:15']);
    expect(dia.linhas.find((l) => l.numero === 1044)).toMatchObject({ servicos: 'Sobrancelha + Buço', total: 105, depositApplied: 30 });
    expect(dia.linhas.find((l) => l.status === 'Falta')).toMatchObject({ cliente: 'Camila Prado', total: 140, pagamento: 'faltou' });
  });

  it('sinal de quem faltou entra em Sinais Pix do dia', async () => {
    repo.findSession.mockResolvedValue(sessao());
    repo.findAppointmentsByStatus.mockImplementation(async (_b: string, _d: string, status: string) =>
      status === 'faltou'
        ? [{ id: 'a9', time: new Date('1970-01-01T12:30:00Z'), depositAmount: '40', client: { name: 'Ana', phone: '9' }, professional: { name: 'Paula' }, service: { name: 'Corte', price: '140' } }]
        : []);
    const dia = await cashService.getDay('b1');
    expect(dia.formas.find((f) => f.chave === 'sinal_pix')).toEqual({ chave: 'sinal_pix', valor: 40, quantidade: 1 });
    expect(dia.totals.entradas).toBe(40);
    expect(dia.linhas[0]).toMatchObject({ status: 'Falta', depositApplied: 40 });
  });

  it('dia sem caixa aberto devolve session null e totais zerados', async () => {
    repo.findSession.mockResolvedValue(null);
    const dia = await cashService.getDay('b1');
    expect(dia.session).toBeNull();
    expect(dia.totals.entradas).toBe(0);
    expect(repo.findClosedComandas).not.toHaveBeenCalled();
  });

  it('consulta de data passada marca isToday false', async () => {
    repo.findSession.mockResolvedValue(null);
    const dia = await cashService.getDay('b1', '2026-10-10');
    expect(dia.isToday).toBe(false);
    expect(repo.findSession).toHaveBeenCalledWith('b1', '2026-10-10');
  });
});

describe('cashService.close', () => {
  it('grava esperado, contado e diferença', async () => {
    repo.findSession.mockResolvedValue(sessao());
    repo.closeSession.mockResolvedValue(true);
    await cashService.close('b1', 'u1', { countedBalance: 145 });
    expect(repo.closeSession).toHaveBeenCalledWith('cx1', 'u1', { countedBalance: 145, expectedBalance: 150, difference: -5, notes: null });
  });

  it('fecha o caixa de uma data passada esquecido aberto', async () => {
    repo.findSession.mockResolvedValue(sessao({ id: 'cx0', openingBalance: '0' }));
    repo.closeSession.mockResolvedValue(true);
    await cashService.close('b1', 'u1', { countedBalance: 0, date: '2026-10-12' });
    expect(repo.findSession).toHaveBeenCalledWith('b1', '2026-10-12');
  });

  it('fechar duas vezes dá 409', async () => {
    repo.findSession.mockResolvedValue(sessao({ closedAt: new Date() }));
    await expect(cashService.close('b1', 'u1', { countedBalance: 0 })).rejects.toThrow('Este caixa já foi fechado');
  });
});

describe('addExpenseSchema', () => {
  it('aceita forma de pagamento válida e recusa inválida', async () => {
    const { addExpenseSchema } = await import('../validators/schemas/financeSchemas.js');
    const base = { description: 'Café', category: 'Copa', amount: 40, date: '2026-10-13' };
    expect(addExpenseSchema.safeParse({ ...base, paymentMethod: 'dinheiro' }).success).toBe(true);
    expect(addExpenseSchema.safeParse({ ...base, paymentMethod: 'cheque' }).success).toBe(false);
    expect(addExpenseSchema.safeParse(base).success).toBe(true);
  });
});
```
(No teste de `close`, `getDay` é chamado por dentro com tudo vazio → esperado = fundo 150, por isso diferença −5.)

- [ ] **Step 2: Rodar e ver falhar** — `cd backend && npx vitest run src/__tests__/cashService.test.ts` → FAIL.

- [ ] **Step 3: `cash.types.ts`**

```ts
import { z } from 'zod';

const valor = z.number().min(0).multipleOf(0.01);
export const OpenCashSchema = z.object({ openingBalance: valor });
export const CashMovementSchema = z.object({
  kind: z.enum(['sangria', 'suprimento']),
  amount: z.number().positive('Valor deve ser maior que zero').multipleOf(0.01),
  description: z.string().trim().min(2, 'Descreva o movimento').max(255),
});
export const CloseCashSchema = z.object({
  countedBalance: valor,
  notes: z.string().max(1000).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});
export const CashDayQuerySchema = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() });

export type CashMovementInput = z.infer<typeof CashMovementSchema>;
export type CloseCashInput = z.infer<typeof CloseCashSchema>;
```
mais a interface `CashDayDto` do bloco **Interfaces** desta tarefa, copiada como está.

- [ ] **Step 4: `cash.repository.ts`**

```ts
import { prisma } from '../../config/prisma.js';

export const cashRepository = {
  findSession(businessId: string, date: string) {
    return prisma.cashSession.findUnique({ where: { businessId_date: { businessId, date: new Date(date) } } });
  },
  createSession(businessId: string, date: string, userId: string, openingBalance: number) {
    return prisma.cashSession.create({ data: { businessId, date: new Date(date), openedBy: userId, openingBalance } });
  },
  async closeSession(id: string, userId: string, d: { countedBalance: number; expectedBalance: number; difference: number; notes: string | null }) {
    const r = await prisma.cashSession.updateMany({ where: { id, closedAt: null }, data: { ...d, closedAt: new Date(), closedBy: userId } });
    return r.count === 1;
  },
  addMovement(sessionId: string, businessId: string, userId: string, m: { kind: string; amount: number; description: string }) {
    return prisma.cashMovement.create({ data: { cashSessionId: sessionId, businessId, createdBy: userId, ...m } });
  },
  findClosedComandas(sessionId: string) {
    return prisma.comanda.findMany({
      where: { cashSessionId: sessionId, status: 'fechada' },
      select: {
        id: true, number: true, paymentMethod: true, totalCharged: true, depositApplied: true,
        appointment: { select: { id: true, time: true } },
        client: { select: { name: true, phone: true } },
        professional: { select: { name: true } },
        items: { select: { name: true }, orderBy: [{ isMain: 'desc' }, { createdAt: 'asc' }] },
      },
    });
  },
  findAppointmentsByStatus(businessId: string, date: string, status: 'em_atendimento' | 'faltou') {
    return prisma.appointment.findMany({
      where: { businessId, date: new Date(date), status },
      select: {
        id: true, time: true, depositAmount: true,
        client: { select: { name: true, phone: true } },
        professional: { select: { name: true } },
        service: { select: { name: true, price: true } },
      },
    });
  },
  findExpenses(businessId: string, date: string) {
    return prisma.expense.findMany({ where: { businessId, date: new Date(date) }, orderBy: { createdAt: 'asc' } });
  },
  findMovements(sessionId: string) {
    return prisma.cashMovement.findMany({ where: { cashSessionId: sessionId }, orderBy: { createdAt: 'asc' } });
  },
  async ownerName(businessId: string) {
    return (await prisma.business.findUnique({ where: { id: businessId }, select: { ownerName: true } }))?.ownerName ?? '';
  },
};
```

- [ ] **Step 5: `cash.service.ts`**

```ts
import { ConflictError } from '../../utils/errors.js';
import { todayInTimezone } from '../../utils/businessDate.js';
import { getBusinessScheduleSettings } from '../../services/scheduleSettingsService.js';
import { cashRepository } from './cash.repository.js';
import type { CashDayDto, CashMovementInput, CloseCashInput } from './cash.types.js';

type Linha = CashDayDto['linhas'][number];

const n = (v: unknown) => Number(v ?? 0);
const cents = (v: number) => Math.round(v * 100);
const reais = (c: number) => c / 100;
const hhmm = (d: Date) => d.toISOString().substring(11, 16);

export function calcularGaveta(g: { fundoInicial: number; entradasDinheiro: number; suprimentos: number; sangrias: number; saidasDinheiro: number }) {
  const esperado = reais(cents(g.fundoInicial) + cents(g.entradasDinheiro) + cents(g.suprimentos) - cents(g.sangrias) - cents(g.saidasDinheiro));
  return { ...g, esperado };
}

async function hoje(businessId: string) {
  const { timezone } = await getBusinessScheduleSettings(businessId);
  return todayInTimezone(timezone);
}

export const cashService = {
  async getDay(businessId: string, date?: string): Promise<CashDayDto> {
    const diaDeHoje = await hoje(businessId);
    const dia = date ?? diaDeHoje;
    const session = await cashRepository.findSession(businessId, dia);
    const [comandas, emAtendimento, faltas, despesas, movimentos, responsavel] = await Promise.all([
      session ? cashRepository.findClosedComandas(session.id) : Promise.resolve([]),
      cashRepository.findAppointmentsByStatus(businessId, dia, 'em_atendimento'),
      cashRepository.findAppointmentsByStatus(businessId, dia, 'faltou'),
      cashRepository.findExpenses(businessId, dia),
      session ? cashRepository.findMovements(session.id) : Promise.resolve([]),
      cashRepository.ownerName(businessId),
    ]);

    const forma = (chave: 'pix' | 'debito' | 'credito' | 'dinheiro') => {
      const lista = comandas.filter((k) => k.paymentMethod === chave);
      return { chave, valor: reais(lista.reduce((t, k) => t + cents(n(k.totalCharged)), 0)), quantidade: lista.length };
    };
    const comSinal = comandas.filter((k) => n(k.depositApplied) > 0);
    // Sinal retido de quem faltou só entra quando há caixa aberto naquele dia.
    const faltasComSinal = session ? faltas.filter((a) => n(a.depositAmount) > 0) : [];
    const sinaisCents = comSinal.reduce((t, k) => t + cents(n(k.depositApplied)), 0)
      + faltasComSinal.reduce((t, a) => t + cents(n(a.depositAmount)), 0);
    const formas: CashDayDto['formas'] = [
      forma('pix'),
      { chave: 'sinal_pix', valor: reais(sinaisCents), quantidade: comSinal.length + faltasComSinal.length },
      forma('debito'), forma('credito'), forma('dinheiro'),
    ];
    const entradasCents = formas.reduce((t, f) => t + cents(f.valor), 0);
    const saidasCents = despesas.reduce((t, e) => t + cents(n(e.amount)), 0);

    const linhas: Linha[] = [
      ...comandas.map((k): Linha => ({
        appointmentId: k.appointment.id, comandaId: k.id, numero: k.number, hora: hhmm(k.appointment.time),
        cliente: k.client.name, telefone: k.client.phone, profissional: k.professional.name,
        servicos: k.items.map((i) => i.name).join(' + '),
        pagamento: (k.paymentMethod ?? 'sinal') as Linha['pagamento'],
        depositApplied: n(k.depositApplied), total: reais(cents(n(k.totalCharged)) + cents(n(k.depositApplied))), status: 'Fechada',
      })),
      ...emAtendimento.map((a): Linha => ({
        appointmentId: a.id, comandaId: null, numero: null, hora: hhmm(a.time), cliente: a.client.name, telefone: a.client.phone,
        profissional: a.professional.name, servicos: a.service.name, pagamento: 'em_atendimento',
        depositApplied: 0, total: n(a.service.price), status: 'Aberta',
      })),
      ...faltas.map((a): Linha => ({
        appointmentId: a.id, comandaId: null, numero: null, hora: hhmm(a.time), cliente: a.client.name, telefone: a.client.phone,
        profissional: a.professional.name, servicos: a.service.name, pagamento: 'faltou',
        depositApplied: n(a.depositAmount), total: n(a.service.price), status: 'Falta',
      })),
    ].sort((a, b) => a.hora.localeCompare(b.hora));

    const somaMov = (k: 'sangria' | 'suprimento') => reais(movimentos.filter((m) => m.kind === k).reduce((t, m) => t + cents(n(m.amount)), 0));
    const gaveta = calcularGaveta({
      fundoInicial: n(session?.openingBalance),
      entradasDinheiro: formas.find((f) => f.chave === 'dinheiro')!.valor,
      suprimentos: somaMov('suprimento'),
      sangrias: somaMov('sangria'),
      saidasDinheiro: reais(despesas.filter((e) => e.paymentMethod === 'dinheiro').reduce((t, e) => t + cents(n(e.amount)), 0)),
    });

    return {
      date: dia, isToday: dia === diaDeHoje, responsavel,
      session: session ? {
        id: session.id, openedAt: session.openedAt.toISOString(), openingBalance: n(session.openingBalance),
        closedAt: session.closedAt ? session.closedAt.toISOString() : null,
        countedBalance: session.countedBalance === null ? null : n(session.countedBalance),
        expectedBalance: session.expectedBalance === null ? null : n(session.expectedBalance),
        difference: session.difference === null ? null : n(session.difference),
      } : null,
      totals: {
        entradas: reais(entradasCents), entradasQtd: comandas.length + comSinal.length + faltasComSinal.length,
        saidas: reais(saidasCents), saidasQtd: despesas.length, saldo: reais(entradasCents - saidasCents),
      },
      comandasResumo: { total: comandas.length + emAtendimento.length + faltas.length, fechadas: comandas.length, abertas: emAtendimento.length, falta: faltas.length },
      formas, linhas,
      despesas: despesas.map((e) => ({ id: e.id, descricao: e.description, categoria: e.category, valor: n(e.amount), formaPagamento: e.paymentMethod, criadoEm: e.createdAt.toISOString() })),
      movimentos: movimentos.map((m) => ({ id: m.id, kind: m.kind as 'sangria' | 'suprimento', valor: n(m.amount), descricao: m.description, criadoEm: m.createdAt.toISOString() })),
      gaveta,
    };
  },

  async open(businessId: string, userId: string, openingBalance: number) {
    const dia = await hoje(businessId);
    try {
      await cashRepository.createSession(businessId, dia, userId, openingBalance);
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') throw new ConflictError('O caixa de hoje já está aberto');
      throw error;
    }
    return cashService.getDay(businessId, dia);
  },

  async addMovement(businessId: string, userId: string, input: CashMovementInput) {
    const dia = await hoje(businessId);
    const session = await cashRepository.findSession(businessId, dia);
    if (!session) throw new ConflictError('Abra o caixa de hoje antes de registrar movimentos');
    if (session.closedAt) throw new ConflictError('O caixa de hoje já foi fechado');
    await cashRepository.addMovement(session.id, businessId, userId, input);
    return cashService.getDay(businessId, dia);
  },

  async close(businessId: string, userId: string, input: CloseCashInput) {
    const dia = input.date ?? (await hoje(businessId));
    const session = await cashRepository.findSession(businessId, dia);
    if (!session) throw new ConflictError('Não há caixa aberto nesta data');
    if (session.closedAt) throw new ConflictError('Este caixa já foi fechado');
    const { gaveta } = await cashService.getDay(businessId, dia);
    const difference = reais(cents(input.countedBalance) - cents(gaveta.esperado));
    const ok = await cashRepository.closeSession(session.id, userId, {
      countedBalance: input.countedBalance, expectedBalance: gaveta.esperado, difference, notes: input.notes ?? null,
    });
    if (!ok) throw new ConflictError('Este caixa já foi fechado');
    return cashService.getDay(businessId, dia);
  },
};
```

- [ ] **Step 6: Controller, rotas, registro**

`cash.controller.ts`:
```ts
import type { Request, Response, NextFunction } from 'express';
import { sendSuccess } from '../../utils/response.js';
import { cashService } from './cash.service.js';

type H = (req: Request, res: Response, next: NextFunction) => Promise<void>;

export const getCashDay: H = async (req, res, next) => {
  try { sendSuccess(res, await cashService.getDay(req.user.businessId!, req.query['date'] as string | undefined)); } catch (e) { next(e); }
};
export const openCash: H = async (req, res, next) => {
  try { sendSuccess(res, await cashService.open(req.user.businessId!, req.user.userId, req.body.openingBalance)); } catch (e) { next(e); }
};
export const addCashMovement: H = async (req, res, next) => {
  try { sendSuccess(res, await cashService.addMovement(req.user.businessId!, req.user.userId, req.body)); } catch (e) { next(e); }
};
export const closeCash: H = async (req, res, next) => {
  try { sendSuccess(res, await cashService.close(req.user.businessId!, req.user.userId, req.body)); } catch (e) { next(e); }
};
```
`cash.routes.ts`:
```ts
import express from 'express';
import { authMiddleware } from '../../middleware/auth.js';
import { requireTenantRoles } from '../../middleware/rbac.js';
import { requireFeature } from '../../middleware/subscriptionGuard.js';
import { validate } from '../../middleware/validate.js';
import { OpenCashSchema, CashMovementSchema, CloseCashSchema, CashDayQuerySchema } from './cash.types.js';
import { getCashDay, openCash, addCashMovement, closeCash } from './cash.controller.js';

const router = express.Router();
const guard = [authMiddleware, requireTenantRoles, requireFeature('finance')];

router.get('/today', ...guard, validate({ query: CashDayQuerySchema }), getCashDay);
router.post('/open', ...guard, validate({ body: OpenCashSchema }), openCash);
router.post('/movements', ...guard, validate({ body: CashMovementSchema }), addCashMovement);
router.post('/close', ...guard, validate({ body: CloseCashSchema }), closeCash);

export default router;
```
`server.ts`: `import cashRoutes from './modules/cash/cash.routes.js';` e `app.use(\`${API_V1}/cash\`, cashRoutes);`.

- [ ] **Step 7: Forma de pagamento das despesas**

`backend/src/validators/schemas/financeSchemas.ts`: em `addExpenseSchema` acrescentar
`paymentMethod: z.enum(['dinheiro', 'pix', 'debito', 'credito']).nullable().optional(),`
`backend/src/repositories/financeRepository.ts`: `createExpense(businessId, data: { ...; paymentMethod?: string | null })` grava `paymentMethod: data.paymentMethod ?? null`; `updateExpense` grava `...(data.paymentMethod !== undefined && { paymentMethod: data.paymentMethod })`.

- [ ] **Step 8: Rodar**

Run: `cd backend && npx vitest run src/__tests__/cashService.test.ts && npx tsc --noEmit` → PASS.

- [ ] **Step 9: Commit**

```bash
git add backend/src
git commit -m "feat(caixa): abertura, sangria, conferência da gaveta e fechamento do caixa do dia

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Detalhes do agendamento, DTO completo e sinal gravado na reserva pública

**Files:**
- Modify: `backend/src/modules/appointments/appointments.repository.ts` (include `comanda`; `findClientVisits`; `findClientNotes`)
- Modify: `backend/src/modules/appointments/appointment.serializer.ts`
- Modify: `backend/src/modules/appointments/appointments.service.ts` (`getDetails`), `appointments.controller.ts`, `appointments.routes.ts` (`GET /:id/details`)
- Modify: `backend/src/modules/publicBooking/publicBooking.repository.ts` (`createPendingAppointment` recebe `depositAmount`), `publicBooking.service.ts`
- Test: `backend/src/__tests__/appointmentDetails.test.ts`

**Interfaces:**
- Produces: `AppointmentDto` ganha `source: string`, `deposit_amount: number | null`, `started_at: string | null`, `comanda_id: string | null`, `comanda_status: 'rascunho' | 'fechada' | null`, `comanda_number: number | null`.
- Produces: `GET /appointments/:id/details` →
```ts
{
  appointment: AppointmentDto;
  client_stats: {
    visits_this_year: number;          // concluídos no ano corrente, antes deste agendamento
    average_cycle_days: number | null; // média de dias entre visitas concluídas (null com < 2 visitas)
    last_visit_days_ago: number | null;
    last_visit_professional: string | null;
    is_recurring: boolean;             // ≥ 2 visitas concluídas
  };
  client_notes: string | null;
}
```

- [ ] **Step 1: Escrever os testes**

`backend/src/__tests__/appointmentDetails.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { toAppointmentDto } from '../modules/appointments/appointment.serializer.js';

const repo = vi.hoisted(() => ({ findById: vi.fn(), findClientVisits: vi.fn(), findClientNotes: vi.fn() }));
vi.mock('../modules/appointments/appointments.repository.js', () => ({ appointmentsPrismaRepository: repo }));
vi.mock('../services/whatsapp/index.js', () => ({ sendWhatsAppMessage: vi.fn() }));
vi.mock('../modules/notifications/notifications.service.js', () => ({ notificationsService: { notify: vi.fn() } }));

const { appointmentsService } = await import('../modules/appointments/appointments.service.js');

const agendamento = {
  id: 'a9', clientId: 'c1', date: new Date('2026-09-17'), time: new Date('1970-01-01T10:00:00Z'), status: 'confirmado',
  client: { name: 'Rafaela', phone: '1' }, professional: { name: 'Camila' }, service: { name: 'Alongamento', price: 180, durationMinutes: 150 },
};

describe('toAppointmentDto', () => {
  it('leva origem, sinal, início e comanda', () => {
    const dto = toAppointmentDto({
      id: 'a1', date: new Date('2026-10-13T00:00:00Z'), time: new Date('1970-01-01T10:00:00Z'), status: 'em_atendimento',
      source: 'publico', depositAmount: '30.00', startedAt: new Date('2026-10-13T13:05:00Z'),
      comanda: { id: 'k1', status: 'rascunho', number: 1042 },
    });
    expect(dto).toMatchObject({ source: 'publico', deposit_amount: 30, started_at: '2026-10-13T13:05:00.000Z', comanda_id: 'k1', comanda_status: 'rascunho', comanda_number: 1042 });
  });

  it('sem sinal e sem comanda dá null', () => {
    const dto = toAppointmentDto({ id: 'a1', date: '2026-10-13', time: '10:00:00', status: 'confirmado' });
    expect(dto).toMatchObject({ source: 'painel', deposit_amount: null, comanda_id: null, comanda_status: null, comanda_number: null, started_at: null });
  });
});

describe('appointmentsService.getDetails', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-17T12:00:00-03:00'));
  });

  it('calcula ciclo médio, visitas no ano e última visita antes deste atendimento', async () => {
    repo.findById.mockResolvedValue(agendamento);
    repo.findClientVisits.mockResolvedValue([
      { date: new Date('2026-08-29'), professional: { name: 'Camila Rocha' } },
      { date: new Date('2026-08-08'), professional: { name: 'Camila Rocha' } },
      { date: new Date('2026-07-18'), professional: { name: 'Bruna Lima' } },
      { date: new Date('2025-12-20'), professional: { name: 'Bruna Lima' } },
    ]);
    repo.findClientNotes.mockResolvedValue('Sensível a primer ácido');

    const d = await appointmentsService.getDetails('a9', 'b1');

    expect(repo.findClientVisits).toHaveBeenCalledWith('c1', 'b1', new Date('2026-09-17'));
    // intervalos: 21, 21 e 210 dias → média 84
    expect(d.client_stats).toEqual({
      visits_this_year: 3,
      average_cycle_days: 84,
      last_visit_days_ago: 19,
      last_visit_professional: 'Camila Rocha',
      is_recurring: true,
    });
    expect(d.client_notes).toBe('Sensível a primer ácido');
  });

  it('cliente nova não tem ciclo nem última visita', async () => {
    repo.findById.mockResolvedValue(agendamento);
    repo.findClientVisits.mockResolvedValue([]);
    repo.findClientNotes.mockResolvedValue(null);
    const d = await appointmentsService.getDetails('a9', 'b1');
    expect(d.client_stats).toEqual({ visits_this_year: 0, average_cycle_days: null, last_visit_days_ago: null, last_visit_professional: null, is_recurring: false });
  });

  it('agendamento de outro negócio dá NotFound', async () => {
    repo.findById.mockResolvedValue(null);
    await expect(appointmentsService.getDetails('a9', 'b1')).rejects.toThrow('Agendamento não encontrado');
  });
});
```

- [ ] **Step 2: Rodar e ver falhar** — `cd backend && npx vitest run src/__tests__/appointmentDetails.test.ts` → FAIL.

- [ ] **Step 3: Serializer**

Em `appointment.serializer.ts`: na interface `RawAppointment` acrescentar
```ts
  source?: string;
  depositAmount?: unknown;
  startedAt?: Date | string | null;
  comanda?: { id: string; status: string; number: number } | null;
```
em `AppointmentDto`:
```ts
  source: string;
  deposit_amount: number | null;
  started_at: string | null;
  comanda_id: string | null;
  comanda_status: 'rascunho' | 'fechada' | null;
  comanda_number: number | null;
```
e no objeto de `toAppointmentDto`:
```ts
  source: a.source ?? 'painel',
  deposit_amount: a.depositAmount === null || a.depositAmount === undefined ? null : priceToNumber(a.depositAmount),
  started_at: a.startedAt ? new Date(a.startedAt).toISOString() : null,
  comanda_id: a.comanda?.id ?? null,
  comanda_status: (a.comanda?.status as 'rascunho' | 'fechada' | undefined) ?? null,
  comanda_number: a.comanda?.number ?? null,
```

- [ ] **Step 4: Repositório e serviço**

`appointments.repository.ts`: `APPOINTMENT_INCLUDE` ganha `comanda: { select: { id: true, status: true, number: true } },` e os métodos:
```ts
  findClientVisits(clientId: string, businessId: string, before: Date) {
    return prisma.appointment.findMany({
      where: { clientId, businessId, status: 'concluido', date: { lt: before } },
      select: { date: true, professional: { select: { name: true } } },
      orderBy: { date: 'desc' },
    });
  },

  async findClientNotes(clientId: string, businessId: string): Promise<string | null> {
    const c = await prisma.client.findFirst({ where: { id: clientId, businessId }, select: { notes: true } });
    return c?.notes ?? null;
  },
```
Acrescentar em `AppointmentWithRelations` (`appointments.types.ts`): `depositAmount?: unknown; startedAt?: Date | null; comanda?: { id: string; status: string; number: number } | null;`.

`appointments.service.ts`:
```ts
  async getDetails(id: string, businessId: string) {
    const appointment = await appointmentsPrismaRepository.findById(id, businessId);
    if (!appointment) throw new NotFoundError('Agendamento');
    const [visitas, notas] = await Promise.all([
      appointmentsPrismaRepository.findClientVisits(appointment.clientId, businessId, appointment.date),
      appointmentsPrismaRepository.findClientNotes(appointment.clientId, businessId),
    ]);
    const DIA = 24 * 60 * 60 * 1000;
    const anoAtual = new Date().getFullYear();
    const intervalos = visitas.slice(0, -1).map((v, i) => Math.round((v.date.getTime() - visitas[i + 1].date.getTime()) / DIA));
    const ultima = visitas[0];
    return {
      appointment,
      client_stats: {
        visits_this_year: visitas.filter((v) => v.date.getUTCFullYear() === anoAtual).length,
        average_cycle_days: intervalos.length ? Math.round(intervalos.reduce((a, b) => a + b, 0) / intervalos.length) : null,
        last_visit_days_ago: ultima ? Math.round((appointment.date.getTime() - ultima.date.getTime()) / DIA) : null,
        last_visit_professional: ultima?.professional.name ?? null,
        is_recurring: visitas.length >= 2,
      },
      client_notes: notas,
    };
  },
```

- [ ] **Step 5: Controller e rota**

`appointments.controller.ts`:
```ts
export const getAppointmentDetails = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = await appointmentsService.getDetails(String(req.params['id']), req.user.businessId!);
    sendSuccess(res, { ...data, appointment: toAppointmentDto(data.appointment) });
  } catch (error) {
    next(error);
  }
};
```
`appointments.routes.ts`: `router.get('/:id/details', ...guard, getAppointmentDetails);` logo depois de `/available-slots`.

- [ ] **Step 6: Sinal gravado na reserva pública**

`publicBooking.repository.ts#createPendingAppointment`: tipo do parâmetro ganha `depositAmount: number` e o `data` ganha `depositAmount: data.depositAmount,`.
`publicBooking.service.ts`: na chamada `createPendingAppointment({...})`, acrescentar `depositAmount,` (variável já calculada antes da transação).

- [ ] **Step 7: Rodar a suíte inteira do backend**

Run: `cd backend && npx vitest run src/__tests__/appointmentDetails.test.ts && npx vitest run && npx tsc --noEmit`
Expected: tudo passando. Se `publicBooking.test.ts` verifica os argumentos exatos de `createPendingAppointment`, acrescentar `depositAmount` ao objeto esperado (o valor do teste é `preço × percentual / 100`).

- [ ] **Step 8: Commit**

```bash
git add backend/src
git commit -m "feat(agenda): detalhes com ciclo da cliente; origem, sinal e comanda no DTO

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 10: Frontend — tipos, clientes de API e proxies

**Files:**
- Modify: `frontend/src/types/index.ts`
- Create: `frontend/src/lib/comanda.ts`, `frontend/src/lib/caixa.ts`, `frontend/src/lib/produtos.ts`
- Create proxies (padrão de `frontend/src/app/api/appointments/[id]/status/route.ts`, usando `proxyRequest` de `@/lib/server/proxy`):
  - `frontend/src/app/api/appointments/[id]/details/route.ts` (GET → `/appointments/${id}/details`)
  - `frontend/src/app/api/appointments/[id]/comanda/route.ts` (POST → `/appointments/${id}/comanda`)
  - `frontend/src/app/api/comandas/settings/route.ts` (GET, PUT)
  - `frontend/src/app/api/comandas/shortcuts/route.ts` (GET)
  - `frontend/src/app/api/comandas/[id]/route.ts` (GET, PUT)
  - `frontend/src/app/api/comandas/[id]/close/route.ts` (POST)
  - `frontend/src/app/api/comandas/[id]/receipt/route.ts` (POST)
  - `frontend/src/app/api/products/route.ts` (GET, POST), `frontend/src/app/api/products/[id]/route.ts` (PUT, DELETE)
  - `frontend/src/app/api/cash/today/route.ts` (GET — repassar a query string), `frontend/src/app/api/cash/open/route.ts`, `frontend/src/app/api/cash/movements/route.ts`, `frontend/src/app/api/cash/close/route.ts` (POST)
- Test: `frontend/src/lib/__tests__/comanda.test.ts`

**Interfaces:**
- Produces em `@/types`: `AppointmentStatus` (6 valores), `Appointment` com os campos novos do DTO (Task 9), `Professional` com `breakStart`, `breakEnd`, `commissionServicePct`, `commissionProductPct` (opcionais), `Expense.payment_method?`/`paymentMethod?`.
- Produces em `@/lib/comanda`: tipos `PaymentMethod`, `ComandaCalc`, `ComandaItem`, `ComandaDetail`, `ComandaExtraInput`, `ComandaShortcut`, `AppointmentDetails`, `CommissionSettings`; funções `calcularComanda` (cópia exata da Task 4), `abrirComanda(appointmentId)`, `salvarComanda(id, input)`, `fecharComanda(id, input)`, `reenviarComprovante(id)`, `buscarAtalhos()`, `buscarDetalhesAgendamento(id)`, `buscarRegraComissao()`, `salvarRegraComissao(r)`, `ROTULO_PAGAMENTO`, `ehCaixaFechado(error)`.
- Produces em `@/lib/caixa`: `CashDay` (= `CashDayDto` da Task 8), `buscarCaixa(date?)`, `abrirCaixa(openingBalance)`, `registrarMovimento(m)`, `fecharCaixa(d)`, `ROTULO_FORMA_CAIXA`.
- Produces em `@/lib/produtos`: `Produto`, `listarProdutos()`, `criarProduto(p)`, `atualizarProduto(id, p)`, `removerProduto(id)`.

- [ ] **Step 1: Escrever o teste do espelho do cálculo**

`frontend/src/lib/__tests__/comanda.test.ts` — os mesmos casos da Task 4, importando do frontend, mais o detector de caixa fechado:
```ts
import { describe, it, expect } from 'vitest';
import { AxiosError, type AxiosResponse } from 'axios';
import { calcularComanda, ehCaixaFechado } from '@/lib/comanda';

const base = { depositAvailable: 0, discount: 0, tip: 0, serviceCommissionPct: 50, productCommissionPct: 20 };

describe('calcularComanda (espelho do backend)', () => {
  it('reproduz a comanda do Stitch', () => {
    const r = calcularComanda({
      ...base,
      items: [{ kind: 'servico', unitPrice: 110, quantity: 1 }, { kind: 'produto', unitPrice: 25, quantity: 1 }],
      depositAvailable: 30, tip: 10,
    });
    expect(r).toMatchObject({ subtotal: 135, totalCharged: 115, commissionTotal: 70, houseRetention: 75 });
  });
  it('sinal maior que o subtotal não deixa total negativo', () => {
    const r = calcularComanda({ ...base, items: [{ kind: 'servico', unitPrice: 20, quantity: 1 }], depositAvailable: 30 });
    expect(r.totalCharged).toBe(0);
  });
  it('desconto rateado antes da comissão', () => {
    const r = calcularComanda({ ...base, items: [{ kind: 'servico', unitPrice: 80, quantity: 1 }, { kind: 'produto', unitPrice: 20, quantity: 1 }], discount: 10 });
    expect([r.commissionService, r.commissionProduct]).toEqual([36, 3.6]);
  });
  it('arredonda half-up', () => {
    const r = calcularComanda({ ...base, serviceCommissionPct: 33.33, items: [{ kind: 'servico', unitPrice: 10.01, quantity: 1 }] });
    expect(r.commissionService).toBe(3.34);
  });
});

describe('ehCaixaFechado', () => {
  it('reconhece o 409 CASH_CLOSED do backend', () => {
    const erro = new AxiosError('x', '409', undefined, undefined, { status: 409, data: { errorCode: 'CASH_CLOSED' } } as AxiosResponse);
    expect(ehCaixaFechado(erro)).toBe(true);
  });
  it('outros erros não', () => {
    const erro = new AxiosError('x', '409', undefined, undefined, { status: 409, data: { errorCode: 'CONFLICT' } } as AxiosResponse);
    expect(ehCaixaFechado(erro)).toBe(false);
  });
});
```
(O interceptor de `@/lib/api` copia `error.code` do backend para `data.errorCode` — ver `frontend/src/lib/api.ts:142-150`.)

- [ ] **Step 2: Rodar e ver falhar** — `cd frontend && npx vitest run src/lib/__tests__/comanda.test.ts` → FAIL.

- [ ] **Step 3: Tipos em `frontend/src/types/index.ts`**

Trocar a linha de status do `Appointment` e acrescentar campos:
```ts
export type AppointmentStatus =
    | 'aguardando_pagamento' | 'confirmado' | 'em_atendimento' | 'concluido' | 'faltou' | 'cancelado';

export interface Appointment {
    // ...campos atuais, com:
    status: AppointmentStatus;
    source?: 'painel' | 'publico' | 'whatsapp' | string;
    deposit_amount?: number | null;
    started_at?: string | null;
    comanda_id?: string | null;
    comanda_status?: 'rascunho' | 'fechada' | null;
    comanda_number?: number | null;
}
```
`Professional` ganha `breakStart?: string | null; breakEnd?: string | null; commissionServicePct?: number | null; commissionProductPct?: number | null;`.
`Expense` ganha `paymentMethod?: 'dinheiro' | 'pix' | 'debito' | 'credito' | null;` e `ExpenseFormData` ganha `paymentMethod?: 'dinheiro' | 'pix' | 'debito' | 'credito' | null;`.
Rodar `npx tsc --noEmit` e corrigir os pontos que tipavam status com só 4 valores (ex.: `AppointmentModule.handleStatusChange`, `LinhaDoTempo`, `AppointmentCard`) **só no tipo** — o comportamento muda nas Tasks 11-12.

- [ ] **Step 4: `frontend/src/lib/comanda.ts`**

```ts
import { AxiosError } from 'axios';
import api from '@/lib/api';
import type { Appointment } from '@/types';

// ─── Cálculo: cópia exata de backend/src/modules/comandas/comandaMath.ts ─────────
// Os dois arquivos têm os mesmos testes; mudou um, mude o outro.
export interface ComandaItemInput { kind: 'servico' | 'produto'; unitPrice: number; quantity: number }
export interface ComandaCalcInput {
  items: ComandaItemInput[]; depositAvailable: number; discount: number; tip: number;
  serviceCommissionPct: number; productCommissionPct: number;
}
export interface ComandaCalc {
  servicesTotal: number; productsTotal: number; subtotal: number;
  depositApplied: number; discount: number; tip: number; totalCharged: number;
  revenue: number;
  commissionService: number; commissionProduct: number; commissionTotal: number;
  houseRetention: number;
  serviceBase: number; productBase: number;
}
const toCents = (v: number): number => Math.round((Number(v) || 0) * 100);
const fromCents = (c: number): number => c / 100;
const pos = (c: number) => Math.max(0, c);
const pctOf = (cents: number, pct: number) => Math.floor((cents * Math.round(pct * 100)) / 10000 + 0.5);

export function calcularComanda(input: ComandaCalcInput): ComandaCalc {
  let services = 0;
  let products = 0;
  for (const item of input.items) {
    const linha = toCents(item.unitPrice) * Math.max(1, Math.floor(item.quantity));
    if (item.kind === 'servico') services += linha; else products += linha;
  }
  const subtotal = services + products;
  const depositApplied = Math.min(pos(toCents(input.depositAvailable)), subtotal);
  const discount = Math.min(pos(toCents(input.discount)), subtotal - depositApplied);
  const tip = pos(toCents(input.tip));
  const totalCharged = subtotal - depositApplied - discount + tip;
  const revenue = subtotal - discount;
  const descontoServico = subtotal > 0 ? Math.round((discount * services) / subtotal) : 0;
  const serviceBase = services - descontoServico;
  const productBase = products - (discount - descontoServico);
  const commissionService = pctOf(serviceBase, input.serviceCommissionPct);
  const commissionProduct = pctOf(productBase, input.productCommissionPct);
  return {
    servicesTotal: fromCents(services), productsTotal: fromCents(products), subtotal: fromCents(subtotal),
    depositApplied: fromCents(depositApplied), discount: fromCents(discount), tip: fromCents(tip),
    totalCharged: fromCents(totalCharged), revenue: fromCents(revenue),
    commissionService: fromCents(commissionService), commissionProduct: fromCents(commissionProduct),
    commissionTotal: fromCents(commissionService + commissionProduct + tip),
    houseRetention: fromCents(revenue - commissionService - commissionProduct),
    serviceBase: fromCents(serviceBase), productBase: fromCents(productBase),
  };
}

// ─── Tipos espelhando o backend (comandas.types.ts / appointments) ─────────────
export type PaymentMethod = 'pix' | 'debito' | 'credito' | 'dinheiro';
export const ROTULO_PAGAMENTO: Record<PaymentMethod, string> = {
  pix: 'Pix', debito: 'Cartão débito', credito: 'Cartão crédito', dinheiro: 'Dinheiro',
};

export interface ComandaItem {
  id: string | null; kind: 'servico' | 'produto'; refId: string | null; name: string;
  unitPrice: number; quantity: number; durationMinutes: number | null; isMain: boolean;
}
export interface ComandaDetail {
  id: string; number: number; status: 'rascunho' | 'fechada';
  appointment: { id: string; date: string; time: string; status: string; source: string };
  client: { id: string; name: string; phone: string };
  professional: { id: string; name: string };
  items: ComandaItem[];
  depositAvailable: number;
  discount: number; tip: number; paymentMethod: PaymentMethod | null;
  commission: { servicePct: number; productPct: number; origem: 'profissional' | 'negocio' };
  calc: ComandaCalc;
  whatsappConnected: boolean;
  closedAt: string | null; receiptSentAt: string | null;
}
export interface ComandaExtraInput { kind: 'servico' | 'produto'; id: string; quantity: number }
export interface SalvarComandaInput {
  extras: ComandaExtraInput[]; discount: number; tip: number; paymentMethod: PaymentMethod | null;
}
export interface ComandaShortcut { kind: 'servico' | 'produto'; id: string; name: string; price: number }
export interface AppointmentDetails {
  appointment: Appointment;
  client_stats: {
    visits_this_year: number; average_cycle_days: number | null; last_visit_days_ago: number | null;
    last_visit_professional: string | null; is_recurring: boolean;
  };
  client_notes: string | null;
}
export interface CommissionSettings { serviceCommissionPct: number; productCommissionPct: number }

// ─── API ───────────────────────────────────────────────────────────────────────
export const abrirComanda = async (appointmentId: string) =>
  (await api.post<ComandaDetail>(`/appointments/${appointmentId}/comanda`)).data;
export const salvarComanda = async (id: string, input: SalvarComandaInput) =>
  (await api.put<ComandaDetail>(`/comandas/${id}`, input)).data;
export const fecharComanda = async (id: string, input: SalvarComandaInput) =>
  (await api.post<ComandaDetail>(`/comandas/${id}/close`, input)).data;
export const reenviarComprovante = async (id: string) =>
  (await api.post<{ sent: boolean }>(`/comandas/${id}/receipt`)).data;
export const buscarAtalhos = async () => (await api.get<ComandaShortcut[]>('/comandas/shortcuts')).data;
export const buscarDetalhesAgendamento = async (id: string) =>
  (await api.get<AppointmentDetails>(`/appointments/${id}/details`)).data;
export const buscarRegraComissao = async () => (await api.get<CommissionSettings>('/comandas/settings')).data;
export const salvarRegraComissao = async (r: CommissionSettings) =>
  (await api.put<CommissionSettings>('/comandas/settings', r)).data;

export const ehCaixaFechado = (error: unknown): boolean =>
  error instanceof AxiosError && error.response?.status === 409 &&
  (error.response.data as { errorCode?: string } | undefined)?.errorCode === 'CASH_CLOSED';
```

- [ ] **Step 5: `frontend/src/lib/caixa.ts` e `frontend/src/lib/produtos.ts`**

`caixa.ts`:
```ts
import api from '@/lib/api';

export interface CashDay {
  date: string; isToday: boolean; responsavel: string;
  session: null | {
    id: string; openedAt: string; openingBalance: number;
    closedAt: string | null; countedBalance: number | null; expectedBalance: number | null; difference: number | null;
  };
  totals: { entradas: number; entradasQtd: number; saidas: number; saidasQtd: number; saldo: number };
  comandasResumo: { total: number; fechadas: number; abertas: number; falta: number };
  formas: Array<{ chave: FormaCaixa; valor: number; quantidade: number }>;
  linhas: Array<{
    appointmentId: string; comandaId: string | null; numero: number | null; hora: string;
    cliente: string; telefone: string; profissional: string; servicos: string;
    pagamento: 'pix' | 'debito' | 'credito' | 'dinheiro' | 'sinal' | 'em_atendimento' | 'faltou';
    depositApplied: number; total: number; status: 'Fechada' | 'Aberta' | 'Falta';
  }>;
  despesas: Array<{ id: string; descricao: string; categoria: string; valor: number; formaPagamento: string | null; criadoEm: string }>;
  movimentos: Array<{ id: string; kind: 'sangria' | 'suprimento'; valor: number; descricao: string; criadoEm: string }>;
  gaveta: { fundoInicial: number; entradasDinheiro: number; suprimentos: number; sangrias: number; saidasDinheiro: number; esperado: number };
}
export type FormaCaixa = 'pix' | 'sinal_pix' | 'debito' | 'credito' | 'dinheiro';

// Rótulo e legenda de quantidade de cada forma, nos termos do caixa.html (baf21f).
export const ROTULO_FORMA_CAIXA: Record<FormaCaixa, { rotulo: string; legenda: (n: number) => string }> = {
  pix: { rotulo: 'Pix', legenda: (n) => `${n} no balcão` },
  sinal_pix: { rotulo: 'Sinais Pix', legenda: (n) => `${n} ${n === 1 ? 'antecipado' : 'antecipados'}` },
  debito: { rotulo: 'Débito', legenda: (n) => `${n} ${n === 1 ? 'transação' : 'transações'}` },
  credito: { rotulo: 'Crédito', legenda: (n) => `${n} ${n === 1 ? 'transação' : 'transações'}` },
  dinheiro: { rotulo: 'Dinheiro', legenda: (n) => `${n} na gaveta` },
};

export const buscarCaixa = async (date?: string) => (await api.get<CashDay>('/cash/today', { params: date ? { date } : {} })).data;
export const abrirCaixa = async (openingBalance: number) => (await api.post<CashDay>('/cash/open', { openingBalance })).data;
export const registrarMovimento = async (m: { kind: 'sangria' | 'suprimento'; amount: number; description: string }) =>
  (await api.post<CashDay>('/cash/movements', m)).data;
export const fecharCaixa = async (d: { countedBalance: number; notes?: string; date?: string }) =>
  (await api.post<CashDay>('/cash/close', d)).data;
```
`produtos.ts`:
```ts
import api from '@/lib/api';

export interface Produto { id: string; name: string; description: string | null; price: number; active: boolean }
export interface ProdutoInput { name: string; description?: string | null; price: number }

export const listarProdutos = async () => (await api.get<Produto[]>('/products')).data;
export const criarProduto = async (p: ProdutoInput) => (await api.post<Produto>('/products', p)).data;
export const atualizarProduto = async (id: string, p: Partial<ProdutoInput>) => (await api.put<Produto>(`/products/${id}`, p)).data;
export const removerProduto = async (id: string) => { await api.delete(`/products/${id}`); };
```

- [ ] **Step 6: Proxies**

Cada arquivo segue exatamente este molde (trocar método e caminho):
```ts
import { proxyRequest } from '@/lib/server/proxy';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyRequest(request, `/comandas/${id}/close`, 'POST');
}
```
Para rotas sem `[id]`: `export async function GET(request: Request) { return proxyRequest(request, '/comandas/shortcuts', 'GET'); }`.
Para `cash/today`, repassar a query: `const { search } = new URL(request.url); return proxyRequest(request, \`/cash/today${search}\`, 'GET');` — antes, abrir `frontend/src/lib/server/proxy.ts` e confirmar se `proxyRequest` já repassa a query sozinho (se sim, usar só `'/cash/today'`).

- [ ] **Step 7: Rodar**

Run: `cd frontend && npx vitest run src/lib/__tests__/comanda.test.ts && npx tsc --noEmit` → PASS.

- [ ] **Step 8: Commit**

```bash
git add frontend/src
git commit -m "feat(frontend): tipos, clientes de API e proxies de comanda, caixa e produtos

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Comanda (tela) — `ComandaModal`

**Files:**
- Create: `frontend/src/components/comanda/ComandaModal.tsx`
- Create: `frontend/src/components/comanda/AbrirCaixaInline.tsx`
- Modify: `frontend/src/lib/themedPaths.ts` (acrescentar `'src/components/comanda'`)
- Test: `frontend/src/components/comanda/__tests__/ComandaModal.test.tsx`

**Interfaces:**
- Consumes: `@/lib/comanda` (Task 10), `@/lib/caixa#abrirCaixa`, `@/lib/produtos#listarProdutos`, `api.get('/business/services')`.
- Produces:
```ts
export interface ComandaModalProps {
  appointmentId: string | null;           // null = fechado
  onClose: () => void;
  onAtualizada: () => void;               // recarregar a Agenda (rascunho salvo ou comanda fechada)
}
export function ComandaModal(props: ComandaModalProps): JSX.Element | null
```

**Referência visual:** `docs/design/stitch/projeto/studio-aurora-fechamento-de-comanda-e-comissao-ajustada--a9945c.html`, do `<div class="relative w-full rounded-2xl bg-surface-light shadow-xl ...">` até o fim do cartão. Tradução de classes do Stitch para tokens do projeto: `bg-surface-light`→`bg-surface`, `bg-surface-2-light`→`bg-surface-2`, `bg-surface-container-low`/`bg-surface-container`→`bg-surface-2`, `text-ink-light`→`text-ink`, `text-muted-light`→`text-muted`, `bg-primary`/`bg-primary-container`→`bg-brand`, `text-on-primary`/`text-on-brand`→`text-on-brand`, `text-primary`→`text-brand-text`, `ring-primary-container`→`ring-brand`, `bg-primary-container/10`→`bg-brand/10`, `text-success-light`→`text-success-text`, `bg-success-light/10`→`bg-success/10`, `text-danger-light`→`text-danger`, `text-tertiary`→`text-tertiary`, `text-whatsapp-light`→`text-whatsapp`, `font-title-lg text-title-lg`→`text-[18px] font-bold`, `font-title-md text-title-md`→`text-[15px] font-semibold`, `font-label-md text-label-md`→`text-[13px]`, `font-label-sm text-label-sm`→`text-[12px]`, `font-body-sm text-body-sm`→`text-[14px]`, `font-headline-md text-headline-md`→`text-[22px] font-bold`. Se algum token citado não existir em `frontend/src/styles/globals.css` / `tailwind.config`, use o mais próximo que existir (o teste de conformidade aponta cor fixa).

**Comportamento:**
1. Ao receber `appointmentId`, chama `abrirComanda(id)` e, em paralelo, `buscarAtalhos()`, `listarProdutos()` e `api.get('/business/services')`. Enquanto carrega, mostra `Skeleton`.
2. Estado local: `extras: Array<{ kind; refId; name; unitPrice; quantity; durationMinutes }>` (inicial = itens não principais do DTO), `descontoModo: 'reais' | 'percentual'`, `descontoValor: number`, `gorjeta: number`, `gorjetaOutro: boolean`, `forma: PaymentMethod | null` (inicial = DTO).
3. Prévia: `calcularComanda({ items: [principal, ...extras], depositAvailable: dto.depositAvailable, discount: descontoEmReais, tip: gorjeta, serviceCommissionPct: dto.commission.servicePct, productCommissionPct: dto.commission.productPct })`, com `descontoEmReais = descontoModo === 'percentual' ? round2(subtotal * descontoValor / 100) : descontoValor`.
4. Cabeçalho: ícone `point_of_sale`; chip "Comanda #{number}"; "Finalização de atendimento"; nome da cliente (h1); cartão "Profissional responsável" com `Avatar` + nome; botão fechar (`close`, `aria-label="Fechar comanda"`). Sem "Mesa".
5. "Itens do atendimento" + "{n} itens registrados". Serviço principal: ícone `brush`, nome, duração (`formatDurationExtenso` de `@/lib/formatters` ou `formatarDuracao` de `LinhaDoTempo`), chip "Serviço principal", preço — **sem** lixeira e sem +/−. Extras: ícone `brush` (serviço) ou `shopping_bag` (produto, `text-tertiary`), nome, legenda ("Produto" ou descrição do produto, se houver), +/− (`aria-label="Diminuir quantidade de {nome}"`/`"Aumentar quantidade de {nome}"`, mínimo 1), preço da linha (`unitPrice × quantity`), lixeira (`aria-label="Remover {nome}"`).
6. "Adicionar serviço ou produto extra": campo de busca (`placeholder="Buscar serviço ou produto"`) que filtra serviços ativos (exceto o principal) e produtos ativos pelo nome (sem acento, minúsculas); lista até 6 resultados como botões "{nome} (R$ x)". Adicionar item já presente soma 1 à quantidade. Linha "Atalhos:" com os atalhos do backend (some se vier vazio).
7. "Forma de pagamento": 4 opções como `radio` acessível (`role="radiogroup"`, cada `label` com `input type="radio" className="sr-only"`): Pix (selo "Sem taxa", legenda "Instantâneo"), Cartão débito ("Máquina"), Cartão crédito ("À vista / 1x"), Dinheiro ("Troco disponível"). Sem "Clube".
8. "Resumo financeiro": Serviços executados; Produtos extras (só se > 0); Subtotal; faixa verde "Sinal já pago via Pix  − R$ x" (só se `depositApplied > 0`); linha "Desconto" com botão "Adicionar desconto" que revela campo numérico + alternador R$/% (`aria-label="Desconto em reais"`/`"Desconto em percentual"`), e mostra "− R$ x" quando > 0; "Gorjeta para {primeiro nome}" + "100% repassado" + botões "R$ 5", "R$ 10", "R$ 15", "Outro" (Outro revela campo numérico; clicar no valor já ativo zera a gorjeta); "Total a cobrar" grande + "Saldo remanescente".
9. "Divisão do repasse automático": legenda "Regra da profissional" ou "Regra do negócio" (por `commission.origem`); linhas "Serviço ({pct}% de R$ x)", "Produto ({pct}% de R$ y)" (só se houver produto), "Gorjeta integral" (só se > 0), "Comissão total profissional", "Retenção da casa". Se `servicePct === 0 && productPct === 0`, no lugar das linhas: "Configure a comissão em Ajustes" com link para `/configuracoes`.
10. Rodapé: "Salvar como rascunho" (secundário, ícone `bookmark`) → `salvarComanda` → toast "Rascunho salvo" e `onAtualizada()`; botão principal `check_circle` "Fechar comanda e enviar WhatsApp (R$ x)" quando `dto.whatsappConnected`, senão "Fechar comanda (R$ x)". Desabilitado se `calc.totalCharged > 0 && !forma` (com dica "Escolha a forma de pagamento").
11. Fechar: `fecharComanda`. Se `ehCaixaFechado(erro)`, troca o rodapé por `AbrirCaixaInline` ("O caixa de hoje ainda não foi aberto" + campo "Saldo inicial em dinheiro" + botão "Abrir caixa e fechar comanda") que chama `abrirCaixa(saldo)` e repete `fecharComanda`. Sucesso: toast "Comanda #N fechada" (+ " · comprovante enviado" se `receiptSentAt` veio preenchido; + " · comprovante não enviado" se WhatsApp conectado e `receiptSentAt` nulo), `onAtualizada()`, `onClose()`. Outros erros: toast com `getApiErrorMessage` (já usado em `AppointmentModule.tsx`).
12. Cartões informativos abaixo do modal ("Comprovante instantâneo — Enviado pelo WhatsApp da cliente", "Lançamento em caixa — Entrada no caixa de hoje"): só aparecem com WhatsApp conectado (o primeiro) e sempre o segundo. Sem "recibo fiscal".
13. Layout: `Modal` de `@/components/ui` com largura grande no desktop (`max-w-5xl`) e tela cheia no celular (`max-sm:h-dvh max-sm:max-w-none max-sm:rounded-none`); grade `lg:grid-cols-12` com coluna 7/5 como no Stitch. Antes de começar, ler `frontend/src/components/ui/Modal.tsx` para ver as props de tamanho existentes e usar as dele.

- [ ] **Step 1: Escrever os testes**

`frontend/src/components/comanda/__tests__/ComandaModal.test.tsx`:
```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AxiosError, type AxiosResponse } from 'axios';
import { ToastProvider } from '@/components/Toast';
import { ComandaModal } from '../ComandaModal';
import * as comanda from '@/lib/comanda';
import * as caixa from '@/lib/caixa';

vi.mock('@/lib/api', () => ({ default: { get: vi.fn().mockResolvedValue({ data: [
  { id: 's1', name: 'Manutenção Fibra de Vidro', price: 110, duration_minutes: 90, active: true },
  { id: 's9', name: 'Remoção Express', price: 30, duration_minutes: 20, active: true },
] }) } }));
vi.mock('@/lib/produtos', () => ({ listarProdutos: vi.fn().mockResolvedValue([
  { id: 'pr1', name: 'Óleo Hidratante de Cutícula 10ml', description: 'Produto Home Care', price: 25, active: true },
]) }));
vi.mock('@/lib/caixa', async (orig) => ({ ...(await orig<typeof import('@/lib/caixa')>()), abrirCaixa: vi.fn() }));
vi.mock('@/lib/comanda', async (orig) => ({
  ...(await orig<typeof import('@/lib/comanda')>()),
  abrirComanda: vi.fn(), salvarComanda: vi.fn(), fecharComanda: vi.fn(), buscarAtalhos: vi.fn(),
}));

const dto = (over: Partial<comanda.ComandaDetail> = {}): comanda.ComandaDetail => ({
  id: 'k1', number: 1042, status: 'rascunho',
  appointment: { id: 'a1', date: '2026-10-13', time: '10:00', status: 'em_atendimento', source: 'publico' },
  client: { id: 'c1', name: 'Mariana Souza', phone: '83999990000' },
  professional: { id: 'p1', name: 'Camila Rocha' },
  items: [{ id: 'i1', kind: 'servico', refId: 's1', name: 'Manutenção Fibra de Vidro', unitPrice: 110, quantity: 1, durationMinutes: 90, isMain: true }],
  depositAvailable: 30, discount: 0, tip: 0, paymentMethod: null,
  commission: { servicePct: 50, productPct: 20, origem: 'negocio' },
  calc: comanda.calcularComanda({ items: [{ kind: 'servico', unitPrice: 110, quantity: 1 }], depositAvailable: 30, discount: 0, tip: 0, serviceCommissionPct: 50, productCommissionPct: 20 }),
  whatsappConnected: true, closedAt: null, receiptSentAt: null,
  ...over,
});

const abrir = () => {
  const onAtualizada = vi.fn();
  const onClose = vi.fn();
  render(<ToastProvider><ComandaModal appointmentId="a1" onClose={onClose} onAtualizada={onAtualizada} /></ToastProvider>);
  return { onAtualizada, onClose };
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(comanda.abrirComanda).mockResolvedValue(dto());
  vi.mocked(comanda.buscarAtalhos).mockResolvedValue([{ kind: 'servico', id: 's9', name: 'Remoção Express', price: 30 }]);
});

describe('ComandaModal', () => {
  it('mostra a comanda com sinal descontado e total a cobrar', async () => {
    abrir();
    expect(await screen.findByText('Comanda #1042')).toBeInTheDocument();
    expect(screen.getByText('Mariana Souza')).toBeInTheDocument();
    expect(screen.getByText('Sinal já pago via Pix')).toBeInTheDocument();
    expect(screen.getByTestId('total-a-cobrar')).toHaveTextContent('R$ 80,00');
    expect(screen.queryByText(/mesa/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/clube/i)).not.toBeInTheDocument();
  });

  it('adicionar produto pela busca e aumentar a quantidade recalcula total e repasse', async () => {
    const user = userEvent.setup();
    abrir();
    await screen.findByText('Comanda #1042');
    await user.type(screen.getByPlaceholderText('Buscar serviço ou produto'), 'oleo');
    await user.click(screen.getByRole('button', { name: /Óleo Hidratante de Cutícula 10ml/ }));
    await user.click(screen.getByRole('button', { name: 'Aumentar quantidade de Óleo Hidratante de Cutícula 10ml' }));
    expect(screen.getByTestId('total-a-cobrar')).toHaveTextContent('R$ 130,00');
    expect(screen.getByText('Produto (20% de R$ 50,00)')).toBeInTheDocument();
  });

  it('atalho adiciona o item', async () => {
    const user = userEvent.setup();
    abrir();
    await user.click(await screen.findByRole('button', { name: /Remoção Express \(R\$ 30\)/ }));
    expect(screen.getByTestId('total-a-cobrar')).toHaveTextContent('R$ 110,00');
  });

  it('desconto em percentual', async () => {
    const user = userEvent.setup();
    abrir();
    await screen.findByText('Comanda #1042');
    await user.click(screen.getByRole('button', { name: 'Adicionar desconto' }));
    await user.click(screen.getByRole('button', { name: 'Desconto em percentual' }));
    await user.type(screen.getByLabelText('Valor do desconto'), '10');
    expect(screen.getByTestId('total-a-cobrar')).toHaveTextContent('R$ 69,00');
  });

  it('gorjeta "Outro"', async () => {
    const user = userEvent.setup();
    abrir();
    await screen.findByText('Comanda #1042');
    await user.click(screen.getByRole('button', { name: 'Outro' }));
    await user.type(screen.getByLabelText('Valor da gorjeta'), '7');
    expect(screen.getByTestId('total-a-cobrar')).toHaveTextContent('R$ 87,00');
    expect(screen.getByText('Gorjeta integral')).toBeInTheDocument();
  });

  it('sem WhatsApp conectado o botão não promete envio', async () => {
    vi.mocked(comanda.abrirComanda).mockResolvedValue(dto({ whatsappConnected: false }));
    abrir();
    expect(await screen.findByRole('button', { name: /Fechar comanda \(R\$ 80,00\)/ })).toBeInTheDocument();
    expect(screen.queryByText(/enviar WhatsApp/i)).not.toBeInTheDocument();
  });

  it('não fecha sem forma de pagamento quando há valor a cobrar', async () => {
    abrir();
    expect(await screen.findByRole('button', { name: /Fechar comanda e enviar WhatsApp/ })).toBeDisabled();
  });

  it('caixa fechado: abre o caixa ali mesmo e conclui o fechamento', async () => {
    const user = userEvent.setup();
    const erro = new AxiosError('x', '409', undefined, undefined, { status: 409, data: { errorCode: 'CASH_CLOSED' } } as AxiosResponse);
    vi.mocked(comanda.fecharComanda).mockRejectedValueOnce(erro).mockResolvedValueOnce(dto({ status: 'fechada', receiptSentAt: '2026-10-13T13:00:00Z' }));
    vi.mocked(caixa.abrirCaixa).mockResolvedValue({} as caixa.CashDay);
    const { onAtualizada, onClose } = abrir();
    await screen.findByText('Comanda #1042');
    await user.click(within(screen.getByRole('radiogroup')).getByLabelText(/Pix/));
    await user.click(screen.getByRole('button', { name: /Fechar comanda e enviar WhatsApp/ }));
    expect(await screen.findByText('O caixa de hoje ainda não foi aberto')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Saldo inicial em dinheiro'), '150');
    await user.click(screen.getByRole('button', { name: 'Abrir caixa e fechar comanda' }));
    await waitFor(() => expect(caixa.abrirCaixa).toHaveBeenCalledWith(150));
    await waitFor(() => expect(comanda.fecharComanda).toHaveBeenCalledTimes(2));
    expect(onAtualizada).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('salvar rascunho envia extras, desconto, gorjeta e forma', async () => {
    const user = userEvent.setup();
    vi.mocked(comanda.salvarComanda).mockResolvedValue(dto());
    abrir();
    await user.click(await screen.findByRole('button', { name: /Remoção Express \(R\$ 30\)/ }));
    await user.click(screen.getByRole('button', { name: 'R$ 10' }));
    await user.click(screen.getByRole('button', { name: 'Salvar como rascunho' }));
    await waitFor(() => expect(comanda.salvarComanda).toHaveBeenCalledWith('k1', {
      extras: [{ kind: 'servico', id: 's9', quantity: 1 }], discount: 0, tip: 10, paymentMethod: null,
    }));
  });
});
```

- [ ] **Step 2: Rodar e ver falhar** — `cd frontend && npx vitest run src/components/comanda/__tests__/ComandaModal.test.tsx` → FAIL (componente não existe).

- [ ] **Step 3: Implementar `AbrirCaixaInline.tsx`**

```tsx
'use client';

import { useState } from 'react';
import { Button, Field, Input, Icon } from '@/components/ui';

export interface AbrirCaixaInlineProps {
  carregando: boolean;
  rotuloBotao: string;
  onAbrir: (saldoInicial: number) => void;
}

export function AbrirCaixaInline({ carregando, rotuloBotao, onAbrir }: AbrirCaixaInlineProps) {
  const [saldo, setSaldo] = useState('');
  const valor = Number(saldo.replace(',', '.'));
  return (
    <div className="flex flex-col gap-3 rounded-card border border-warning/40 bg-warning/10 p-4 sm:flex-row sm:items-end">
      <div className="flex-1">
        <p className="mb-2 flex items-center gap-1.5 text-[14px] font-semibold text-ink">
          <Icon name="lock" size={18} className="text-warning-text" />
          O caixa de hoje ainda não foi aberto
        </p>
        <Field id="saldo-inicial-caixa" label="Saldo inicial em dinheiro">
          <Input id="saldo-inicial-caixa" inputMode="decimal" value={saldo} onChange={(e) => setSaldo(e.target.value)} placeholder="0,00" />
        </Field>
      </div>
      <Button disabled={carregando || Number.isNaN(valor) || valor < 0} onClick={() => onAbrir(Number.isNaN(valor) ? 0 : valor)}>
        <Icon name="lock_open" size={18} />
        {rotuloBotao}
      </Button>
    </div>
  );
}
```
(Confira em `frontend/src/components/ui/Field.tsx` se `Field` recebe `id`+`label` como acima — é o uso de `ServiceProfessionalModal.tsx:222`.)

- [ ] **Step 4: Implementar `ComandaModal.tsx`**

Estrutura e lógica (o JSX de cada seção porta a marcação do Stitch com a tradução de classes acima):
```tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import api from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatCurrency } from '@/lib/formatters';
import { Modal, Button, Avatar, Skeleton, Icon, Input } from '@/components/ui';
import { useToast } from '@/components/Toast';
import { listarProdutos, type Produto } from '@/lib/produtos';
import { abrirCaixa } from '@/lib/caixa';
import {
  abrirComanda, salvarComanda, fecharComanda, buscarAtalhos, calcularComanda, ehCaixaFechado,
  type ComandaDetail, type ComandaShortcut, type PaymentMethod, type SalvarComandaInput,
} from '@/lib/comanda';
import type { Service } from '@/types';
import { AbrirCaixaInline } from './AbrirCaixaInline';

interface Extra { kind: 'servico' | 'produto'; refId: string; name: string; legenda: string | null; unitPrice: number; quantity: number }

const GORJETAS = [5, 10, 15] as const;
const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const round2 = (v: number) => Math.round(v * 100) / 100;
const numero = (s: string) => { const v = Number(s.replace(',', '.')); return Number.isFinite(v) && v > 0 ? v : 0; };

export interface ComandaModalProps {
  appointmentId: string | null;
  onClose: () => void;
  onAtualizada: () => void;
}

export function ComandaModal({ appointmentId, onClose, onAtualizada }: ComandaModalProps) {
  const { showToast } = useToast();
  const [dto, setDto] = useState<ComandaDetail | null>(null);
  const [servicos, setServicos] = useState<Service[]>([]);
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [atalhos, setAtalhos] = useState<ComandaShortcut[]>([]);
  const [extras, setExtras] = useState<Extra[]>([]);
  const [busca, setBusca] = useState('');
  const [mostrarDesconto, setMostrarDesconto] = useState(false);
  const [descontoModo, setDescontoModo] = useState<'reais' | 'percentual'>('reais');
  const [descontoTexto, setDescontoTexto] = useState('');
  const [gorjeta, setGorjeta] = useState(0);
  const [gorjetaOutro, setGorjetaOutro] = useState(false);
  const [gorjetaTexto, setGorjetaTexto] = useState('');
  const [forma, setForma] = useState<PaymentMethod | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [pedirCaixa, setPedirCaixa] = useState(false);

  useEffect(() => {
    if (!appointmentId) return;
    let ativo = true;
    setDto(null); setPedirCaixa(false); setBusca('');
    Promise.all([
      abrirComanda(appointmentId),
      buscarAtalhos().catch(() => []),
      listarProdutos().catch(() => []),
      api.get<Service[]>('/business/services').then((r) => r.data).catch(() => []),
    ]).then(([c, a, p, s]) => {
      if (!ativo) return;
      setDto(c); setAtalhos(a); setProdutos(p); setServicos(s);
      setExtras(c.items.filter((i) => !i.isMain).map((i) => ({
        kind: i.kind, refId: i.refId ?? '', name: i.name,
        legenda: i.kind === 'produto' ? p.find((x) => x.id === i.refId)?.description ?? 'Produto' : null,
        unitPrice: i.unitPrice, quantity: i.quantity,
      })));
      setForma(c.paymentMethod);
      setGorjeta(c.tip);
      if (c.discount > 0) { setMostrarDesconto(true); setDescontoTexto(String(c.discount)); }
    }).catch((e) => {
      showToast(getMensagem(e, 'Não foi possível abrir a comanda'), 'error');
      onClose();
    });
    return () => { ativo = false; };
  }, [appointmentId]); // eslint-disable-line react-hooks/exhaustive-deps

  const principal = dto?.items.find((i) => i.isMain) ?? null;
  const subtotalBruto = (principal ? principal.unitPrice : 0) + extras.reduce((t, e) => t + e.unitPrice * e.quantity, 0);
  const descontoReais = descontoModo === 'percentual' ? round2(subtotalBruto * numero(descontoTexto) / 100) : numero(descontoTexto);
  const gorjetaFinal = gorjetaOutro ? numero(gorjetaTexto) : gorjeta;

  const calc = useMemo(() => dto && calcularComanda({
    items: [
      ...(principal ? [{ kind: 'servico' as const, unitPrice: principal.unitPrice, quantity: 1 }] : []),
      ...extras.map((e) => ({ kind: e.kind, unitPrice: e.unitPrice, quantity: e.quantity })),
    ],
    depositAvailable: dto.depositAvailable, discount: descontoReais, tip: gorjetaFinal,
    serviceCommissionPct: dto.commission.servicePct, productCommissionPct: dto.commission.productPct,
  }), [dto, principal, extras, descontoReais, gorjetaFinal]);

  const resultados = useMemo(() => {
    const termo = semAcento(busca.trim());
    if (!termo) return [];
    const opcoes = [
      ...servicos.filter((s) => s.active !== false && s.id !== principal?.refId).map((s) => ({ kind: 'servico' as const, id: s.id, name: s.name, price: Number(s.price), legenda: null })),
      ...produtos.map((p) => ({ kind: 'produto' as const, id: p.id, name: p.name, price: p.price, legenda: p.description ?? 'Produto' })),
    ];
    return opcoes.filter((o) => semAcento(o.name).includes(termo)).slice(0, 6);
  }, [busca, servicos, produtos, principal]);

  const adicionar = (item: { kind: 'servico' | 'produto'; id: string; name: string; price: number; legenda?: string | null }) => {
    setExtras((atual) => {
      const i = atual.findIndex((e) => e.kind === item.kind && e.refId === item.id);
      if (i >= 0) return atual.map((e, k) => (k === i ? { ...e, quantity: e.quantity + 1 } : e));
      const legenda = item.kind === 'produto' ? item.legenda ?? produtos.find((p) => p.id === item.id)?.description ?? 'Produto' : null;
      return [...atual, { kind: item.kind, refId: item.id, name: item.name, legenda, unitPrice: item.price, quantity: 1 }];
    });
    setBusca('');
  };
  const mudarQuantidade = (indice: number, delta: number) =>
    setExtras((atual) => atual.map((e, k) => (k === indice ? { ...e, quantity: Math.max(1, e.quantity + delta) } : e)));
  const remover = (indice: number) => setExtras((atual) => atual.filter((_, k) => k !== indice));

  const entrada = (): SalvarComandaInput => ({
    extras: extras.map((e) => ({ kind: e.kind, id: e.refId, quantity: e.quantity })),
    discount: calc?.discount ?? 0, tip: calc?.tip ?? 0, paymentMethod: forma,
  });

  const salvarRascunho = async () => {
    if (!dto) return;
    setEnviando(true);
    try {
      await salvarComanda(dto.id, entrada());
      showToast('Rascunho salvo', 'success');
      onAtualizada();
    } catch (e) {
      showToast(getMensagem(e, 'Erro ao salvar a comanda'), 'error');
    } finally { setEnviando(false); }
  };

  const fechar = async () => {
    if (!dto) return;
    setEnviando(true);
    try {
      const fechada = await fecharComanda(dto.id, entrada());
      const extra = fechada.receiptSentAt ? ' · comprovante enviado' : dto.whatsappConnected ? ' · comprovante não enviado' : '';
      showToast(`Comanda #${fechada.number} fechada${extra}`, 'success');
      onAtualizada();
      onClose();
    } catch (e) {
      if (ehCaixaFechado(e)) setPedirCaixa(true);
      else showToast(getMensagem(e, 'Erro ao fechar a comanda'), 'error');
    } finally { setEnviando(false); }
  };

  const abrirCaixaEFechar = async (saldo: number) => {
    setEnviando(true);
    try {
      await abrirCaixa(saldo);
      setPedirCaixa(false);
    } catch (e) {
      showToast(getMensagem(e, 'Erro ao abrir o caixa'), 'error');
      setEnviando(false);
      return;
    }
    await fechar();
  };

  // JSX: cabeçalho, coluna esquerda (itens, busca/atalhos, forma de pagamento),
  // coluna direita (resumo, desconto, gorjeta, total, repasse), rodapé, cartões.
  // Requisitos de acessibilidade/texto que os testes usam:
  //  - total: <span data-testid="total-a-cobrar">{formatCurrency(calc.totalCharged)}</span>
  //  - radiogroup de forma de pagamento com <label> contendo o nome ("Pix", "Cartão débito"...)
  //  - botões: "Adicionar desconto", "Desconto em reais", "Desconto em percentual",
  //    "R$ 5", "R$ 10", "R$ 15", "Outro", "Salvar como rascunho",
  //    `Fechar comanda e enviar WhatsApp (${formatCurrency(calc.totalCharged)})` ou
  //    `Fechar comanda (${formatCurrency(calc.totalCharged)})`
  //  - campos: aria-label "Valor do desconto", "Valor da gorjeta"
  //  - repasse: `Serviço (${pct}% de ${formatCurrency(calc.serviceBase)})`,
  //    `Produto (${pct}% de ${formatCurrency(calc.productBase)})`, "Gorjeta integral",
  //    "Comissão total profissional", "Retenção da casa"
  //  - atalhos: `${nome} (R$ ${preco})` (preço sem centavos quando inteiro, como no Stitch)
  //  - quando pedirCaixa: <AbrirCaixaInline rotuloBotao="Abrir caixa e fechar comanda" .../>
  // ...
}

function getMensagem(e: unknown, padrao: string): string {
  const data = (e as { response?: { data?: { error?: string; message?: string } } })?.response?.data;
  return data?.error || data?.message || padrao;
}
```
Escreva o JSX completo das seções descritas em **Comportamento** (itens 4-13), seguindo a marcação do Stitch indicada. `formatCurrency` de `@/lib/formatters` deve produzir "R$ 80,00" (confira a assinatura; o projeto usa `formatCurrency(valor)` e `formatCurrency(valor, { cents: false })`). Se `getApiErrorMessage` já existir exportado em algum `lib`, use-o no lugar de `getMensagem`.

- [ ] **Step 5: Registrar a pasta no tema**

`frontend/src/lib/themedPaths.ts`: acrescentar `'src/components/comanda',` na lista.

- [ ] **Step 6: Rodar**

Run: `cd frontend && npx vitest run src/components/comanda/__tests__/ComandaModal.test.tsx src/__tests__/themeCompliance.test.ts && npx tsc --noEmit` → PASS.

- [ ] **Step 7: Commit**

```bash
git add frontend/src
git commit -m "feat(comanda): tela de fechamento de comanda fiel ao Stitch

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Agenda — ações de status, comanda, duração real, meia-noite, horário livre preenchido e almoço

**Files:**
- Modify: `frontend/src/components/AppointmentModule.tsx`
- Modify: `frontend/src/components/appointments/LinhaDoTempo.tsx`, `AppointmentCard.tsx`, `CreateAppointmentModal.tsx`, `PainelDetalhesAgendamento.tsx` (só `faixaDoAtendimento`)
- Modify: `frontend/src/components/ProfessionalAgenda.tsx` (usa `duracaoPadraoMinutos`)
- Test: `frontend/src/components/appointments/__tests__/LinhaDoTempo.test.tsx`, `AppointmentCard.test.tsx`, `frontend/src/components/__tests__/AppointmentModule.test.tsx` (acrescentar casos)

**Interfaces:**
- Consumes: `ComandaModal` (Task 11), `Professional.breakStart/breakEnd` (Task 3/10).
- Produces: tipo único de ação usado por cartão, linha do tempo e painel:
```ts
// frontend/src/components/appointments/acoes.ts
export type AcaoAgendamento = 'iniciar' | 'concluir' | 'faltou' | 'cancelar' | 'desfazer_inicio';
export const ACOES_POR_STATUS: Record<AppointmentStatus, AcaoAgendamento[]> = {
  aguardando_pagamento: ['cancelar'],
  confirmado: ['iniciar', 'concluir', 'faltou', 'cancelar'],
  em_atendimento: ['concluir', 'desfazer_inicio', 'cancelar'],
  concluido: [], faltou: [], cancelado: [],
};
```
- Produces: `CreateAppointmentModal` aceita `inicial?: { professionalId?: string; date?: string; time?: string }`.
- Produces: `LinhaDoTempo` e `AppointmentCard` recebem `onAcao: (agendamento: Appointment, acao: AcaoAgendamento) => void` no lugar de `onStatusChange`; `LinhaDoTempo` recebe `onNovoAgendamento: (inicial?: { professionalId?: string; date?: string; time?: string }) => void` e `intervalos: Record<string, { inicio: string; fim: string } | undefined>` (por id de profissional).

- [ ] **Step 1: Escrever os testes**

Em `LinhaDoTempo.test.tsx` acrescentar (funções puras exportadas pelo arquivo):
```tsx
import { calcularVagasLivres, faixaHorariaTexto } from '../LinhaDoTempo';

describe('vagas livres respeitam duração real e almoço', () => {
  const faixa = { inicioMinutos: 9 * 60, fimMinutos: 15 * 60 } as const;

  it('a vaga começa quando o atendimento de 150 min termina', () => {
    const vagas = calcularVagasLivres([agendamento({ id: 'a1', time: '09:00:00', service_duration_minutes: 150 })], faixa as never, 30);
    expect(vagas[0]).toEqual({ inicioMinutos: 11 * 60 + 30, duracaoMinutos: 210 });
  });

  it('o almoço conta como ocupado', () => {
    const vagas = calcularVagasLivres(
      [agendamento({ id: 'a1', time: '09:00:00', service_duration_minutes: 60 })],
      faixa as never, 30, undefined, [{ inicio: 12 * 60, fim: 13 * 60 }],
    );
    expect(vagas).toEqual([
      { inicioMinutos: 10 * 60, duracaoMinutos: 120 },
      { inicioMinutos: 13 * 60, duracaoMinutos: 120 },
    ]);
  });
});

it('faixa horária que passa da meia-noite volta para 00h', () => {
  expect(faixaHorariaTexto(23 * 60 + 30, 150)).toBe('23:30 às 02:00');
});
```
(`agendamento()` é o helper que já existe no topo do arquivo; `bloqueios` entra como 5º parâmetro de `calcularVagasLivres`, depois de `opcoes` — ver Step 5.)

Em `PainelDetalhesAgendamento.test.tsx`, trocar o teste atual de `faixaDoAtendimento` por:
```ts
it('faixa que passa da meia-noite volta para 00h', () => {
  expect(faixaDoAtendimento('23:30', 150)).toBe('23:30 às 02:00');
});
```

Em `AppointmentModule.test.tsx`, acrescentar no topo (junto dos outros `vi.mock`):
```tsx
const mockApiPut = vi.hoisted(() => vi.fn().mockResolvedValue({ data: {} }));
vi.mock('@/lib/comanda', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/comanda')>()),
  abrirComanda: vi.fn().mockResolvedValue({
    id: 'k1', number: 1042, status: 'rascunho',
    appointment: { id: 'a1', date: '2026-09-17', time: '10:00', status: 'em_atendimento', source: 'painel' },
    client: { id: 'c1', name: 'Mariana Souza', phone: '83999990000' },
    professional: { id: 'p1', name: 'Camila Rocha' },
    items: [{ id: 'i1', kind: 'servico', refId: 's1', name: 'Atendimento', unitPrice: 100, quantity: 1, durationMinutes: 60, isMain: true }],
    depositAvailable: 0, discount: 0, tip: 0, paymentMethod: null,
    commission: { servicePct: 0, productPct: 0, origem: 'negocio' },
    calc: { servicesTotal: 100, productsTotal: 0, subtotal: 100, depositApplied: 0, discount: 0, tip: 0, totalCharged: 100, revenue: 100, commissionService: 0, commissionProduct: 0, commissionTotal: 0, houseRetention: 100, serviceBase: 100, productBase: 0 },
    whatsappConnected: false, closedAt: null, receiptSentAt: null,
  }),
  buscarAtalhos: vi.fn().mockResolvedValue([]),
  buscarDetalhesAgendamento: vi.fn().mockResolvedValue({ appointment: {}, client_stats: { visits_this_year: 0, average_cycle_days: null, last_visit_days_ago: null, last_visit_professional: null, is_recurring: false }, client_notes: null }),
}));
vi.mock('@/lib/produtos', () => ({ listarProdutos: vi.fn().mockResolvedValue([]) }));
```
e trocar `put: vi.fn(),` do mock de `@/lib/api` por `put: (...args: unknown[]) => mockApiPut(...args),`. Depois, os casos:
```tsx
describe('AppointmentModule: ações de status', () => {
  beforeEach(() => {
    mockSearch.value = '';
    mockApiGet.mockReset();
    mockApiPut.mockClear();
  });

  it('concluir abre a comanda em vez de mudar o status direto', async () => {
    const user = userEvent.setup();
    responder([agendamento({ id: 'a1', time: '10:00:00', service_duration_minutes: 60 })]);
    render(<AppointmentModule />);
    const [botao] = await screen.findAllByRole('button', { name: 'Concluir atendimento de Mariana Souza' });
    await user.click(botao);
    expect(await screen.findByText('Comanda #1042')).toBeInTheDocument();
    expect(mockApiPut).not.toHaveBeenCalledWith('/appointments/a1/status', { status: 'concluido' });
  });

  it('iniciar atendimento envia em_atendimento', async () => {
    const user = userEvent.setup();
    responder([agendamento({ id: 'a1', time: '10:00:00', service_duration_minutes: 60 })]);
    render(<AppointmentModule />);
    const [botao] = await screen.findAllByRole('button', { name: 'Iniciar atendimento de Mariana Souza' });
    await user.click(botao);
    await waitFor(() => expect(mockApiPut).toHaveBeenCalledWith('/appointments/a1/status', { status: 'em_atendimento' }));
  });

  it('clicar num horário livre abre o novo agendamento com profissional e data', async () => {
    const user = userEvent.setup();
    responder([agendamento({ id: 'a1', time: '09:00:00', service_duration_minutes: 60 })]);
    render(<AppointmentModule />);
    const [vaga] = await screen.findAllByRole('button', { name: /Novo agendamento: 10:00/ });
    await user.click(vaga);
    await waitFor(() => expect(mockApiGet).toHaveBeenCalledWith('/appointments/available-slots', { params: expect.objectContaining({ professionalId: 'p1', date: '2026-09-17' }) }));
  });
});
```
(Os botões do computador e do celular têm o mesmo `aria-label`, por isso `findAllByRole(...)[0]`. Se os parâmetros de `available-slots` tiverem outro formato, ajuste ao que `loadAvailableSlots` envia em `AppointmentModule.tsx:252`.)

- [ ] **Step 2: Rodar e ver falhar** — `cd frontend && npx vitest run src/components/appointments src/components/__tests__/AppointmentModule.test.tsx` → FAIL nos novos casos.

- [ ] **Step 3: `acoes.ts` e rótulos**

Criar `frontend/src/components/appointments/acoes.ts` com o bloco de **Interfaces** acima e:
```ts
export const ROTULO_ACAO: Record<AcaoAgendamento, { texto: string; icone: string }> = {
  iniciar: { texto: 'Iniciar atendimento', icone: 'play_circle' },
  concluir: { texto: 'Concluir atendimento', icone: 'task_alt' },
  faltou: { texto: 'Cliente faltou', icone: 'person_off' },
  cancelar: { texto: 'Cancelar', icone: 'cancel' },
  desfazer_inicio: { texto: 'Voltar para confirmado', icone: 'undo' },
};
```

- [ ] **Step 4: `AppointmentModule.tsx`**

- Novo estado `const [comandaDe, setComandaDe] = useState<string | null>(null);` e `const [inicialNovo, setInicialNovo] = useState<{ professionalId?: string; date?: string; time?: string } | undefined>();`.
- Trocar `handleStatusChange` por:
```ts
const STATUS_DA_ACAO: Record<Exclude<AcaoAgendamento, 'concluir'>, AppointmentStatus> = {
  iniciar: 'em_atendimento', faltou: 'faltou', cancelar: 'cancelado', desfazer_inicio: 'confirmado',
};
const MENSAGEM_DA_ACAO: Record<Exclude<AcaoAgendamento, 'concluir'>, string> = {
  iniciar: 'Atendimento iniciado', faltou: 'Falta registrada', cancelar: 'Agendamento cancelado', desfazer_inicio: 'Atendimento voltou para confirmado',
};
const handleAcao = async (agendamento: Appointment, acao: AcaoAgendamento) => {
  if (acao === 'concluir') { setDetalhesId(null); setComandaDe(agendamento.id); return; }
  try {
    setActionLoading(agendamento.id);
    await api.put(`/appointments/${agendamento.id}/status`, { status: STATUS_DA_ACAO[acao] });
    showToast(MENSAGEM_DA_ACAO[acao], acao === 'cancelar' ? 'info' : 'success');
    loadAppointments();
  } catch (error: unknown) {
    showToast(getApiErrorMessage(error, 'Erro ao atualizar status'), 'error');
  } finally {
    setActionLoading(null);
  }
};
```
  A confirmação de Pix (`PendingPaymentList`) continua chamando `/status` com `confirmado` por conta própria — não mexer.
- `openModal(inicial?)` guarda `setInicialNovo(inicial)` antes de abrir; `closeModal` limpa.
- `duracaoMinutos`: apagar `conteudoDemo.agenda.duracaoPadraoMinutos`; usar `const duracaoMinutos = horarioFuncionamento?.intervaloMinutos ?? 30;` (fallback só para agendamento cujo serviço veio sem duração, o que não deve acontecer). Conferir o nome do campo de intervalo em `HorarioFuncionamento` (`LinhaDoTempo.tsx:151`); se não existir, usar `30` fixo com o comentário "fallback técnico: o DTO sempre traz service_duration_minutes".
- Montar `intervalos` a partir de `professionals` (já carregado em `loadAuxData`): `Object.fromEntries(professionals.filter(p => p.breakStart && p.breakEnd).map(p => [p.id, { inicio: p.breakStart!, fim: p.breakEnd! }]))`.
- Passar `onAcao={handleAcao}`, `intervalos`, `onNovoAgendamento={openModal}` para `LinhaDoTempo`/`AppointmentCard`, e `inicial={inicialNovo}` para `CreateAppointmentModal`.
- Renderizar no fim: `<ComandaModal appointmentId={comandaDe} onClose={() => setComandaDe(null)} onAtualizada={loadAppointments} />`.
- Cabeçalho da Agenda (Stitch `44833f`): conferir os textos com o arquivo — chips "Todas" + profissionais, legenda com os 6 status, "Faturamento" e "horários livres". Ajustar o que divergir (texto e ordem), sem trocar componentes.

- [ ] **Step 5: `LinhaDoTempo.tsx`**

- Props: `onStatusChange` → `onAcao`; `onNovoAgendamento: (inicial?) => void`; novo `intervalos?: Record<string, { inicio: string; fim: string } | undefined>`.
- `BlocoVagaLivre` recebe `professionalId` e `data` e chama `onNovoAgendamento({ professionalId, date, time: paraHoraTexto(vaga.inicioMinutos) })`. O `date` é a data do grupo (`agendamentos[0].date.substring(0, 10)` ou prop `data` vinda do `AppointmentModule`, que já agrupa por data). Atualizar o comentário que dizia "o clique abre o formulário vazio".
- `calcularVagasLivres(agendamentos, faixa, duracaoPadraoMinutos, opcoes?, bloqueios: Array<{ inicio: number; fim: number }> = [])`: os bloqueios entram na lista `ocupados` antes do `sort`. A `LinhaDoTempo` passa o almoço da coluna convertido com `paraMinutos`.
- Desenhar o almoço: para cada coluna com intervalo, bloco `absolute` com `posicaoDoBloco(inicio, fim - inicio, ...)`, fundo listrado como no Stitch (`bg-surface-2` + `bg-[repeating-linear-gradient(...)]` não é permitido — usar `bg-surface-2 border border-dashed border-line`), ícone `restaurant` e texto "Almoço".
- Botões de ação do bloco (hover): para cada `acao` em `ACOES_POR_STATUS[status]`, exceto `cancelar` e `desfazer_inicio` (que ficam no painel de detalhes), botão com `aria-label={\`${ROTULO_ACAO[acao].texto} de ${cliente}\`}` e o ícone de `ROTULO_ACAO`. Isso substitui o par fixo ✓/✗.

- [ ] **Step 6: `AppointmentCard.tsx` (celular)**

- Prop `onStatusChange` → `onAcao`. As duas ações do gesto: `confirmado` → esquerda "Iniciar atendimento" (`iniciar`), direita "Cliente faltou" (`faltou`); `em_atendimento` → esquerda "Concluir" (`concluir`, abre a comanda), direita "Voltar para confirmado" (`desfazer_inicio`). Cancelar fica no painel de detalhes. Os `aria-label` seguem `${ROTULO_ACAO[acao].texto} de ${cliente}`.
- Duração embaixo do horário: `service_duration_minutes` (sem fallback de demo).

- [ ] **Step 7: `CreateAppointmentModal.tsx`**

- Prop `inicial?: { professionalId?: string; date?: string; time?: string }`.
- `useEffect` ao abrir (`isOpen` vira `true`): `setFormData({ clientId: '', serviceId: '', professionalId: inicial?.professionalId ?? '', date: inicial?.date ?? today, time: '' })` e, se houver profissional e data, `onLoadSlots(professionalId, date, '')`; quando os horários chegarem e `inicial.time` estiver entre eles, selecionar `time`.
- Teste em `CreateAppointmentModal` não existe hoje; o caso é coberto pelo teste da `LinhaDoTempo` (chamada) — acrescente um teste simples de pré-preenchimento em `frontend/src/components/appointments/__tests__/CreateAppointmentModal.test.tsx`:
```tsx
it('abre com profissional, data e horário pré-preenchidos', async () => {
  const onLoadSlots = vi.fn();
  render(<CreateAppointmentModal isOpen onClose={vi.fn()} clients={[]} professionals={[{ id: 'p1', name: 'Camila', business_id: 'b', photo: null, active: true, created_at: '' }]}
    services={[]} availableSlots={['10:00', '10:30']} slotsLoading={false} onLoadSlots={onLoadSlots} onSubmit={vi.fn()}
    inicial={{ professionalId: 'p1', date: '2026-10-14', time: '10:00' }} />);
  expect(onLoadSlots).toHaveBeenCalledWith('p1', '2026-10-14', '');
  expect(screen.getByLabelText(/profissional/i)).toHaveValue('p1');
});
```

- [ ] **Step 8: `faixaDoAtendimento` com meia-noite**

Em `PainelDetalhesAgendamento.tsx`, a função passa a usar `% (24 * 60)` no fim:
```ts
export const faixaDoAtendimento = (hora: string, duracaoMinutos: number): string => {
  const [h, m] = hora.split(':').map(Number);
  const inicio = h * 60 + m;
  const fim = (inicio + duracaoMinutos) % (24 * 60);
  const fmt = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
  return `${fmt(inicio)} às ${fmt(fim)}`;
};
```
Fazer o mesmo em `faixaHorariaTexto` de `LinhaDoTempo.tsx:139`.

- [ ] **Step 9: `ProfessionalAgenda.tsx`**

Trocar `duracaoMinutos={conteudoDemo.agenda.duracaoPadraoMinutos}` pela duração real do agendamento (`agendamento.service_duration_minutes`).

- [ ] **Step 10: Rodar**

Run: `cd frontend && npx vitest run src/components/appointments src/components/__tests__/AppointmentModule.test.tsx && npx tsc --noEmit` → PASS (rodar arquivo a arquivo se a máquina estourar 5 s).

- [ ] **Step 11: Commit**

```bash
git add frontend/src
git commit -m "feat(agenda): iniciar, faltou e concluir pela comanda; horário livre preenchido; almoço; duração real

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: Drawer de detalhes (versão "Drawer Completo")

**Files:**
- Modify: `frontend/src/components/appointments/PainelDetalhesAgendamento.tsx`
- Test: `frontend/src/components/appointments/__tests__/PainelDetalhesAgendamento.test.tsx` (reescrever os casos que dependiam de `conteudoDemo`)

**Interfaces:**
- Consumes: `buscarDetalhesAgendamento`, `reenviarComprovante` (Task 10), `AcaoAgendamento`, `ACOES_POR_STATUS`, `ROTULO_ACAO` (Task 12).
- Produces: `PainelDetalhesAgendamento` com props `{ agendamento: Appointment | null; actionLoading: string | null; onFechar: () => void; onAcao: (a: Appointment, acao: AcaoAgendamento) => void; onRemarcar: (a: Appointment) => void }` (sai `duracaoMinutos`: vem de `agendamento.service_duration_minutes`).

**Referência visual:** `studio-aurora-detalhes-do-agendamento-drawer-completo--7ba488.html`, bloco do drawer (de "Agendamento #4892" até os botões do rodapé), com a mesma tradução de classes da Task 11.

**Comportamento (bloco a bloco, todos com dado real):**
1. Cabeçalho: botão fechar; "Agendamento #{comanda_number ?? numeroDoAgendamento(id)}" em caixa alta pequena; "Detalhes da sessão"; `StatusChip` com ponto pulsante quando `em_atendimento`.
2. Cliente: `Avatar`, nome, telefone formatado; selo "Cliente recorrente" (`repeat`) só se `client_stats.is_recurring`; botão WhatsApp (`linkWhatsapp` já existente).
3. Cartões: "Ciclo médio — {n} dias" (selo "Ciclo regular" — **não** "Ideal para o serviço", que afirmaria uma comparação que o sistema não faz — só com ≥ 3 visitas, isto é, `visits_this_year >= 3 && average_cycle_days !== null`) e "Total de visitas — {n} em {ano}" + "Última há {d} dias com {profissional}". Sem histórico: um único cartão "Primeira visita" com texto "Ainda não há atendimentos concluídos desta cliente".
4. "Serviço e horário": chip "Origem: {Agendado no painel | Página pública (link da bio) | WhatsApp}"; serviço; profissional com `Avatar`; data por extenso + `faixaDoAtendimento` + duração.
5. "Pagamento": "Valor total"; faixa "Sinal pago R$ x via Pix — CONFIRMADO" só se `deposit_amount > 0` e status ≠ `aguardando_pagamento`; "Restante no balcão: Cartão, dinheiro ou Pix na saída — R$ (preço − sinal)". Se `comanda_status === 'fechada'`: "Comanda #N fechada" + botão "Reenviar comprovante" (chama `reenviarComprovante(comanda_id)`, toast conforme `sent`).
6. "Observações da ficha técnica" (ícone `warning`, fundo `bg-warning/10`): `client_notes`; o bloco some se vazio.
7. Rodapé: botão principal "Concluir atendimento e receber" (ação `concluir`) quando permitido; se `comanda_status === 'rascunho'`, o texto vira "Continuar comanda #N". Linha de três botões: "Remarcar" (`edit_calendar`, chama `onRemarcar`), "Cliente faltou" (só para `confirmado`), "Cancelar". Quando `em_atendimento`, acrescentar link discreto "Voltar para confirmado". Status final (`concluido`, `faltou`, `cancelado`): sem botões de ação.
8. Carregamento: ao mudar `agendamento?.id`, chama `buscarDetalhesAgendamento`; enquanto carrega, os blocos 3 e 6 mostram `Skeleton`; erro → toast e os blocos 3 e 6 ficam ocultos (o resto usa o `Appointment` que já veio da lista).
9. Apagar `repartirValor` e o uso de `conteudoDemo.agenda.detalhes`.

`onRemarcar` em `AppointmentModule`: abre `CreateAppointmentModal` com `inicial={{ professionalId: a.professional_id, date: a.date.substring(0, 10) }}` e, ao salvar, chama `api.put('/appointments/{id}', dados)` em vez de `post` (acrescentar prop `editandoId?: string` ao modal; o backend já tem `PUT /appointments/:id` — conferir que existe o proxy `frontend/src/app/api/appointments/[id]/route.ts` com `PUT`; se não existir, criá-lo no molde da Task 10).

- [ ] **Step 1: Reescrever os testes**

Em `PainelDetalhesAgendamento.test.tsx`, remover o import de `conteudoDemo`, `repartirValor` e os testes que dependiam dele, mockar `@/lib/comanda`:
```tsx
vi.mock('@/lib/comanda', async (orig) => ({
  ...(await orig<typeof import('@/lib/comanda')>()),
  buscarDetalhesAgendamento: vi.fn(), reenviarComprovante: vi.fn(),
}));

const detalhes = (over = {}) => ({
  appointment: agendamento(),
  client_stats: { visits_this_year: 8, average_cycle_days: 21, last_visit_days_ago: 19, last_visit_professional: 'Camila Rocha', is_recurring: true },
  client_notes: 'Sensível a primer ácido',
  ...over,
});
```
e os casos:
```tsx
it('mostra ciclo médio, visitas do ano e última visita reais', async () => {
  vi.mocked(buscarDetalhesAgendamento).mockResolvedValue(detalhes());
  abrir();
  expect(await screen.findByText('21')).toBeInTheDocument();
  expect(screen.getByText(/8 em 2026/)).toBeInTheDocument();
  expect(screen.getByText('Última há 19 dias com Camila Rocha')).toBeInTheDocument();
  expect(screen.getByText('Cliente recorrente')).toBeInTheDocument();
});

it('cliente sem histórico mostra primeira visita', async () => {
  vi.mocked(buscarDetalhesAgendamento).mockResolvedValue(detalhes({ client_stats: { visits_this_year: 0, average_cycle_days: null, last_visit_days_ago: null, last_visit_professional: null, is_recurring: false } }));
  abrir();
  expect(await screen.findByText('Primeira visita')).toBeInTheDocument();
  expect(screen.queryByText('Cliente recorrente')).not.toBeInTheDocument();
});

it('observações da ficha técnica só aparecem quando existem', async () => {
  vi.mocked(buscarDetalhesAgendamento).mockResolvedValue(detalhes({ client_notes: null }));
  abrir();
  await screen.findByText('Detalhes da sessão');
  await waitFor(() => expect(screen.queryByText('Observações da ficha técnica')).not.toBeInTheDocument());
});

it('sinal real e restante no balcão', async () => {
  vi.mocked(buscarDetalhesAgendamento).mockResolvedValue(detalhes());
  abrir({ deposit_amount: 30, source: 'publico', service_price: 180 });
  expect(await screen.findByText(/Sinal pago R\$ 30,00 via Pix/)).toBeInTheDocument();
  expect(screen.getByText('R$ 150,00')).toBeInTheDocument();
  expect(screen.getByText(/Página pública \(link da bio\)/)).toBeInTheDocument();
});

it('botões dependem do status', async () => {
  vi.mocked(buscarDetalhesAgendamento).mockResolvedValue(detalhes());
  const { onAcao } = abrir({ status: 'confirmado' });
  await userEvent.setup().click(await screen.findByRole('button', { name: 'Concluir atendimento e receber' }));
  expect(onAcao).toHaveBeenCalledWith(expect.objectContaining({ id: expect.any(String) }), 'concluir');
  expect(screen.getByRole('button', { name: 'Cliente faltou' })).toBeInTheDocument();
});

it('comanda em rascunho vira "Continuar comanda"', async () => {
  vi.mocked(buscarDetalhesAgendamento).mockResolvedValue(detalhes());
  abrir({ status: 'em_atendimento', comanda_id: 'k1', comanda_status: 'rascunho', comanda_number: 1042 });
  expect(await screen.findByRole('button', { name: 'Continuar comanda #1042' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Cliente faltou' })).not.toBeInTheDocument();
});

it('atendimento concluído não oferece ações', async () => {
  vi.mocked(buscarDetalhesAgendamento).mockResolvedValue(detalhes());
  abrir({ status: 'concluido', comanda_id: 'k1', comanda_status: 'fechada', comanda_number: 1042 });
  expect(await screen.findByText('Comanda #1042 fechada')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Concluir/ })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Reenviar comprovante' })).toBeInTheDocument();
});
```
(Ajustar o helper `abrir` do arquivo para as props novas: `onAcao`, `onRemarcar`, sem `duracaoMinutos`, e retornar `{ onAcao }`.)

- [ ] **Step 2: Rodar e ver falhar** → FAIL.

- [ ] **Step 3: Implementar** o painel conforme **Comportamento**, reaproveitando `SidePanel`/folha inferior que o arquivo já usa (`MEDIA_COMPUTADOR`, `LARGURA_PAINEL`).

- [ ] **Step 4: Rodar** — `cd frontend && npx vitest run src/components/appointments/__tests__/PainelDetalhesAgendamento.test.tsx && npx tsc --noEmit` → PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src
git commit -m "feat(agenda): painel de detalhes com dado real da cliente, origem, sinal e comanda

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 14: Caixa — trocar todo o exemplo por dado real

**Files:**
- Modify: `frontend/src/components/FinanceModule.tsx` (blocos de caixa)
- Create: `frontend/src/components/caixa/MovimentoCaixaModal.tsx`, `frontend/src/components/caixa/FecharCaixaModal.tsx`
- Modify: `frontend/src/components/finance/ExpenseModal.tsx` (forma de pagamento), `frontend/src/lib/themedPaths.ts` (`'src/components/caixa'`)
- Test: `frontend/src/components/caixa/__tests__/Caixa.test.tsx`

**Interfaces:**
- Consumes: `buscarCaixa`, `abrirCaixa`, `registrarMovimento`, `fecharCaixa`, `ROTULO_FORMA_CAIXA`, `CashDay` (Task 10); `AbrirCaixaInline` (Task 11).
- Produces: `MovimentoCaixaModal({ isOpen, onClose, onSalvo(dia: CashDay) })`, `FecharCaixaModal({ isOpen, dia: CashDay, onClose, onFechado(dia: CashDay) })`.

**Referência visual:** `studio-aurora-caixa-do-dia-e-fechamento--baf21f.html` (a tela atual já segue esse arquivo — manter a marcação e trocar só a fonte de dados).

**Comportamento:**
1. `FinanceModule` passa a carregar `buscarCaixa(dataSelecionada)` junto do que já carrega (`/finance/summary`, `/finance/expenses`, `/finance/monthly`). Navegação de data no cabeçalho (botões `chevron_left`/`chevron_right` + "Hoje"), como na Agenda; dias passados ficam somente leitura (sem botões de ação).
2. Cabeçalho: "Caixa do dia", data por extenso; se `session`: "aberto às {HH:mm de openedAt} por {responsavel} · saldo inicial {R$}"; se fechado: "fechado às {HH:mm} · diferença {R$}". Ações (só hoje): sem sessão → `AbrirCaixaInline` (rótulo "Abrir caixa") no lugar da linha de abertura; sessão aberta → "Registrar sangria/suprimento" (secundário, `remove_circle_outline`) e "Fechar caixa" (`lock`); sempre "PDF" (se `exportAccess.allowed`, o mesmo `exportToPDF` de hoje).
3. Cartões: "Entradas" (`totals.entradas`, "{entradasQtd} recebimentos confirmados"), "Saídas" (`totals.saidas`, "{saidasQtd} despesas operacionais"), "Saldo" (`totals.saldo`, "Físico + digital apurado"), "Comandas" (`comandasResumo.total`, "{fechadas} fechadas · {abertas} abertas · {falta} falta").
4. "Entradas por forma de pagamento": uma linha por item de `formas` com `ROTULO_FORMA_CAIXA[chave]`, % do total (1 casa, vírgula), valor e legenda; "Total faturado" no título = `totals.entradas`. Some o título "(exemplo)".
5. "Comandas do dia": tabela paginada no cliente, 6 por página ("Mostrando {a} de {total} comandas", botões de página); colunas Hora, Cliente (+telefone), Profissional, Serviços, Pagamento, Total, Status. Pagamento: `pix` "Pix balcão", `debito` "Débito", `credito` "Crédito", `dinheiro` "Dinheiro em espécie", com sinal: "Sinal Pix (R$ x) + {forma}", `em_atendimento` "Em atendimento", `faltou` "Não compareceu" (total riscado). Status com `StatusChip`-like: Fechada (`success`), Aberta (`warning`), Falta (`danger`) — via tokens, nunca hex. Clicar numa linha "Aberta" abre a `ComandaModal` daquele agendamento.
6. "Despesas do dia": `dia.despesas` (já não `expenses` filtradas no cliente), com forma de pagamento ("Pix estúdio", "Débito estúdio", "Dinheiro", "Não informado"); botão "Nova despesa" abre o `ExpenseModal` existente com a data do dia.
7. "Conferência do dinheiro em espécie": linhas "Fundo inicial de troco", "(+) Entradas em dinheiro", "(+) Suprimentos" (só se > 0), "(−) Sangrias" (só se > 0), "(−) Saídas em dinheiro", "Total esperado na gaveta". Selo: sem fechamento → nenhum selo e texto "Confira ao fechar o caixa"; fechado com diferença 0 → "Bate 100%" (`success`); diferença ≠ 0 → "Diferença de R$ x" (`danger` se negativa, `warning` se positiva).
8. Movimentos (sangria/suprimento) listados abaixo da conferência, se houver.
9. `ExpenseModal`: novo `Select` "Forma de pagamento" (Dinheiro, Pix, Débito, Crédito), enviado como `paymentMethod`.
10. `MovimentoCaixaModal`: tipo (Sangria/Suprimento, radio), valor, descrição; salvar → `registrarMovimento` → `onSalvo`.
11. `FecharCaixaModal`: mostra "Total esperado na gaveta: R$ x", campo "Valor contado na gaveta", diferença calculada ao digitar, observações; confirmar → `fecharCaixa({ countedBalance, notes, date: dia.date })`.
12. Apagar `const caixa = conteudoDemo.caixa;`, `aCaminho` dos botões de caixa e `despesaEhDeHoje` se ficar sem uso.

- [ ] **Step 1: Escrever os testes**

`frontend/src/components/caixa/__tests__/Caixa.test.tsx`:
```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider } from '@/components/Toast';
import { FinanceModule } from '@/components/FinanceModule';
import * as caixa from '@/lib/caixa';

vi.mock('@/lib/api', () => ({ default: { get: vi.fn().mockImplementation((url: string) => {
  if (url === '/finance/summary') return Promise.resolve({ data: { today: { earnings: 0, expenses: 0 }, month: { earnings: 0, expenses: 0 } } });
  return Promise.resolve({ data: [] });
}), post: vi.fn(), put: vi.fn(), delete: vi.fn() } }));
vi.mock('@/lib/caixa', async (orig) => ({ ...(await orig<typeof import('@/lib/caixa')>()), buscarCaixa: vi.fn(), abrirCaixa: vi.fn(), fecharCaixa: vi.fn(), registrarMovimento: vi.fn() }));

const acesso = { allowed: true } as never;
const dia = (over: Partial<caixa.CashDay> = {}): caixa.CashDay => ({
  date: '2026-10-13', isToday: true, responsavel: 'Carla',
  session: { id: 'cx1', openedAt: '2026-10-13T10:45:00Z', openingBalance: 150, closedAt: null, countedBalance: null, expectedBalance: null, difference: null },
  totals: { entradas: 340, entradasQtd: 4, saidas: 120, saidasQtd: 2, saldo: 220 },
  comandasResumo: { total: 4, fechadas: 3, abertas: 0, falta: 1 },
  formas: [
    { chave: 'pix', valor: 115, quantidade: 1 }, { chave: 'sinal_pix', valor: 30, quantidade: 1 },
    { chave: 'debito', valor: 75, quantidade: 1 }, { chave: 'credito', valor: 0, quantidade: 0 }, { chave: 'dinheiro', valor: 120, quantidade: 1 },
  ],
  linhas: [{ appointmentId: 'a9', comandaId: null, numero: null, hora: '12:30', cliente: 'Camila Prado', telefone: '83991208844', profissional: 'Paula', servicos: 'Corte', pagamento: 'faltou', depositApplied: 0, total: 140, status: 'Falta' }],
  despesas: [], movimentos: [],
  gaveta: { fundoInicial: 150, entradasDinheiro: 120, suprimentos: 0, sangrias: 50, saidasDinheiro: 40, esperado: 180 },
  ...over,
});

const abrir = () => render(<ToastProvider><FinanceModule reportAccess={acesso} exportAccess={acesso} onUpgrade={vi.fn()} onManageBilling={vi.fn()} /></ToastProvider>);

beforeEach(() => vi.clearAllMocks());

describe('Caixa com dado real', () => {
  it('mostra abertura, formas e gaveta reais, sem "(exemplo)"', async () => {
    vi.mocked(caixa.buscarCaixa).mockResolvedValue(dia());
    abrir();
    expect(await screen.findByText(/por Carla/)).toBeInTheDocument();
    expect(screen.getByText('Sinais Pix')).toBeInTheDocument();
    expect(screen.getByText('R$ 180,00')).toBeInTheDocument();
    expect(screen.getByText('Não compareceu')).toBeInTheDocument();
    expect(screen.queryByText(/exemplo/i)).not.toBeInTheDocument();
  });

  it('sem caixa aberto oferece abrir', async () => {
    const user = userEvent.setup();
    vi.mocked(caixa.buscarCaixa).mockResolvedValue(dia({ session: null }));
    vi.mocked(caixa.abrirCaixa).mockResolvedValue(dia());
    abrir();
    await user.type(await screen.findByLabelText('Saldo inicial em dinheiro'), '150');
    await user.click(screen.getByRole('button', { name: 'Abrir caixa' }));
    await waitFor(() => expect(caixa.abrirCaixa).toHaveBeenCalledWith(150));
  });

  it('fechamento mostra a diferença e o selo "Bate 100%" quando zera', async () => {
    const user = userEvent.setup();
    vi.mocked(caixa.buscarCaixa).mockResolvedValue(dia());
    vi.mocked(caixa.fecharCaixa).mockResolvedValue(dia({ session: { ...dia().session!, closedAt: '2026-10-13T22:00:00Z', countedBalance: 180, expectedBalance: 180, difference: 0 } }));
    abrir();
    await user.click(await screen.findByRole('button', { name: 'Fechar caixa' }));
    await user.type(screen.getByLabelText('Valor contado na gaveta'), '175');
    expect(screen.getByText('Diferença: -R$ 5,00')).toBeInTheDocument();
    await user.clear(screen.getByLabelText('Valor contado na gaveta'));
    await user.type(screen.getByLabelText('Valor contado na gaveta'), '180');
    await user.click(screen.getByRole('button', { name: 'Confirmar fechamento' }));
    await waitFor(() => expect(caixa.fecharCaixa).toHaveBeenCalledWith({ countedBalance: 180, notes: '', date: '2026-10-13' }));
    expect(await screen.findByText('Bate 100%')).toBeInTheDocument();
  });

  it('dia passado é somente leitura', async () => {
    vi.mocked(caixa.buscarCaixa).mockResolvedValue(dia({ isToday: false }));
    abrir();
    await screen.findByText(/por Carla/);
    expect(screen.queryByRole('button', { name: 'Fechar caixa' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /sangria/i })).not.toBeInTheDocument();
  });
});
```
(Ler `frontend/src/components/FinanceModule.tsx:100-200` antes: ajuste o mock de `/finance/*` ao formato que o módulo espera, e o texto da diferença ao formato de `formatCurrency` para negativos.)

- [ ] **Step 2: Rodar e ver falhar** → FAIL.

- [ ] **Step 3: Implementar** conforme **Comportamento**.

- [ ] **Step 4: Rodar** — `cd frontend && npx vitest run src/components/caixa src/__tests__/themeCompliance.test.ts && npx tsc --noEmit` → PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src
git commit -m "feat(caixa): caixa do dia com abertura, sangria, conferência e fechamento reais

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 15: Cadastros — produtos, comissão e almoço da profissional, comissão padrão

**Files:**
- Create: `frontend/src/components/services/ProdutosTab.tsx`
- Modify: `frontend/src/components/ServiceProfessionalModule.tsx` (aba Produtos), `frontend/src/components/services/ServiceProfessionalModal.tsx` (campos da profissional)
- Modify: `frontend/src/components/SettingsModule.tsx` (seção "Comissão")
- Test: `frontend/src/components/services/__tests__/ProdutosTab.test.tsx`, `frontend/src/components/services/__tests__/ServiceProfessionalModal.test.tsx` (acrescentar), teste novo para a seção de comissão em `frontend/src/components/__tests__/SettingsModuleComissao.test.tsx`

**Interfaces:**
- Consumes: `@/lib/produtos` (Task 10), `buscarRegraComissao`/`salvarRegraComissao` (Task 10), `PUT /business/professionals/:id` com os campos novos (Task 3).

**Comportamento:**
1. `ServiceProfessionalModule`: ao lado de "Serviços" e "Profissionais", aba "Produtos" (mesmo componente `Tabs` usado no projeto). `ProdutosTab` lista produtos (nome, descrição, preço) com editar/remover e botão "Novo produto"; modal com Nome, Descrição curta (opcional, placeholder "Ex.: Produto home care") e Preço. Estado vazio: `EmptyState` "Nenhum produto cadastrado" + "Cadastre os produtos que você vende no atendimento para lançá-los na comanda."
2. `ServiceProfessionalModal` (modo profissional): seção "Intervalo" com "Início do almoço" e "Fim do almoço" (`input type="time"`, ambos opcionais, botão "Sem intervalo" limpa); seção "Comissão própria" com "% sobre serviços" e "% sobre produtos" (vazio = usa a regra do negócio; texto de ajuda "Deixe em branco para usar a comissão padrão de Ajustes"). Envia `breakStart`, `breakEnd`, `commissionServicePct`, `commissionProductPct` (números ou `null`).
3. `SettingsModule`: nova seção "Comissão padrão" com "% sobre serviços" e "% sobre produtos" e botão "Salvar comissão", carregando de `buscarRegraComissao()` e salvando com `salvarRegraComissao()`; texto: "Usada na divisão do repasse de cada comanda. Cada profissional pode ter a própria regra no cadastro."

- [ ] **Step 1: Escrever os testes**

`ProdutosTab.test.tsx`:
```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider } from '@/components/Toast';
import { ProdutosTab } from '../ProdutosTab';
import * as produtos from '@/lib/produtos';

vi.mock('@/lib/produtos', () => ({ listarProdutos: vi.fn(), criarProduto: vi.fn(), atualizarProduto: vi.fn(), removerProduto: vi.fn() }));
const renderTab = () => render(<ToastProvider><ProdutosTab /></ToastProvider>);

beforeEach(() => vi.clearAllMocks());

describe('ProdutosTab', () => {
  it('estado vazio explica para que serve', async () => {
    vi.mocked(produtos.listarProdutos).mockResolvedValue([]);
    renderTab();
    expect(await screen.findByText('Nenhum produto cadastrado')).toBeInTheDocument();
  });

  it('cria produto com preço em número', async () => {
    const user = userEvent.setup();
    vi.mocked(produtos.listarProdutos).mockResolvedValue([]);
    vi.mocked(produtos.criarProduto).mockResolvedValue({ id: 'pr1', name: 'Óleo', description: null, price: 25, active: true });
    renderTab();
    await user.click(await screen.findByRole('button', { name: 'Novo produto' }));
    await user.type(screen.getByLabelText('Nome'), 'Óleo');
    await user.type(screen.getByLabelText('Preço'), '25');
    await user.click(screen.getByRole('button', { name: 'Salvar produto' }));
    await waitFor(() => expect(produtos.criarProduto).toHaveBeenCalledWith({ name: 'Óleo', description: null, price: 25 }));
  });
});
```
`ServiceProfessionalModal.test.tsx` (acrescentar):
```tsx
it('envia intervalo e comissão própria da profissional', async () => {
  const user = userEvent.setup();
  const onSubmitProfessional = vi.fn().mockResolvedValue(undefined);
  // render no modo profissional seguindo o setup existente do arquivo
  await user.type(screen.getByLabelText('Nome do Profissional'), 'Camila');
  await user.type(screen.getByLabelText('Início do almoço'), '12:00');
  await user.type(screen.getByLabelText('Fim do almoço'), '13:00');
  await user.type(screen.getByLabelText('% sobre serviços'), '50');
  await user.click(screen.getByRole('button', { name: /salvar/i }));
  await waitFor(() => expect(onSubmitProfessional).toHaveBeenCalledWith(expect.objectContaining({
    name: 'Camila', breakStart: '12:00', breakEnd: '13:00', commissionServicePct: 50, commissionProductPct: null,
  })));
});
```
`SettingsModuleComissao.test.tsx`:
```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider } from '@/components/Toast';
import { ComissaoPadraoSection } from '@/components/settings/ComissaoPadraoSection';
import * as comanda from '@/lib/comanda';

vi.mock('@/lib/comanda', async (orig) => ({ ...(await orig<typeof import('@/lib/comanda')>()), buscarRegraComissao: vi.fn(), salvarRegraComissao: vi.fn() }));

it('carrega e salva a comissão padrão', async () => {
  const user = userEvent.setup();
  vi.mocked(comanda.buscarRegraComissao).mockResolvedValue({ serviceCommissionPct: 0, productCommissionPct: 0 });
  vi.mocked(comanda.salvarRegraComissao).mockResolvedValue({ serviceCommissionPct: 50, productCommissionPct: 20 });
  render(<ToastProvider><ComissaoPadraoSection /></ToastProvider>);
  const serv = await screen.findByLabelText('% sobre serviços');
  await user.clear(serv); await user.type(serv, '50');
  const prod = screen.getByLabelText('% sobre produtos');
  await user.clear(prod); await user.type(prod, '20');
  await user.click(screen.getByRole('button', { name: 'Salvar comissão' }));
  await waitFor(() => expect(comanda.salvarRegraComissao).toHaveBeenCalledWith({ serviceCommissionPct: 50, productCommissionPct: 20 }));
});
```
(A seção nova vive em `frontend/src/components/settings/ComissaoPadraoSection.tsx` e é renderizada dentro de `SettingsModule`; registrar `'src/components/settings'` em `themedPaths.ts` se a pasta for nova.)

- [ ] **Step 2: Rodar e ver falhar** → FAIL.

- [ ] **Step 3: Implementar** os três pontos de **Comportamento**. Para a profissional, o tipo `ProfessionalFormData` de `ServiceProfessionalModal.tsx:17` ganha os quatro campos; `ServiceProfessionalModule` repassa ao `api.put('/business/professionals/:id')`/`post` como hoje.

- [ ] **Step 4: Rodar** — `cd frontend && npx vitest run src/components/services src/components/__tests__/SettingsModuleComissao.test.tsx src/__tests__/themeCompliance.test.ts && npx tsc --noEmit` → PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src
git commit -m "feat(cadastros): produtos, comissão e almoço da profissional, comissão padrão

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 16: Limpeza do exemplo, Hoje com duração real, documentação e verificação final

**Files:**
- Modify: `frontend/src/lib/conteudoDemo.ts` (apagar `agenda` e `caixa` e tipos), `frontend/src/lib/__tests__/conteudoDemo.test.ts`
- Modify: `frontend/src/app/dashboard/page.tsx:77` (duração real), `frontend/src/lib/agendaMetrics.ts` (se usar duração padrão)
- Modify: `docs/design/SEGUIMENTO.md`, `docs/design/DESIGN.md` (status e regras novas)

- [ ] **Step 1: Apagar as chaves de exemplo**

Em `conteudoDemo.ts`, remover `AgendaDetalhes`, `AgendaContent`, `CaixaAbertura`, `CaixaMetricas`, `CaixaFormaPagamento`, `CaixaComanda`, `CaixaConferenciaDinheiro`, `CaixaContent`, as chaves `agenda` e `caixa` de `ConteudoDemo` e do objeto. Rodar `cd frontend && npx tsc --noEmit`: cada erro aponta um uso que sobrou — trocar pelo dado real (Tasks 12-14) ou apagar.

- [ ] **Step 2: Hoje com duração real**

`frontend/src/app/dashboard/page.tsx:77`: `calcularMetricasAgendaDoDia(agendamentosHoje, conteudoDemo.agenda.duracaoPadraoMinutos)` → usar a duração de cada agendamento. Abrir `frontend/src/lib/agendaMetrics.ts`: se `calcularMetricasAgendaDoDia` usa o segundo argumento como duração de todos, trocar por `a.service_duration_minutes || 30` dentro da função e remover o parâmetro (atualizar o teste de `agendaMetrics` se existir).

- [ ] **Step 3: Atualizar testes de conteúdo de exemplo**

`frontend/src/lib/__tests__/conteudoDemo.test.ts`: apagar as asserções sobre `agenda`/`caixa`.

- [ ] **Step 4: Documentação**

`docs/design/SEGUIMENTO.md`:
- Remover de "Dívida técnica": a duração 60 min, `faixaDoAtendimento` meia-noite, linha em negrito vazia (se resolvida pelo drawer novo), conflito swipe/clique (se o novo gesto resolver; senão manter), pré-preenchimento do horário livre, "Três cores da legenda da Agenda ficam inertes".
- Acrescentar em "O que a migração deixou pronto": "Sub-projeto 2A: comanda com produtos, desconto, gorjeta e repasse; caixa do dia com abertura, sangria e fechamento; status em atendimento e faltou; intervalo de almoço; referências do Stitch completas em `docs/design/stitch/projeto/`."
- Acrescentar em "Decisões que dependem de você": "O Stitch mostra 'Retenção casa R$ 55' na comanda de exemplo, o que só fecha se a gorjeta sair da casa; o sistema segue a decisão de que gorjeta não é faturamento (retenção R$ 75 no mesmo exemplo)."

`docs/design/DESIGN.md`: na seção de status de agendamento (procurar "Confirmado"/"Em atendimento"), registrar o conjunto final de 6 status e as cores de `StatusChip.tsx`.

- [ ] **Step 5: Verificação completa**

```bash
cd backend && npx tsc --noEmit && npx vitest run
cd ../frontend && npx tsc --noEmit && npx vitest run && npx next build
```
Expected: tudo verde. Na suíte do frontend, teste que estourar 5 s por carga deve ser rodado de novo isolado antes de ser tratado como falha.

- [ ] **Step 6: Commit**

```bash
git add frontend/src docs/design
git commit -m "chore(2A): remove conteúdo de exemplo da agenda e do caixa; atualiza seguimento

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 7: Rodar localmente para a conferência visual**

Subir backend (`cd backend && npm run dev`) e frontend (`cd frontend && npm run dev`), abrir `http://localhost:3000/agendamentos`, `/financeiro`, `/servicos` e conferir lado a lado com os arquivos do Stitch listados em **Global Constraints**. A migração `20261013120000_agenda_comanda_caixa` precisa estar aplicada no banco apontado pelo `backend/.env` (`cd backend && npx prisma migrate deploy`) — **perguntar ao dono antes de aplicar se o `.env` apontar para o banco de produção**.
