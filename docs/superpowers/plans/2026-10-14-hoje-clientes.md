# Hoje e Clientes (sub-projeto 2B) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A tela Hoje e o CRM de Clientes (lista, fases, ficha) mostram só dado real do negócio, fiéis às versões novas do Stitch, com ficha técnica, fotos privadas, consentimento LGPD, etiquetas e lista de espera.

**Architecture:** Backend Express + Prisma ganha uma função pura de CRM (`crmMetrics.ts`) usada por endpoints de resumo (`/dashboard/today`, `/clients/insights`, `/clients/phases`, `/clients/:id/profile|timeline`) e módulos novos (`tags`, `clientPhotos`, `waitlist`). O frontend troca `conteudoDemo.hoje`/`conteudoDemo.clientes` por chamadas reais via proxies Next, e a ficha da cliente vira página própria (`/clientes/[id]`).

**Tech Stack:** Node/Express, Prisma 5 (PostgreSQL/Supabase + Storage), Zod, Vitest; Next.js 15 App Router, React, Tailwind (tokens), Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-10-14-hoje-clientes-design.md`

## Global Constraints

- Idioma: português do Brasil em tela, erros e commits. Botões em frase normal (maiúscula só na primeira palavra).
- Planos visíveis: Solo / Equipe / Salão. Nunca "Pro".
- Cores só por token (`bg-brand`, `text-ink`, `text-muted`, `bg-surface`, `bg-surface-2`, `border-line`, `text-success-text`, `text-warning-text`, `text-danger`, `bg-tertiary`, `text-whatsapp`…). `frontend/src/__tests__/themeCompliance.test.ts` reprova cor fixa e pasta/arquivo novo não registrado em `frontend/src/lib/themedPaths.ts`.
- Ícones: Material Symbols via `<Icon name="..."/>` de `@/components/ui`; para props tipadas `LucideIcon` use `materialIcon('nome')` de `@/lib/materialIconAdapter`. Nenhum `lucide-react` em arquivo novo.
- Referência visual (versão nova) em `docs/design/stitch/projeto/`: Hoje `studio-aurora-hoje-painel-desktop--575b48.html` e `studio-aurora-hoje-painel-mobile--b808ac.html`; lista `studio-aurora-crm-clientes-lista-desktop-ajustada--805f33.html`; fases `studio-aurora-crm-clientes-visao-por-fases-corrigida--19ad17.html`; ficha `studio-aurora-ficha-da-cliente-mariana-souza-ajustada--96f71e.html` e `studio-aurora-ficha-resumida-da-cliente-mobile--e3b0b0.html`. Tradução de classes Stitch → tokens: ver `frontend/src/components/comanda/ComandaModal.tsx` (já mapeado no 2A).
- Nenhum dado de exemplo: bloco sem dado mostra estado vazio ou some. "Assinante Clube VIP" não aparece (sub-projeto 4).
- Consentimento: clientes existentes = "não informado"; caixa da página pública **desmarcada**.
- Fotos da cliente: bucket **privado** `client-photos`, links assinados de 10 min, upload pelo backend (até 5 MB, jpeg/png/webp).
- WhatsApp no 2B só abre a conversa (`https://wa.me/55<telefone>?text=<mensagem>`), sempre com mensagem editável; nada é enviado pelo sistema.
- Datas no fuso do negócio (`getBusinessScheduleSettings(businessId).timezone`, `todayInTimezone` de `backend/src/utils/businessDate.ts`). Colunas `@db.Date` são lidas pelos componentes UTC; `@db.Time` como `1970-01-01THH:MM:SSZ`.
- Comandos: backend `cd backend && npx vitest run <arquivo>` / `npx tsc --noEmit`; frontend `cd frontend && npx vitest run <arquivo>` / `npx tsc --noEmit`. A máquina é lenta: teste que estoura 5 s na suíte inteira deve ser reexecutado sozinho antes de ser tratado como falha.
- Nunca rodar `prisma migrate deploy`/`db push` nem subir servidores: aplicar migração é com o controller, com o dono.
- Commits terminam com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Cliente com visitas no mesmo dia (duas comandas na mesma data)** — o ciclo médio não pode virar 0 nem dividir por zero; intervalos de 0 dia são ignorados (teste na Task 2).
2. **Aniversário em 29/02 ou cliente sem data de nascimento** — etiqueta só no mês certo e nunca quebra (teste na Task 2).
3. **Telefone com máscara, sem DDI ou vazio** — o link `wa.me` sai sempre como `55` + só dígitos, e sem telefone o botão fica desabilitado (teste na Task 9).
4. **Negócio sem nenhuma profissional ativa ou fechado hoje** — ocupação vem `null` (cartão "Sem expediente hoje"), nunca divisão por zero (teste na Task 8).
5. **CSV com nome contendo `;`, aspas ou quebra de linha, e acentos abrindo no Excel** — campo entre aspas com aspas duplicadas, BOM UTF-8 no início (teste na Task 3).

---

## File Structure

**Backend — novos**
- `backend/prisma/migrations/20261014120000_hoje_clientes/migration.sql`
- `backend/src/modules/crm/crmMetrics.ts` — regras puras (ciclo, retorno, fase, etiquetas, LTV, retenção).
- `backend/src/modules/crm/crm.repository.ts` — leitura de clientes + visitas do negócio.
- `backend/src/modules/crm/technicalSheetTemplates.ts` — modelos de ficha por segmento.
- `backend/src/modules/crm/crm.{types,service,controller,routes}.ts` — insights, fases, export, perfil, timeline, ficha técnica, consentimento, crm-settings.
- `backend/src/modules/tags/tags.{types,repository,service,controller,routes}.ts`
- `backend/src/modules/clientPhotos/clientPhotos.{types,service,controller,routes}.ts`
- `backend/src/modules/waitlist/waitlist.{types,repository,service,controller,routes}.ts`
- `backend/src/modules/dashboard/today.{service,repository}.ts` + rota `GET /dashboard/today`
- Testes em `backend/src/__tests__/`: `crmMetrics.test.ts`, `crmService.test.ts`, `crmExport.test.ts`, `tags.test.ts`, `clientPhotos.test.ts`, `waitlist.test.ts`, `dashboardToday.test.ts`, `publicBookingConsent.test.ts`.

**Backend — alterados**
- `backend/prisma/schema.prisma`, `backend/src/server.ts`, `backend/src/routes/dashboard.ts`, `backend/src/modules/publicBooking/publicBooking.{types,service,repository}.ts`.

**Frontend — novos**
- `frontend/src/lib/crm.ts` (tipos + API de clientes/fases/perfil/timeline/ficha/consentimento/export/crm-settings), `frontend/src/lib/tags.ts`, `frontend/src/lib/clientPhotos.ts`, `frontend/src/lib/waitlist.ts`, `frontend/src/lib/hoje.ts`, `frontend/src/lib/whatsappLink.ts`, `frontend/src/lib/technicalSheetTemplates.ts` (cópia do backend).
- `frontend/src/app/dashboard/clientes/[id]/page.tsx` + `frontend/src/components/clientes/` (FichaCliente, FichaTecnica, GaleriaCliente, LinhaDoTempoCliente, FasesClientes, ListaClientes, MensagemWhatsappModal).
- `frontend/src/components/waitlist/ListaEsperaPanel.tsx`.
- `frontend/src/components/settings/CrmSettingsSection.tsx`, `frontend/src/components/settings/EtiquetasSection.tsx`.
- Proxies em `frontend/src/app/api/...` para cada rota nova.

**Frontend — alterados**
- `frontend/src/app/dashboard/page.tsx`, `frontend/src/components/DashboardCards.tsx`, `frontend/src/components/dashboard/{SaudacaoDia,PainelPendencias,ProximasDuasHoras}.tsx`, `frontend/src/components/ClientModule.tsx` (vira container de Lista/Fases), `frontend/src/components/clients/ClientDetailPanel.tsx` (removido ao fim), `frontend/src/components/AppointmentModule.tsx` (botão Lista de espera), `frontend/src/components/SettingsModule.tsx`, `frontend/src/components/publicBooking/*` (caixa de consentimento), `frontend/src/lib/conteudoDemo.ts`, `docs/design/SEGUIMENTO.md`.

---

### Task 1: Migração e schema

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/20261014120000_hoje_clientes/migration.sql`

**Interfaces:**
- Produces modelos Prisma: `Tag`, `ClientTag`, `ClientTechnicalSheet`, `ClientPhoto`, `ClientConsent`, `WaitlistEntry`; campos `BusinessSettings.segment` (String, default `"outro"`) e `BusinessSettings.dailyRevenueGoal` (Decimal?).

- [ ] **Step 1: Copiar o schema atual** — `cp backend/prisma/schema.prisma "$TMP/schema.before.prisma"` (`$TMP` = pasta de rascunho da sessão).

- [ ] **Step 2: Editar `schema.prisma`**

`model BusinessSettings`, depois de `commissionProductPct`:
```prisma
  segment                  String   @default("outro") @db.VarChar(20)
  dailyRevenueGoal         Decimal? @map("daily_revenue_goal") @db.Decimal(10, 2)
```
Relações novas: `Business` → `tags Tag[]`, `clientPhotos ClientPhoto[]`, `clientConsents ClientConsent[]`, `waitlistEntries WaitlistEntry[]`, `technicalSheets ClientTechnicalSheet[]`; `Client` → `tags ClientTag[]`, `technicalSheet ClientTechnicalSheet?`, `photos ClientPhoto[]`, `consents ClientConsent[]`, `waitlistEntries WaitlistEntry[]`; `Service` → `waitlistEntries WaitlistEntry[]`; `Professional` → `waitlistEntries WaitlistEntry[]`; `Appointment` → `photos ClientPhoto[]`, `waitlistEntry WaitlistEntry?`; `User` → `technicalSheetsUpdated ClientTechnicalSheet[] @relation("SheetUpdatedBy")`, `photosCreated ClientPhoto[] @relation("PhotoCreatedBy")`, `consentsRecorded ClientConsent[] @relation("ConsentRecordedBy")`.

No fim do arquivo:
```prisma
// ─── CRM, ficha técnica e lista de espera (sub-projeto 2B) ───────────────────

model Tag {
  id         String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  businessId String   @map("business_id") @db.Uuid
  name       String   @db.VarChar(40)
  color      String   @default("brand") @db.VarChar(20)
  createdAt  DateTime @default(now()) @map("created_at")

  business Business    @relation(fields: [businessId], references: [id], onDelete: Cascade)
  clients  ClientTag[]

  @@index([businessId])
  @@map("tags")
}

model ClientTag {
  clientId  String   @map("client_id") @db.Uuid
  tagId     String   @map("tag_id") @db.Uuid
  createdAt DateTime @default(now()) @map("created_at")

  client Client @relation(fields: [clientId], references: [id], onDelete: Cascade)
  tag    Tag    @relation(fields: [tagId], references: [id], onDelete: Cascade)

  @@id([clientId, tagId])
  @@map("client_tags")
}

