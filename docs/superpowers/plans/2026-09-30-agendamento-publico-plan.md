# Agendamento Público com Sinal Pix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que o cliente final de um negócio agende um horário sozinho, sem
login, numa página pública (`/agendar/[slug]`), pagando o sinal via Pix direto na
chave do próprio negócio, com confirmação manual do dono no painel.

**Architecture:** Dois módulos novos no backend (`modules/publicBooking` sem
autenticação, `modules/businessPublicPage` autenticado), extensão do módulo
`modules/appointments` existente (novo status, nova checagem de disponibilidade,
endpoint de confirmação), um gerador de payload Pix (BR Code) sem gateway externo, e
expiração de reservas não pagas resolvida de forma preguiçosa (nunca depende de job
rodar a tempo) mais um cron de limpeza complementar. No frontend: uma página pública
nova, um formulário de configuração da página pública (substitui o placeholder "Em
breve" de Minha Página) e uma seção "Aguardando Pix" no painel.

**Tech Stack:** Express + TypeScript + Prisma + PostgreSQL (backend), Next.js App
Router + React + Tailwind (frontend), `node-cron` (já em uso), `express-rate-limit`
(já em uso), Zod para validação.

**Spec:** `docs/superpowers/specs/2026-09-30-agendamento-publico-design.md`

## Global Constraints

- Status de `Appointment` ganha um quarto valor: `aguardando_pagamento` (além de
  `confirmado`, `concluido`, `cancelado`). Transições válidas a partir dele:
  `['confirmado', 'cancelado']`.
- Reserva pública expira em **15 minutos** (`expiresAt = now() + 15min`) se ninguém
  confirmar o pagamento.
- Sinal do serviço é `service.depositPercentage` (percentual, `Decimal(5,2)`,
  nullable). Serviço sem `depositPercentage` configurado **não aparece** na vitrine
  pública.
- Confirmação de pagamento é **manual** (dono clica em "Confirmar recebimento do
  Pix" no painel) — não existe confirmação automática nesta versão.
- Ao confirmar pagamento, dispara mensagem WhatsApp automática via
  `sendWhatsAppMessage` (já existe em `backend/src/services/whatsapp/index.js`).
- Nenhum endpoint público expõe: chave Pix bruta fora do payload de pagamento já
  montado, dados de outros clientes, ou agendamentos que não sejam o recém-criado.
- Endpoint público de criação de agendamento tem rate limit próprio, mais
  restritivo que o global (120/min): 5 tentativas por IP a cada 15 minutos.
- Correção de disponibilidade nunca depende de um cron ter rodado a tempo — a
  checagem de expiração é sempre feita também no momento da consulta
  (`hasConflict`/`getBookedSlots`).

## Review Focus

- **Slug duplicado ou com caracteres inválidos**: dois negócios tentando usar o
  mesmo slug, ou um slug com espaços/acentos/maiúsculas — o sistema deve rejeitar
  ou normalizar, nunca silenciosamente sobrescrever outro negócio.
- **Corrida entre dois clientes reservando o mesmo horário ao mesmo tempo**: o
  segundo `POST` de criação de agendamento público para o mesmo
  profissional/data/hora já ocupado (mesmo que por uma reserva
  `aguardando_pagamento` não expirada) deve falhar com conflito, nunca criar dois
  agendamentos para o mesmo horário.
- **Reserva expirada sendo tratada como ocupando o horário**: um agendamento
  `aguardando_pagamento` cujo `expiresAt` já passou não pode aparecer como
  indisponível para um novo cliente, mesmo que o cron de limpeza ainda não tenha
  rodado.
- **Serviço/profissional de outro negócio sendo aceito no agendamento público**: o
  endpoint público precisa rejeitar um `serviceId`/`professionalId` que não
  pertence ao `businessId` resolvido pelo slug da URL.
- **Confirmar pagamento de um agendamento já expirado/cancelado**: o botão
  "Confirmar recebimento do Pix" não pode reviver um agendamento que já passou do
  prazo e foi cancelado (transição inválida deve ser rejeitada, não silenciosamente
  aceita).

---

### Task 1: Modelo de dados — migração e tipos de domínio

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Modify: `backend/src/types/domain.ts`
- Modify: `backend/src/modules/appointments/appointments.types.ts`
- Test: `backend/src/__tests__/appointmentStatusTransitions.test.ts`

**Interfaces:**
- Produces: `AppointmentStatus = 'confirmado' | 'concluido' | 'cancelado' |
  'aguardando_pagamento'`; `VALID_STATUS_TRANSITIONS['aguardando_pagamento'] =
  ['confirmado', 'cancelado']`; campos `Business.slug`, `Business.pixKey`,
  `Business.pixKeyType`, `Business.logoUrl`, `Business.brandColor`,
  `Service.depositPercentage`, `Appointment.expiresAt`, `Appointment.source`.

- [ ] **Step 1: Escrever o teste de transição de status (falhando)**

```typescript
// backend/src/__tests__/appointmentStatusTransitions.test.ts
import { describe, it, expect } from 'vitest';
import { VALID_STATUS_TRANSITIONS } from '../modules/appointments/appointments.types.js';

describe('VALID_STATUS_TRANSITIONS', () => {
  it('permite ir de aguardando_pagamento para confirmado ou cancelado', () => {
    expect(VALID_STATUS_TRANSITIONS['aguardando_pagamento']).toEqual([
      'confirmado',
      'cancelado',
    ]);
  });

  it('não permite transições a partir de aguardando_pagamento além das duas permitidas', () => {
    expect(VALID_STATUS_TRANSITIONS['aguardando_pagamento']).not.toContain('concluido');
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `cd backend && npx vitest run src/__tests__/appointmentStatusTransitions.test.ts`
Expected: FAIL — `VALID_STATUS_TRANSITIONS['aguardando_pagamento']` é `undefined`
(a chave nem existe no objeto ainda), ou erro de tipo na compilação.

- [ ] **Step 3: Atualizar `backend/src/types/domain.ts`**

Trocar a linha 22 (`export type AppointmentStatus = 'confirmado' | 'concluido' |
'cancelado';`) por:

```typescript
export type AppointmentStatus = 'confirmado' | 'concluido' | 'cancelado' | 'aguardando_pagamento';
```

- [ ] **Step 4: Atualizar `backend/src/modules/appointments/appointments.types.ts`**

No topo do arquivo, trocar os três `z.enum(['confirmado', 'concluido',
'cancelado'])` (em `UpdateStatusSchema` e `GetAppointmentsQuerySchema`) para incluir
o novo valor:

```typescript
export const UpdateStatusSchema = z.object({
  status: z.enum(['confirmado', 'concluido', 'cancelado', 'aguardando_pagamento']),
});
```

```typescript
export const GetAppointmentsQuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  status: z.enum(['confirmado', 'concluido', 'cancelado', 'aguardando_pagamento']).optional(),
  view: z.enum(['day', 'week']).default('day'),
  professionalId: z.string().uuid().optional(),
});
```

E atualizar `VALID_STATUS_TRANSITIONS`:

```typescript
export const VALID_STATUS_TRANSITIONS: Record<AppointmentStatus, AppointmentStatus[]> = {
  confirmado: ['concluido', 'cancelado'],
  concluido: [],
  cancelado: [],
  aguardando_pagamento: ['confirmado', 'cancelado'],
};
```

Também adicionar `expiresAt?: Date | null;` e `source: string;` à interface
`AppointmentWithRelations`.

- [ ] **Step 5: Rodar o teste e confirmar que passa**

Run: `cd backend && npx vitest run src/__tests__/appointmentStatusTransitions.test.ts`
Expected: PASS

- [ ] **Step 6: Editar `backend/prisma/schema.prisma`**

No `model Business` (depois do campo `instagramHandle`), adicionar:

```prisma
  slug                         String?   @unique @db.VarChar(100)
  pixKey                       String?   @map("pix_key") @db.VarChar(255)
  pixKeyType                   String?   @map("pix_key_type") @db.VarChar(20)
  logoUrl                      String?   @map("logo_url") @db.Text
  brandColor                   String?   @map("brand_color") @db.VarChar(7)
```

No `model Service` (depois do campo `durationMinutes`), adicionar:

```prisma
  depositPercentage Decimal? @map("deposit_percentage") @db.Decimal(5, 2)
```

No `model Appointment` (perto do campo `status`), adicionar:

```prisma
  expiresAt    DateTime? @map("expires_at")
  source       String    @default("painel") @db.VarChar(20)
```

- [ ] **Step 7: Gerar e aplicar a migração**

Run: `cd backend && npx prisma migrate dev --name add_public_booking_fields`
Expected: migração criada em `backend/prisma/migrations/`, aplicada ao banco de
desenvolvimento sem erros, `prisma generate` roda automaticamente no final.

- [ ] **Step 8: Rodar a suíte completa do backend pra garantir que nada quebrou**

Run: `cd backend && npm test`
Expected: PASS (os testes existentes que usam `AppointmentStatus`/
`VALID_STATUS_TRANSITIONS` continuam passando — a união de tipo só ganhou um
membro, não perdeu nenhum).

- [ ] **Step 9: Commit**

```bash
git add backend/prisma backend/src/types/domain.ts backend/src/modules/appointments/appointments.types.ts backend/src/__tests__/appointmentStatusTransitions.test.ts
git commit -m "feat(db): adiciona campos de agendamento público e status aguardando_pagamento"
```

---

### Task 2: Gerador de payload Pix (BR Code)

**Files:**
- Create: `backend/src/utils/pixPayload.ts`
- Test: `backend/src/__tests__/pixPayload.test.ts`

**Interfaces:**
- Consumes: nada de tasks anteriores (função pura, isolada).
- Produces: `buildPixPayload({ pixKey, pixKeyType, merchantName, merchantCity,
  amount, description }: PixPayloadInput): string` — retorna a string "copia e
  cola" (EMV/BR Code) pronta para gerar QR Code. `PixPayloadInput` exportado.

O padrão Pix (BR Code, especificação EMV do Banco Central) é um payload de campos
TLV (tag-length-value) terminado por um CRC16/CCITT-FALSE. Não depende de nenhum
gateway — qualquer chave Pix válida pode gerar um BR Code offline.

- [ ] **Step 1: Escrever o teste (falhando)**

```typescript
// backend/src/__tests__/pixPayload.test.ts
import { describe, it, expect } from 'vitest';
import { buildPixPayload } from '../utils/pixPayload.js';