model ClientTechnicalSheet {
  clientId     String   @id @map("client_id") @db.Uuid
  businessId   String   @map("business_id") @db.Uuid
  allergies    String?  @db.Text
  fields       Json     @default("{}")
  customFields Json     @default("[]") @map("custom_fields")
  updatedAt    DateTime @default(now()) @updatedAt @map("updated_at")
  updatedBy    String?  @map("updated_by") @db.Uuid

  client        Client   @relation(fields: [clientId], references: [id], onDelete: Cascade)
  business      Business @relation(fields: [businessId], references: [id], onDelete: Cascade)
  updatedByUser User?    @relation("SheetUpdatedBy", fields: [updatedBy], references: [id], onDelete: SetNull)

  @@map("client_technical_sheets")
}

model ClientPhoto {
  id            String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  businessId    String   @map("business_id") @db.Uuid
  clientId      String   @map("client_id") @db.Uuid
  appointmentId String?  @map("appointment_id") @db.Uuid
  serviceName   String?  @map("service_name") @db.VarChar(255)
  caption       String?  @db.VarChar(255)
  storagePath   String   @map("storage_path") @db.Text
  takenAt       DateTime @map("taken_at") @db.Date
  createdAt     DateTime @default(now()) @map("created_at")
  createdBy     String?  @map("created_by") @db.Uuid

  business      Business     @relation(fields: [businessId], references: [id], onDelete: Cascade)
  client        Client       @relation(fields: [clientId], references: [id], onDelete: Cascade)
  appointment   Appointment? @relation(fields: [appointmentId], references: [id], onDelete: SetNull)
  createdByUser User?        @relation("PhotoCreatedBy", fields: [createdBy], references: [id], onDelete: SetNull)

  @@index([clientId, takenAt])
  @@map("client_photos")
}

model ClientConsent {
  id         String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  businessId String    @map("business_id") @db.Uuid
  clientId   String    @map("client_id") @db.Uuid
  kind       String    @default("whatsapp_lembretes") @db.VarChar(30)
  granted    Boolean
  channel    String    @db.VarChar(20)
  grantedAt  DateTime  @default(now()) @map("granted_at")
  revokedAt  DateTime? @map("revoked_at")
  recordedBy String?   @map("recorded_by") @db.Uuid

  business       Business @relation(fields: [businessId], references: [id], onDelete: Cascade)
  client         Client   @relation(fields: [clientId], references: [id], onDelete: Cascade)
  recordedByUser User?    @relation("ConsentRecordedBy", fields: [recordedBy], references: [id], onDelete: SetNull)

  @@index([clientId, grantedAt])
  @@map("client_consents")
}

model WaitlistEntry {
  id             String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  businessId     String    @map("business_id") @db.Uuid
  clientId       String    @map("client_id") @db.Uuid
  serviceId      String    @map("service_id") @db.Uuid
  professionalId String?   @map("professional_id") @db.Uuid
  desiredDate    DateTime? @map("desired_date") @db.Date
  period         String    @default("qualquer") @db.VarChar(10)
  notes          String?   @db.VarChar(255)
  status         String    @default("aguardando") @db.VarChar(15)
  offeredAt      DateTime? @map("offered_at")
  appointmentId  String?   @unique @map("appointment_id") @db.Uuid
  createdAt      DateTime  @default(now()) @map("created_at")

  business     Business      @relation(fields: [businessId], references: [id], onDelete: Cascade)
  client       Client        @relation(fields: [clientId], references: [id], onDelete: Cascade)
  service      Service       @relation(fields: [serviceId], references: [id], onDelete: Cascade)
  professional Professional? @relation(fields: [professionalId], references: [id], onDelete: SetNull)
  appointment  Appointment?  @relation(fields: [appointmentId], references: [id], onDelete: SetNull)

  @@index([businessId, status])
  @@map("waitlist_entries")
}
```

- [ ] **Step 3: Validar e gerar o SQL sem banco**
```bash
cd backend
npx prisma validate
npx prisma migrate diff --from-schema-datamodel "$TMP/schema.before.prisma" --to-schema-datamodel prisma/schema.prisma --script > "$TMP/2b.sql"
```
Expected: schema válido; SQL só com `CREATE TABLE`, `CREATE INDEX`, `ALTER TABLE ... ADD COLUMN/CONSTRAINT`. Nenhum `DROP` (se aparecer, o schema foi editado errado).

- [ ] **Step 4: Montar `migrations/20261014120000_hoje_clientes/migration.sql`** = SQL gerado + no fim:
```sql
-- Etiqueta única por negócio sem diferenciar maiúsculas (o Prisma não expressa lower()).
CREATE UNIQUE INDEX IF NOT EXISTS "tags_business_id_lower_name_key" ON "tags" ("business_id", lower("name"));

-- Bucket privado das fotos de procedimento (dado pessoal da cliente).
INSERT INTO storage.buckets (id, name, public)
VALUES ('client-photos', 'client-photos', false)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.tags                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_tags             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_technical_sheets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_photos           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_consents         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.waitlist_entries        ENABLE ROW LEVEL SECURITY;
```

- [ ] **Step 5:** `cd backend && npx prisma generate && npx tsc --noEmit` → client gerado, tipos limpos.

- [ ] **Step 6: Commit**
```bash
git add backend/prisma
git commit -m "feat(db): etiquetas, ficha técnica, fotos privadas, consentimento e lista de espera

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Regras puras do CRM

**Files:**
- Create: `backend/src/modules/crm/crmMetrics.ts`
- Test: `backend/src/__tests__/crmMetrics.test.ts`

**Interfaces:**
- Produces:
```ts
export type Fase = 'novo' | 'recorrente' | 'fiel' | 'em_risco' | 'perdido';
export const FASE_ROTULO: Record<Fase, string>; // Novo, Recorrente, Fiel / VIP, Em risco, Perdido
export interface Visita { date: string; receita: number; servico: string; profissional: string } // date YYYY-MM-DD
export interface ResumoCliente {
  visitas: number;
  cicloMedio: number | null;
  ultimaVisita: (Visita & { diasAtras: number }) | null;
  retornoPrevisto: { data: string | null; venceuHa: number | null; texto: string };
  fase: Fase;
  ltv: number;
  ticketMedio: number | null;
  etiquetasAuto: string[];
}
export function diasEntre(a: string, b: string): number; // b − a em dias (YYYY-MM-DD)
export function resumirCliente(visitas: Visita[], hoje: string, aniversario: string | null): ResumoCliente;
export function taxaRetencao(datasPorCliente: Map<string, string[]>, hoje: string): number | null;
```

- [ ] **Step 1: Escrever os testes**

`backend/src/__tests__/crmMetrics.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { resumirCliente, taxaRetencao, diasEntre, type Visita } from '../modules/crm/crmMetrics.js';

const v = (date: string, receita = 100, servico = 'Corte', profissional = 'Camila'): Visita => ({ date, receita, servico, profissional });
const HOJE = '2026-10-14';

describe('diasEntre', () => {
  it('conta dias de calendário', () => {
    expect(diasEntre('2026-10-01', '2026-10-14')).toBe(13);
    expect(diasEntre('2026-02-28', '2026-03-01')).toBe(1);
  });
});

describe('resumirCliente', () => {
  it('sem visitas: novo, sem ciclo, retorno "—"', () => {
    const r = resumirCliente([], HOJE, null);
    expect(r).toMatchObject({ visitas: 0, cicloMedio: null, ultimaVisita: null, fase: 'novo', ltv: 0, ticketMedio: null });
    expect(r.retornoPrevisto).toEqual({ data: null, venceuHa: null, texto: '—' });
  });

  it('uma visita recente: novo, primeira vez, sugerir retorno', () => {
    const r = resumirCliente([v('2026-10-01', 80)], HOJE, null);
    expect(r.fase).toBe('novo');
    expect(r.etiquetasAuto).toContain('Primeira vez');
    expect(r.retornoPrevisto.texto).toBe('Sugerir retorno em ~45 dias');
    expect(r.ltv).toBe(80);
    expect(r.ticketMedio).toBe(80);
  });

  it('ciclo médio e retorno previsto futuro', () => {
    const r = resumirCliente([v('2026-09-02'), v('2026-09-23'), v('2026-10-08')], HOJE, null);
    expect(r.cicloMedio).toBe(18); // (21 + 15) / 2
    expect(r.retornoPrevisto).toEqual({ data: '2026-10-26', venceuHa: null, texto: '26/10 · em 12 dias' });
    expect(r.fase).toBe('recorrente');
  });

  it('visitas no mesmo dia não zeram o ciclo', () => {
    const r = resumirCliente([v('2026-09-01'), v('2026-09-01'), v('2026-09-21')], HOJE, null);
    expect(r.cicloMedio).toBe(20);
    expect(r.visitas).toBe(3);
  });

  it('em risco quando passa de 1,5× o ciclo', () => {
    const r = resumirCliente([v('2026-08-01'), v('2026-08-21')], HOJE, null); // ciclo 20, limite 30, dias 54
    expect(r.fase).toBe('em_risco');
    expect(r.etiquetasAuto).toContain('Resgatável');
    expect(r.retornoPrevisto).toEqual({ data: '2026-09-10', venceuHa: 34, texto: 'Venceu há 34 dias' });
  });

  it('limite de 45 dias quando não há ciclo', () => {
    expect(resumirCliente([v('2026-08-31')], HOJE, null).fase).toBe('novo');        // 44 dias
    expect(resumirCliente([v('2026-08-29')], HOJE, null).fase).toBe('em_risco');    // 46 dias
  });

  it('perdido acima de 120 dias', () => {
    expect(resumirCliente([v('2026-06-15'), v('2026-06-16')], HOJE, null).fase).toBe('em_risco'); // exatamente 120 dias
    expect(resumirCliente([v('2026-06-13'), v('2026-06-14')], HOJE, null).fase).toBe('perdido'); // 122
  });

  it('fiel com 5 visitas dentro do limite', () => {
    const datas = ['2026-08-10', '2026-08-31', '2026-09-14', '2026-09-28', '2026-10-12'];
    expect(resumirCliente(datas.map((d) => v(d)), HOJE, null).fase).toBe('fiel');
  });

  it('aniversariante do mês ganha etiqueta; fora do mês não; sem data não quebra', () => {
    expect(resumirCliente([], HOJE, '1990-10-20').etiquetasAuto).toContain('Aniversário 20/10');
    expect(resumirCliente([], HOJE, '1990-11-20').etiquetasAuto.some((e) => e.startsWith('Aniversário'))).toBe(false);
    expect(resumirCliente([], '2027-02-10', '1992-02-29').etiquetasAuto).toContain('Aniversário 29/02');
    expect(() => resumirCliente([], HOJE, null)).not.toThrow();
  });

  it('última visita traz serviço, profissional e dias atrás, mesmo com entrada fora de ordem', () => {
    const r = resumirCliente([v('2026-10-08', 100, 'Gel', 'Bruna'), v('2026-09-01')], HOJE, null);
    expect(r.ultimaVisita).toEqual({ date: '2026-10-08', receita: 100, servico: 'Gel', profissional: 'Bruna', diasAtras: 6 });
  });
});

describe('taxaRetencao', () => {
  it('quem veio nos 90 dias anteriores e voltou nos últimos 90', () => {
    const m = new Map<string, string[]>([
      ['a', ['2026-06-01', '2026-09-01']], // voltou
      ['b', ['2026-06-10']],               // não voltou
      ['c', ['2026-10-01']],               // só recente: fora da base
    ]);
    expect(taxaRetencao(m, HOJE)).toBe(50);
  });
  it('sem base devolve null', () => {
    expect(taxaRetencao(new Map(), HOJE)).toBeNull();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar** — `cd backend && npx vitest run src/__tests__/crmMetrics.test.ts` → FAIL (módulo não existe).

- [ ] **Step 3: Implementar `crmMetrics.ts`**
```ts
/** Regras do CRM (sub-projeto 2B). Função pura: datas em YYYY-MM-DD no fuso do negócio. */
export type Fase = 'novo' | 'recorrente' | 'fiel' | 'em_risco' | 'perdido';
export const FASE_ROTULO: Record<Fase, string> = {
  novo: 'Novo', recorrente: 'Recorrente', fiel: 'Fiel / VIP', em_risco: 'Em risco', perdido: 'Perdido',
};