describe('buildPixPayload', () => {
  it('gera um payload terminado em CRC16 de 4 dígitos hexadecimais maiúsculos', () => {
    const payload = buildPixPayload({
      pixKey: '11999998888',
      pixKeyType: 'telefone',
      merchantName: 'Studio Aurora',
      merchantCity: 'CAMPINA GRANDE',
      amount: 30,
      description: 'Sinal - Manutencao',
    });

    expect(payload).toMatch(/^000201/); // Payload Format Indicator obrigatório
    expect(payload.slice(-4)).toMatch(/^[0-9A-F]{4}$/);
  });

  it('formata telefone com +55 no campo da chave Pix', () => {
    const payload = buildPixPayload({
      pixKey: '11999998888',
      pixKeyType: 'telefone',
      merchantName: 'Studio Aurora',
      merchantCity: 'CAMPINA GRANDE',
      amount: 30,
      description: 'Sinal',
    });

    expect(payload).toContain('+5511999998888');
  });

  it('rejeita valor menor ou igual a zero', () => {
    expect(() =>
      buildPixPayload({
        pixKey: 'a@b.com',
        pixKeyType: 'email',
        merchantName: 'Studio',
        merchantCity: 'CAMPINA GRANDE',
        amount: 0,
        description: 'Sinal',
      })
    ).toThrow('Valor do Pix deve ser maior que zero');
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `cd backend && npx vitest run src/__tests__/pixPayload.test.ts`
Expected: FAIL — `Cannot find module '../utils/pixPayload.js'`

- [ ] **Step 3: Implementar `backend/src/utils/pixPayload.ts`**

```typescript
export type PixKeyType = 'cpf' | 'cnpj' | 'email' | 'telefone' | 'aleatoria';

export interface PixPayloadInput {
  pixKey: string;
  pixKeyType: PixKeyType;
  merchantName: string;
  merchantCity: string;
  amount: number;
  description?: string;
  txId?: string;
}

const ID_PAYLOAD_FORMAT_INDICATOR = '00';
const ID_MERCHANT_ACCOUNT_INFO = '26';
const ID_MERCHANT_ACCOUNT_INFO_GUI = '00';
const ID_MERCHANT_ACCOUNT_INFO_KEY = '01';
const ID_MERCHANT_ACCOUNT_INFO_DESCRIPTION = '02';
const ID_MERCHANT_CATEGORY_CODE = '52';
const ID_TRANSACTION_CURRENCY = '53';
const ID_TRANSACTION_AMOUNT = '54';
const ID_COUNTRY_CODE = '58';
const ID_MERCHANT_NAME = '59';
const ID_MERCHANT_CITY = '60';
const ID_ADDITIONAL_DATA_FIELD = '62';
const ID_ADDITIONAL_DATA_FIELD_TX_ID = '05';
const ID_CRC16 = '63';

const field = (id: string, value: string): string => {
  const length = String(value.length).padStart(2, '0');
  return `${id}${length}${value}`;
};

const normalizeAscii = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9 ]/g, '')
    .toUpperCase();

const formatPixKey = (pixKey: string, pixKeyType: PixKeyType): string => {
  if (pixKeyType === 'telefone') {
    const digits = pixKey.replace(/\D/g, '');
    return `+55${digits}`;
  }
  if (pixKeyType === 'cpf' || pixKeyType === 'cnpj') {
    return pixKey.replace(/\D/g, '');
  }
  return pixKey.trim();
};

// CRC16/CCITT-FALSE (polinômio 0x1021, valor inicial 0xFFFF) — exigido pelo
// padrão EMV do BR Code. Implementação bit a bit, sem dependência externa.
const crc16 = (payload: string): string => {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i += 1) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 0x8000) !== 0 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
};

export function buildPixPayload({
  pixKey,
  pixKeyType,
  merchantName,
  merchantCity,
  amount,
  description,
  txId = '***',
}: PixPayloadInput): string {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('Valor do Pix deve ser maior que zero');
  }

  const merchantAccountInfo =
    field(ID_MERCHANT_ACCOUNT_INFO_GUI, 'br.gov.bcb.pix') +
    field(ID_MERCHANT_ACCOUNT_INFO_KEY, formatPixKey(pixKey, pixKeyType)) +
    (description
      ? field(ID_MERCHANT_ACCOUNT_INFO_DESCRIPTION, normalizeAscii(description).slice(0, 60))
      : '');

  const additionalData = field(ID_ADDITIONAL_DATA_FIELD_TX_ID, txId);

  const payloadWithoutCrc =
    field(ID_PAYLOAD_FORMAT_INDICATOR, '01') +
    field(ID_MERCHANT_ACCOUNT_INFO, merchantAccountInfo) +
    field(ID_MERCHANT_CATEGORY_CODE, '0000') +
    field(ID_TRANSACTION_CURRENCY, '986') +
    field(ID_TRANSACTION_AMOUNT, amount.toFixed(2)) +
    field(ID_COUNTRY_CODE, 'BR') +
    field(ID_MERCHANT_NAME, normalizeAscii(merchantName).slice(0, 25) || 'RECEBEDOR') +
    field(ID_MERCHANT_CITY, normalizeAscii(merchantCity).slice(0, 15) || 'BRASIL') +
    field(ID_ADDITIONAL_DATA_FIELD, additionalData) +
    `${ID_CRC16}04`;

  return `${payloadWithoutCrc}${crc16(payloadWithoutCrc)}`;
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `cd backend && npx vitest run src/__tests__/pixPayload.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/utils/pixPayload.ts backend/src/__tests__/pixPayload.test.ts
git commit -m "feat(pix): gera payload Pix (BR Code) sem depender de gateway"
```

---

### Task 3: Disponibilidade considera reservas pendentes não expiradas

**Files:**
- Modify: `backend/src/modules/appointments/appointments.repository.ts`
- Test: `backend/src/__tests__/appointmentsAvailability.test.ts`

**Interfaces:**
- Consumes: `Appointment.status`, `Appointment.expiresAt` (Task 1).
- Produces: `hasConflict` e `getBookedSlots` passam a considerar
  `aguardando_pagamento` com `expiresAt > now()` como horário ocupado;
  `aguardando_pagamento` expirado não bloqueia.

- [ ] **Step 1: Escrever o teste (falhando)**

```typescript
// backend/src/__tests__/appointmentsAvailability.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { prisma } from '../config/prisma.js';
import { appointmentsPrismaRepository } from '../modules/appointments/appointments.repository.js';

vi.mock('../config/prisma.js', () => ({
  prisma: {
    appointment: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

describe('hasConflict com aguardando_pagamento', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('considera aguardando_pagamento não expirado como conflito', async () => {
    (prisma.appointment.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'apt-1' });

    const result = await appointmentsPrismaRepository.hasConflict(
      'biz-1', 'prof-1', '2026-10-24', '14:00:00'
    );

    expect(result).toBe(true);
    const whereArg = (prisma.appointment.findFirst as ReturnType<typeof vi.fn>).mock.calls[0][0].where;
    expect(whereArg.status.in).toEqual(
      expect.arrayContaining(['confirmado', 'aguardando_pagamento'])
    );
    expect(whereArg.OR).toBeDefined();
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `cd backend && npx vitest run src/__tests__/appointmentsAvailability.test.ts`
Expected: FAIL — `whereArg.status.in` é `undefined` (hoje `where.status` é a string
literal `'confirmado'`, não um objeto `{ in: [...] }`).

- [ ] **Step 3: Editar `hasConflict` em `appointments.repository.ts`**

Substituir o método `hasConflict` (linhas 79-101) por:

```typescript
  async hasConflict(
    businessId: string,
    professionalId: string,
    date: string,
    time: string,
    excludeId?: string
  ): Promise<boolean> {
    const now = new Date();
    const existing = await prisma.appointment.findFirst({
      where: {
        businessId,
        professionalId,
        date: new Date(date),
        time: new Date(`1970-01-01T${time}Z`),
        status: { in: ['confirmado', 'aguardando_pagamento'] },
        OR: [
          { status: 'confirmado' },
          { status: 'aguardando_pagamento', expiresAt: { gt: now } },
        ],
        ...(excludeId ? { NOT: { id: excludeId } } : {}),
      },
      select: { id: true },
    });
    return existing !== null;
  },
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `cd backend && npx vitest run src/__tests__/appointmentsAvailability.test.ts`
Expected: PASS

- [ ] **Step 5: Aplicar a mesma regra em `getBookedSlots`**

Substituir o `where` do método `getBookedSlots` (linhas 174-197):

```typescript
  async getBookedSlots(
    businessId: string,
    professionalId: string,
    date: string
  ): Promise<string[]> {
    const now = new Date();
    const appointments = await prisma.appointment.findMany({
      where: {
        businessId,
        professionalId,
        date: new Date(date),
        OR: [
          { status: 'confirmado' },
          { status: 'aguardando_pagamento', expiresAt: { gt: now } },
        ],
      },
      select: { time: true },
    });

    return appointments.map((a) => {
      const t = a.time;
      const h = String(t.getUTCHours()).padStart(2, '0');
      const m = String(t.getUTCMinutes()).padStart(2, '0');
      return `${h}:${m}`;
    });
  },
```

- [ ] **Step 6: Rodar a suíte completa do backend**

Run: `cd backend && npm test`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add backend/src/modules/appointments/appointments.repository.ts backend/src/__tests__/appointmentsAvailability.test.ts
git commit -m "fix(agenda): reserva aguardando pagamento bloqueia horário até expirar"
```

---

### Task 4: Cron de limpeza de reservas expiradas

**Files:**
- Modify: `backend/src/services/cronService.ts`
- Test: `backend/src/__tests__/expirePendingAppointmentsCron.test.ts`

**Interfaces:**
- Consumes: `Appointment.status`/`expiresAt` (Task 1).
- Produces: `expirePendingAppointments(now?: Date): Promise<number>` exportado de
  `cronService.ts` (retorna quantos agendamentos foram cancelados), chamado a cada
  5 minutos por `startReminderCron`.

Esta limpeza é só higiene — a Task 3 já garante que a disponibilidade nunca
depende dela ter rodado.

- [ ] **Step 1: Escrever o teste (falhando)**

```typescript
// backend/src/__tests__/expirePendingAppointmentsCron.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { prisma } from '../config/prisma.js';
import { expirePendingAppointments } from '../services/cronService.js';

vi.mock('../config/prisma.js', () => ({
  prisma: {
    appointment: {
      updateMany: vi.fn().mockResolvedValue({ count: 3 }),
    },
  },
}));

describe('expirePendingAppointments', () => {
  beforeEach(() => vi.clearAllMocks());

  it('cancela agendamentos aguardando_pagamento com expiresAt no passado', async () => {
    const count = await expirePendingAppointments(new Date('2026-10-24T15:00:00Z'));

    expect(count).toBe(3);
    expect(prisma.appointment.updateMany).toHaveBeenCalledWith({
      where: {
        status: 'aguardando_pagamento',
        expiresAt: { lt: new Date('2026-10-24T15:00:00Z') },
      },
      data: { status: 'cancelado' },
    });
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `cd backend && npx vitest run src/__tests__/expirePendingAppointmentsCron.test.ts`
Expected: FAIL — `expirePendingAppointments` não é exportado ainda.

- [ ] **Step 3: Adicionar a função e agendar o cron em `cronService.ts`**

Adicionar, antes de `export const startReminderCron`:

```typescript
export const expirePendingAppointments = async (now: Date = new Date()): Promise<number> => {
  const result = await prisma.appointment.updateMany({
    where: {
      status: 'aguardando_pagamento',
      expiresAt: { lt: now },
    },
    data: { status: 'cancelado' },
  });
  return result.count;
};
```

Dentro de `startReminderCron`, adicionar mais um `cron.schedule`:

```typescript
  cron.schedule('*/5 * * * *', async () => {
    try {
      const count = await expirePendingAppointments();
      if (count > 0) {
        logger.info({ count }, 'Reservas públicas expiradas canceladas automaticamente');
      }
    } catch (error) {
      logger.error({ err: error }, 'Erro ao expirar reservas públicas pendentes');
    }
  });
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `cd backend && npx vitest run src/__tests__/expirePendingAppointmentsCron.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/cronService.ts backend/src/__tests__/expirePendingAppointmentsCron.test.ts
git commit -m "feat(cron): expira reservas públicas não pagas a cada 5 minutos"
```

---

### Task 5: Sinal por serviço (`depositPercentage`)

**Files:**
- Modify: `backend/src/validators/schemas/serviceSchemas.ts`
- Modify: `backend/src/repositories/serviceRepository.ts`
- Modify: `backend/src/services/serviceSerializer.ts`
- Test: `backend/src/__tests__/serviceDepositPercentage.test.ts`

**Interfaces:**
- Consumes: `Service.depositPercentage` (Task 1).
- Produces: `ServiceDto.deposit_percentage: number | null`; `createServiceSchema`/
  `updateServiceSchema` aceitam `depositPercentage?: number` (0-100).

- [ ] **Step 1: Escrever o teste (falhando)**

```typescript
// backend/src/__tests__/serviceDepositPercentage.test.ts
import { describe, it, expect } from 'vitest';
import { toServiceDto } from '../services/serviceSerializer.js';

describe('toServiceDto — depositPercentage', () => {
  it('inclui deposit_percentage no DTO quando configurado', () => {
    const dto = toServiceDto({
      id: 'srv-1',
      businessId: 'biz-1',
      name: 'Manutenção',
      price: 130 as unknown as never,
      durationMinutes: 105,
      depositPercentage: 30 as unknown as never,
      active: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never);

    expect(dto.deposit_percentage).toBe(30);
  });

  it('retorna null quando o serviço não tem sinal configurado', () => {
    const dto = toServiceDto({
      id: 'srv-2',
      businessId: 'biz-1',
      name: 'Corte',
      price: 40 as unknown as never,
      durationMinutes: 30,
      depositPercentage: null,
      active: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never);

    expect(dto.deposit_percentage).toBeNull();
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `cd backend && npx vitest run src/__tests__/serviceDepositPercentage.test.ts`
Expected: FAIL — `dto.deposit_percentage` é `undefined`.

- [ ] **Step 3: Editar `serviceSerializer.ts`**

Adicionar ao objeto retornado por `toServiceDto` (mesmo padrão de `priceToNumber`
já usado para `price`):

```typescript
    deposit_percentage: raw.depositPercentage !== null && raw.depositPercentage !== undefined
      ? Number(raw.depositPercentage)
      : null,
```

E ao tipo `ServiceDto`: `deposit_percentage: number | null;`.

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `cd backend && npx vitest run src/__tests__/serviceDepositPercentage.test.ts`
Expected: PASS

- [ ] **Step 5: Aceitar o campo na criação/edição**

Em `backend/src/validators/schemas/serviceSchemas.ts`, adicionar aos dois schemas
(`createServiceSchema` e `updateServiceSchema`):

```typescript
  depositPercentage: z.number().min(0).max(100).optional(),
```

Em `backend/src/repositories/serviceRepository.ts`, nos métodos `create` e
`update`, incluir `depositPercentage: data.depositPercentage ?? null` (create) ou
`...(data.depositPercentage !== undefined && { depositPercentage: data.depositPercentage })`
(update) no objeto passado ao Prisma — seguir exatamente o padrão já usado ali para
`price`/`durationMinutes`.

- [ ] **Step 6: Rodar a suíte completa do backend**

Run: `cd backend && npm test`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add backend/src/validators/schemas/serviceSchemas.ts backend/src/repositories/serviceRepository.ts backend/src/services/serviceSerializer.ts backend/src/__tests__/serviceDepositPercentage.test.ts
git commit -m "feat(servicos): adiciona percentual de sinal por serviço"
```

---

### Task 6: Módulo de configuração da página pública (autenticado)

**Files:**
- Create: `backend/src/modules/businessPublicPage/businessPublicPage.types.ts`
- Create: `backend/src/modules/businessPublicPage/businessPublicPage.repository.ts`
- Create: `backend/src/modules/businessPublicPage/businessPublicPage.service.ts`
- Create: `backend/src/modules/businessPublicPage/businessPublicPage.controller.ts`
- Create: `backend/src/modules/businessPublicPage/businessPublicPage.routes.ts`
- Modify: `backend/src/server.ts`
- Test: `backend/src/__tests__/businessPublicPage.test.ts`

**Interfaces:**
- Consumes: `Business.slug/pixKey/pixKeyType/logoUrl/brandColor` (Task 1);
  `req.user.businessId` (padrão de auth já usado em `modules/appointments`).
- Produces: `GET /api/v1/business-public-page` → `{ slug, pixKey, pixKeyType,
  logoUrl, brandColor }`; `PUT /api/v1/business-public-page` (mesmo shape,
  parcial) — usado pelo Task 12 (frontend).

- [ ] **Step 1: Escrever o teste do gerador/validador de slug (falhando)**

```typescript
// backend/src/__tests__/businessPublicPage.test.ts
import { describe, it, expect } from 'vitest';
import { slugify, isValidSlug } from '../modules/businessPublicPage/businessPublicPage.service.js';

describe('slugify', () => {
  it('normaliza nome do negócio para um slug válido', () => {
    expect(slugify('Studio Aurora & Unhas')).toBe('studio-aurora-unhas');
  });

  it('remove acentos', () => {
    expect(slugify('Espaço Lumé Estética')).toBe('espaco-lume-estetica');
  });
});

describe('isValidSlug', () => {
  it('aceita apenas letras minúsculas, números e hífen', () => {
    expect(isValidSlug('studio-aurora')).toBe(true);
    expect(isValidSlug('Studio Aurora')).toBe(false);
    expect(isValidSlug('studio_aurora')).toBe(false);
    expect(isValidSlug('')).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `cd backend && npx vitest run src/__tests__/businessPublicPage.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Criar `businessPublicPage.types.ts`**

```typescript
import { z } from 'zod';

export const PixKeyTypeSchema = z.enum(['cpf', 'cnpj', 'email', 'telefone', 'aleatoria']);

export const UpdatePublicPageSchema = z.object({
  slug: z.string().min(3).max(100).regex(/^[a-z0-9-]+$/).optional(),
  pixKey: z.string().min(1).max(255).optional(),
  pixKeyType: PixKeyTypeSchema.optional(),
  logoUrl: z.string().url().max(2048).optional(),
  brandColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
});

export type UpdatePublicPageInput = z.infer<typeof UpdatePublicPageSchema>;

export interface PublicPageSettings {
  slug: string | null;
  pixKey: string | null;
  pixKeyType: string | null;
  logoUrl: string | null;
  brandColor: string | null;
}
```

- [ ] **Step 4: Criar `businessPublicPage.repository.ts`**

```typescript
import { prisma } from '../../config/prisma.js';
import type { PublicPageSettings, UpdatePublicPageInput } from './businessPublicPage.types.js';

export const businessPublicPageRepository = {
  async findByBusinessId(businessId: string): Promise<PublicPageSettings | null> {
    const business = await prisma.business.findUnique({
      where: { id: businessId },
      select: { slug: true, pixKey: true, pixKeyType: true, logoUrl: true, brandColor: true },
    });
    return business;
  },

  async slugExists(slug: string, excludeBusinessId?: string): Promise<boolean> {
    const existing = await prisma.business.findFirst({
      where: { slug, ...(excludeBusinessId ? { NOT: { id: excludeBusinessId } } : {}) },
      select: { id: true },
    });
    return existing !== null;
  },

  async update(businessId: string, data: UpdatePublicPageInput): Promise<PublicPageSettings> {
    return prisma.business.update({
      where: { id: businessId },
      data,
      select: { slug: true, pixKey: true, pixKeyType: true, logoUrl: true, brandColor: true },
    });
  },
};
```

- [ ] **Step 5: Criar `businessPublicPage.service.ts`**

```typescript
import { ConflictError, ValidationError } from '../../utils/errors.js';
import { businessPublicPageRepository } from './businessPublicPage.repository.js';
import type { PublicPageSettings, UpdatePublicPageInput } from './businessPublicPage.types.js';

export const slugify = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');

export const isValidSlug = (value: string): boolean => /^[a-z0-9-]+$/.test(value) && value.length >= 3;

export const businessPublicPageService = {
  async get(businessId: string): Promise<PublicPageSettings> {
    const settings = await businessPublicPageRepository.findByBusinessId(businessId);
    if (!settings) throw new ValidationError('Negócio não encontrado');
    return settings;
  },

  async update(businessId: string, data: UpdatePublicPageInput): Promise<PublicPageSettings> {
    if (data.slug) {
      if (!isValidSlug(data.slug)) {
        throw new ValidationError('Slug inválido', ['Use apenas letras minúsculas, números e hífen']);
      }
      const taken = await businessPublicPageRepository.slugExists(data.slug, businessId);
      if (taken) throw new ConflictError('Este link já está em uso por outro negócio');
    }

    return businessPublicPageRepository.update(businessId, data);
  },
};
```

- [ ] **Step 6: Rodar o teste e confirmar que passa**

Run: `cd backend && npx vitest run src/__tests__/businessPublicPage.test.ts`
Expected: PASS

- [ ] **Step 7: Criar controller e rotas**

```typescript
// backend/src/modules/businessPublicPage/businessPublicPage.controller.ts
import type { Request, Response, NextFunction } from 'express';
import { sendSuccess } from '../../utils/response.js';
import { businessPublicPageService } from './businessPublicPage.service.js';

export const getPublicPageSettings = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = await businessPublicPageService.get(req.user.businessId!);
    sendSuccess(res, data);
  } catch (error) {
    next(error);
  }
};

export const updatePublicPageSettings = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = await businessPublicPageService.update(req.user.businessId!, req.body);
    sendSuccess(res, data);
  } catch (error) {
    next(error);
  }
};
```

```typescript
// backend/src/modules/businessPublicPage/businessPublicPage.routes.ts
import express from 'express';
import { authMiddleware } from '../../middleware/auth.js';
import { requireTenantRoles } from '../../middleware/rbac.js';
import { validate } from '../../middleware/validate.js';
import { UpdatePublicPageSchema } from './businessPublicPage.types.js';
import { getPublicPageSettings, updatePublicPageSettings } from './businessPublicPage.controller.js';

const router = express.Router();
const guard = [authMiddleware, requireTenantRoles];

router.get('/', ...guard, getPublicPageSettings);
router.put('/', ...guard, validate({ body: UpdatePublicPageSchema }), updatePublicPageSettings);

export default router;
```

- [ ] **Step 8: Registrar a rota em `server.ts`**

Junto aos outros `app.use(\`${API_V1}/...\`, ...)`, adicionar:

```typescript
import businessPublicPageRoutes from './modules/businessPublicPage/businessPublicPage.routes.js';
// ...
app.use(`${API_V1}/business-public-page`, businessPublicPageRoutes);
```

- [ ] **Step 9: Rodar a suíte completa do backend**

Run: `cd backend && npm test`
Expected: PASS

- [ ] **Step 10: Commit**

```bash
git add backend/src/modules/businessPublicPage backend/src/server.ts backend/src/__tests__/businessPublicPage.test.ts
git commit -m "feat(pagina-publica): endpoint autenticado de configuração (slug, pix, logo, cor)"
```

---

### Task 7: Módulo de agendamento público (sem autenticação)

**Files:**
- Create: `backend/src/modules/publicBooking/publicBooking.types.ts`
- Create: `backend/src/modules/publicBooking/publicBooking.repository.ts`
- Create: `backend/src/modules/publicBooking/publicBooking.service.ts`
- Create: `backend/src/modules/publicBooking/publicBooking.controller.ts`
- Create: `backend/src/modules/publicBooking/publicBooking.routes.ts`
- Modify: `backend/src/server.ts`
- Test: `backend/src/__tests__/publicBooking.test.ts`

**Interfaces:**
- Consumes: `buildPixPayload` (Task 2), `appointmentsPrismaRepository.hasConflict`/
  `getBookedSlots`/`getServiceDetails` (Tasks 1/3), `clientRepository.findByPhone`/
  `create` (já existentes em `backend/src/repositories/clientRepository.ts`),
  `generateAvailableTimeSlots`/`getBusinessScheduleSettings` (já existentes em
  `backend/src/services/scheduleSettingsService.ts`).
- Produces: `GET /api/v1/public/:slug` (vitrine), `GET
  /api/v1/public/:slug/availability?serviceId=&professionalId=&date=`, `POST
  /api/v1/public/:slug/appointments` → `{ appointment: {...}, pixPayload: string,
  depositAmount: number, expiresAt: string }`.

- [ ] **Step 1: Escrever o teste do serviço de vitrine (falhando)**

```typescript
// backend/src/__tests__/publicBooking.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { publicBookingService } from '../modules/publicBooking/publicBooking.service.js';
import { publicBookingRepository } from '../modules/publicBooking/publicBooking.repository.js';
import { NotFoundError, ValidationError } from '../utils/errors.js';

vi.mock('../modules/publicBooking/publicBooking.repository.js', () => ({
  publicBookingRepository: {
    findBusinessBySlug: vi.fn(),
    findEligibleServices: vi.fn(),
    findProfessionalsForService: vi.fn(),
    findServiceForBusiness: vi.fn(),
    findProfessionalForBusiness: vi.fn(),
    findOrCreateClient: vi.fn(),
    createPendingAppointment: vi.fn(),
  },
}));

describe('publicBookingService.getStorefront', () => {
  beforeEach(() => vi.clearAllMocks());

  it('lança NotFoundError quando o slug não existe', async () => {
    (publicBookingRepository.findBusinessBySlug as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    await expect(publicBookingService.getStorefront('inexistente')).rejects.toThrow(NotFoundError);
  });

  it('retorna nome, logo, cor e serviços elegíveis do negócio', async () => {
    (publicBookingRepository.findBusinessBySlug as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'biz-1',
      name: 'Studio Aurora',
      logoUrl: 'https://x/logo.png',
      brandColor: '#FF7A00',
    });
    (publicBookingRepository.findEligibleServices as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 'srv-1', name: 'Manutenção', price: 130, durationMinutes: 105, depositPercentage: 30 },
    ]);

    const result = await publicBookingService.getStorefront('studio-aurora');

    expect(result.name).toBe('Studio Aurora');
    expect(result.services).toHaveLength(1);
    expect(result.services[0].depositAmount).toBe(39); // 30% de 130
  });
});

describe('publicBookingService.createPendingAppointment', () => {
  beforeEach(() => vi.clearAllMocks());

  it('rejeita serviço que não pertence ao negócio do slug', async () => {
    (publicBookingRepository.findBusinessBySlug as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'biz-1' });
    (publicBookingRepository.findServiceForBusiness as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    await expect(
      publicBookingService.createPendingAppointment('studio-aurora', {
        serviceId: 'srv-de-outro-negocio',
        professionalId: 'prof-1',
        date: '2026-10-24',
        time: '14:00',
        clientName: 'Mariana',
        clientPhone: '83999990000',
      })
    ).rejects.toThrow(ValidationError);
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `cd backend && npx vitest run src/__tests__/publicBooking.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Criar `publicBooking.types.ts`**

```typescript
import { z } from 'zod';

export const GetPublicAvailabilitySchema = z.object({
  serviceId: z.string().uuid(),
  professionalId: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const CreatePublicAppointmentSchema = z.object({
  serviceId: z.string().uuid(),
  professionalId: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().regex(/^\d{2}:\d{2}$/),
  clientName: z.string().trim().min(2).max(255),
  clientPhone: z.string().trim().min(10).max(20),
});

export type GetPublicAvailabilityQuery = z.infer<typeof GetPublicAvailabilitySchema>;
export type CreatePublicAppointmentInput = z.infer<typeof CreatePublicAppointmentSchema>;

export interface StorefrontService {
  id: string;
  name: string;
  price: number;
  durationMinutes: number;
  depositPercentage: number;
  depositAmount: number;
}

export interface Storefront {
  businessId: string;
  name: string;
  logoUrl: string | null;
  brandColor: string | null;
  services: StorefrontService[];
}
```

- [ ] **Step 4: Criar `publicBooking.repository.ts`**

```typescript
import { prisma } from '../../config/prisma.js';
import { clientRepository } from '../../repositories/clientRepository.js';

export const publicBookingRepository = {
  async findBusinessBySlug(slug: string) {
    return prisma.business.findFirst({
      where: { slug, active: true },
      select: {
        id: true, name: true, logoUrl: true, brandColor: true, pixKey: true, pixKeyType: true,
      },
    });
  },

  async findEligibleServices(businessId: string) {
    return prisma.service.findMany({
      where: { businessId, active: true, depositPercentage: { not: null } },
      select: { id: true, name: true, price: true, durationMinutes: true, depositPercentage: true },
    });
  },

  async findProfessionalsForService(businessId: string) {
    return prisma.professional.findMany({
      where: { businessId, active: true },
      select: { id: true, name: true },
    });
  },

  async findServiceForBusiness(businessId: string, serviceId: string) {
    return prisma.service.findFirst({
      where: { id: serviceId, businessId, active: true, depositPercentage: { not: null } },
      select: { id: true, price: true, durationMinutes: true, depositPercentage: true },
    });
  },

  async findProfessionalForBusiness(businessId: string, professionalId: string) {
    return prisma.professional.findFirst({
      where: { id: professionalId, businessId, active: true },
      select: { id: true },
    });
  },

  async findOrCreateClient(businessId: string, name: string, phone: string): Promise<{ id: string }> {
    const existing = await clientRepository.findByPhone(businessId, phone);
    if (existing) return existing;
    return clientRepository.create({
      businessId, name, phone,
      email: null, birthDate: null, address: null, notes: null,
    });
  },

  async createPendingAppointment(data: {
    businessId: string;
    clientId: string;
    professionalId: string;
    serviceId: string;
    date: string;
    time: string;
    expiresAt: Date;
  }) {
    return prisma.appointment.create({
      data: {
        businessId: data.businessId,
        clientId: data.clientId,
        professionalId: data.professionalId,
        serviceId: data.serviceId,
        date: new Date(data.date),
        time: new Date(`1970-01-01T${data.time}:00Z`),
        status: 'aguardando_pagamento',
        expiresAt: data.expiresAt,
        source: 'publico',
      },
      include: {
        client: { select: { name: true, phone: true } },
        service: { select: { name: true, price: true } },
      },
    });
  },
};
```

`clientRepository.create` exige `email`, `birthDate`, `address` e `notes` como
propriedades presentes (aceitam `null`, mas não podem ser omitidas) — conferido em
`backend/src/repositories/clientRepository.ts:121-129`.

- [ ] **Step 5: Criar `publicBooking.service.ts`**

```typescript
import { NotFoundError, ValidationError, ConflictError } from '../../utils/errors.js';
import { publicBookingRepository } from './publicBooking.repository.js';
import { appointmentsPrismaRepository } from '../appointments/appointments.repository.js';
import { generateAvailableTimeSlots, getBusinessScheduleSettings } from '../../services/scheduleSettingsService.js';
import { buildPixPayload } from '../../utils/pixPayload.js';
import logger from '../../utils/logger.js';
import type { CreatePublicAppointmentInput, GetPublicAvailabilityQuery, Storefront } from './publicBooking.types.js';

const HOLD_MINUTES = 15;

const calcDeposit = (price: number, depositPercentage: number): number =>
  Math.round(price * (depositPercentage / 100) * 100) / 100;

export const publicBookingService = {
  async getStorefront(slug: string): Promise<Storefront> {
    const business = await publicBookingRepository.findBusinessBySlug(slug);
    if (!business) throw new NotFoundError('Página');

    const services = await publicBookingRepository.findEligibleServices(business.id);

    return {
      businessId: business.id,
      name: business.name,
      logoUrl: business.logoUrl,
      brandColor: business.brandColor,
      services: services.map((s) => ({
        id: s.id,
        name: s.name,
        price: Number(s.price),
        durationMinutes: s.durationMinutes,
        depositPercentage: Number(s.depositPercentage),
        depositAmount: calcDeposit(Number(s.price), Number(s.depositPercentage)),
      })),
    };
  },

  async getProfessionals(slug: string) {
    const business = await publicBookingRepository.findBusinessBySlug(slug);
    if (!business) throw new NotFoundError('Página');
    return publicBookingRepository.findProfessionalsForService(business.id);
  },

  async getAvailability(slug: string, query: GetPublicAvailabilityQuery) {
    const business = await publicBookingRepository.findBusinessBySlug(slug);
    if (!business) throw new NotFoundError('Página');

    const service = await publicBookingRepository.findServiceForBusiness(business.id, query.serviceId);
    if (!service) throw new ValidationError('Serviço indisponível para este negócio');

    const professional = await publicBookingRepository.findProfessionalForBusiness(business.id, query.professionalId);
    if (!professional) throw new ValidationError('Profissional indisponível para este negócio');

    const businessSettings = await getBusinessScheduleSettings(business.id);
    const bookedTimes = await appointmentsPrismaRepository.getBookedSlots(
      business.id, query.professionalId, query.date
    );

    return (generateAvailableTimeSlots as Function)(businessSettings, query.date, {
      serviceDurationMinutes: service.durationMinutes,
      bookedTimes,
    });
  },

  async createPendingAppointment(slug: string, data: CreatePublicAppointmentInput) {
    const business = await publicBookingRepository.findBusinessBySlug(slug);
    if (!business) throw new NotFoundError('Página');
    if (!business.pixKey || !business.pixKeyType) {
      throw new ValidationError('Este negócio ainda não configurou o recebimento de sinal via Pix');
    }

    const service = await publicBookingRepository.findServiceForBusiness(business.id, data.serviceId);
    if (!service) throw new ValidationError('Serviço indisponível para este negócio');

    const professional = await publicBookingRepository.findProfessionalForBusiness(business.id, data.professionalId);
    if (!professional) throw new ValidationError('Profissional indisponível para este negócio');

    const conflict = await appointmentsPrismaRepository.hasConflict(
      business.id, data.professionalId, data.date, `${data.time}:00`
    );
    if (conflict) throw new ConflictError('Este horário acabou de ser reservado por outra pessoa');

    const client = await publicBookingRepository.findOrCreateClient(business.id, data.clientName, data.clientPhone);

    const expiresAt = new Date(Date.now() + HOLD_MINUTES * 60 * 1000);
    const appointment = await publicBookingRepository.createPendingAppointment({
      businessId: business.id,
      clientId: client.id,
      professionalId: data.professionalId,
      serviceId: data.serviceId,
      date: data.date,
      time: data.time,
      expiresAt,
    });

    const depositAmount = calcDeposit(Number(service.price), Number(service.depositPercentage));

    const pixPayload = buildPixPayload({
      pixKey: business.pixKey,
      pixKeyType: business.pixKeyType as never,
      merchantName: business.name,
      merchantCity: 'BRASIL',
      amount: depositAmount,
      description: `Sinal - ${appointment.service.name}`,
    });

    logger.info({ appointmentId: appointment.id, businessId: business.id }, 'Reserva pública criada, aguardando pagamento');

    return {
      appointmentId: appointment.id,
      depositAmount,
      pixPayload,
      expiresAt: expiresAt.toISOString(),
    };
  },
};
```

- [ ] **Step 6: Rodar o teste e confirmar que passa**

Run: `cd backend && npx vitest run src/__tests__/publicBooking.test.ts`
Expected: PASS

- [ ] **Step 7: Criar controller, rate limiter e rotas**

```typescript
// backend/src/modules/publicBooking/publicBooking.controller.ts
import type { Request, Response, NextFunction } from 'express';
import { sendSuccess, sendCreated } from '../../utils/response.js';
import { publicBookingService } from './publicBooking.service.js';

export const getStorefront = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = await publicBookingService.getStorefront(String(req.params['slug']));
    sendSuccess(res, data);
  } catch (error) {
    next(error);
  }
};

export const getProfessionals = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = await publicBookingService.getProfessionals(String(req.params['slug']));
    sendSuccess(res, data);
  } catch (error) {
    next(error);
  }
};

export const getAvailability = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = await publicBookingService.getAvailability(String(req.params['slug']), req.query as never);
    sendSuccess(res, data);
  } catch (error) {
    next(error);
  }
};

export const createAppointment = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = await publicBookingService.createPendingAppointment(String(req.params['slug']), req.body);
    sendCreated(res, data);
  } catch (error) {
    next(error);
  }
};
```

```typescript
// backend/src/modules/publicBooking/publicBooking.routes.ts
import express from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { validate } from '../../middleware/validate.js';
import { GetPublicAvailabilitySchema, CreatePublicAppointmentSchema } from './publicBooking.types.js';
import { getStorefront, getProfessionals, getAvailability, createAppointment } from './publicBooking.controller.js';

const router = express.Router();

const createAppointmentLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => ipKeyGenerator(req.ip ?? 'unknown'),
  message: {
    success: false,
    error: { code: 'RATE_LIMIT_PUBLIC_BOOKING', message: 'Muitas tentativas. Tente novamente em alguns minutos.' },
  },
});

router.get('/:slug', getStorefront);
router.get('/:slug/professionals', getProfessionals);
router.get('/:slug/availability', validate({ query: GetPublicAvailabilitySchema }), getAvailability);
router.post('/:slug/appointments', createAppointmentLimiter, validate({ body: CreatePublicAppointmentSchema }), createAppointment);

export default router;
```

- [ ] **Step 8: Registrar a rota em `server.ts`**

```typescript
import publicBookingRoutes from './modules/publicBooking/publicBooking.routes.js';
// ...
app.use(`${API_V1}/public`, publicBookingRoutes);
```

Importante: este `app.use` precisa vir **antes** do rate limit tenant/IP global de
`security.ts` na ordem de execução real não importa para o limite global (é
`max: 120` e não teria efeito bloqueante aqui), mas confirmar que
`applySecurityMiddleware` já rodou antes desta rota ser montada (deve estar, já
que os outros módulos também dependem dela).

- [ ] **Step 9: Rodar a suíte completa do backend**

Run: `cd backend && npm test`
Expected: PASS

- [ ] **Step 10: Commit**

```bash
git add backend/src/modules/publicBooking backend/src/server.ts backend/src/__tests__/publicBooking.test.ts
git commit -m "feat(agendamento-publico): vitrine, disponibilidade e criação de reserva sem login"
```

---

### Task 8: Confirmação manual de pagamento + WhatsApp

**Files:**
- Modify: `backend/src/modules/appointments/appointments.repository.ts`
- Modify: `backend/src/modules/appointments/appointments.service.ts`
- Modify: `backend/src/modules/appointments/appointments.controller.ts`
- Modify: `backend/src/modules/appointments/appointments.routes.ts`
- Test: `backend/src/__tests__/confirmPixPayment.test.ts`

**Interfaces:**
- Consumes: `VALID_STATUS_TRANSITIONS` (Task 1), `sendWhatsAppMessage` (já existe
  em `backend/src/services/whatsapp/index.js`, mesma importação usada em
  `cronService.ts`).
- Produces: `GET /api/v1/appointments/pending-payment`, `POST
  /api/v1/appointments/:id/confirm-payment`.

- [ ] **Step 1: Escrever o teste (falhando)**

```typescript
// backend/src/__tests__/confirmPixPayment.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { appointmentsService } from '../modules/appointments/appointments.service.js';
import { appointmentsPrismaRepository } from '../modules/appointments/appointments.repository.js';

vi.mock('../modules/appointments/appointments.repository.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../modules/appointments/appointments.repository.js')>();
  return {
    ...actual,
    appointmentsPrismaRepository: {
      ...actual.appointmentsPrismaRepository,
      findById: vi.fn(),
      updateStatus: vi.fn(),
      getServiceDetails: vi.fn(),
    },
  };
});

vi.mock('../services/whatsapp/index.js', () => ({ sendWhatsAppMessage: vi.fn().mockResolvedValue(true) }));

describe('appointmentsService.updateStatus — confirmação de pagamento', () => {
  beforeEach(() => vi.clearAllMocks());

  it('rejeita confirmar pagamento de agendamento já cancelado', async () => {
    (appointmentsPrismaRepository.findById as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'apt-1', status: 'cancelado', serviceId: 'srv-1', businessId: 'biz-1',
    });

    await expect(
      appointmentsService.updateStatus('apt-1', 'biz-1', 'confirmado')
    ).rejects.toThrow(/Transição de status inválida/);
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que passa (é regressão, já deve
  passar)**

Run: `cd backend && npx vitest run src/__tests__/confirmPixPayment.test.ts`
Expected: PASS — este comportamento já existe (Task 1 garantiu a transição
`cancelado: []`); este teste serve de guarda de regressão, não de TDD para código
novo. Se falhar, revisar a Task 1 antes de prosseguir.

- [ ] **Step 3: Adicionar `findPendingPayment` ao repositório**

Em `appointments.repository.ts`, adicionar:

```typescript
  async findPendingPayment(businessId: string): Promise<AppointmentWithRelations[]> {
    const now = new Date();
    return prisma.appointment.findMany({
      where: { businessId, status: 'aguardando_pagamento', expiresAt: { gt: now } },
      include: APPOINTMENT_INCLUDE,
      orderBy: [{ date: 'asc' }, { time: 'asc' }],
    }) as unknown as AppointmentWithRelations[];
  },
```

- [ ] **Step 4: Adicionar `getPendingPayment` e disparo de WhatsApp em
  `appointments.service.ts`**

```typescript
// @ts-ignore — sendWhatsAppMessage é um serviço JS legado ainda não tipado
import { sendWhatsAppMessage } from '../../services/whatsapp/index.js';

// dentro de appointmentsService:
  async getPendingPayment(businessId: string): Promise<AppointmentWithRelations[]> {
    return appointmentsPrismaRepository.findPendingPayment(businessId);
  },
```

No método `updateStatus` já existente, depois do bloco `if (newStatus ===
'concluido')`, adicionar:

```typescript
    if (newStatus === 'confirmado' && currentStatus === 'aguardando_pagamento') {
      const message = `Olá ${appointment.client.name}! Seu sinal foi confirmado e seu horário está garantido. Te esperamos!`;
      await sendWhatsAppMessage(appointment.client.phone, message, { businessId });
    }
```

- [ ] **Step 5: Expor as rotas**

Em `appointments.controller.ts`, adicionar:

```typescript
export const getPendingPayment = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = await appointmentsService.getPendingPayment(req.user.businessId!);
    sendSuccess(res, data.map(toAppointmentDto));
  } catch (error) {
    next(error);
  }
};
```

Em `appointments.routes.ts`, adicionar (antes de `router.get('/available-slots'
...)` para não colidir com `/:id`):

```typescript
router.get('/pending-payment', ...guard, getPendingPayment);
```

A confirmação em si reaproveita `PUT /:id/status` já existente (`{ status:
"confirmado" }`) — não precisa de rota nova, só o front chamar a que já existe.

- [ ] **Step 6: Rodar a suíte completa do backend**

Run: `cd backend && npm test`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add backend/src/modules/appointments backend/src/__tests__/confirmPixPayment.test.ts
git commit -m "feat(agenda): lista de agendamentos aguardando pix e confirmação envia whatsapp"
```

---

### Task 9: Frontend — rotas públicas e clientes de API

**Files:**
- Modify: `frontend/src/lib/publicRoutes.ts`
- Create: `frontend/src/lib/publicBooking.ts`
- Create: `frontend/src/lib/businessPublicPage.ts`
- Test: `frontend/src/lib/__tests__/publicRoutes.test.ts` (estender o existente,
  se já houver; senão criar)

**Interfaces:**
- Produces: `isPublicAuthPath('/agendar/qualquer-slug') === true`;
  `publicBookingApi.getStorefront(slug)`, `.getProfessionals(slug)`,
  `.getAvailability(slug, params)`, `.createAppointment(slug, data)`;
  `businessPublicPageApi.getSettings()`, `.updateSettings(data)`.

- [ ] **Step 1: Escrever o teste (falhando)**

```typescript
// frontend/src/lib/__tests__/publicRoutes.test.ts
import { describe, it, expect } from 'vitest';
import { isPublicAuthPath } from '@/lib/publicRoutes';

describe('isPublicAuthPath — /agendar', () => {
  it('trata qualquer slug sob /agendar como rota pública', () => {
    expect(isPublicAuthPath('/agendar/studio-aurora')).toBe(true);
    expect(isPublicAuthPath('/agendar')).toBe(true);
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `cd frontend && npx vitest run src/lib/__tests__/publicRoutes.test.ts`
Expected: FAIL

- [ ] **Step 3: Editar `publicRoutes.ts`**

```typescript
const PUBLIC_AUTH_PATHS = ['/login', '/cadastro', '/esqueci-senha', '/auth/redefinir-senha', '/termos', '/privacidade', '/agendar'] as const;
```

(a lógica de `isPathMatch` já cobre `/agendar/:slug` via `startsWith`, nenhuma
outra mudança necessária).

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `cd frontend && npx vitest run src/lib/__tests__/publicRoutes.test.ts`
Expected: PASS

- [ ] **Step 5: Criar `frontend/src/lib/publicBooking.ts`**

```typescript
import api from '@/lib/api';

export interface StorefrontServiceDto {
  id: string;
  name: string;
  price: number;
  durationMinutes: number;
  depositPercentage: number;
  depositAmount: number;
}

export interface StorefrontDto {
  businessId: string;
  name: string;
  logoUrl: string | null;
  brandColor: string | null;
  services: StorefrontServiceDto[];
}

export interface ProfessionalDto {
  id: string;
  name: string;
}

export interface CreatePublicAppointmentPayload {
  serviceId: string;
  professionalId: string;
  date: string;
  time: string;
  clientName: string;
  clientPhone: string;
}

export interface CreatePublicAppointmentResponse {
  appointmentId: string;
  depositAmount: number;
  pixPayload: string;
  expiresAt: string;
}

export const publicBookingApi = {
  async getStorefront(slug: string): Promise<StorefrontDto> {
    const response = await api.get(`/public/${slug}`);
    return response.data;
  },

  async getProfessionals(slug: string): Promise<ProfessionalDto[]> {
    const response = await api.get(`/public/${slug}/professionals`);
    return response.data;
  },

  async getAvailability(slug: string, params: { serviceId: string; professionalId: string; date: string }): Promise<string[]> {
    const response = await api.get(`/public/${slug}/availability`, { params });
    return response.data;
  },

  async createAppointment(slug: string, payload: CreatePublicAppointmentPayload): Promise<CreatePublicAppointmentResponse> {
    const response = await api.post(`/public/${slug}/appointments`, payload);
    return response.data;
  },
};
```

- [ ] **Step 6: Criar `frontend/src/lib/businessPublicPage.ts`**

```typescript
import api from '@/lib/api';

export interface PublicPageSettings {
  slug: string | null;
  pixKey: string | null;
  pixKeyType: 'cpf' | 'cnpj' | 'email' | 'telefone' | 'aleatoria' | null;
  logoUrl: string | null;
  brandColor: string | null;
}

export const businessPublicPageApi = {
  async getSettings(): Promise<PublicPageSettings> {
    const response = await api.get('/business-public-page');
    return response.data;
  },

  async updateSettings(data: Partial<PublicPageSettings>): Promise<PublicPageSettings> {
    const response = await api.put('/business-public-page', data);
    return response.data;
  },
};
```

- [ ] **Step 7: Rodar a suíte completa do frontend**

Run: `cd frontend && npm test`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add frontend/src/lib/publicRoutes.ts frontend/src/lib/publicBooking.ts frontend/src/lib/businessPublicPage.ts frontend/src/lib/__tests__/publicRoutes.test.ts
git commit -m "feat(frontend): clientes de API para agendamento público e config da página"
```

---

### Task 10: Frontend — página pública `/agendar/[slug]`

**Files:**
- Create: `frontend/src/app/agendar/[slug]/page.tsx`
- Create: `frontend/src/components/publicBooking/PublicBookingFlow.tsx`
- Test: `frontend/src/components/publicBooking/__tests__/PublicBookingFlow.test.tsx`

**Interfaces:**
- Consumes: `publicBookingApi` (Task 9), tokens do DESIGN.md (mesmos usados na
  landing: `bg`, `surface`, `ink`, `muted`, `line`, `brand`, `on-brand`,
  `whatsapp`, `status-confirmed`).
- Produces: componente `PublicBookingFlow({ slug }: { slug: string })` com estado
  interno de passos (serviço → profissional → data/hora → dados do cliente → Pix).

- [ ] **Step 1: Escrever o teste do primeiro passo (falhando)**

```typescript
// frontend/src/components/publicBooking/__tests__/PublicBookingFlow.test.tsx
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { PublicBookingFlow } from '../PublicBookingFlow';
import { publicBookingApi } from '@/lib/publicBooking';

vi.mock('@/lib/publicBooking', () => ({
  publicBookingApi: {
    getStorefront: vi.fn().mockResolvedValue({
      businessId: 'biz-1',
      name: 'Studio Aurora',
      logoUrl: null,
      brandColor: '#FF7A00',
      services: [
        { id: 'srv-1', name: 'Manutenção Fibra', price: 130, durationMinutes: 105, depositPercentage: 30, depositAmount: 39 },
      ],
    }),
    getProfessionals: vi.fn(),
    getAvailability: vi.fn(),
    createAppointment: vi.fn(),
  },
}));

describe('PublicBookingFlow', () => {
  it('mostra o nome do negócio e os serviços elegíveis ao carregar', async () => {
    render(<PublicBookingFlow slug="studio-aurora" />);

    await waitFor(() => {
      expect(screen.getByText('Studio Aurora')).toBeInTheDocument();
    });
    expect(screen.getByText('Manutenção Fibra')).toBeInTheDocument();
    expect(publicBookingApi.getStorefront).toHaveBeenCalledWith('studio-aurora');
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `cd frontend && npx vitest run src/components/publicBooking/__tests__/PublicBookingFlow.test.tsx`
Expected: FAIL — componente não existe.

- [ ] **Step 3: Implementar `PublicBookingFlow.tsx`**

```tsx
'use client';

import { useEffect, useState } from 'react';
import { publicBookingApi, type StorefrontDto, type ProfessionalDto } from '@/lib/publicBooking';

type Step = 'servico' | 'profissional' | 'horario' | 'dados' | 'pix';

export function PublicBookingFlow({ slug }: { slug: string }) {
  const [storefront, setStorefront] = useState<StorefrontDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<Step>('servico');
  const [serviceId, setServiceId] = useState<string | null>(null);
  const [professionals, setProfessionals] = useState<ProfessionalDto[]>([]);
  const [professionalId, setProfessionalId] = useState<string | null>(null);
  const [date, setDate] = useState('');
  const [availableSlots, setAvailableSlots] = useState<string[]>([]);
  const [time, setTime] = useState<string | null>(null);
  const [clientName, setClientName] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [pixResult, setPixResult] = useState<{ pixPayload: string; depositAmount: number } | null>(null);

  useEffect(() => {
    publicBookingApi
      .getStorefront(slug)
      .then(setStorefront)
      .catch(() => setError('Página não encontrada.'))
      .finally(() => setLoading(false));
  }, [slug]);

  const selectService = async (id: string) => {
    setServiceId(id);
    const list = await publicBookingApi.getProfessionals(slug);
    setProfessionals(list);
    setStep('profissional');
  };

  const selectProfessional = (id: string) => {
    setProfessionalId(id);
    setStep('horario');
  };

  const loadAvailability = async (selectedDate: string) => {
    setDate(selectedDate);
    if (!serviceId || !professionalId) return;
    const slots = await publicBookingApi.getAvailability(slug, { serviceId, professionalId, date: selectedDate });
    setAvailableSlots(slots);
  };

  const selectTime = (slot: string) => {
    setTime(slot);
    setStep('dados');
  };

  const submit = async () => {
    if (!serviceId || !professionalId || !time) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await publicBookingApi.createAppointment(slug, {
        serviceId, professionalId, date, time, clientName, clientPhone,
      });
      setPixResult({ pixPayload: result.pixPayload, depositAmount: result.depositAmount });
      setStep('pix');
    } catch {
      setError('Não foi possível criar a reserva. Tente novamente.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="p-8 text-center text-muted">Carregando...</div>;
  if (error && !storefront) return <div className="p-8 text-center text-danger">{error}</div>;
  if (!storefront) return null;

  return (
    <div className="mx-auto max-w-xl px-4 py-10">
      <h1 className="text-2xl font-extrabold text-ink">{storefront.name}</h1>

      {step === 'servico' && (
        <div className="mt-6 flex flex-col gap-3">
          {storefront.services.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => selectService(s.id)}
              className="rounded-card border border-line bg-surface p-4 text-left hover:border-brand"
            >
              <p className="font-bold text-ink">{s.name}</p>
              <p className="text-sm text-muted">Sinal: R$ {s.depositAmount.toFixed(2)}</p>
            </button>
          ))}
        </div>
      )}

      {step === 'profissional' && (
        <div className="mt-6 flex flex-col gap-3">
          {professionals.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => selectProfessional(p.id)}
              className="rounded-card border border-line bg-surface p-4 text-left hover:border-brand"
            >
              {p.name}
            </button>
          ))}
        </div>
      )}

      {step === 'horario' && (
        <div className="mt-6 flex flex-col gap-4">
          <input
            type="date"
            value={date}
            onChange={(e) => loadAvailability(e.target.value)}
            className="rounded-lg border border-line p-3"
          />
          <div className="flex flex-wrap gap-2">
            {availableSlots.map((slot) => (
              <button
                key={slot}
                type="button"
                onClick={() => selectTime(slot)}
                className="rounded-lg border border-line px-4 py-2 hover:border-brand"
              >
                {slot}
              </button>
            ))}
          </div>
        </div>
      )}

      {step === 'dados' && (
        <div className="mt-6 flex flex-col gap-4">
          <input
            placeholder="Seu nome"
            value={clientName}
            onChange={(e) => setClientName(e.target.value)}
            className="rounded-lg border border-line p-3"
          />
          <input
            placeholder="Seu WhatsApp"
            value={clientPhone}
            onChange={(e) => setClientPhone(e.target.value)}
            className="rounded-lg border border-line p-3"
          />
          {error && <p className="text-sm text-danger">{error}</p>}
          <button
            type="button"
            disabled={submitting || !clientName || !clientPhone}
            onClick={submit}
            className="rounded-lg bg-brand px-4 py-3 font-bold text-on-brand disabled:opacity-60"
          >
            {submitting ? 'Reservando...' : 'Reservar e pagar sinal'}
          </button>
        </div>
      )}

      {step === 'pix' && pixResult && (
        <div className="mt-6 flex flex-col gap-4 rounded-card border border-line bg-surface-2 p-5">
          <p className="font-bold text-ink">Pague o sinal de R$ {pixResult.depositAmount.toFixed(2)} via Pix</p>
          <textarea readOnly value={pixResult.pixPayload} className="h-24 rounded-lg border border-line p-3 text-xs" />
          <p className="text-sm text-muted">
            Aguardando confirmação do estabelecimento. Você pode fechar esta página.
          </p>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `cd frontend && npx vitest run src/components/publicBooking/__tests__/PublicBookingFlow.test.tsx`
Expected: PASS

- [ ] **Step 5: Criar a página da rota**

```tsx
// frontend/src/app/agendar/[slug]/page.tsx
import { PublicBookingFlow } from '@/components/publicBooking/PublicBookingFlow';

export default async function AgendarPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <PublicBookingFlow slug={slug} />;
}
```

- [ ] **Step 6: Adicionar `frontend/src/app/agendar/[slug]/page.tsx` e o novo
  diretório a `themedPaths.ts`**

Em `frontend/src/lib/themedPaths.ts`, adicionar `'src/app/agendar'` e
`'src/components/publicBooking'` à lista `THEMED_PATHS`.

- [ ] **Step 7: Rodar a suíte completa do frontend**

Run: `cd frontend && npm test`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add frontend/src/app/agendar frontend/src/components/publicBooking frontend/src/lib/themedPaths.ts
git commit -m "feat(agendamento-publico): página pública de autoagendamento com sinal Pix"
```

---

### Task 11: Frontend — configuração da página pública no painel

**Files:**
- Modify: `frontend/src/app/dashboard/minha-pagina/page.tsx`
- Create: `frontend/src/components/settings/PublicPageSettingsForm.tsx`
- Test: `frontend/src/components/settings/__tests__/PublicPageSettingsForm.test.tsx`

**Interfaces:**
- Consumes: `businessPublicPageApi` (Task 9).
- Produces: substitui o placeholder `EmBreve` por um formulário real de slug,
  chave Pix, tipo de chave, logo (URL) e cor da marca.

- [ ] **Step 1: Escrever o teste (falhando)**

```typescript
// frontend/src/components/settings/__tests__/PublicPageSettingsForm.test.tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { PublicPageSettingsForm } from '../PublicPageSettingsForm';
import { businessPublicPageApi } from '@/lib/businessPublicPage';

vi.mock('@/lib/businessPublicPage', () => ({
  businessPublicPageApi: {
    getSettings: vi.fn().mockResolvedValue({ slug: null, pixKey: null, pixKeyType: null, logoUrl: null, brandColor: null }),
    updateSettings: vi.fn().mockResolvedValue({ slug: 'studio-aurora', pixKey: '83999990000', pixKeyType: 'telefone', logoUrl: null, brandColor: null }),
  },
}));

describe('PublicPageSettingsForm', () => {
  it('salva o slug e a chave Pix ao enviar o formulário', async () => {
    const user = userEvent.setup();
    render(<PublicPageSettingsForm />);

    await waitFor(() => expect(businessPublicPageApi.getSettings).toHaveBeenCalled());

    await user.type(screen.getByLabelText(/link da sua página/i), 'studio-aurora');
    await user.type(screen.getByLabelText(/chave pix/i), '83999990000');
    await user.click(screen.getByRole('button', { name: /salvar/i }));

    await waitFor(() => {
      expect(businessPublicPageApi.updateSettings).toHaveBeenCalledWith(
        expect.objectContaining({ slug: 'studio-aurora', pixKey: '83999990000' })
      );
    });
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `cd frontend && npx vitest run src/components/settings/__tests__/PublicPageSettingsForm.test.tsx`
Expected: FAIL — componente não existe.

- [ ] **Step 3: Implementar `PublicPageSettingsForm.tsx`**

```tsx
'use client';

import { useEffect, useState } from 'react';
import { businessPublicPageApi, type PublicPageSettings } from '@/lib/businessPublicPage';

const PIX_KEY_TYPES: { value: NonNullable<PublicPageSettings['pixKeyType']>; label: string }[] = [
  { value: 'cpf', label: 'CPF' },
  { value: 'cnpj', label: 'CNPJ' },
  { value: 'email', label: 'E-mail' },
  { value: 'telefone', label: 'Telefone' },
  { value: 'aleatoria', label: 'Chave aleatória' },
];

export function PublicPageSettingsForm() {
  const [settings, setSettings] = useState<PublicPageSettings | null>(null);
  const [slug, setSlug] = useState('');
  const [pixKey, setPixKey] = useState('');
  const [pixKeyType, setPixKeyType] = useState<PublicPageSettings['pixKeyType']>('telefone');
  const [saving, setSaving] = useState(false);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  useEffect(() => {
    businessPublicPageApi.getSettings().then((data) => {
      setSettings(data);
      setSlug(data.slug ?? '');
      setPixKey(data.pixKey ?? '');
      setPixKeyType(data.pixKeyType ?? 'telefone');
    });
  }, []);

  const submit = async () => {
    setSaving(true);
    setSavedMessage(null);
    try {
      const updated = await businessPublicPageApi.updateSettings({ slug, pixKey, pixKeyType: pixKeyType ?? undefined });
      setSettings(updated);
      setSavedMessage('Configurações salvas.');
    } finally {
      setSaving(false);
    }
  };

  if (!settings) return <div className="p-6 text-muted">Carregando...</div>;

  return (
    <div className="flex max-w-lg flex-col gap-4 p-6">
      <label className="flex flex-col gap-1 text-sm font-semibold text-ink">
        Link da sua página
        <input
          id="public-page-slug"
          aria-label="Link da sua página"
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          placeholder="studio-aurora"
          className="rounded-lg border border-line p-3"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm font-semibold text-ink">
        Tipo de chave Pix
        <select
          aria-label="Tipo de chave Pix"
          value={pixKeyType ?? 'telefone'}
          onChange={(e) => setPixKeyType(e.target.value as PublicPageSettings['pixKeyType'])}
          className="rounded-lg border border-line p-3"
        >
          {PIX_KEY_TYPES.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1 text-sm font-semibold text-ink">
        Chave Pix
        <input
          aria-label="Chave Pix"
          value={pixKey}
          onChange={(e) => setPixKey(e.target.value)}
          className="rounded-lg border border-line p-3"
        />
      </label>

      {savedMessage && <p className="text-sm text-whatsapp">{savedMessage}</p>}

      <button
        type="button"
        onClick={submit}
        disabled={saving}
        className="rounded-lg bg-brand px-4 py-3 font-bold text-on-brand disabled:opacity-60"
      >
        {saving ? 'Salvando...' : 'Salvar'}
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `cd frontend && npx vitest run src/components/settings/__tests__/PublicPageSettingsForm.test.tsx`
Expected: PASS

- [ ] **Step 5: Substituir o placeholder em `minha-pagina/page.tsx`**

```tsx
import { PublicPageSettingsForm } from '@/components/settings/PublicPageSettingsForm';

export default function MinhaPaginaPage() {
  return <PublicPageSettingsForm />;
}
```

- [ ] **Step 6: Rodar a suíte completa do frontend**

Run: `cd frontend && npm test`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add frontend/src/app/dashboard/minha-pagina frontend/src/components/settings/PublicPageSettingsForm.tsx frontend/src/components/settings/__tests__/PublicPageSettingsForm.test.tsx
git commit -m "feat(minha-pagina): formulário real de slug e chave Pix, substitui o placeholder"
```

---

### Task 12: Frontend — seção "Aguardando Pix" no painel

**Files:**
- Create: `frontend/src/components/appointments/PendingPaymentList.tsx`
- Create: `frontend/src/lib/appointments.ts` (se não existir um client de API de
  agendamentos já — conferir antes; se já houver chamadas equivalentes em outro
  arquivo, adicionar os dois métodos novos lá em vez de criar um arquivo)
- Test: `frontend/src/components/appointments/__tests__/PendingPaymentList.test.tsx`

**Interfaces:**
- Consumes: `GET /appointments/pending-payment`, `PUT /appointments/:id/status`
  (Task 8).
- Produces: componente `PendingPaymentList` listado dentro do módulo de Agenda
  (`AppointmentModule.tsx` ou equivalente já existente) como uma seção/aba.

- [ ] **Step 1: Escrever o teste (falhando)**

```typescript
// frontend/src/components/appointments/__tests__/PendingPaymentList.test.tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { PendingPaymentList } from '../PendingPaymentList';
import api from '@/lib/api';

vi.mock('@/lib/api', () => ({
  default: {
    get: vi.fn().mockResolvedValue({
      data: [
        {
          id: 'apt-1',
          client: { name: 'Mariana', phone: '83999990000' },
          service: { name: 'Manutenção' },
          date: '2026-10-24',
          time: '14:00:00',
        },
      ],
    }),
    put: vi.fn().mockResolvedValue({ data: {} }),
  },
}));

describe('PendingPaymentList', () => {
  it('confirma o pagamento ao clicar no botão', async () => {
    const user = userEvent.setup();
    render(<PendingPaymentList />);

    await waitFor(() => expect(screen.getByText('Mariana')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: /confirmar recebimento do pix/i }));

    await waitFor(() => {
      expect(api.put).toHaveBeenCalledWith('/appointments/apt-1/status', { status: 'confirmado' });
    });
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `cd frontend && npx vitest run src/components/appointments/__tests__/PendingPaymentList.test.tsx`
Expected: FAIL — componente não existe.

- [ ] **Step 3: Implementar `PendingPaymentList.tsx`**

```tsx
'use client';

import { useEffect, useState } from 'react';
import api from '@/lib/api';

interface PendingAppointment {
  id: string;
  client: { name: string; phone: string };
  service: { name: string };
  date: string;
  time: string;
}

export function PendingPaymentList() {
  const [items, setItems] = useState<PendingAppointment[]>([]);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  const load = async () => {
    const response = await api.get('/appointments/pending-payment');
    setItems(response.data);
  };

  useEffect(() => {
    load();
  }, []);

  const confirm = async (id: string) => {
    setConfirmingId(id);
    try {
      await api.put(`/appointments/${id}/status`, { status: 'confirmado' });
      await load();
    } finally {
      setConfirmingId(null);
    }
  };

  if (items.length === 0) {
    return <p className="p-4 text-sm text-muted">Nenhuma reserva aguardando pagamento.</p>;
  }

  return (
    <div className="flex flex-col gap-3 p-4">
      {items.map((item) => (
        <div key={item.id} className="flex items-center justify-between rounded-card border border-line bg-surface p-4">
          <div>
            <p className="font-bold text-ink">{item.client.name}</p>
            <p className="text-sm text-muted">{item.service.name} · {item.date} {item.time}</p>
          </div>
          <button
            type="button"
            disabled={confirmingId === item.id}
            onClick={() => confirm(item.id)}
            className="rounded-lg bg-whatsapp px-4 py-2 text-sm font-bold text-on-brand disabled:opacity-60"
          >
            Confirmar recebimento do Pix
          </button>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `cd frontend && npx vitest run src/components/appointments/__tests__/PendingPaymentList.test.tsx`
Expected: PASS

- [ ] **Step 5: Encaixar no módulo de Agenda existente**

Abrir `frontend/src/components/AppointmentModule.tsx`, localizar onde as
abas/seções do módulo são renderizadas, e adicionar `PendingPaymentList` como uma
nova aba "Aguardando Pix" seguindo o mesmo padrão de aba já usado ali (o
implementador deve olhar a estrutura real do arquivo nesse momento — ela não foi
transcrita aqui porque este arquivo já existe e muda com frequência; o padrão de
"nova aba" deve seguir exatamente o de uma aba irmã já existente no mesmo
componente).

- [ ] **Step 6: Rodar a suíte completa do frontend**

Run: `cd frontend && npm test`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/appointments/PendingPaymentList.tsx frontend/src/components/appointments/__tests__/PendingPaymentList.test.tsx frontend/src/components/AppointmentModule.tsx
git commit -m "feat(agenda): aba Aguardando Pix com confirmação manual de sinal"
```

---

## Self-Review

**Cobertura da spec:** dados novos (Task 1), geração de Pix sem gateway (Task 2),
disponibilidade considerando reservas pendentes (Task 3), expiração (Tasks 3+4),
sinal por serviço (Task 5), configuração da página pública (Tasks 6, 11), fluxo
público completo (Tasks 7, 10), confirmação manual + WhatsApp (Tasks 8, 12),
segurança/rate limit (Task 7). Todas as seções da spec têm uma task correspondente.

**Placeholders:** nenhum "TBD"/"implementar depois" — a única exceção deliberada é
a Task 12 Step 5, que aponta para um arquivo existente e variável
(`AppointmentModule.tsx`) em vez de transcrever seu conteúdo atual, com instrução
explícita do padrão a seguir.

**Consistência de tipos:** `AppointmentStatus` (Task 1) é consumido identicamente
em Tasks 3, 7, 8; `PublicPageSettings`/`UpdatePublicPageInput` (Task 6) são os
mesmos tipos consumidos pelo `businessPublicPageApi` do frontend (Task 9);
`StorefrontDto`/`CreatePublicAppointmentPayload` (Task 9) espelham exatamente o
retorno de `publicBookingService` (Task 7).

**Review Focus coberto:**
- Slug duplicado/inválido → testado na Task 6 (`isValidSlug`, `slugExists`).
- Corrida de reserva no mesmo horário → `hasConflict` (Task 3) mais a checagem
  explícita em `createPendingAppointment` (Task 7) antes de criar.
- Reserva expirada bloqueando indevidamente → testado na Task 3 (via `OR` com
  `expiresAt: { gt: now } `).
- Serviço/profissional de outro negócio → testado na Task 7
  (`findServiceForBusiness`/`findProfessionalForBusiness` retornando `null`).
- Confirmar pagamento de agendamento expirado/cancelado → coberto pela transição
  de status já validada (Task 1) e reforçado pelo teste de regressão da Task 8.