export interface Visita { date: string; receita: number; servico: string; profissional: string }
export interface ResumoCliente {
  visitas: number;
  cicloMedio: number | null;
  ultimaVisita: (Visita & { diasAtras: number }) | null;
  retornoPrevisto: { data: string | null; venceuHa: number | null; texto: string };
  fase: Fase;
  ltv: number;
  ticketMedio: number | null;
  etiquetasAuto: string[];
}

const DIA = 86_400_000;
const utc = (d: string) => Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10)));
export const diasEntre = (a: string, b: string): number => Math.round((utc(b) - utc(a)) / DIA);
const somarDias = (d: string, n: number): string => new Date(utc(d) + n * DIA).toISOString().slice(0, 10);
const ddmm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const centavos = (v: number) => Math.round(v * 100);

export function resumirCliente(visitas: Visita[], hoje: string, aniversario: string | null): ResumoCliente {
  const ordenadas = [...visitas].sort((a, b) => a.date.localeCompare(b.date));
  const n = ordenadas.length;
  const intervalos: number[] = [];
  for (let i = 1; i < n; i++) {
    const d = diasEntre(ordenadas[i - 1].date, ordenadas[i].date);
    if (d > 0) intervalos.push(d);
  }
  const cicloMedio = intervalos.length ? Math.round(intervalos.reduce((s, x) => s + x, 0) / intervalos.length) : null;
  const ultima = n ? ordenadas[n - 1] : null;
  const diasAtras = ultima ? diasEntre(ultima.date, hoje) : null;

  let retornoPrevisto: ResumoCliente['retornoPrevisto'];
  if (!ultima) retornoPrevisto = { data: null, venceuHa: null, texto: '—' };
  else if (cicloMedio === null) retornoPrevisto = { data: null, venceuHa: null, texto: 'Sugerir retorno em ~45 dias' };
  else {
    const data = somarDias(ultima.date, cicloMedio);
    const falta = diasEntre(hoje, data);
    retornoPrevisto = falta < 0
      ? { data, venceuHa: -falta, texto: `Venceu há ${-falta} ${-falta === 1 ? 'dia' : 'dias'}` }
      : { data, venceuHa: null, texto: falta === 0 ? `${ddmm(data)} · hoje` : `${ddmm(data)} · em ${falta} ${falta === 1 ? 'dia' : 'dias'}` };
  }

  const limite = cicloMedio !== null ? 1.5 * cicloMedio : 45;
  let fase: Fase;
  if (ultima && (diasAtras as number) > 120) fase = 'perdido';
  else if (ultima && (diasAtras as number) > limite) fase = 'em_risco';
  else if (n <= 1) fase = 'novo';
  else if (n >= 5) fase = 'fiel';
  else fase = 'recorrente';

  const ltvCents = ordenadas.reduce((s, x) => s + centavos(x.receita), 0);
  const etiquetasAuto: string[] = [];
  if (aniversario && aniversario.slice(5, 7) === hoje.slice(5, 7)) etiquetasAuto.push(`Aniversário ${ddmm(aniversario)}`);
  if (n === 1) etiquetasAuto.push('Primeira vez');
  if (fase === 'em_risco') etiquetasAuto.push('Resgatável');

  return {
    visitas: n,
    cicloMedio,
    ultimaVisita: ultima ? { ...ultima, diasAtras: diasAtras as number } : null,
    retornoPrevisto,
    fase,
    ltv: ltvCents / 100,
    ticketMedio: n ? Math.round(ltvCents / n) / 100 : null,
    etiquetasAuto,
  };
}

export function taxaRetencao(datasPorCliente: Map<string, string[]>, hoje: string): number | null {
  const inicioRecente = somarDias(hoje, -90);
  const inicioAnterior = somarDias(hoje, -180);
  let base = 0;
  let voltaram = 0;
  for (const datas of datasPorCliente.values()) {
    const anterior = datas.some((d) => d >= inicioAnterior && d < inicioRecente);
    if (!anterior) continue;
    base++;
    if (datas.some((d) => d >= inicioRecente && d <= hoje)) voltaram++;
  }
  return base ? Math.round((voltaram / base) * 100) : null;
}
```

- [ ] **Step 4: Rodar** → PASS. `npx tsc --noEmit` limpo.

- [ ] **Step 5: Commit** — `git add backend/src/modules/crm/crmMetrics.ts backend/src/__tests__/crmMetrics.test.ts && git commit -m "feat(crm): regras de fase, ciclo, retorno, LTV e retenção\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"` (use mensagem multi-linha real).

---
### Task 3: Lista, fases e exportação de clientes (API)

**Files:**
- Create: `backend/src/modules/crm/crm.repository.ts`, `backend/src/modules/crm/crm.types.ts`, `backend/src/modules/crm/crm.service.ts`, `backend/src/modules/crm/crm.controller.ts`, `backend/src/modules/crm/crm.routes.ts`, `backend/src/modules/crm/csv.ts`
- Modify: `backend/src/server.ts` (montar `crmRoutes` em `${API_V1}/clients` **antes** do router antigo de clientes, para `/clients/insights`, `/clients/phases`, `/clients/export.csv` e `/clients/:id/profile|timeline|technical-sheet|consent|tags` não colidirem com `PUT /clients/:id`)
- Test: `backend/src/__tests__/crmService.test.ts`, `backend/src/__tests__/crmExport.test.ts`

**Interfaces:**
- Consumes: `resumirCliente`, `taxaRetencao`, `FASE_ROTULO`, `Fase`, `Visita` (Task 2); `todayInTimezone`, `getBusinessScheduleSettings`.
- Produces:
```ts
// crm.repository.ts
export interface ClienteBase { id: string; name: string; phone: string; email: string | null; birthDate: string | null; createdAt: string; active: boolean;
  tags: Array<{ id: string; name: string; color: string }>; consentimento: 'consentido' | 'revogado' | 'nao_informado' }
export const crmRepository: {
  clientes(businessId: string): Promise<ClienteBase[]>;
  visitas(businessId: string): Promise<Map<string, Visita[]>>; // concluido + receita (earnings) + serviço + profissional, por cliente
  profissionaisPorCliente(businessId: string): Promise<Map<string, Set<string>>>; // ids de profissionais que já atenderam
};
// crm.types.ts
export interface ClienteInsight extends ClienteBase {
  fase: Fase; etiquetasAuto: string[]; ultimaVisita: ResumoCliente['ultimaVisita'];
  cicloMedio: number | null; retornoPrevisto: ResumoCliente['retornoPrevisto']; ltv: number; atendimentos: number;
}
export const InsightsQuerySchema: z.ZodObject; // page(1) pageSize(10, máx 100) busca? fase? etiqueta(uuid)? profissional(uuid)? ordem('ultima_visita'|'nome'|'ltv'|'retorno', default 'ultima_visita')
// crm.service.ts
export const crmService: {
  insights(businessId: string, q: InsightsQuery): Promise<{ itens: ClienteInsight[]; total: number; contagemPorFase: Record<Fase | 'todas', number> }>;
  fases(businessId: string): Promise<{ colunas: Array<{ fase: Fase; rotulo: string; contagem: number; ltvTotal: number; cartoes: ClienteInsight[] }>;
    kpis: { ativas: number; ativasNovasNoMes: number; ltvMedio: number | null; retencao: number | null } }>;
  exportCsv(businessId: string): Promise<string>;
};
// csv.ts
export function linhaCsv(campos: Array<string | number | null>): string; // separador ';', aspas quando preciso
```
Rotas: `GET /clients/insights`, `GET /clients/phases`, `GET /clients/export.csv` (header `Content-Type: text/csv; charset=utf-8`, `Content-Disposition: attachment; filename="clientes.csv"`), todas `authMiddleware, requireTenantRoles, requireFeature('clients')`.

- [ ] **Step 1: Escrever os testes**

`backend/src/__tests__/crmExport.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { linhaCsv } from '../modules/crm/csv.js';

describe('linhaCsv', () => {
  it('separa por ponto e vírgula', () => {
    expect(linhaCsv(['Ana', '83999990000', 120.5])).toBe('Ana;83999990000;120,50');
  });
  it('protege ; aspas e quebra de linha', () => {
    expect(linhaCsv(['Ana; Maria', 'diz "oi"', 'linha1\nlinha2'])).toBe('"Ana; Maria";"diz ""oi""";"linha1\nlinha2"');
  });
  it('vazio para null', () => {
    expect(linhaCsv([null, 'x'])).toBe(';x');
  });
});
```
`backend/src/__tests__/crmService.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const repo = vi.hoisted(() => ({ clientes: vi.fn(), visitas: vi.fn(), profissionaisPorCliente: vi.fn() }));
vi.mock('../modules/crm/crm.repository.js', () => ({ crmRepository: repo }));
vi.mock('../services/scheduleSettingsService.js', () => ({ getBusinessScheduleSettings: vi.fn().mockResolvedValue({ timezone: 'America/Sao_Paulo' }) }));

const { crmService } = await import('../modules/crm/crm.service.js');

const cliente = (id: string, name: string, over: Record<string, unknown> = {}) => ({
  id, name, phone: '83999990000', email: null, birthDate: null, createdAt: '2026-01-01T00:00:00.000Z', active: true,
  tags: [], consentimento: 'nao_informado', ...over,
});
const vis = (date: string, receita = 100) => ({ date, receita, servico: 'Corte', profissional: 'Camila' });

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-14T12:00:00-03:00'));
  repo.clientes.mockResolvedValue([
    cliente('a', 'Ana', { tags: [{ id: 't1', name: 'VIP Cílios', color: 'brand' }] }),
    cliente('b', 'Bia'),
    cliente('c', 'Carla'),
  ]);
  repo.visitas.mockResolvedValue(new Map([
    ['a', [vis('2026-09-20', 150), vis('2026-10-10', 150)]],
    ['b', [vis('2026-05-01')]],
  ]));
  repo.profissionaisPorCliente.mockResolvedValue(new Map([['a', new Set(['p1'])], ['b', new Set(['p2'])]]));
});

describe('crmService.insights', () => {
  it('calcula fase, LTV e conta por fase', async () => {
    const r = await crmService.insights('b1', { page: 1, pageSize: 10, ordem: 'ultima_visita' } as never);
    expect(r.total).toBe(3);
    expect(r.contagemPorFase).toMatchObject({ todas: 3, recorrente: 1, perdido: 1, novo: 1 });
    expect(r.itens[0]).toMatchObject({ id: 'a', fase: 'recorrente', ltv: 300, atendimentos: 2 });
    expect(r.itens.at(-1)).toMatchObject({ id: 'c', fase: 'novo', ultimaVisita: null }); // sem visita vai para o fim
  });

  it('filtra por fase, etiqueta, profissional e busca (sem acento)', async () => {
    expect((await crmService.insights('b1', { page: 1, pageSize: 10, ordem: 'nome', fase: 'perdido' } as never)).itens.map((c) => c.id)).toEqual(['b']);
    expect((await crmService.insights('b1', { page: 1, pageSize: 10, ordem: 'nome', etiqueta: 't1' } as never)).itens.map((c) => c.id)).toEqual(['a']);
    expect((await crmService.insights('b1', { page: 1, pageSize: 10, ordem: 'nome', profissional: 'p2' } as never)).itens.map((c) => c.id)).toEqual(['b']);
    expect((await crmService.insights('b1', { page: 1, pageSize: 10, ordem: 'nome', busca: 'CARLA' } as never)).itens.map((c) => c.id)).toEqual(['c']);
  });

  it('pagina', async () => {
    const r = await crmService.insights('b1', { page: 2, pageSize: 2, ordem: 'nome' } as never);
    expect(r.itens.map((c) => c.id)).toEqual(['c']);
    expect(r.total).toBe(3);
  });
});

describe('crmService.fases', () => {
  it('monta as 5 colunas com contagem e LTV, e os KPIs', async () => {
    const r = await crmService.fases('b1');
    expect(r.colunas.map((c) => c.fase)).toEqual(['novo', 'recorrente', 'fiel', 'em_risco', 'perdido']);
    expect(r.colunas.find((c) => c.fase === 'recorrente')).toMatchObject({ contagem: 1, ltvTotal: 300 });
    expect(r.kpis).toMatchObject({ ativas: 1, ltvMedio: 200 }); // ativas = visita nos últimos 120 dias; LTV médio entre quem tem visita
  });
});

describe('crmService.exportCsv', () => {
  it('começa com BOM e cabeçalho', async () => {
    const csv = await crmService.exportCsv('b1');
    expect(csv.startsWith('﻿Nome;Telefone;E-mail;Aniversário;Fase;Última visita;Ciclo médio (dias);LTV;Atendimentos;Etiquetas;Consentimento WhatsApp\r\n')).toBe(true);
    expect(csv).toContain('Ana;83999990000;;;Recorrente;10/10/2026;20;300,00;2;VIP Cílios;Não informado');
  });
});
```

- [ ] **Step 2: Rodar e ver falhar** — `cd backend && npx vitest run src/__tests__/crmService.test.ts src/__tests__/crmExport.test.ts` → FAIL.

- [ ] **Step 3: Implementar**

`csv.ts`:
```ts
const precisaAspas = /[;"\r\n]/;
const formatar = (v: string | number | null): string => {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') return v.toFixed(2).replace('.', ',');
  return precisaAspas.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
};
export const linhaCsv = (campos: Array<string | number | null>): string => campos.map(formatar).join(';');
```
(Números inteiros que não são dinheiro — ciclo, atendimentos — entram como string: `String(n)`.)

`crm.repository.ts` (Prisma, sempre por `businessId`):
- `clientes`: `prisma.client.findMany({ where: { businessId }, select: { id, name, phone, email, birthDate, createdAt, active, tags: { select: { tag: { select: { id, name, color } } } }, consents: { orderBy: { grantedAt: 'desc' }, take: 1, select: { granted: true, revokedAt: true } } } })` → `ClienteBase` (`birthDate` como `YYYY-MM-DD` pelos componentes UTC; consentimento: sem registro → `nao_informado`; `granted && !revokedAt` → `consentido`; senão `revogado`).
- `visitas`: um `$queryRaw` sobre `appointments a JOIN services s JOIN professionals p LEFT JOIN earnings e ON e.appointment_id = a.id WHERE a.business_id = $1 AND a.status = 'concluido'` selecionando `a.client_id, a.date, COALESCE(e.amount, s.price) AS receita, s.name, p.name, p.id` → agrupa em `Map<clientId, Visita[]>` (data `YYYY-MM-DD` via `to_char(a.date, 'YYYY-MM-DD')`).
- `profissionaisPorCliente`: do mesmo resultado (pode ser um único método interno que devolve os dois mapas; mantenha a interface acima).

`crm.service.ts`:
- Monta `ClienteInsight` para cada cliente com `resumirCliente(visitas.get(id) ?? [], hoje, birthDate)`.
- Filtros: `fase`; `etiqueta` (id em `tags`); `profissional` (id em `profissionaisPorCliente`); `busca` (nome, telefone ou e-mail, comparação sem acento e em minúsculas; telefone compara só dígitos).
- Ordem: `ultima_visita` (mais recente primeiro, sem visita no fim), `nome` (pt-BR, `localeCompare`), `ltv` (maior primeiro), `retorno` (vencidos primeiro, mais vencido antes; depois por data).
- `contagemPorFase` sobre o conjunto filtrado **sem** o filtro de fase (para as abas).
- `fases`: cartões ordenados por última visita (mais recente primeiro), até 20 por coluna; `kpis.ativas` = `active` com última visita ≤ 120 dias; `ativasNovasNoMes` = ativas cuja primeira visita é do mês corrente; `ltvMedio` = média do LTV de quem tem ≥ 1 visita (null se ninguém); `retencao` = `taxaRetencao`.
- `exportCsv`: `'﻿'` + cabeçalho + uma linha por cliente (ordem por nome), linhas separadas por `\r\n`; aniversário e última visita em `DD/MM/AAAA`; fase pelo `FASE_ROTULO`; etiquetas manuais e automáticas juntas separadas por `, `; consentimento `Consentido` / `Revogado` / `Não informado`.

`crm.types.ts`: `InsightsQuerySchema` com `z.coerce.number()` para paginação e `z.enum` para fase/ordem.

Controller/rotas no padrão de `backend/src/modules/comandas/` (handlers `H` com try/catch + `sendSuccess`; o CSV usa `res.setHeader(...)` + `res.send(csv)`).

- [ ] **Step 4: Rodar** → PASS; `npx tsc --noEmit` limpo; rodar também `src/__tests__/clients*.test.ts` existentes (as rotas antigas de clientes não podem quebrar).

- [ ] **Step 5: Commit** — `feat(crm): lista com fases, filtros e paginação, visão por fases e exportação CSV`.

---

### Task 4: Perfil, linha do tempo, ficha técnica, consentimento e ajustes do CRM (API)

**Files:**
- Create: `backend/src/modules/crm/technicalSheetTemplates.ts`
- Modify: `backend/src/modules/crm/crm.{types,repository,service,controller,routes}.ts`
- Test: `backend/src/__tests__/crmProfile.test.ts`

**Interfaces:**
- Produces:
```ts
// technicalSheetTemplates.ts
export type Segmento = 'unhas' | 'cilios_sobrancelhas' | 'cabelo' | 'barbearia' | 'estetica' | 'outro';
export interface CampoFicha { key: string; label: string; type: 'texto' | 'opcoes'; options?: string[] }
export const SEGMENTOS: Record<Segmento, { rotulo: string; campos: CampoFicha[] }>;
// rotas
// GET  /clients/:id/profile  → ClientProfileDto
// GET  /clients/:id/timeline?filtro=todos|agendamentos|financeiro → TimelineEvento[]
// PUT  /clients/:id/technical-sheet { allergies: string|null, fields: Record<string,string>, customFields: Array<{label,value}> } → FichaTecnicaDto
// POST /clients/:id/consent { granted: boolean } → { estado, desde, canal }
// GET/PUT /business/crm-settings { segment: Segmento, dailyRevenueGoal: number|null }
export interface FichaTecnicaDto { allergies: string | null; fields: Record<string, string>; customFields: Array<{ label: string; value: string }>; updatedAt: string | null; updatedBy: string | null; segmento: Segmento; campos: CampoFicha[] }
export interface ClientProfileDto {
  cliente: { id: string; name: string; phone: string; email: string | null; birthDate: string | null; notes: string | null; createdAt: string };
  fase: Fase; etiquetas: Array<{ id: string; name: string; color: string }>; etiquetasAuto: string[];
  indicadores: { cicloMedio: number | null; ticketMedio: number | null; visitasNoAno: number; faltasECancelamentos: number; ultimaVisita: ResumoCliente['ultimaVisita']; retornoPrevisto: ResumoCliente['retornoPrevisto'] };
  consentimento: { estado: 'consentido' | 'revogado' | 'nao_informado'; desde: string | null; canal: 'painel' | 'publico' | 'whatsapp' | null };
  fichaTecnica: FichaTecnicaDto;
}
export interface TimelineEvento { tipo: 'agendado' | 'concluido' | 'faltou' | 'cancelado' | 'lembrete' | 'avaliacao' | 'sinal_pix' | 'cadastro'; data: string /* ISO */; titulo: string; descricao: string | null; valor: number | null; nota?: number }
```

**Conteúdo de `SEGMENTOS`** (exatamente estes rótulos e opções):
- `unhas` "Unhas": `formato` Formato preferido (opções Amendoado, Quadrado, Stiletto, Bailarina, Redondo); `comprimento` Comprimento (texto); `cor` Cor/acabamento favorito (texto); `curvatura` Curvatura (texto); `aplicacao` Observações de aplicação (texto).
- `cilios_sobrancelhas` "Cílios e sobrancelhas": `tecnica` Técnica (Fio a fio, Volume russo, Híbrido, Lash lifting); `curvatura` Curvatura; `espessura` Espessura; `tamanho` Tamanho; `sobrancelha` Formato da sobrancelha; `observacoes` Observações.
- `cabelo` "Cabelo": `tipo_fio` Tipo de fio; `quimica` Química atual; `coloracao` Coloração (número/marca); `corte` Corte preferido; `observacoes` Observações.
- `barbearia` "Barbearia": `maquina` Máquina (altura); `estilo` Estilo do corte; `barba` Barba; `produtos` Produtos preferidos; `observacoes` Observações.
- `estetica` "Estética": `pele` Tipo de pele; `sensibilidade` Sensibilidade; `protocolo` Protocolo atual; `contraindicacoes` Contraindicações; `observacoes` Observações.
- `outro` "Outro": `observacoes` Observações.

**Timeline** (fontes; títulos exatos): agendamentos da cliente → `agendado` "Agendamento para {dd/mm às HH:MM} · {serviço} com {profissional}" (data = `created_at`); `concluido` "Atendimento concluído com {profissional}" com `valor` = `total_charged + deposit_applied` da comanda fechada (ou `service.price` sem comanda) e descrição com os itens; `faltou` "Não compareceu"; `cancelado` "Agendamento cancelado"; `reminder_sent = true` → `lembrete` "Lembrete automático enviado pelo WhatsApp" (data = data/hora do agendamento − 1 dia, porque o envio exato não é gravado — o texto não promete hora); `whatsapp_ratings` → `avaliacao` "Avaliação {nota} estrelas" + comentário; agendamento com `source='publico'` e `deposit_amount` e status em (confirmado, em_atendimento, concluido, faltou) → `sinal_pix` "Sinal Pix de R$ X pago na reserva online"; `client.created_at` → `cadastro` "Cadastro da cliente". Filtro `agendamentos` = agendado/concluido/faltou/cancelado/lembrete; `financeiro` = concluido/sinal_pix. Ordem: mais recente primeiro.

**Validação da ficha:** `allergies` até 1000 chars; `fields` só aceita chaves do modelo do segmento atual (outras → 400 "Campo desconhecido para o segmento"), valores até 200 chars, e para `opcoes` só valores da lista; `customFields` até 20 itens, label 1–40 e value 0–200. Salvar grava `updatedBy = req.user.userId`. `updatedBy` no DTO = `business.ownerName` (users não têm nome — mesma regra do caixa).

**Consentimento:** `POST` grava um registro novo (`granted`, `channel='painel'`, `recordedBy`); revogar = `granted=false` (o estado atual é sempre o último registro).

**crm-settings:** upsert em `business_settings` (`segment`, `dailyRevenueGoal`; meta ≤ 0 → 400; `null` remove). Rota em `backend/src/routes/business.ts` ou módulo novo `crm` (`/business/crm-settings`), guard `requireFeature('advanced_admin')` como `/business/settings`.

- [ ] **Step 1: Escrever os testes** (`crmProfile.test.ts`, mockando `crm.repository.js` e `prisma` no estilo de `crmService.test.ts`):
```ts
// casos obrigatórios (escreva cada um como `it(...)` com dados mínimos):
// 1. profile: indicadores (cicloMedio, ticketMedio, visitasNoAno só do ano corrente, faltasECancelamentos conta faltou+cancelado)
// 2. profile: consentimento sem registro → { estado: 'nao_informado', desde: null, canal: null }
// 3. profile: ficha inexistente → fields {} e campos do segmento do negócio
// 4. technical-sheet: chave fora do modelo → ValidationError 'Campo desconhecido para o segmento'
// 5. technical-sheet: opção inválida em campo 'opcoes' → ValidationError
// 6. technical-sheet: grava updatedBy do usuário
// 7. timeline: ordena desc, filtro 'financeiro' só concluido/sinal_pix, valor da comanda fechada
// 8. timeline: sinal_pix NÃO aparece para reserva pública cancelada
// 9. consent: revogar grava granted=false e o profile passa a 'revogado'
// 10. crm-settings: meta 0 → 400; null remove a meta
// 11. outro negócio: profile/timeline de cliente de outro businessId → NotFoundError('Cliente')
```
Cada caso com `expect` concreto sobre o retorno do serviço (ex.: `expect(p.consentimento).toEqual({ estado: 'nao_informado', desde: null, canal: null })`).

- [ ] **Step 2: Rodar e ver falhar.**
- [ ] **Step 3: Implementar** conforme acima.
- [ ] **Step 4: Rodar** `crmProfile`, `crmService`, `crmMetrics` + `tsc` → PASS.
- [ ] **Step 5: Commit** — `feat(crm): perfil, linha do tempo, ficha técnica por segmento, consentimento e ajustes`.

---

### Task 5: Etiquetas (API)

**Files:**
- Create: `backend/src/modules/tags/tags.{types,repository,service,controller,routes}.ts`
- Modify: `backend/src/server.ts` (`${API_V1}/tags`), `backend/src/modules/crm/crm.routes.ts` (`PUT /clients/:id/tags`)
- Test: `backend/src/__tests__/tags.test.ts`

**Interfaces:**
- Produces: `GET /tags` → `Array<{ id, name, color, clientes: number }>`; `POST /tags` `{ name, color }`; `PUT /tags/:id`; `DELETE /tags/:id`; `PUT /clients/:id/tags` `{ tagIds: string[] }` → etiquetas da cliente. `color` ∈ `brand | success | warning | danger | tertiary | muted`. Nome 1–40, aparado.

- [ ] **Step 1: Testes** (`tags.test.ts`, repositório mockado): nome repetido (P2002 do índice funcional) → `ConflictError('Já existe uma etiqueta com esse nome')`; cor inválida rejeitada pelo schema; `PUT /clients/:id/tags` com id de etiqueta de outro negócio → `ValidationError('Etiqueta inválida')`; apagar etiqueta chama `delete` (cascade remove de `client_tags`); cliente de outro negócio → `NotFoundError('Cliente')`.
- [ ] **Step 2: Rodar e ver falhar.**
- [ ] **Step 3: Implementar** — `setClientTags` numa transação: valida que todos os `tagIds` são do negócio, `deleteMany` + `createMany`.
- [ ] **Step 4: Rodar** → PASS + `tsc`.
- [ ] **Step 5: Commit** — `feat(etiquetas): etiquetas manuais das clientes`.

---

### Task 6: Fotos de procedimento privadas (API)

**Files:**
- Create: `backend/src/modules/clientPhotos/clientPhotos.{types,service,controller,routes}.ts`
- Modify: `backend/src/server.ts` (limite `express.json({ limit: '7mb' })` só para `POST ${API_V1}/clients/:id/photos`, no mesmo estilo do upload da página pública, e montar as rotas)
- Test: `backend/src/__tests__/clientPhotos.test.ts`

**Interfaces:**
- Produces: `GET /clients/:id/photos` → `Array<{ id, url, caption, serviceName, takenAt }>` (url assinada 600 s); `POST /clients/:id/photos` `{ imageBase64, contentType: 'image/jpeg'|'image/png'|'image/webp', caption?, appointmentId?, takenAt? }` → foto; `DELETE /clients/:id/photos/:photoId`.

**Regras:** bucket `client-photos` (privado); caminho `${businessId}/${clientId}/${randomUUID()}.${ext}` — **nunca** derivado de dado do request além do clientId já validado; até 5 MB decodificados (`ValidationError('Imagem inválida ou maior que 5MB')`); `appointmentId`, se vier, precisa ser da mesma cliente e negócio, e copia `service.name` para `serviceName` e `date` para `takenAt`; sem `appointmentId`, `takenAt` = hoje no fuso do negócio; URLs com `createSignedUrls(paths, 600)`; apagar remove o objeto do storage e a linha (se o storage falhar, não apaga a linha e devolve 502). Use `getSupabaseAdminClient()` de `backend/src/services/supabaseAuthService.js`, como `businessPublicPage.service.ts`.

- [ ] **Step 1: Testes** (mockar `getSupabaseAdminClient` com `storage.from().upload/createSignedUrls/remove` e o prisma): tipo inválido → schema rejeita; 6 MB → ValidationError; caminho começa com `b1/c1/`; foto de outro negócio no DELETE → `NotFoundError('Foto')`; `appointmentId` de outra cliente → ValidationError; GET devolve `url` vinda de `createSignedUrls` com 600 s; falha do `remove` → AppError 502 e a linha não é apagada.
- [ ] **Step 2: Rodar e ver falhar.**
- [ ] **Step 3: Implementar.**
- [ ] **Step 4: Rodar** → PASS + `tsc`.
- [ ] **Step 5: Commit** — `feat(fotos): galeria de procedimentos em bucket privado com links assinados`.

---

### Task 7: Lista de espera (API)

**Files:**
- Create: `backend/src/modules/waitlist/waitlist.{types,repository,service,controller,routes}.ts`
- Modify: `backend/src/server.ts` (`${API_V1}/waitlist`)
- Test: `backend/src/__tests__/waitlist.test.ts`

**Interfaces:**
- Produces:
```ts
export interface WaitlistItemDto { id: string; cliente: { id: string; name: string; phone: string }; servico: { id: string; name: string }; profissional: { id: string; name: string } | null;
  desiredDate: string | null; period: 'manha' | 'tarde' | 'noite' | 'qualquer'; notes: string | null; status: 'aguardando' | 'oferecida' | 'agendada' | 'cancelada'; offeredAt: string | null; createdAt: string }
// GET /waitlist?status=aguardando|oferecida|todas(default ativas = aguardando+oferecida)&period=&date=
// POST /waitlist { clientId, serviceId, professionalId?, desiredDate?, period, notes? }
// PUT /waitlist/:id { status: 'cancelada' } | campos editáveis
// POST /waitlist/:id/offer → { item, whatsappUrl } (mensagem com {nome},{servico},{negocio},{data},{hora} do corpo { date, time, professionalId? })
// POST /waitlist/:id/booked { appointmentId } → item agendada
```
**Regras:** cliente/serviço/profissional precisam ser do negócio; `offer` só de `aguardando`/`oferecida` (marca `oferecida`, `offeredAt=now`); `booked` só de `aguardando`/`oferecida` e o agendamento precisa ser da mesma cliente (senão 409 "Esta inscrição não pode mais ser agendada"); `cancelada` e `agendada` são finais. Filtro `date`: inscrições sem data ou com a data pedida; `period`: a pedida ou `qualquer`. Ordenação: mais antigas primeiro. `whatsappUrl` = `https://wa.me/55${soDigitos(phone)}?text=${encodeURIComponent(msg)}` (se o telefone já começa com 55 e tem 12–13 dígitos, não repete o 55). Mensagem: `Olá, {nome}! Abriu um horário para {servico} no {negocio}: {data} às {hora}. Quer que eu reserve para você?`

- [ ] **Step 1: Testes** (repositório mockado): transições permitidas e 409; filtro por período inclui `qualquer`; cliente de outro negócio → NotFound; `whatsappUrl` com 55 + dígitos e mensagem codificada; telefone `+55 (83) 99999-0000` → `https://wa.me/5583999990000?...`.
- [ ] **Step 2: Rodar e ver falhar.** · **Step 3: Implementar.** · **Step 4: Rodar** → PASS + `tsc`.
- [ ] **Step 5: Commit** — `feat(lista-espera): inscrição, oferta de vaga pelo WhatsApp e agendamento`.

---

### Task 8: Hoje (API) e consentimento na reserva pública

**Files:**
- Create: `backend/src/modules/dashboard/today.repository.ts`, `backend/src/modules/dashboard/today.service.ts`
- Modify: `backend/src/routes/dashboard.ts` (`GET /today` → controller novo, guard `requireFeature('dashboard')`), `backend/src/modules/publicBooking/publicBooking.{types,service,repository}.ts`
- Test: `backend/src/__tests__/dashboardToday.test.ts`, `backend/src/__tests__/publicBookingConsent.test.ts`

**Interfaces:**
- Consumes: `resumirCliente` (Task 2), `generateAvailableTimeSlots`/regras de almoço (`getProfessionalBreak` do 2A), `todayInTimezone`.
- Produces `GET /dashboard/today` →
```ts
export interface HojeDto {
  saudacao: { ownerName: string; date: string };
  faturamento: { valor: number; meta: number | null; percentual: number | null };
  agendamentos: { total: number; livresTarde: number };
  ocupacao: { percentual: number; variacao: number | null; diaDaSemana: string } | null; // null = sem expediente hoje
  confirmadosLembrete: { quantidade: number; valor: number };
  pendencias: Array<
    | { tipo: 'vagas_tarde'; quantidade: number; vagas: Array<{ profissional: string; professionalId: string; inicio: string; fim: string }> }
    | { tipo: 'retorno_vencido'; quantidade: number; clientes: Array<{ id: string; name: string; phone: string; servico: string; venceuHa: number }> }
    | { tipo: 'sinais_pix'; quantidade: number; total: number; expiraEmMinutos: number }
    | { tipo: 'avaliacao'; quantidade: number; avaliacoes: Array<{ clientId: string; cliente: string; phone: string; nota: number; comentario: string | null; data: string }> }>;
  proximas: AppointmentDto[]; // próximas 2 h: confirmado, em_atendimento, aguardando_pagamento não expirado
  semana: Array<{ data: string; valor: number }>; // últimos 7 dias incluindo hoje
}
```
**Regras:** seção "Regras de cálculo" da spec. Detalhes que ela deixa abertos, decididos aqui:
- Expediente de cada profissional ativa = abertura–fechamento do negócio, se o dia está em `diasAbertos`, menos o almoço dela. Minutos agendados = soma das durações dos agendamentos não cancelados do dia (inclui faltou e aguardando não expirado), limitada ao expediente. `ocupacao = null` se não há profissional ativa ou o negócio não abre hoje.
- Média das 4 semanas: mesmo cálculo para hoje −7, −14, −21, −28 dias (pula dias fechados); `variacao` = pontos percentuais arredondados (`percentual − média`), `null` se nenhuma semana anterior conta. `diaDaSemana` em pt-BR minúsculo ("terça").
- Vagas da tarde: por profissional, buracos ≥ 30 min entre max(12:00, agora) e o fechamento, sem agendamento e fora do almoço; `livresTarde` = total desses buracos; a pendência traz até 3 (`inicio`/`fim` HH:MM). A pendência só aparece se `quantidade > 0`.
- `retorno_vencido`: clientes ativas com `retornoPrevisto.venceuHa !== null` e sem agendamento futuro (confirmado/aguardando); até 20, mais vencidas primeiro.
- `sinais_pix`: agendamentos `aguardando_pagamento` não expirados; `total` = soma do `deposit_amount`; `expiraEmMinutos` = do que expira primeiro.
- `avaliacao`: `whatsapp_ratings` com `rating <= 3` dos últimos 7 dias.
- `semana`: soma de `earnings` por dia.
- `percentual` da meta = `round(valor / meta × 100)`, `null` sem meta.

**Reserva pública:** `CreatePublicAppointmentSchema` ganha `whatsappConsent: z.boolean().optional()`; quando `true`, depois de criar a reserva, grava `ClientConsent { granted: true, channel: 'publico' }` para a cliente (não grava nada quando `false`/ausente).

- [ ] **Step 1: Testes**
  - `dashboardToday.test.ts` (repositório mockado; relógio fixo em `2026-10-14T13:00:00-03:00`, terça):
    1. faturamento com meta 1800 e earnings 1460 → `{ valor: 1460, meta: 1800, percentual: 81 }`; sem meta → `percentual: null`.
    2. ocupação: 1 profissional, 09–19 com almoço 12–13 (540 min), 270 min agendados → 50; média das 4 terças anteriores 44 → `variacao: 6`, `diaDaSemana: 'terça'`.
    3. negócio fechado hoje ou sem profissional ativa → `ocupacao: null` (Review Focus 4).
    4. vagas da tarde ignoram o almoço e começam em "agora" (13:00), buracos < 30 min não contam.
    5. pendências vazias não aparecem; ordem fixa `vagas_tarde`, `retorno_vencido`, `sinais_pix`, `avaliacao`.
    6. `confirmadosLembrete` conta só concluídos do mês com `reminder_sent`.
  - `publicBookingConsent.test.ts`: `whatsappConsent: true` grava consentimento `publico`; `false` ou ausente não grava.
- [ ] **Step 2: Rodar e ver falhar.** · **Step 3: Implementar.**
- [ ] **Step 4: Rodar** os dois arquivos + `publicBooking.test.ts` + suíte inteira do backend + `tsc` → PASS.
- [ ] **Step 5: Commit** — `feat(hoje): resumo do dia com meta, ocupação, pendências e consentimento na reserva pública`.

---
### Task 9: Frontend — clientes de API, proxies, link do WhatsApp e modelos de ficha

**Files:**
- Create: `frontend/src/lib/crm.ts`, `frontend/src/lib/tags.ts`, `frontend/src/lib/clientPhotos.ts`, `frontend/src/lib/waitlist.ts`, `frontend/src/lib/hoje.ts`, `frontend/src/lib/whatsappLink.ts`, `frontend/src/lib/technicalSheetTemplates.ts`
- Create proxies (molde `frontend/src/app/api/comandas/[id]/route.ts`, `proxyRequest` já repassa a query string): `api/clients/insights`, `api/clients/phases`, `api/clients/export.csv` (GET — repassar o corpo como texto e os headers `Content-Type`/`Content-Disposition`; ler `frontend/src/lib/server/proxy.ts` para ver se `proxyRequest` já preserva corpo não-JSON; se não, criar `proxyRaw` ao lado), `api/clients/[id]/profile`, `api/clients/[id]/timeline`, `api/clients/[id]/technical-sheet` (PUT), `api/clients/[id]/consent` (POST), `api/clients/[id]/tags` (PUT), `api/clients/[id]/photos` (GET, POST), `api/clients/[id]/photos/[photoId]` (DELETE), `api/tags` (GET, POST), `api/tags/[id]` (PUT, DELETE), `api/waitlist` (GET, POST), `api/waitlist/[id]` (PUT), `api/waitlist/[id]/offer` (POST), `api/waitlist/[id]/booked` (POST), `api/dashboard/today` (GET), `api/business/crm-settings` (GET, PUT)
- Test: `frontend/src/lib/__tests__/whatsappLink.test.ts`

**Interfaces:**
- Produces os tipos espelho dos DTOs das Tasks 3–8 (`ClienteInsight`, `FasesDto`, `ClientProfileDto`, `TimelineEvento`, `FichaTecnicaDto`, `CampoFicha`, `Segmento`, `Etiqueta`, `FotoCliente`, `WaitlistItem`, `HojeDto`, `CrmSettings`) e as funções `buscarInsights(q)`, `buscarFases()`, `exportarClientesCsv()` (baixa o arquivo via `Blob` + link temporário), `buscarPerfil(id)`, `buscarTimeline(id, filtro)`, `salvarFichaTecnica(id, f)`, `registrarConsentimento(id, granted)`, `buscarCrmSettings()`, `salvarCrmSettings(s)`, `listarEtiquetas()`, `criarEtiqueta`, `atualizarEtiqueta`, `removerEtiqueta`, `definirEtiquetasCliente(id, tagIds)`, `listarFotos(id)`, `enviarFoto(id, arquivo: File, extra)` (lê como base64 no navegador, recusa > 5 MB antes de enviar), `removerFoto(id, fotoId)`, `listarEspera(q)`, `inscreverEspera(d)`, `atualizarEspera(id, d)`, `ofertarVaga(id, d)`, `marcarAgendada(id, appointmentId)`, `buscarHoje()`.
- `whatsappLink.ts`:
```ts
export const soDigitos = (s: string) => s.replace(/\D/g, '');
/** null quando não há telefone utilizável (menos de 10 dígitos). */
export function linkWhatsapp(telefone: string | null | undefined, mensagem: string): string | null;
export type TipoMensagem = 'retorno_vencido' | 'pos_atendimento' | 'mimo' | 'resgate' | 'resposta_avaliacao' | 'oferta_vaga';
export const MENSAGENS: Record<TipoMensagem, string>; // com {nome} {servico} {negocio} {data} {hora}
export function preencherMensagem(modelo: string, dados: Partial<Record<'nome' | 'servico' | 'negocio' | 'data' | 'hora', string>>): string; // marcador sem dado some com o espaço anterior
```
Textos de `MENSAGENS` (exatos):
- `retorno_vencido`: `Oi, {nome}! Já está na hora de renovar o seu {servico} aqui no {negocio}. Quer que eu veja um horário para você?`
- `pos_atendimento`: `Oi, {nome}! Obrigada por vir ao {negocio}. Como ficou o seu {servico}? Qualquer coisa, estou por aqui.`
- `mimo`: `Oi, {nome}! Você é especial para o {negocio} e preparamos um mimo para a sua próxima visita. Quer agendar?`
- `resgate`: `Oi, {nome}! Sentimos sua falta no {negocio}. Que tal marcar o seu {servico} esta semana?`
- `resposta_avaliacao`: `Oi, {nome}! Vi sua avaliação sobre o {negocio} e quero entender melhor o que aconteceu. Pode me contar?`
- `oferta_vaga`: `Olá, {nome}! Abriu um horário para {servico} no {negocio}: {data} às {hora}. Quer que eu reserve para você?`
- `technicalSheetTemplates.ts`: cópia exata de `backend/src/modules/crm/technicalSheetTemplates.ts` (mesmo conteúdo; comentário apontando o par).

- [ ] **Step 1: Teste** `whatsappLink.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { linkWhatsapp, preencherMensagem, MENSAGENS } from '@/lib/whatsappLink';

describe('linkWhatsapp', () => {
  it('normaliza telefone com máscara e acrescenta 55', () => {
    expect(linkWhatsapp('(83) 99999-0000', 'oi')).toBe('https://wa.me/5583999990000?text=oi');
  });
  it('não repete o 55', () => {
    expect(linkWhatsapp('+55 83 99999-0000', 'oi')).toBe('https://wa.me/5583999990000?text=oi');
  });
  it('codifica a mensagem', () => {
    expect(linkWhatsapp('83999990000', 'Oi, Ana! às 10:00')).toBe('https://wa.me/5583999990000?text=Oi%2C%20Ana!%20%C3%A0s%2010%3A00');
  });
  it('sem telefone utilizável devolve null', () => {
    expect(linkWhatsapp('', 'oi')).toBeNull();
    expect(linkWhatsapp(null, 'oi')).toBeNull();
    expect(linkWhatsapp('9999', 'oi')).toBeNull();
  });
});

describe('preencherMensagem', () => {
  it('troca os marcadores', () => {
    expect(preencherMensagem(MENSAGENS.resgate, { nome: 'Ana', negocio: 'Studio Aurora', servico: 'corte' }))
      .toBe('Oi, Ana! Sentimos sua falta no Studio Aurora. Que tal marcar o seu corte esta semana?');
  });
  it('marcador sem dado some sem deixar espaço duplo', () => {
    expect(preencherMensagem('Oi, {nome}! Seu {servico} ficou pronto.', { nome: 'Ana' })).toBe('Oi, Ana! Seu ficou pronto.');
  });
});
```
- [ ] **Step 2: Rodar e ver falhar.** · **Step 3: Implementar** libs e proxies. · **Step 4:** `npx vitest run src/lib/__tests__/whatsappLink.test.ts && npx tsc --noEmit` → PASS.
- [ ] **Step 5: Commit** — `feat(frontend): clientes de API do CRM, lista de espera e Hoje; link do WhatsApp`.

---

### Task 10: Tela Hoje com dados reais (desktop e celular)

**Files:**
- Modify: `frontend/src/app/dashboard/page.tsx`, `frontend/src/components/DashboardCards.tsx`, `frontend/src/components/dashboard/{SaudacaoDia,PainelPendencias,ProximasDuasHoras}.tsx`
- Create: `frontend/src/components/clientes/MensagemWhatsappModal.tsx` (usado também nas Tasks 11–13)
- Test: `frontend/src/components/dashboard/__tests__/Hoje.test.tsx` (e atualizar os testes existentes da pasta que dependiam de `conteudoDemo.hoje`)

**Interfaces:**
- Consumes: `buscarHoje()`, `HojeDto` (Task 9), `linkWhatsapp`, `MENSAGENS`, `preencherMensagem`.
- Produces: `MensagemWhatsappModal({ isOpen, onClose, telefone, nomeCliente, mensagemInicial })` — textarea editável com a mensagem; botão "Abrir conversa no WhatsApp" abre `linkWhatsapp(telefone, texto)` em nova aba (`window.open(url, '_blank', 'noopener')`) e fecha; sem telefone, o botão fica desabilitado com "Cadastre o telefone da cliente".

**Referência:** `575b48` (desktop) e `b808ac` (celular). A página atual já segue a marcação; troque a fonte de dados para `buscarHoje()` (uma chamada só) e:
1. Saudação: `saudacaoPorHora` + `ownerName` (não mais o nome do negócio); data por extenso.
2. "Disparos WhatsApp" → link para `/whatsapp`; "+ Novo agendamento" → `/agendamentos?novo=1`.
3. Cartões: Faturamento hoje (valor; barra e "Meta R$ X · N%" quando há meta; sem meta, link "Definir meta" para `/configuracoes`); Agendamentos hoje (total; "N horários livres à tarde" em `warning-text` quando > 0); Taxa de ocupação (`N%`; variação "+6% vs média de terça" com seta e cor `success-text`/`danger`; `ocupacao === null` → "Sem expediente hoje"); Confirmados por lembrete (valor do mês; legenda "N atendimentos com lembrete enviado no mês"; zero → "Nenhum atendimento com lembrete neste mês").
4. "Precisa de você" com contador "N pendências"; itens na ordem do DTO, cada um com seu texto e ação:
   - `vagas_tarde`: "N horários vagos à tarde" + "{inicio} com {profissional}" (até 3) → botão "Oferecer à lista de espera" abre o `ListaEsperaPanel` (Task 14) filtrado por `period='tarde'` e data de hoje. Até a Task 14 existir, o botão navega para `/agendamentos` (a Task 14 troca).
   - `retorno_vencido`: "N clientes com retorno vencido" → "Lembrar no WhatsApp" abre uma lista (dentro do próprio painel, expansível) com cada cliente e um botão que abre `MensagemWhatsappModal` com `MENSAGENS.retorno_vencido`.
   - `sinais_pix`: "N sinais Pix aguardando pagamento" + "Expira em X min (R$ Y pendentes)" → "Ver pendências" (`/agendamentos?aba=aguardando-pix` — confira o parâmetro que `AppointmentModule` usa para abrir a aba; se não houver, use a rota sem parâmetro).
   - `avaliacao`: "N avaliação desfavorável" + "Cliente {nome} · {data}" → "Ver e responder" abre `MensagemWhatsappModal` com `MENSAGENS.resposta_avaliacao` e mostra nota + comentário no topo do modal.
   - Sem pendências: estado vazio "Tudo em dia por aqui".
5. "Próximas 2 horas": `proximas` do DTO (o componente já existe; trocar a fonte e manter o filtro por profissional).
6. "Faturamento últimos 7 dias": `semana` do DTO.
7. Apagar todo uso de `conteudoDemo.hoje` (incluindo `profissionaisAtivasHoje`, a pendência fixa de vagas e os nomes de exemplo).

- [ ] **Step 1: Testes** `Hoje.test.tsx` (mockar `@/lib/hoje`):
```tsx
// casos (cada um um it com render da página/painel e asserts):
// 1. saudação usa ownerName ("Bom dia, Carla" com relógio às 09:00)
// 2. meta: "Meta R$ 1.800,00" e "81%"; sem meta mostra link "Definir meta"
// 3. ocupação null → "Sem expediente hoje"; variação +6 → "+6% vs média de terça"
// 4. pendências: só as recebidas, na ordem; contador "2 pendências"; vazio → "Tudo em dia por aqui"
// 5. "Ver e responder" abre o modal com a mensagem de resposta e o link do WhatsApp do telefone da avaliação
// 6. nenhum nome de exemplo (Camila, Bruna, Paula) aparece quando o DTO não traz
```
- [ ] **Step 2: Rodar e ver falhar.** · **Step 3: Implementar.** · **Step 4:** `npx vitest run src/components/dashboard src/__tests__/themeCompliance.test.ts && npx tsc --noEmit` → PASS (registrar `src/components/clientes` em `themedPaths.ts`).
- [ ] **Step 5: Commit** — `feat(hoje): tela Hoje com meta, ocupação, pendências e próximas horas reais`.

---

### Task 11: Clientes — lista (versão Ajustada)

**Files:**
- Create: `frontend/src/components/clientes/ListaClientes.tsx`
- Modify: `frontend/src/components/ClientModule.tsx` (vira o container: cabeçalho "Clientes", alternador Lista/Fases, "+ Nova cliente", modal de cadastro/edição existente `ClientFormModal`)
- Test: `frontend/src/components/clientes/__tests__/ListaClientes.test.tsx` (e atualizar `frontend/src/components/__tests__/ClientModule.test.tsx`)

**Referência:** `805f33`.

**Comportamento:**
- Busca (`placeholder="Buscar por nome, telefone ou e-mail"`, com espera de 300 ms), ordenação ("Última visita (mais recente)", "Nome", "Maior LTV", "Retorno vencido"), "Exportar" (`exportarClientesCsv()`), abas "Todas N · Novo N · Recorrente N · Fiel N · Em risco N · Perdido N" (de `contagemPorFase`), selects "Etiquetas (todas)" e "Profissional (todas)".
- Tabela: Cliente (avatar com iniciais, nome, telefone formatado, etiquetas manuais com a cor do token e automáticas em `muted`), Fase CRM (chip com ponto na cor da fase: novo `tertiary`, recorrente `success`, fiel `brand`, em risco `warning`, perdido `danger`), Última visita ("17 set (há 0 dias)" + "serviço · profissional"), Ciclo médio ("21 dias" ou "1ª visita" + legenda), Retorno previsto (texto do DTO; vencido em `danger` com ícone `warning`), LTV acumulado (valor + "N atendimentos"), Ações rápidas (WhatsApp → `MensagemWhatsappModal` com `MENSAGENS.retorno_vencido` se vencido, senão `pos_atendimento`; agendar → `/agendamentos?novo=1&cliente=<id>`; menu "Editar", "Etiquetas", "Ver ficha").
- Linha clicável abre `/clientes/<id>` (Task 13).
- Paginação "Mostrando 1–10 de N clientes" + Anterior/números/Próxima.
- Estados: carregando (Skeleton), vazio sem clientes ("Nenhuma cliente cadastrada" + "+ Nova cliente"), vazio por filtro ("Nenhuma cliente encontrada com esses filtros").
- Some do arquivo o uso de `conteudoDemo.clientes.exemplos`, `exemploParaIndice` e `calcularRetornoPrevisto`.

- [ ] **Step 1: Testes** (mockar `@/lib/crm`): abas com contagem; clicar aba "Em risco" chama `buscarInsights` com `fase: 'em_risco'`; busca com espera; ordem "Maior LTV" → `ordem: 'ltv'`; "Exportar" chama `exportarClientesCsv`; retorno vencido aparece em `danger`; botão WhatsApp desabilitado para cliente sem telefone; paginação pede `page: 2`; clicar na linha navega para `/clientes/<id>` (mock de `next/navigation`).
- [ ] **Step 2–4:** ver falhar, implementar, rodar `src/components/clientes src/components/__tests__/ClientModule.test.tsx src/__tests__/themeCompliance.test.ts` + `tsc` → PASS.
- [ ] **Step 5: Commit** — `feat(clientes): lista do CRM com fases, etiquetas, filtros e exportação`.

---

### Task 12: Clientes — visão por fases

**Files:**
- Create: `frontend/src/components/clientes/FasesClientes.tsx`
- Modify: `frontend/src/components/ClientModule.tsx` (alternador mostra Lista ou Fases)
- Test: `frontend/src/components/clientes/__tests__/FasesClientes.test.tsx`

**Referência:** `19ad17`.

**Comportamento:** três KPIs (Total de clientes ativas + "+N este mês"; LTV médio da carteira; Taxa de retenção, `null` → "—"); cinco colunas (Novo, Recorrente, Fiel / VIP, Em risco, Perdido) com contagem, "N clientes · R$ X" e frase fixa por fase ("Primeira visita nos últimos 30 dias", "2 a 4 atendimentos com ciclo regular", "5 ou mais atendimentos com ciclo regular", "Passou do ciclo de retorno", "Mais de 120 dias sem visita"); cartão com nome, telefone, etiqueta de ciclo ("Ciclo 21d"), último serviço · profissional, ticket/LTV e o botão da fase:
- Novo → "Pós-atendimento WhatsApp" (`pos_atendimento`)
- Recorrente → "Agendar retorno" (`/agendamentos?novo=1&cliente=<id>`)
- Fiel → "Enviar mimo no WhatsApp" (`mimo`)
- Em risco → "Resgatar no WhatsApp" (`resgate`)
- Perdido → "Campanha de resgate" (`resgate`)
No celular as colunas rolam na horizontal (`overflow-x-auto snap-x`). Coluna vazia: "Nenhuma cliente nesta fase".

- [ ] **Step 1: Testes** (mockar `@/lib/crm`): cinco colunas na ordem com contagem; botão de cada fase com o texto acima; WhatsApp abre o modal com a mensagem da fase; retenção `null` mostra "—"; coluna vazia mostra a frase.
- [ ] **Step 2–4:** ver falhar, implementar, rodar + `tsc` → PASS.
- [ ] **Step 5: Commit** — `feat(clientes): visão por fases do CRM`.

---

### Task 13: Ficha da cliente (página, versão Ajustada, e celular)

**Files:**
- Create: `frontend/src/app/dashboard/clientes/[id]/page.tsx`, `frontend/src/components/clientes/FichaCliente.tsx`, `FichaTecnica.tsx`, `GaleriaCliente.tsx`, `LinhaDoTempoCliente.tsx`
- Modify: `frontend/src/lib/themedPaths.ts` (registrar `src/app/dashboard/clientes`), confira em `frontend/src/middleware.ts` / `next.config` como `/clientes` é reescrito para `/dashboard/clientes` e garanta que `/clientes/<id>` também funciona
- Delete (no fim da task): `frontend/src/components/clients/ClientDetailPanel.tsx` e seu teste, se nada mais o usar
- Test: `frontend/src/components/clientes/__tests__/FichaCliente.test.tsx`

**Referência:** `96f71e` (desktop) e `e3b0b0` (celular).

**Comportamento:**
1. Breadcrumb "Clientes › {nome}"; avatar; nome; chips: fase, etiquetas manuais e automáticas; botões "Conversar no WhatsApp" (`MensagemWhatsappModal`, mensagem `pos_atendimento`) e "Novo agendamento" (`/agendamentos?novo=1&cliente=<id>`); menu com "Editar cadastro" (abre `ClientFormModal`) e "Etiquetas" (seleção múltipla → `definirEtiquetasCliente`).
2. Faixa LGPD: consentido → "Consentimento ativo para WhatsApp e lembretes" + "Autorizado em {data} · {canal}" (canal: Painel / Página pública / WhatsApp) + link "Revogar"; revogado → "Consentimento revogado em {data}" + "Registrar novo consentimento"; não informado → "Consentimento não informado" + botão "Registrar consentimento" (confirmação curta: "A cliente autorizou receber mensagens e lembretes pelo WhatsApp?" → `registrarConsentimento(id, true)`).
3. Quatro indicadores: "Ciclo médio de retorno" ({n} dias / "—"), "Ticket médio" (R$), "Frequência presencial" ("{n} visitas em {ano}"), "Faltas / cancelamentos" ({n}).
4. Ficha técnica — título "Ficha técnica — {rótulo do segmento}"; caixa "Alergias e restrições" em destaque `warning` (vazia: "Nenhuma alergia registrada"); campos do modelo (opções como select, texto como input) e campos livres (adicionar/remover rótulo + valor, até 20); "Atualizar ficha técnica" salva (`salvarFichaTecnica`) e mostra "Atualizada em {data} por {nome}".
5. Galeria de procedimentos: grade de fotos (link assinado), legenda e data; "+ Anexar foto" (input file `accept="image/jpeg,image/png,image/webp"`, recusa > 5 MB com toast "A foto precisa ter até 5MB"; legenda opcional; vincular a um atendimento concluído opcional) → `enviarFoto`; remover com confirmação. Imagem que falhar ao carregar (link expirado) recarrega a lista uma vez. Vazio: "Nenhuma foto ainda".
6. Linha do tempo: abas "Todos", "Agendamentos", "Financeiro" → `buscarTimeline(id, filtro)`; cada evento com ícone por tipo (agendado `event`, concluido `check_circle`, faltou `person_off`, cancelado `cancel`, lembrete `chat`, avaliacao `star`, sinal_pix `qr_code_2`, cadastro `person_add`), data, título, descrição e valor quando houver; avaliação mostra as estrelas.
7. Celular (`e3b0b0`): a mesma página em coluna única, com indicadores 2×2 e seções recolhíveis (ficha técnica, galeria, linha do tempo).
8. Cliente inexistente/outro negócio (404) → estado "Cliente não encontrada" com link para voltar à lista.

- [ ] **Step 1: Testes** (mockar `@/lib/crm`, `@/lib/clientPhotos`, `@/lib/tags`, `next/navigation`): indicadores reais; consentimento nos três estados com o botão certo; registrar consentimento chama a API; ficha técnica do segmento `unhas` mostra "Formato preferido" como select e salva só chaves do modelo; campo livre adicionado vai em `customFields`; foto > 5 MB não chama `enviarFoto` e mostra o toast; abas da linha do tempo chamam o filtro; 404 mostra "Cliente não encontrada"; "Assinante Clube" nunca aparece.
- [ ] **Step 2–4:** ver falhar, implementar, rodar `src/components/clientes src/__tests__/themeCompliance.test.ts` + `tsc` → PASS.
- [ ] **Step 5: Commit** — `feat(clientes): ficha da cliente com ficha técnica, galeria privada, consentimento e linha do tempo`.

---

### Task 14: Lista de espera, Ajustes do CRM e consentimento na página pública

**Files:**
- Create: `frontend/src/components/waitlist/ListaEsperaPanel.tsx`, `frontend/src/components/settings/CrmSettingsSection.tsx`, `frontend/src/components/settings/EtiquetasSection.tsx`
- Modify: `frontend/src/components/AppointmentModule.tsx` (botão "Lista de espera" no cabeçalho da Agenda que abre o painel), `frontend/src/app/dashboard/page.tsx`/`PainelPendencias.tsx` (botão "Oferecer à lista de espera" abre o painel filtrado), `frontend/src/components/SettingsModule.tsx` (renderiza as duas seções novas), `frontend/src/components/publicBooking/*` (passo de confirmação dos dados da cliente) e `frontend/src/lib/publicBooking.ts` (enviar `whatsappConsent`), `frontend/src/lib/themedPaths.ts` (`src/components/waitlist`)
- Test: `frontend/src/components/waitlist/__tests__/ListaEsperaPanel.test.tsx`, `frontend/src/components/settings/__tests__/CrmSettings.test.tsx`, teste novo no fluxo público (`frontend/src/components/publicBooking/__tests__/PublicBookingFlow.test.tsx`)

**Comportamento:**
- `ListaEsperaPanel({ aberto, onFechar, filtroInicial?: { period?, date? } })` — `SidePanel`; lista (cliente, serviço, profissional ou "Qualquer profissional", data ou "Qualquer dia", período, observação, status); "+ Inscrever" (cliente com busca, serviço, profissional opcional, data opcional, período, observação → `inscreverEspera`); por item: "Oferecer vaga" (pede data e hora — prefilled com a vaga clicada quando vier da Hoje — chama `ofertarVaga` e abre o `whatsappUrl` devolvido em nova aba), "Agendar" (abre o `CreateAppointmentModal` com `inicial` = cliente, serviço, profissional e data; ao salvar, chama `marcarAgendada` com o id criado — para isso `AppointmentModule.handleSubmit` precisa devolver o agendamento criado; ajuste o retorno), "Cancelar". Vazio: "Ninguém na lista de espera".
- `CrmSettingsSection` em Ajustes: "Segmento do negócio" (select com os rótulos de `SEGMENTOS`; texto de ajuda "Define os campos sugeridos da ficha técnica") e "Meta de faturamento diária" (valor via `parseValorBR`; vazio remove a meta); "Salvar" → `salvarCrmSettings`.
- `EtiquetasSection`: lista com nome, cor e "N clientes"; criar/renomear/mudar cor (6 tokens) /apagar (confirmação "Remover a etiqueta de todas as clientes?"); 409 → toast "Já existe uma etiqueta com esse nome".
- Página pública: no passo dos dados da cliente, checkbox **desmarcado** "Quero receber lembretes e novidades pelo WhatsApp de {negócio}" com o texto "Você pode cancelar quando quiser respondendo SAIR."; o valor vai em `whatsappConsent`.

- [ ] **Step 1: Testes**: painel lista, inscreve, oferta abre `window.open` com a URL da API, agendar chama `marcarAgendada` com o id; ajustes salvam segmento e meta (`1.800` → 1800; vazio → null); etiqueta duplicada mostra o toast; na página pública a caixa começa **desmarcada** e, marcada, a reserva é enviada com `whatsappConsent: true`.
- [ ] **Step 2–4:** ver falhar, implementar, rodar os arquivos + `src/components/appointments src/components/__tests__/AppointmentModule.test.tsx src/__tests__/themeCompliance.test.ts` + `tsc` → PASS.
- [ ] **Step 5: Commit** — `feat(crm): lista de espera, segmento, meta, etiquetas e consentimento na página pública`.

---

### Task 15: Limpeza, documentação e verificação final

**Files:**
- Modify: `frontend/src/lib/conteudoDemo.ts` (remover `hoje` e `clientes` e seus tipos), `frontend/src/lib/__tests__/conteudoDemo.test.ts`, `docs/design/SEGUIMENTO.md`

- [ ] **Step 1:** Apagar `HojeContent`, `HojePendencia`, `ClientesContent`, `ClienteExemplo` e afins + as chaves `hoje`/`clientes`. `npx tsc --noEmit` aponta qualquer uso restante — trocar por dado real (Tasks 10–13) ou apagar. Após isso o módulo só tem `whatsapp` e `plano`.
- [ ] **Step 2:** Atualizar o teste de `conteudoDemo` para as duas chaves restantes.
- [ ] **Step 3:** `SEGUIMENTO.md`: remover os itens resolvidos (nomes de exemplo da equipe na Hoje; `ownerName` fora da sessão; blocos de `conteudoDemo` em Clientes); acrescentar em "O que a migração deixou pronto" a linha do 2B (Hoje e CRM reais, ficha técnica por segmento, fotos privadas, consentimento LGPD, etiquetas, lista de espera); em "Decisões", registrar que "Receita recuperada via lembretes" virou "Confirmados por lembrete" (definição honesta, sem atribuição de causa).
- [ ] **Step 4: Verificação completa**
```bash
cd backend && npx tsc --noEmit && npx vitest run
cd ../frontend && npx tsc --noEmit && npx vitest run && npx next build
```
Testes que estourarem 5 s na suíte cheia: reexecutar sozinhos antes de tratar como falha.
- [ ] **Step 5: Commit** — `chore(2B): remove conteúdo de exemplo da Hoje e de Clientes; atualiza seguimento`.
- [ ] **Step 6 (controller, com o dono):** aplicar `20261014120000_hoje_clientes` no banco do `backend/.env` (o host direto do Supabase não responde desta rede: usar o pooler de sessão `:5432` como `DIRECT_URL`, como no 2A) e rodar o app para conferência lado a lado com o Stitch.
