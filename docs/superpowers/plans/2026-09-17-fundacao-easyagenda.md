# Fundação EasyAgenda+ — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Renomear o produto de EasyBarber para EasyAgenda+, trocar os nomes internos de barbearia por nomes neutros no banco, no código e na API, tirar funcionalidades falsas e deixar o CI barrando regressão.

**Architecture:** Seis fatias em sequência. Primeiro a rede de segurança (testes verdes e CI obrigatório), depois a higiene funcional, depois a migration que renomeia o banco, depois a renomeação mecânica do backend e do frontend por script, e por fim marca, textos e verificação. Nenhuma rota antiga é mantida em paralelo: o único consumidor da API é o frontend deste repositório, que muda junto.

**Tech Stack:** Node 20, Express 4, TypeScript, Prisma 5, PostgreSQL (Supabase), Vitest, Next.js 15 (App Router), Tailwind, Docker (só para o Postgres local de verificação).

**Spec:** `docs/superpowers/specs/2026-09-17-fundacao-easyagenda-design.md`

## Global Constraints

- Nome do produto: **EasyAgenda+**. O `+` aparece só em texto visível ao usuário. Identificadores, pacotes, prefixos e chaves usam `easyagenda` ou `EasyAgenda`, sem `+`.
- Todo texto de interface, de e-mail e do bot em português do Brasil.
- Mapa de nomes obrigatório: `barbershops`→`businesses`, `Barbershop`→`Business`, `barbers`→`professionals`, `Barber`→`Professional`, `barbershop_id`→`business_id`, `barber_id`→`professional_id`, `barbershop_settings`→`business_settings`, `actor_barbershop_id`→`actor_business_id`, `target_barbershop_id`→`target_business_id`, `barbershop_name`→`business_name`, `current_barbershop_id()`→`current_business_id()`, bucket `barber-photos`→`professional-photos`.
- Termos em português: "barbearia" vira "negócio", "barbeiro(a)" vira "profissional". Variáveis de mensagem: `{nome_barbearia}`→`{nome_negocio}`, `{barbeiro}`→`{profissional}`.
- **O endereço do backend no Render continua `https://easybarber-backend.onrender.com`.** Esse endereço não é renomeado por script nem à mão: o serviço do Render mantém o subdomínio criado. Ele passa a ser lido da variável `BACKEND_ORIGIN`.
- Sem compatibilidade com dados antigos: não existem rotas antigas em paralelo, nem migração de chaves do navegador. Produção só tem contas de teste do dono.
- Sem funcionalidade nova. Segmentos, vocabulário por segmento, visual novo e textos de venda são de outros sub-projetos.
- Nenhuma tarefa fecha com teste vermelho. Cada tarefa termina em um commit próprio.
- Comandos são para Git Bash, a partir da raiz do repositório. Backend e frontend rodam em subshell: `(cd backend && npm test)`.
- Trabalhe no branch `feat/fundacao-easyagenda`, criado a partir de `main`.

**Estado inicial conhecido:** `tsc --noEmit` passa no backend; a suíte tem 423 testes, com 420 passando, 1 pulado e 2 falhando (os 2 são corrigidos na Tarefa 1).

---

### Task 0: Preparar o branch

**Files:**
- Nenhum arquivo alterado.

- [ ] **Step 1: Criar o branch de trabalho**

```bash
git checkout main
git pull --ff-only
git checkout -b feat/fundacao-easyagenda
```

- [ ] **Step 2: Confirmar o ponto de partida**

Run: `(cd backend && npm ci && npx tsc --noEmit && npx vitest run 2>&1 | tail -5)`
Expected: typecheck sem erro; `Tests 2 failed | 420 passed | 1 skipped (423)`.

---

## Fatia 1 — Rede de segurança

### Task 1: Corrigir os dois testes desatualizados

Os dois testes estão errados, o código está certo:

1. `auth.test.ts` espera `plan: 'basico'` no cadastro, mas o commit `84ce751` ("replace plan-gated signup with 14-day free trial on Profissional") passou a criar o cadastro com `TRIAL_PLAN = 'profissional'` (`backend/src/services/authService.ts:173,403`). O teste ficou para trás.
2. `asaasService.test.ts` usa `nextDueDate: '2026-06-30'`, uma data no passado. O código protege contra isso: `resolvePixDueDate` (`backend/src/integrations/asaas/service.ts:494-499`) empurra vencimento vencido para hoje, e `createPixSubscription` passou a mandar `externalReference` (`service.ts:1386`). O teste quebra sozinho com o passar do tempo.

**Files:**
- Test: `backend/src/__tests__/auth.test.ts:211`
- Test: `backend/src/__tests__/asaasService.test.ts:294-329`

- [ ] **Step 1: Rodar os dois testes e ver as falhas**

Run: `(cd backend && npx vitest run src/__tests__/auth.test.ts src/__tests__/asaasService.test.ts 2>&1 | tail -30)`
Expected: FAIL nos dois, com `expected 'profissional' to be 'basico'` e `expected 2nd "spy" call to have been called with [ '/payments', …(1) ]`.

- [ ] **Step 2: Corrigir a expectativa do plano no cadastro**

Em `backend/src/__tests__/auth.test.ts`, trocar a linha 211:

```ts
      expect(res.body.data.barbershop.plan).toBe('profissional');
```

- [ ] **Step 3: Corrigir o teste de Pix para não depender da data de hoje**

Em `backend/src/__tests__/asaasService.test.ts`, no teste `keeps Pix flow creating charge after customer creation succeeds`, usar uma data futura fixa e esperar o `externalReference`:

```ts
    mockAsaasClient.post
      .mockResolvedValueOnce({ id: 'cus_pix_1' })
      .mockResolvedValueOnce({
        id: 'pay_pix_1',
        status: 'PENDING',
        dueDate: '2099-06-30',
        value: 99.9,
        customer: 'cus_pix_1',
      });

    const result = await asaasService.createPixSubscription({
      barbershop: {
        id: 'tenant-asaas-3',
        owner_name: 'Joao da Silva',
        email: 'tenant-premium@easybarber.local',
        cpf_cnpj: '12.345.678/0001-95',
        whatsapp: '+55 (83) 99999-9999',
      },
      plan: 'profissional',
      nextDueDate: '2099-06-30',
      idempotencyKey: 'pix-checkout:test-2',
    });
```

E a segunda asserção de chamada:

```ts
    expect(mockAsaasClient.post).toHaveBeenNthCalledWith(
      2,
      '/payments',
      {
        customer: 'cus_pix_1',
        billingType: 'PIX',
        value: 99.9,
        dueDate: '2099-06-30',
        externalReference: 'barbershop:tenant-asaas-3:plan:profissional',
      }
    );
```

Manter `expect(mockAsaasClient.post).toHaveBeenCalledTimes(2)` e o `expect(result).toEqual(...)` como estão. O texto `barbershop:` e o e-mail de exemplo são trocados pelo script da Tarefa 8; aqui eles ficam como estão.

- [ ] **Step 4: Rodar a suíte inteira**

Run: `(cd backend && npx vitest run 2>&1 | tail -5)`
Expected: `Tests 422 passed | 1 skipped (423)`, nenhum falhando.

- [ ] **Step 5: Commit**

```bash
git add backend/src/__tests__/auth.test.ts backend/src/__tests__/asaasService.test.ts
git commit -m "test: fix stale expectations for trial plan and pix due date"
```

---

### Task 2: CI obrigatório com typecheck e testes

Hoje o job do backend roda `npx eslint src/ --ext .js || true`: procura arquivos `.js` num projeto TypeScript e engole qualquer erro. O projeto não tem configuração de ESLint no backend, então o passo é substituído, não consertado.

**Files:**
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Confirmar que os comandos passam localmente**

Run: `(cd backend && npm run typecheck && npm test 2>&1 | tail -5)`
Expected: sem erro de typecheck e `422 passed | 1 skipped`.

- [ ] **Step 2: Reescrever o job do backend**

Substituir o job `backend-lint` inteiro por:

```yaml
  backend-checks:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: backend
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
      - run: npm run typecheck
      - run: npm test
```

E atualizar a dependência do job de docker:

```yaml
    needs: [backend-checks, frontend-build]
```

- [ ] **Step 3: Conferir o arquivo**

Run: `cat .github/workflows/ci.yml | grep -n "backend-checks\|typecheck\|npm test\|needs:"`
Expected: o job novo aparece, `|| true` não aparece em lugar nenhum.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: run backend typecheck and tests instead of no-op lint"
```

---

### Task 3: Remover as rotas de diagnóstico

O próprio arquivo diz "Rota temporária de diagnóstico. Remover após resolver integração Asaas." (`backend/src/routes/debug.ts:129`). No frontend, `/debug/supabase` expõe diagnóstico de configuração sem exigir sessão. As funções `getSupabaseClientDiagnostics` e `getSupabaseAnonKeySafeDiagnostics` continuam, porque são usadas por `ForgotPasswordView.tsx` e por `lib/supabase/browserClient.ts`.

**Files:**
- Delete: `backend/src/routes/debug.ts`
- Delete: `frontend/src/app/debug/supabase/page.tsx` (e a pasta `frontend/src/app/debug`)
- Modify: `backend/src/server.ts:79` (import) e `backend/src/server.ts:454-459` (dois `app.use`)
- Modify: `backend/.env.example` (linha do `DEBUG_TOKEN`)

- [ ] **Step 1: Confirmar que nada mais importa essas rotas**

Run: `grep -rn "routes/debug\|DEBUG_TOKEN\|debug/supabase" --exclude-dir=node_modules --exclude-dir=.next backend frontend`
Expected: só as ocorrências listadas acima (`server.ts`, o próprio `debug.ts`, `.env.example`, e a página).

- [ ] **Step 2: Apagar os arquivos**

```bash
git rm backend/src/routes/debug.ts
git rm -r frontend/src/app/debug
```

- [ ] **Step 3: Remover o import e as montagens em `backend/src/server.ts`**

Apagar a linha:

```ts
import debugRoutes from './routes/debug.js';
```

E apagar os dois blocos de montagem:

```ts
app.use(
  `${API_V1}/debug`,
  debugRoutes
);

app.use('/debug', debugRoutes);
```

- [ ] **Step 4: Remover `DEBUG_TOKEN` de `backend/.env.example`**

Apagar a linha que declara `DEBUG_TOKEN` e o comentário logo acima dela, se houver.

- [ ] **Step 5: Verificar**

Run: `(cd backend && npm run typecheck && npm test 2>&1 | tail -5)`
Expected: typecheck limpo, `422 passed | 1 skipped`.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: remove temporary asaas and supabase debug routes"
```

---

## Fatia 2 — Higiene

### Task 4: Lembrete respeita a configuração do negócio

A tela de Ajustes tem "Enviar lembretes por WhatsApp", que grava `whatsapp_reminders`, mas `cronService` nunca lê esse campo: manda para todo mundo. Para testar isso, o corpo do job sai de dentro do `cron.schedule` e vira uma função exportada.

**Files:**
- Modify: `backend/src/services/cronService.ts:39-100`
- Test: `backend/src/__tests__/reminderCron.test.ts` (criar)

**Interfaces:**
- Consumes: `barbershopSettingsRepository.findByBarbershopId(barbershopId: unknown)` de `backend/src/repositories/barbershopSettingsRepository.ts`, que devolve `{ whatsappReminders: boolean, ... }` ou `null`.
- Produces: `runReminderJob(now?: Date): Promise<void>`, exportada por `backend/src/services/cronService.ts`. `startReminderCron()` continua exportada e passa a só agendar `runReminderJob`.

- [ ] **Step 1: Escrever o teste que falha**

Criar `backend/src/__tests__/reminderCron.test.ts`:

```ts
import { vi, describe, it, expect, beforeEach } from 'vitest';

const mockFindMany = vi.hoisted(() => vi.fn());
const mockUpdate = vi.hoisted(() => vi.fn());
const mockBotConfigFindFirst = vi.hoisted(() => vi.fn());
const mockSendWhatsAppMessage = vi.hoisted(() => vi.fn());
const mockFindSettings = vi.hoisted(() => vi.fn());

vi.mock('../config/prisma.js', () => ({
  prisma: {
    appointment: { findMany: mockFindMany, update: mockUpdate },
    whatsappBotConfig: { findFirst: mockBotConfigFindFirst },
    $executeRaw: vi.fn().mockResolvedValue(0),
  },
}));

vi.mock('../utils/logger.js', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), fatal: vi.fn() },
}));

vi.mock('../services/whatsapp/index.js', () => ({
  sendWhatsAppMessage: mockSendWhatsAppMessage,
}));

vi.mock('../repositories/barbershopSettingsRepository.js', () => ({
  barbershopSettingsRepository: { findByBarbershopId: mockFindSettings },
}));

vi.mock('../repositories/subscriptionRepository.js', () => ({
  subscriptionRepository: { expireOneTimeSubscriptions: vi.fn() },
}));

const { runReminderJob } = await import('../services/cronService.js');

const appointment = {
  id: 'appointment-1',
  barbershopId: 'tenant-1',
  time: new Date('1970-01-01T14:00:00.000Z'),
  client: { phone: '5583999990000', name: 'Mariana' },
  service: { name: 'Manutenção' },
  barber: { name: 'Paula' },
};

describe('runReminderJob', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFindMany.mockResolvedValue([appointment]);
    mockBotConfigFindFirst.mockResolvedValue(null);
    mockSendWhatsAppMessage.mockResolvedValue(true);
    mockUpdate.mockResolvedValue({});
  });

  it('envia o lembrete quando o negócio mantém lembretes por WhatsApp ligados', async () => {
    mockFindSettings.mockResolvedValue({ whatsappReminders: true });

    await runReminderJob(new Date('2026-09-17T12:00:00.000Z'));

    expect(mockSendWhatsAppMessage).toHaveBeenCalledTimes(1);
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: 'appointment-1' },
      data: { reminderSent: true },
    });
  });

  it('não envia nada quando o negócio desligou os lembretes por WhatsApp', async () => {
    mockFindSettings.mockResolvedValue({ whatsappReminders: false });

    await runReminderJob(new Date('2026-09-17T12:00:00.000Z'));

    expect(mockSendWhatsAppMessage).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('consulta a configuração uma vez por negócio', async () => {
    mockFindSettings.mockResolvedValue({ whatsappReminders: true });
    mockFindMany.mockResolvedValue([appointment, { ...appointment, id: 'appointment-2' }]);

    await runReminderJob(new Date('2026-09-17T12:00:00.000Z'));

    expect(mockFindSettings).toHaveBeenCalledTimes(1);
    expect(mockSendWhatsAppMessage).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Rodar o teste e ver falhar**

Run: `(cd backend && npx vitest run src/__tests__/reminderCron.test.ts 2>&1 | tail -20)`
Expected: FAIL, porque `runReminderJob` ainda não é exportada por `cronService.ts`.

- [ ] **Step 3: Extrair o job e passar a respeitar a configuração**

Em `backend/src/services/cronService.ts`, adicionar o import do repositório junto aos outros:

```ts
import { barbershopSettingsRepository } from '../repositories/barbershopSettingsRepository.js';
```

Trocar o corpo do primeiro `cron.schedule` por uma função exportada, e deixar o agendamento só chamando ela:

```ts
export const runReminderJob = async (now: Date = new Date()): Promise<void> => {
  try {
    logger.debug('Verificando lembretes...');

    const twoHoursFromNow = new Date(now.getTime() + 2 * 60 * 60 * 1000);

    const targetClock = clockInTz(twoHoursFromNow, REMINDER_TIMEZONE);
    const targetDate = new Date(dateInTz(twoHoursFromNow, REMINDER_TIMEZONE));
    const targetTimeDate = new Date(`1970-01-01T${targetClock}:00`);
    const targetTimePlus10 = new Date(targetTimeDate.getTime() + 10 * 60 * 1000);

    const appointments = await prisma.appointment.findMany({
      where: {
        date: targetDate,
        time: {
          gte: targetTimeDate,
          lte: targetTimePlus10,
        },
        status: 'confirmado',
        reminderSent: false,
      },
      include: {
        client: { select: { phone: true, name: true } },
        service: { select: { name: true } },
        barber: { select: { name: true } },
      },
    });

    // Uma consulta de configuração por negócio, não por agendamento.
    const remindersEnabledByBarbershop = new Map<string, boolean>();

    const remindersEnabled = async (barbershopId: string): Promise<boolean> => {
      const cached = remindersEnabledByBarbershop.get(barbershopId);
      if (cached !== undefined) return cached;

      const settings = await barbershopSettingsRepository.findByBarbershopId(barbershopId);
      const enabled = settings ? (settings as { whatsappReminders?: unknown }).whatsappReminders !== false : true;

      remindersEnabledByBarbershop.set(barbershopId, enabled);
      return enabled;
    };

    for (const appointment of appointments) {
      if (!(await remindersEnabled(appointment.barbershopId))) {
        logger.debug({ barbershopId: appointment.barbershopId }, 'Lembretes por WhatsApp desligados; pulando');
        continue;
      }

      const config = await prisma.whatsappBotConfig.findFirst({
        where: { barbershopId: appointment.barbershopId },
        select: { reminderMessage: true },
      });

      let template =
        '⏰ Lembrete!\n\nOlá {nome_cliente}!\n\nSeu horário é daqui a 2 horas:\n📋 {servico}\n👤 Profissional: {barbeiro}\n⏰ {horario}\n\nTe esperamos!';

      if (config?.reminderMessage) template = config.reminderMessage;

      const timeStr = appointment.time.toISOString().substring(11, 16);
      const message = template
        .replace(/{nome_cliente}/g, appointment.client.name)
        .replace(/{servico}/g, appointment.service.name)
        .replace(/{barbeiro}/g, appointment.barber.name)
        .replace(/{horario}/g, timeStr);

      const sent = await sendWhatsAppMessage(appointment.client.phone, message, {
        barbershopId: appointment.barbershopId,
      });

      if (sent) {
        await prisma.appointment.update({
          where: { id: appointment.id },
          data: { reminderSent: true },
        });
        logger.info({ phone: appointment.client.phone }, 'Lembrete enviado');
      }
    }
  } catch (error) {
    logger.error({ err: error }, 'Erro ao enviar lembretes');
  }
};

export const startReminderCron = (): void => {
  cron.schedule('*/10 * * * *', () => {
    void runReminderJob();
  });
```

Os outros dois `cron.schedule` (expiração de assinatura one-time e de trial) continuam como estão, dentro de `startReminderCron`.

- [ ] **Step 4: Rodar o teste e ver passar**

Run: `(cd backend && npx vitest run src/__tests__/reminderCron.test.ts 2>&1 | tail -10)`
Expected: 3 testes passando.

- [ ] **Step 5: Rodar a suíte inteira e o typecheck**

Run: `(cd backend && npm run typecheck && npm test 2>&1 | tail -5)`
Expected: typecheck limpo, `425 passed | 1 skipped (426)`.

- [ ] **Step 6: Commit**

```bash
git add backend/src/services/cronService.ts backend/src/__tests__/reminderCron.test.ts
git commit -m "fix(reminders): skip whatsapp reminders when the business turned them off"
```

---

### Task 5: Prazo de teste grátis unificado em 14 dias

Hoje há três valores diferentes: o cadastro cria `NOW() + INTERVAL '14 days'` (`backend/src/repositories/authRepository.ts:502`), o Stripe usa `RECURRING_TRIAL_DAYS = 7` (`backend/src/services/stripeCheckoutService.ts:4`) e a página de planos mostra `trialDays: 7` (`frontend/src/lib/plans.ts`). O valor único é **14**.

**Files:**
- Create: `backend/src/config/trial.ts`
- Modify: `backend/src/services/stripeCheckoutService.ts:4`
- Modify: `backend/src/repositories/authRepository.ts:502`
- Modify: `frontend/src/lib/plans.ts` (três ocorrências de `trialDays`)
- Test: `backend/src/__tests__/trialDays.test.ts` (criar)

**Interfaces:**
- Produces: `TRIAL_DAYS: number` exportado por `backend/src/config/trial.ts`.

- [ ] **Step 1: Escrever o teste que falha**

Criar `backend/src/__tests__/trialDays.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { TRIAL_DAYS } from '../config/trial.js';
import { RECURRING_TRIAL_DAYS } from '../services/stripeCheckoutService.js';

describe('prazo do teste grátis', () => {
  it('é de 14 dias', () => {
    expect(TRIAL_DAYS).toBe(14);
  });

  it('o checkout recorrente usa o mesmo prazo', () => {
    expect(RECURRING_TRIAL_DAYS).toBe(TRIAL_DAYS);
  });
});
```

- [ ] **Step 2: Rodar o teste e ver falhar**

Run: `(cd backend && npx vitest run src/__tests__/trialDays.test.ts 2>&1 | tail -10)`
Expected: FAIL, porque `../config/trial.js` não existe.

- [ ] **Step 3: Criar a constante e usar nos dois lugares do backend**

Criar `backend/src/config/trial.ts`:

```ts
// Prazo do teste grátis, em dias. Fonte única: cadastro, checkout e página de planos.
export const TRIAL_DAYS = 14;
```

Em `backend/src/services/stripeCheckoutService.ts`, trocar a constante local pelo reexport:

```ts
import { TRIAL_DAYS } from '../config/trial.js';

export const RECURRING_TRIAL_DAYS = TRIAL_DAYS;
```

Em `backend/src/repositories/authRepository.ts:502`, trocar o intervalo fixo por parâmetro. Adicionar o import no topo do arquivo:

```ts
import { TRIAL_DAYS } from '../config/trial.js';
```

E na query, trocar `NOW() + INTERVAL '14 days'` por:

```ts
        NOW() + (${TRIAL_DAYS} || ' days')::interval
```

- [ ] **Step 4: Rodar o teste e a suíte**

Run: `(cd backend && npx vitest run src/__tests__/trialDays.test.ts 2>&1 | tail -5 && npm run typecheck && npm test 2>&1 | tail -5)`
Expected: os 2 testes novos passam, typecheck limpo, suíte verde.

- [ ] **Step 5: Ajustar a página de planos no frontend**

Em `frontend/src/lib/plans.ts`, trocar as três ocorrências de `trialDays: 7,` por `trialDays: 14,`.

- [ ] **Step 6: Procurar "7 dias" escrito à mão no frontend**

Run: `grep -rn "7 dias\|sete dias" --exclude-dir=node_modules --exclude-dir=.next frontend/src backend/src`
Expected: nenhuma ocorrência sobrando. Se aparecer, trocar por "14 dias".

- [ ] **Step 7: Commit**

```bash
git add backend/src/config/trial.ts backend/src/services/stripeCheckoutService.ts backend/src/repositories/authRepository.ts backend/src/__tests__/trialDays.test.ts frontend/src/lib/plans.ts
git commit -m "fix(billing): use a single 14-day trial across signup, checkout and pricing"
```

---

### Task 6: Remover as opções sem efeito da tela de Ajustes

Três controles gravam no banco e não fazem nada: "Sincronizar com Google Calendar", "Webhook personalizado" e "Enviar lembretes por e-mail" (não existe envio de lembrete por e-mail em lugar nenhum do backend; `emailService.ts` só manda confirmação de cadastro). As colunas correspondentes são apagadas na Tarefa 7.

**Files:**
- Modify: `backend/src/validators/schemas/barbershopSettingsSchemas.ts:30-37`
- Modify: `backend/src/services/barbershopSettingsService.ts:23-26,183-186`
- Modify: `backend/src/repositories/barbershopSettingsRepository.ts:12-15,66-69,351-354,378-405`
- Modify: `frontend/src/components/SettingsModule.tsx:65-68,103-106,938-942,958-964,979-987`
- Test: `backend/src/__tests__/barbershopSettingsService.test.ts` (ajustar o que citar os campos)

- [ ] **Step 1: Ver quais testes falam desses campos**

Run: `grep -rn "emailReminders\|googleCalendarEnabled\|customWebhookUrl" backend/src/__tests__`
Expected: a lista de asserções a ajustar. `whatsappReminders` **fica** e não é tocado.

- [ ] **Step 2: Tirar os três campos do backend**

- Em `barbershopSettingsSchemas.ts`, apagar as chaves `emailReminders`, `googleCalendarEnabled` e `customWebhookUrl` do schema de atualização.
- Em `barbershopSettingsService.ts`, apagar essas três chaves da interface de entrada e do `payload` montado antes do `upsert`.
- Em `barbershopSettingsRepository.ts`, apagar essas três chaves de `mapRowToSettings`, as três linhas `COALESCE(...)` do `SELECT` em `findByBarbershopId`, os três campos da assinatura de `upsert` e as colunas correspondentes no `INSERT ... ON CONFLICT DO UPDATE`.

- [ ] **Step 3: Tirar os três controles da tela**

Em `frontend/src/components/SettingsModule.tsx`:
- apagar `emailReminders`, `googleCalendarEnabled` e `customWebhookUrl` do tipo e do objeto de valores padrão;
- apagar o `ToggleRow` "Enviar lembretes por e-mail";
- apagar o `ToggleRow` "Sincronizar com Google Calendar" e a `div` que só o continha;
- apagar o `Field` "Webhook personalizado".

O painel "Integrações" continua, com o campo somente-leitura "Nome da instância WhatsApp (Evolution)". O painel "Lembretes e notificações" continua, com o toggle de WhatsApp.

- [ ] **Step 4: Ajustar os testes que citavam os campos apagados**

Remover das asserções apenas as três chaves. Nenhum teste novo é necessário: o comportamento some junto com o campo.

- [ ] **Step 5: Verificar**

Run: `(cd backend && npm run typecheck && npm test 2>&1 | tail -5)`
Expected: typecheck limpo, suíte verde.

Run: `grep -rn "emailReminders\|googleCalendarEnabled\|customWebhookUrl" --exclude-dir=node_modules --exclude-dir=.next backend/src frontend/src`
Expected: nenhuma ocorrência.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore(settings): drop google calendar, custom webhook and email reminder toggles"
```

---

## Fatia 3 — Banco

### Task 7: Migration de renomeação

Uma migration só, sem apagar dados. As migrations antigas não são editadas. A verificação roda contra um Postgres local, com um arquivo que imita o mínimo do Supabase (schema `auth`, papéis `authenticated` e `anon`, schema `storage`), porque as migrations existentes usam `auth.uid()` e `storage.objects`.

**Files:**
- Create: `backend/prisma/migrations/20260917150000_rename_to_business_professional/migration.sql`
- Create: `backend/prisma/local/supabase-stub.sql`

- [ ] **Step 1: Subir um Postgres local limpo**

```bash
docker run --rm -d --name easyagenda-db -e POSTGRES_PASSWORD=dev -e POSTGRES_DB=easyagenda -p 55432:5432 postgres:16-alpine
```

- [ ] **Step 2: Criar o arquivo que imita o Supabase**

Criar `backend/prisma/local/supabase-stub.sql`:

```sql
-- Mínimo do Supabase para aplicar as migrations num Postgres local.
-- Não é usado em produção: no Supabase esses objetos já existem.
CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS storage;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
LANGUAGE sql STABLE AS $$ SELECT NULL::uuid $$;

CREATE TABLE IF NOT EXISTS storage.buckets (
  id text PRIMARY KEY,
  name text NOT NULL,
  public boolean NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS storage.objects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_id text,
  name text,
  owner uuid
);
```

Aplicar:

```bash
docker exec -i easyagenda-db psql -U postgres -d easyagenda < backend/prisma/local/supabase-stub.sql
```

- [ ] **Step 3: Aplicar as migrations existentes no banco local**

```bash
(cd backend && DATABASE_URL="postgresql://postgres:dev@localhost:55432/easyagenda" npx prisma migrate deploy)
```

Expected: todas as migrations aplicadas, inclusive `20260608000000_enable_rls_policies` e `20260609120000_storage_rls_barber_photos`.

- [ ] **Step 4: Listar tudo que ainda tem nome de barbearia no banco**

```bash
docker exec -i easyagenda-db psql -U postgres -d easyagenda -c "
SELECT 'tabela' AS tipo, c.relname AS nome FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','i') AND c.relname ILIKE '%barb%'
UNION ALL SELECT 'restricao', conname FROM pg_constraint WHERE conname ILIKE '%barb%'
UNION ALL SELECT 'coluna', table_name || '.' || column_name FROM information_schema.columns WHERE table_schema='public' AND column_name ILIKE '%barb%'
UNION ALL SELECT 'politica', policyname FROM pg_policies WHERE policyname ILIKE '%barb%'
ORDER BY 1, 2;"
```

Guardar essa saída: ela é a lista de conferência do Step 7. Se aparecer algum índice ou restrição que não esteja na migration abaixo, acrescentar o `ALTER` correspondente antes de aplicar.

- [ ] **Step 5: Escrever a migration**

Criar `backend/prisma/migrations/20260917150000_rename_to_business_professional/migration.sql`:

```sql
-- Renomeia o domínio de barbearia para negócio genérico (EasyAgenda+).
-- Não apaga dados: só renomeia tabelas, colunas, índices, restrições e políticas,
-- e remove colunas comprovadamente mortas.

-- ─── 1. Políticas e função de RLS saem primeiro (dependem dos nomes antigos) ───

DROP POLICY IF EXISTS "tenant_select_barbershop"              ON public.barbershops;
DROP POLICY IF EXISTS "tenant_update_barbershop"              ON public.barbershops;
DROP POLICY IF EXISTS "tenant_select_users"                   ON public.users;
DROP POLICY IF EXISTS "tenant_update_own_user"                ON public.users;
DROP POLICY IF EXISTS "tenant_all_barbers"                    ON public.barbers;
DROP POLICY IF EXISTS "tenant_all_services"                   ON public.services;
DROP POLICY IF EXISTS "tenant_all_clients"                    ON public.clients;
DROP POLICY IF EXISTS "tenant_all_appointments"               ON public.appointments;
DROP POLICY IF EXISTS "tenant_all_earnings"                   ON public.earnings;
DROP POLICY IF EXISTS "tenant_all_expenses"                   ON public.expenses;
DROP POLICY IF EXISTS "tenant_select_subscription_events"     ON public.subscription_events;
DROP POLICY IF EXISTS "tenant_select_billing_webhook_events"  ON public.billing_webhook_events;
DROP POLICY IF EXISTS "tenant_select_billing_payments"        ON public.billing_payments;
DROP POLICY IF EXISTS "tenant_select_audit_logs"              ON public.audit_logs;
DROP POLICY IF EXISTS "tenant_select_whatsapp_sessions"       ON public.whatsapp_sessions;
DROP POLICY IF EXISTS "tenant_all_whatsapp_bot_config"        ON public.whatsapp_bot_config;
DROP POLICY IF EXISTS "tenant_select_whatsapp_ratings"        ON public.whatsapp_ratings;
DROP POLICY IF EXISTS "tenant_all_barbershop_settings"        ON public.barbershop_settings;
DROP POLICY IF EXISTS "tenant_all_whatsapp_menu_options"      ON public.whatsapp_menu_options;

DROP FUNCTION IF EXISTS public.current_barbershop_id();

-- ─── 2. Tabelas ───────────────────────────────────────────────────────────────

ALTER TABLE public.barbershops         RENAME TO businesses;
ALTER TABLE public.barbers             RENAME TO professionals;
ALTER TABLE public.barbershop_settings RENAME TO business_settings;

-- ─── 3. Colunas ───────────────────────────────────────────────────────────────

ALTER TABLE public.users                  RENAME COLUMN barbershop_id TO business_id;
ALTER TABLE public.professionals          RENAME COLUMN barbershop_id TO business_id;
ALTER TABLE public.services               RENAME COLUMN barbershop_id TO business_id;
ALTER TABLE public.clients                RENAME COLUMN barbershop_id TO business_id;
ALTER TABLE public.appointments           RENAME COLUMN barbershop_id TO business_id;
ALTER TABLE public.appointments           RENAME COLUMN barber_id     TO professional_id;
ALTER TABLE public.earnings               RENAME COLUMN barbershop_id TO business_id;
ALTER TABLE public.expenses               RENAME COLUMN barbershop_id TO business_id;
ALTER TABLE public.subscription_events    RENAME COLUMN barbershop_id TO business_id;
ALTER TABLE public.billing_webhook_events RENAME COLUMN barbershop_id TO business_id;
ALTER TABLE public.billing_payments       RENAME COLUMN barbershop_id TO business_id;
ALTER TABLE public.whatsapp_sessions      RENAME COLUMN barbershop_id TO business_id;
ALTER TABLE public.whatsapp_bot_config    RENAME COLUMN barbershop_id TO business_id;
ALTER TABLE public.whatsapp_ratings       RENAME COLUMN barbershop_id TO business_id;
ALTER TABLE public.business_settings      RENAME COLUMN barbershop_id TO business_id;
ALTER TABLE public.whatsapp_menu_options  RENAME COLUMN barbershop_id TO business_id;
ALTER TABLE public.audit_logs             RENAME COLUMN actor_barbershop_id  TO actor_business_id;
ALTER TABLE public.audit_logs             RENAME COLUMN target_barbershop_id TO target_business_id;

-- pending_registrations é tabela de SQL cru (sem modelo Prisma)
ALTER TABLE IF EXISTS public.pending_registrations RENAME COLUMN barbershop_name TO business_name;

-- ─── 4. Colunas mortas ────────────────────────────────────────────────────────
-- Credenciais da API oficial da Meta: nunca lidas pelo código; a conexão é por QR code.
DROP INDEX IF EXISTS public.barbershops_whatsapp_phone_number_id_idx;
ALTER TABLE public.businesses DROP COLUMN IF EXISTS whatsapp_phone_number_id;
ALTER TABLE public.businesses DROP COLUMN IF EXISTS whatsapp_waba_id;
ALTER TABLE public.businesses DROP COLUMN IF EXISTS whatsapp_access_token;

-- Configurações que apareciam na tela sem nenhum efeito.
ALTER TABLE public.business_settings DROP COLUMN IF EXISTS google_calendar_enabled;
ALTER TABLE public.business_settings DROP COLUMN IF EXISTS custom_webhook_url;
ALTER TABLE public.business_settings DROP COLUMN IF EXISTS email_reminders;

-- ─── 5. Restrições e índices ──────────────────────────────────────────────────

ALTER TABLE public.businesses            RENAME CONSTRAINT barbershops_pkey         TO businesses_pkey;
ALTER TABLE public.professionals         RENAME CONSTRAINT barbers_pkey             TO professionals_pkey;
ALTER TABLE public.business_settings     RENAME CONSTRAINT barbershop_settings_pkey TO business_settings_pkey;

ALTER TABLE public.users                  RENAME CONSTRAINT users_barbershop_id_fkey                  TO users_business_id_fkey;
ALTER TABLE public.professionals          RENAME CONSTRAINT barbers_barbershop_id_fkey                TO professionals_business_id_fkey;
ALTER TABLE public.services               RENAME CONSTRAINT services_barbershop_id_fkey               TO services_business_id_fkey;
ALTER TABLE public.clients                RENAME CONSTRAINT clients_barbershop_id_fkey                TO clients_business_id_fkey;
ALTER TABLE public.appointments           RENAME CONSTRAINT appointments_barbershop_id_fkey           TO appointments_business_id_fkey;
ALTER TABLE public.appointments           RENAME CONSTRAINT appointments_barber_id_fkey               TO appointments_professional_id_fkey;
ALTER TABLE public.earnings               RENAME CONSTRAINT earnings_barbershop_id_fkey               TO earnings_business_id_fkey;
ALTER TABLE public.expenses               RENAME CONSTRAINT expenses_barbershop_id_fkey               TO expenses_business_id_fkey;
ALTER TABLE public.subscription_events    RENAME CONSTRAINT subscription_events_barbershop_id_fkey    TO subscription_events_business_id_fkey;
ALTER TABLE public.billing_webhook_events RENAME CONSTRAINT billing_webhook_events_barbershop_id_fkey TO billing_webhook_events_business_id_fkey;
ALTER TABLE public.billing_payments       RENAME CONSTRAINT billing_payments_barbershop_id_fkey       TO billing_payments_business_id_fkey;
ALTER TABLE public.whatsapp_sessions      RENAME CONSTRAINT whatsapp_sessions_barbershop_id_fkey      TO whatsapp_sessions_business_id_fkey;
ALTER TABLE public.whatsapp_bot_config    RENAME CONSTRAINT whatsapp_bot_config_barbershop_id_fkey    TO whatsapp_bot_config_business_id_fkey;
ALTER TABLE public.whatsapp_ratings       RENAME CONSTRAINT whatsapp_ratings_barbershop_id_fkey       TO whatsapp_ratings_business_id_fkey;
ALTER TABLE public.business_settings      RENAME CONSTRAINT barbershop_settings_barbershop_id_fkey    TO business_settings_business_id_fkey;
ALTER TABLE public.whatsapp_menu_options  RENAME CONSTRAINT whatsapp_menu_options_barbershop_id_fkey  TO whatsapp_menu_options_business_id_fkey;
ALTER TABLE public.audit_logs             RENAME CONSTRAINT audit_logs_actor_barbershop_id_fkey       TO audit_logs_actor_business_id_fkey;
ALTER TABLE public.audit_logs             RENAME CONSTRAINT audit_logs_target_barbershop_id_fkey      TO audit_logs_target_business_id_fkey;

ALTER INDEX public.barbershops_email_key                          RENAME TO businesses_email_key;
ALTER INDEX public.barbershops_stripe_customer_id_key             RENAME TO businesses_stripe_customer_id_key;
ALTER INDEX public.barbershops_stripe_subscription_id_key         RENAME TO businesses_stripe_subscription_id_key;
ALTER INDEX public.whatsapp_bot_config_barbershop_id_key          RENAME TO whatsapp_bot_config_business_id_key;
ALTER INDEX public.barbershop_settings_barbershop_id_key          RENAME TO business_settings_business_id_key;
ALTER INDEX public.whatsapp_menu_options_barbershop_id_option_order_key RENAME TO whatsapp_menu_options_business_id_option_order_key;
ALTER INDEX public.uq_barbershops_whatsapp_instance_name_norm     RENAME TO uq_businesses_whatsapp_instance_name_norm;

-- ─── 6. Função e políticas de RLS com os nomes novos ──────────────────────────

CREATE OR REPLACE FUNCTION public.current_business_id()
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT business_id
  FROM public.users
  WHERE supabase_user_id = auth.uid()
  LIMIT 1
$$;

CREATE POLICY "tenant_select_business"
  ON public.businesses FOR SELECT
  TO authenticated
  USING (id = public.current_business_id());

CREATE POLICY "tenant_update_business"
  ON public.businesses FOR UPDATE
  TO authenticated
  USING  (id = public.current_business_id())
  WITH CHECK (id = public.current_business_id());

CREATE POLICY "tenant_select_users"
  ON public.users FOR SELECT
  TO authenticated
  USING (business_id = public.current_business_id());

CREATE POLICY "tenant_update_own_user"
  ON public.users FOR UPDATE
  TO authenticated
  USING  (supabase_user_id = auth.uid())
  WITH CHECK (supabase_user_id = auth.uid());

CREATE POLICY "tenant_all_professionals"
  ON public.professionals FOR ALL
  TO authenticated
  USING  (business_id = public.current_business_id())
  WITH CHECK (business_id = public.current_business_id());

CREATE POLICY "tenant_all_services"
  ON public.services FOR ALL
  TO authenticated
  USING  (business_id = public.current_business_id())
  WITH CHECK (business_id = public.current_business_id());

CREATE POLICY "tenant_all_clients"
  ON public.clients FOR ALL
  TO authenticated
  USING  (business_id = public.current_business_id())
  WITH CHECK (business_id = public.current_business_id());

CREATE POLICY "tenant_all_appointments"
  ON public.appointments FOR ALL
  TO authenticated
  USING  (business_id = public.current_business_id())
  WITH CHECK (business_id = public.current_business_id());

CREATE POLICY "tenant_all_earnings"
  ON public.earnings FOR ALL
  TO authenticated
  USING  (business_id = public.current_business_id())
  WITH CHECK (business_id = public.current_business_id());

CREATE POLICY "tenant_all_expenses"
  ON public.expenses FOR ALL
  TO authenticated
  USING  (business_id = public.current_business_id())
  WITH CHECK (business_id = public.current_business_id());

CREATE POLICY "tenant_select_subscription_events"
  ON public.subscription_events FOR SELECT
  TO authenticated
  USING (business_id = public.current_business_id());

CREATE POLICY "tenant_select_billing_webhook_events"
  ON public.billing_webhook_events FOR SELECT
  TO authenticated
  USING (business_id = public.current_business_id());

CREATE POLICY "tenant_select_billing_payments"
  ON public.billing_payments FOR SELECT
  TO authenticated
  USING (business_id = public.current_business_id());

CREATE POLICY "tenant_select_audit_logs"
  ON public.audit_logs FOR SELECT
  TO authenticated
  USING (
    actor_business_id  = public.current_business_id()
    OR target_business_id = public.current_business_id()
  );

CREATE POLICY "tenant_select_whatsapp_sessions"
  ON public.whatsapp_sessions FOR SELECT
  TO authenticated
  USING (business_id = public.current_business_id());

CREATE POLICY "tenant_all_whatsapp_bot_config"
  ON public.whatsapp_bot_config FOR ALL
  TO authenticated
  USING  (business_id = public.current_business_id())
  WITH CHECK (business_id = public.current_business_id());

CREATE POLICY "tenant_select_whatsapp_ratings"
  ON public.whatsapp_ratings FOR SELECT
  TO authenticated
  USING (business_id = public.current_business_id());

CREATE POLICY "tenant_all_business_settings"
  ON public.business_settings FOR ALL
  TO authenticated
  USING  (business_id = public.current_business_id())
  WITH CHECK (business_id = public.current_business_id());

CREATE POLICY "tenant_all_whatsapp_menu_options"
  ON public.whatsapp_menu_options FOR ALL
  TO authenticated
  USING  (business_id = public.current_business_id())
  WITH CHECK (business_id = public.current_business_id());

-- A política de cupons não cita barbearia e continua como está.

-- ─── 7. Bucket de fotos ───────────────────────────────────────────────────────
-- Só roda onde o Storage do Supabase existe. As fotos de teste do bucket antigo
-- não são copiadas; o bucket barber-photos fica para exclusão manual.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'storage') THEN
    INSERT INTO storage.buckets (id, name, public)
    VALUES ('professional-photos', 'professional-photos', true)
    ON CONFLICT (id) DO UPDATE SET public = true;

    EXECUTE $p$DROP POLICY IF EXISTS "authenticated_insert_professional_photos" ON storage.objects$p$;
    EXECUTE $p$DROP POLICY IF EXISTS "authenticated_update_professional_photos" ON storage.objects$p$;
    EXECUTE $p$DROP POLICY IF EXISTS "authenticated_delete_professional_photos" ON storage.objects$p$;
    EXECUTE $p$DROP POLICY IF EXISTS "public_select_professional_photos"        ON storage.objects$p$;

    EXECUTE $p$CREATE POLICY "authenticated_insert_professional_photos"
      ON storage.objects FOR INSERT TO authenticated
      WITH CHECK (bucket_id = 'professional-photos')$p$;

    EXECUTE $p$CREATE POLICY "authenticated_update_professional_photos"
      ON storage.objects FOR UPDATE TO authenticated
      USING  (bucket_id = 'professional-photos')
      WITH CHECK (bucket_id = 'professional-photos')$p$;

    EXECUTE $p$CREATE POLICY "authenticated_delete_professional_photos"
      ON storage.objects FOR DELETE TO authenticated
      USING (bucket_id = 'professional-photos')$p$;

    EXECUTE $p$CREATE POLICY "public_select_professional_photos"
      ON storage.objects FOR SELECT TO public
      USING (bucket_id = 'professional-photos')$p$;

    EXECUTE $p$DROP POLICY IF EXISTS "authenticated_insert_barber_photos" ON storage.objects$p$;
    EXECUTE $p$DROP POLICY IF EXISTS "authenticated_update_barber_photos" ON storage.objects$p$;
    EXECUTE $p$DROP POLICY IF EXISTS "authenticated_delete_barber_photos" ON storage.objects$p$;
    EXECUTE $p$DROP POLICY IF EXISTS "public_select_barber_photos"        ON storage.objects$p$;
  END IF;
END $$;

-- ─── 8. Textos salvos do bot ──────────────────────────────────────────────────

UPDATE public.whatsapp_bot_config SET
  welcome_message  = REPLACE(REPLACE(welcome_message,  '{nome_barbearia}', '{nome_negocio}'), '{barbeiro}', '{profissional}'),
  reminder_message = REPLACE(REPLACE(reminder_message, '{nome_barbearia}', '{nome_negocio}'), '{barbeiro}', '{profissional}')
WHERE welcome_message  LIKE '%{nome_barbearia}%' OR welcome_message  LIKE '%{barbeiro}%'
   OR reminder_message LIKE '%{nome_barbearia}%' OR reminder_message LIKE '%{barbeiro}%';
```

Antes de aplicar, conferir os nomes reais das colunas de texto de `whatsapp_bot_config` (o `UPDATE` acima assume `welcome_message` e `reminder_message`):

```bash
docker exec -i easyagenda-db psql -U postgres -d easyagenda -c "\d public.whatsapp_bot_config"
```

Se houver outras colunas de mensagem com variáveis (por exemplo de confirmação ou de cancelamento), acrescentá-las ao mesmo `UPDATE`.

- [ ] **Step 6: Aplicar a migration no banco local**

```bash
(cd backend && DATABASE_URL="postgresql://postgres:dev@localhost:55432/easyagenda" npx prisma migrate deploy)
```

Expected: `1 migration applied`, sem erro.

- [ ] **Step 7: Conferir que não sobrou nome antigo no banco**

Rodar de novo a consulta do Step 4.
Expected: zero linhas.

- [ ] **Step 8: Commit**

```bash
git add backend/prisma/migrations/20260917150000_rename_to_business_professional backend/prisma/local/supabase-stub.sql
git commit -m "feat(db): rename barbershop domain to business and professional"
```

O container local fica de pé para a Tarefa 8. Para derrubar depois: `docker stop easyagenda-db`.

---

## Fatia 4 — Código

### Task 8: Renomeação do backend

A troca é mecânica e feita por script, com três cuidados que precisam vir antes:

1. `barbershopBusinessSettingsService.ts` viraria `businessBusinessSettingsService.ts`. Ele cuida de horário de funcionamento, intervalo de agenda, encaixe e fuso: é renomeado à mão para `scheduleSettingsService.ts` **antes** do script.
2. A ordem das substituições importa: `easybarber` contém `barber`, e `barbershop` contém `barber`. Marca primeiro, depois `barbershop`, depois `barber`.
3. `prisma/migrations/` e `prisma/legacy-migrations/` **não** são tocados: são histórico.

**Files:**
- Rename: `backend/src/services/barbershopBusinessSettingsService.ts` → `backend/src/services/scheduleSettingsService.ts`
- Rename: `backend/src/__tests__/barbershopBusinessSettingsService.test.ts` → `backend/src/__tests__/scheduleSettingsService.test.ts`
- Rename: `backend/src/controllers/barberController.ts`, `barbershopSettingsController.ts`, `backend/src/repositories/barberRepository.ts`, `barbershopSettingsRepository.ts`, `backend/src/routes/barbershop.ts`, `backend/src/services/barberService.ts`, `barbershopSettingsService.ts`, `backend/src/validators/schemas/barberSchemas.ts`, `barbershopSettingsSchemas.ts`, `backend/src/modules/barbershop/`, `backend/src/__tests__/barbershopSettingsService.test.ts`
- Modify: `backend/prisma/schema.prisma`, todo `backend/src/**`, `backend/package.json`, `backend/.env.example`

- [ ] **Step 1: Renomear o serviço de horários à mão**

```bash
git mv backend/src/services/barbershopBusinessSettingsService.ts backend/src/services/scheduleSettingsService.ts
git mv backend/src/__tests__/barbershopBusinessSettingsService.test.ts backend/src/__tests__/scheduleSettingsService.test.ts
```

Dentro dos dois arquivos e em quem os importa, renomear os símbolos: `DEFAULT_BUSINESS_SETTINGS` → `DEFAULT_SCHEDULE_SETTINGS`, `BusinessSettings` → `ScheduleSettings`, e qualquer função exportada com `BusinessSettings` no nome passa a usar `ScheduleSettings`. Achar quem importa:

Run: `grep -rn "barbershopBusinessSettingsService\|DEFAULT_BUSINESS_SETTINGS\|BusinessSettings" backend/src`

- [ ] **Step 2: Verificar antes de rodar o script**

Run: `(cd backend && npm run typecheck)`
Expected: sem erro. Se houver, corrigir os imports do passo anterior.

- [ ] **Step 3: Rodar o script de renomeação no backend**

```bash
for f in $(git ls-files 'backend/*' | grep -E '\.(ts|prisma|json|md|yml|yaml|example)$' | grep -v 'prisma/migrations/' | grep -v 'prisma/legacy-migrations/'); do
  sed -i \
    -e 's/EasyBarber/EasyAgenda/g' -e 's/easyBarber/easyAgenda/g' -e 's/easybarber/easyagenda/g' -e 's/EASYBARBER/EASYAGENDA/g' \
    -e 's/Easy Barber/EasyAgenda/g' -e 's/easy barber/easyagenda/g' \
    -e 's/barbershops/businesses/g' -e 's/Barbershops/Businesses/g' -e 's/BARBERSHOPS/BUSINESSES/g' \
    -e 's/barbershop/business/g' -e 's/Barbershop/Business/g' -e 's/BARBERSHOP/BUSINESS/g' \
    -e 's/barbers/professionals/g' -e 's/Barbers/Professionals/g' -e 's/BARBERS/PROFESSIONALS/g' \
    -e 's/barber/professional/g' -e 's/Barber/Professional/g' -e 's/BARBER/PROFESSIONAL/g' \
    "$f"
done
```

- [ ] **Step 4: Renomear os arquivos e a pasta do módulo**

```bash
git mv backend/src/controllers/barberController.ts backend/src/controllers/professionalController.ts
git mv backend/src/controllers/barbershopSettingsController.ts backend/src/controllers/businessSettingsController.ts
git mv backend/src/repositories/barberRepository.ts backend/src/repositories/professionalRepository.ts
git mv backend/src/repositories/barbershopSettingsRepository.ts backend/src/repositories/businessSettingsRepository.ts
git mv backend/src/routes/barbershop.ts backend/src/routes/business.ts
git mv backend/src/services/barberService.ts backend/src/services/professionalService.ts
git mv backend/src/services/barbershopSettingsService.ts backend/src/services/businessSettingsService.ts
git mv backend/src/validators/schemas/barberSchemas.ts backend/src/validators/schemas/professionalSchemas.ts
git mv backend/src/validators/schemas/barbershopSettingsSchemas.ts backend/src/validators/schemas/businessSettingsSchemas.ts
git mv backend/src/modules/barbershop backend/src/modules/business
git mv backend/src/modules/business/barbershop.routes.ts backend/src/modules/business/business.routes.ts
git mv backend/src/__tests__/barbershopSettingsService.test.ts backend/src/__tests__/businessSettingsService.test.ts
```

Conferir se sobrou algum arquivo com nome antigo:

Run: `find backend/src -iname "*barber*"`
Expected: nenhum resultado.

- [ ] **Step 5: Restaurar o endereço real do Render**

O script trocou `easybarber-backend.onrender.com` por `easyagenda-backend.onrender.com`. Esse endereço é real e não muda. Restaurar em todos os lugares:

```bash
grep -rln "easyagenda-backend.onrender.com" backend | xargs sed -i 's/easyagenda-backend\.onrender\.com/easybarber-backend.onrender.com/g'
grep -rn "onrender.com" backend/src backend/.env.example
```

Expected: só `easybarber-backend.onrender.com`.

- [ ] **Step 6: Conferir os pontos sensíveis à mão**

Run: `grep -rn "INSTANCE_PREFIX\|externalReference = \|uq_businesses_whatsapp_instance_name_norm\|{business}\|WHATSAPP_DEFAULT_BUSINESS_ID\|WHATSAPP_INSTANCE_BUSINESS_MAP" backend/src backend/.env.example | head -30`

Confirmar que ficou assim:
- `backend/src/services/whatsapp/whatsappInstanceService.ts`: `const INSTANCE_PREFIX = 'easyagenda';`
- `backend/src/integrations/asaas/service.ts`: `buildExternalReference` gera `business:${businessId}:plan:${plan}` e o modelo de descrição usa `{business}`;
- `backend/src/services/businessSettingsService.ts` e `whatsappInstanceService.ts` comparam com `uq_businesses_whatsapp_instance_name_norm`, igual ao nome criado na migration;
- `.env.example` documenta `WHATSAPP_DEFAULT_BUSINESS_ID`, `WHATSAPP_INSTANCE_BUSINESS_MAP` e `ASAAS_BILLING_DESCRIPTION=EasyAgenda - Plano {plan} ({business})`.

- [ ] **Step 7: Conferir plurais e palavras emendadas**

Run: `grep -rnE "businesss|professionalss|businesses_id|professionals_id|businessId s" backend/src backend/prisma/schema.prisma`
Expected: nenhum resultado.

O banco local de desenvolvimento se chama `barberpro` e virou `professionalpro` pelo script. Trocar por `easyagenda`:

```bash
grep -rl "professionalpro" backend | xargs -r sed -i 's/professionalpro/easyagenda/g'
grep -rn "professionalpro\|barberpro" backend
```

Expected: nenhum resultado.

Run: `grep -n "@@map\|@map(\"business_id\")\|@map(\"professional_id\")" backend/prisma/schema.prisma | head -30`
Expected: `@@map("businesses")`, `@@map("professionals")`, `@@map("business_settings")` e as colunas renomeadas.

- [ ] **Step 8: Gerar o cliente do Prisma e verificar**

Run: `(cd backend && npx prisma generate && npm run typecheck && npm test 2>&1 | tail -5)`
Expected: cliente gerado, typecheck limpo, suíte verde. Se o typecheck acusar nome antigo, é import não atualizado: corrigir e repetir.

- [ ] **Step 9: Conferir que o schema bate com o banco renomeado**

```bash
(cd backend && DATABASE_URL="postgresql://postgres:dev@localhost:55432/easyagenda" npx prisma migrate diff \
  --from-schema-datasource prisma/schema.prisma \
  --to-schema-datamodel prisma/schema.prisma \
  --exit-code) ; echo "exit=$?"
```

Expected: `exit=0`, ou seja, nenhuma diferença entre o banco e o schema. A única diferença aceita é a tabela `whatsapp_menu_options`, que não é modelada no Prisma e já era assim antes; se ela aparecer, seguir.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "refactor(backend): rename barbershop domain to business and professional"
```

---

### Task 9: Renomeação do frontend

Mesmo script, mais o ajuste do endereço do backend e as rotas de proxy.

**Files:**
- Rename: `frontend/src/app/api/barbershop/` → `frontend/src/app/api/business/`, `frontend/src/app/api/barbers/` → `frontend/src/app/api/professionals/`, `frontend/src/app/api/auth/barbershop/` → `frontend/src/app/api/auth/business/`, `frontend/src/app/api/auth/barbers/` → `frontend/src/app/api/auth/professionals/`, e as subpastas `barbers` dentro delas
- Rename: `frontend/src/components/BarberAgenda.tsx`, `ServiceBarberModule.tsx`, `services/BarberCard.tsx`, `services/ServiceBarberModal.tsx`, `frontend/src/lib/barbershopProfile.ts`
- Modify: `frontend/next.config.js:3`, todo `frontend/src/**`, `frontend/package.json`, `frontend/.env.example`

- [ ] **Step 1: Rodar o script no frontend**

```bash
for f in $(git ls-files 'frontend/*' | grep -E '\.(ts|tsx|js|jsx|json|md|example)$'); do
  sed -i \
    -e 's/EasyBarber/EasyAgenda/g' -e 's/easyBarber/easyAgenda/g' -e 's/easybarber/easyagenda/g' -e 's/EASYBARBER/EASYAGENDA/g' \
    -e 's/Easy Barber/EasyAgenda/g' -e 's/easy barber/easyagenda/g' \
    -e 's/barbershops/businesses/g' -e 's/Barbershops/Businesses/g' -e 's/BARBERSHOPS/BUSINESSES/g' \
    -e 's/barbershop/business/g' -e 's/Barbershop/Business/g' -e 's/BARBERSHOP/BUSINESS/g' \
    -e 's/barbers/professionals/g' -e 's/Barbers/Professionals/g' -e 's/BARBERS/PROFESSIONALS/g' \
    -e 's/barber/professional/g' -e 's/Barber/Professional/g' -e 's/BARBER/PROFESSIONAL/g' \
    "$f"
done
```

- [ ] **Step 2: Renomear pastas de rota e componentes**

```bash
git mv frontend/src/app/api/barbershop frontend/src/app/api/business
git mv frontend/src/app/api/business/barbers frontend/src/app/api/business/professionals
git mv frontend/src/app/api/barbers frontend/src/app/api/professionals
git mv frontend/src/app/api/auth/barbershop frontend/src/app/api/auth/business
git mv frontend/src/app/api/auth/business/barbers frontend/src/app/api/auth/business/professionals
git mv frontend/src/app/api/auth/barbers frontend/src/app/api/auth/professionals
git mv frontend/src/components/BarberAgenda.tsx frontend/src/components/ProfessionalAgenda.tsx
git mv frontend/src/components/ServiceBarberModule.tsx frontend/src/components/ServiceProfessionalModule.tsx
git mv frontend/src/components/services/BarberCard.tsx frontend/src/components/services/ProfessionalCard.tsx
git mv frontend/src/components/services/ServiceBarberModal.tsx frontend/src/components/services/ServiceProfessionalModal.tsx
git mv frontend/src/lib/barbershopProfile.ts frontend/src/lib/businessProfile.ts
```

Run: `find frontend/src -iname "*barber*"`
Expected: só `frontend/src/icons/easybarber.png`, que é tratado na Tarefa 11.

- [ ] **Step 3: Tirar o endereço fixo do backend de `next.config.js`**

Trocar a linha 3 por:

```js
const PRODUCTION_BACKEND_ORIGIN =
  process.env.BACKEND_ORIGIN || 'https://easybarber-backend.onrender.com';
```

O valor padrão é o endereço real do serviço no Render, que não muda de nome. Quando houver domínio novo, basta definir `BACKEND_ORIGIN` na Vercel.

- [ ] **Step 4: Conferir os pontos sensíveis**

Run: `grep -rn "easyagenda:pixCheckout\|easyagenda.settings.v1\|easyagenda-theme\|professional-photos\|onrender.com" frontend/src frontend/next.config.js`

Confirmar: as três chaves do navegador com prefixo `easyagenda`, o bucket `professional-photos` em `ServiceProfessionalModal.tsx`, e o único `onrender.com` sendo `easybarber-backend.onrender.com` dentro do `next.config.js`.

- [ ] **Step 5: Conferir que as rotas do frontend batem com as do backend**

Run: `grep -rn "api/business\|api/professionals" frontend/src/lib frontend/src/app/api --include=*.ts --include=*.tsx | head -20`
Run: `grep -rn "'/business'\|/business/professionals" backend/src/server.ts backend/src/routes/business.ts | head`
Expected: frontend chamando `/api/business/...` e `/api/professionals/...`; backend montando `${API_V1}/business` e servindo `/professionals`.

- [ ] **Step 6: Construir o frontend**

Run: `(cd frontend && npm ci && npm run build 2>&1 | tail -20)`
Expected: build concluído sem erro de tipo nem import quebrado.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor(frontend): rename barbershop domain to business and professional"
```

---

## Fatia 5 — Marca e textos

### Task 10: Textos em português e identidade do produto

O script trocou identificadores, não português. Restam cerca de 142 ocorrências de "barbearia" e "barbeiro" em 42 arquivos, e a marca precisa aparecer como **EasyAgenda+** no texto visível.

**Files:**
- Modify: todos os arquivos listados pelo comando do Step 1 (backend e frontend)

- [ ] **Step 1: Listar o que falta**

Run: `grep -rliE "barbeir[oa]s?|barbearias?" --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=legacy-migrations --exclude-dir=migrations backend/src frontend/src`

- [ ] **Step 2: Trocar os termos arquivo por arquivo**

Regras, aplicadas à mão porque o artigo muda de gênero:
- "a barbearia" → "o negócio"; "da barbearia" → "do negócio"; "sua barbearia" → "seu negócio"; "para barbearias" → "para negócios de beleza".
- "barbeiro" e "barbeira" → "profissional"; "os barbeiros" → "as profissionais" só quando o texto já falar de um time feminino; no genérico, "a equipe" ou "os profissionais".
- Dados de exemplo: "Barbearia Teste" → "Negócio Teste"; "Cliente Teste EasyBarber" já virou "Cliente Teste EasyAgenda" pelo script.
- Nas mensagens do bot: `{nome_barbearia}` → `{nome_negocio}` e `{barbeiro}` → `{profissional}`, iguais aos valores que a migration gravou no banco. Conferir `backend/src/services/whatsapp/whatsappConstants.ts`, `whatsappFlowService.ts` e `backend/src/services/cronService.ts`.
- Emoji de barbearia (💈) sai dos textos padrão do bot.
- Onde o bot se apresentava como "EasyAgenda Bot", passa a se apresentar como assistente do próprio negócio: "Sou o assistente virtual da {nome_negocio}".

- [ ] **Step 3: Colocar o `+` na marca visível**

Run: `grep -rn "EasyAgenda" --exclude-dir=node_modules --exclude-dir=.next backend/src frontend/src | grep -v "easyagenda"`

Em texto que o usuário lê — título da página, SEO, `opengraph-image.tsx`, `twitter-image.tsx`, navbar, rodapé, telas de login, página de pagamento, cabeçalho do PDF, assunto e corpo dos e-mails, termos de uso, política de privacidade — usar **EasyAgenda+**. Em identificador, nome de pacote, endereço, prefixo de instância e chave do navegador, continuar `easyagenda`/`EasyAgenda`, sem `+`.

Exceção: `NEXT_PUBLIC_WHATSAPP_CONTACT_URL` leva a mensagem pronta dentro da URL (`...quero%20conhecer%20o%20EasyAgenda`). Ali fica sem o `+`, porque numa URL o `+` vira espaço.

- [ ] **Step 4: Atualizar as variáveis mostradas na tela do WhatsApp**

Run: `grep -rn "nome_negocio\|profissional}" frontend/src/components/WhatsAppModule.tsx frontend/src/components/whatsapp | head`
Conferir que a lista de variáveis disponíveis mostrada ao usuário bate com as que o backend substitui.

- [ ] **Step 5: Ler as páginas legais inteiras**

Abrir `frontend/src/app/termos/page.tsx` e `frontend/src/app/privacidade/page.tsx` e ler do começo ao fim: elas descrevem o serviço ("plataforma de gestão para barbearias") e citam a empresa. Ajustar a descrição para agendamento de negócios de beleza e bem-estar, mantendo o restante do texto jurídico.

- [ ] **Step 6: Verificar**

Run: `(cd backend && npm run typecheck && npm test 2>&1 | tail -5) && (cd frontend && npm run build 2>&1 | tail -5)`
Expected: typecheck limpo, suíte verde, build do frontend concluído.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore(copy): replace barbershop wording with neutral EasyAgenda+ copy"
```

---

### Task 11: Logotipo provisório

Hoje o logo é `frontend/src/icons/easybarber.png`, usado em cinco telas e convertido para o PDF financeiro. O PDF passa a escrever a marca como texto, o que elimina a conversão de imagem.

**Files:**
- Create: `frontend/src/icons/easyagenda-logo.svg`
- Delete: `frontend/src/icons/easybarber.png`
- Modify: `frontend/src/app/layout.tsx:6,39-41`, `frontend/src/app/pagamento/page.tsx:19,304`, `frontend/src/components/admin/AdminSidebar.tsx:7,26`, `frontend/src/components/auth/AuthForm.tsx:14,216`, `frontend/src/components/marketing/PublicFooter.tsx:3,19`, `frontend/src/components/marketing/PublicNavbar.tsx:7,24`, `frontend/src/components/Navbar.tsx:8,49`, `frontend/src/components/FinanceModule.tsx:23,38-52,160-168`

- [ ] **Step 1: Criar o logotipo**

Criar `frontend/src/icons/easyagenda-logo.svg`:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 64" width="320" height="64" role="img" aria-label="EasyAgenda+">
  <rect width="64" height="64" rx="16" fill="#FF7A00"/>
  <path d="M20 22h24M20 32h24M20 42h14" stroke="#1A1817" stroke-width="5" stroke-linecap="round"/>
  <text x="80" y="42" font-family="'Plus Jakarta Sans', system-ui, sans-serif" font-size="30" font-weight="800" fill="currentColor">EasyAgenda</text>
  <text x="272" y="42" font-family="'Plus Jakarta Sans', system-ui, sans-serif" font-size="30" font-weight="800" fill="#FF7A00">+</text>
</svg>
```

- [ ] **Step 2: Trocar as importações**

Em cada arquivo listado, trocar a importação e o uso:

```tsx
import easyAgendaLogo from '@/icons/easyagenda-logo.svg';
```

Onde havia `<Image src={easyAgendaLogo} alt="Logo EasyAgenda" ... />`, usar `alt="Logo EasyAgenda+"`. Em `layout.tsx`, os campos `icon`, `shortcut` e `apple` passam a apontar para `easyAgendaLogo.src`.

- [ ] **Step 3: Tirar a imagem do PDF financeiro**

Em `frontend/src/components/FinanceModule.tsx`:
- apagar a importação do logo e a função `loadLogoDataUrl` inteira;
- em `exportToPDF`, apagar `const logoDataUrl = await loadLogoDataUrl();`, o `const titleX = ...` e o bloco `if (logoDataUrl) { doc.addImage(...) }`;
- usar posição fixa e a marca como texto:

```ts
    doc.setFontSize(20);
    doc.setTextColor(255, 122, 0);
    doc.text('EasyAgenda+ — Relatório Financeiro', 14, 20);
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`Gerado em: ${now}`, 14, 28);
```

Trocar também as demais ocorrências de `titleX` por `14` no restante da função.

- [ ] **Step 4: Apagar o logo antigo**

```bash
git rm frontend/src/icons/easybarber.png
```

Run: `grep -rn "easybarber" --exclude-dir=node_modules --exclude-dir=.next frontend/src`
Expected: nenhum resultado.

- [ ] **Step 5: Verificar**

Run: `(cd frontend && npm run build 2>&1 | tail -10)`
Expected: build concluído. Se o Next reclamar de importar SVG como componente, o uso correto aqui é `<Image src={easyAgendaLogo} ... />`, que trata o SVG como arquivo estático.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(brand): replace logo with provisional EasyAgenda+ wordmark"
```

---

## Fatia 6 — Fechamento

### Task 12: Varredura final, documentação e roteiro de domínio

**Files:**
- Modify: `README.md`, `INSTALL.md`, `DEPLOY.md`, `PROJECT_STRUCTURE.md`, `QUICK_START.md`, `START_HERE.md`, `WHATSAPP_BOT.md`, `PLANOS.md`, `TROUBLESHOOTING.md`, `API_DOCS.md`, `FIX_CADASTRO.md`, `POSTGRESQL_SETUP.md`, `package.json`, `docker-compose.yml`, `setup.ps1`
- Create: `docs/RUNBOOK-DOMINIO.md`

- [ ] **Step 1: Rodar o script nos documentos e nos arquivos da raiz**

```bash
for f in $(git ls-files '*.md' 'package.json' 'docker-compose.yml' 'setup.ps1' 'vercel.json' | grep -v '^docs/superpowers/'); do
  sed -i \
    -e 's/EasyBarber/EasyAgenda+/g' -e 's/easyBarber/easyAgenda/g' -e 's/easybarber/easyagenda/g' \
    -e 's/Easy Barber/EasyAgenda+/g' \
    -e 's/barbershops/businesses/g' -e 's/Barbershops/Businesses/g' \
    -e 's/barbershop/business/g' -e 's/Barbershop/Business/g' \
    -e 's/barbers/professionals/g' -e 's/Barbers/Professionals/g' \
    -e 's/barber/professional/g' -e 's/Barber/Professional/g' \
    "$f"
done
```

Restaurar o endereço do Render, que o script trocou, e acertar o banco local:

```bash
grep -rl "easyagenda-backend.onrender.com" --include=*.md --include=*.json --include=*.yml --include=*.ps1 . | xargs -r sed -i 's/easyagenda-backend\.onrender\.com/easybarber-backend.onrender.com/g'
grep -rl "professionalpro" --include=*.md --include=*.json --include=*.yml --include=*.ps1 . | xargs -r sed -i 's/professionalpro/easyagenda/g'
```

Run: `grep -n "\"name\"" package.json && grep -n "POSTGRES_DB\|DATABASE_URL" docker-compose.yml`
Expected: `"name": "easyagenda-saas"` (nome de pacote não leva `+`) e `easyagenda` como nome do banco local, sem `barberpro` nem `professionalpro`.

- [ ] **Step 2: Ler os documentos alterados**

Abrir `README.md`, `INSTALL.md` e `DEPLOY.md` e corrigir o que o script deixou estranho em português ("gestão para professionals", por exemplo), aplicando as mesmas regras da Tarefa 10.

- [ ] **Step 3: Varredura final no repositório**

```bash
grep -rniE "barber" --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=.git . \
  | grep -v "prisma/migrations/" \
  | grep -v "prisma/legacy-migrations/" \
  | grep -v "easybarber-backend.onrender.com" \
  | grep -v "docs/superpowers/"
```

Expected: nenhuma linha. Qualquer sobra é corrigida antes de seguir.

- [ ] **Step 4: Escrever o roteiro de troca de domínio**

Criar `docs/RUNBOOK-DOMINIO.md` com este conteúdo:

```markdown
# Roteiro de troca de domínio

Executar quando o domínio novo for comprado. Nada aqui foi feito na Fundação.

1. DNS: apontar o domínio para a Vercel e validar o certificado.
2. Vercel: adicionar o domínio ao projeto e definir `BACKEND_ORIGIN`, `NEXT_PUBLIC_API_URL` e `NEXT_PUBLIC_SITE_URL`.
3. Redirecionamento permanente (301) do endereço antigo para o novo.
4. Supabase: atualizar Site URL e Redirect URLs (login, confirmação de e-mail, recuperação de senha).
5. Stripe: atualizar a URL do webhook e as URLs de sucesso e cancelamento do checkout.
6. Asaas: atualizar a URL do webhook.
7. Evolution: rodar `/admin/sync-webhooks` para reapontar as instâncias, e conferir uma a uma.
8. E-mail: publicar SPF, DKIM e DMARC do domínio novo e trocar o remetente (`SMTP_FROM`).
9. Cookies: sessões do domínio antigo não valem no novo; avisar que será preciso entrar de novo.
10. Conferir: cadastro, login, agendamento, cobrança Pix e cartão, e recebimento de mensagem do bot.
```

- [ ] **Step 5: Verificação final automática**

Run: `(cd backend && npm run typecheck && npm test 2>&1 | tail -5) && (cd frontend && npm run build 2>&1 | tail -5)`
Expected: typecheck limpo, suíte verde, build concluído.

- [ ] **Step 6: Commit e abertura do PR**

```bash
git add -A
git commit -m "docs: rebrand documentation and add domain migration runbook"
git push -u origin feat/fundacao-easyagenda
gh pr create --title "Fundação EasyAgenda+" --body "Implementa docs/superpowers/specs/2026-09-17-fundacao-easyagenda-design.md"
```

---

### Task 13: Roteiro manual e publicação

Esta tarefa não altera código. É executada com o dono do produto, depois que o PR estiver verde.

- [ ] **Step 1: Backup do banco**

No painel do Supabase, gerar um backup do banco antes de qualquer coisa e guardar o arquivo. O Prisma não desfaz migration: a volta é restaurar o backup.

- [ ] **Step 2: Atualizar as variáveis de ambiente**

- Render: renomear `WHATSAPP_DEFAULT_BARBERSHOP_ID` para `WHATSAPP_DEFAULT_BUSINESS_ID` e `WHATSAPP_INSTANCE_BARBERSHOP_MAP` para `WHATSAPP_INSTANCE_BUSINESS_MAP`, mantendo os valores; remover `DEBUG_TOKEN`; ajustar `ASAAS_BILLING_DESCRIPTION` e `SMTP_FROM` para a marca nova.
- Vercel: manter `BACKEND_ORIGIN` apontando para `https://easybarber-backend.onrender.com`.

- [ ] **Step 3: Aplicar a migration em produção**

```bash
(cd backend && DATABASE_URL="<url do supabase>" npx prisma migrate deploy)
```

Expected: `1 migration applied`. Rodar em seguida a consulta de conferência do Step 4 da Tarefa 7 contra o banco do Supabase: zero linhas.

- [ ] **Step 4: Publicar**

Fazer o merge do PR, subir o backend no Render e o frontend na Vercel, nessa ordem. O sistema fica indisponível entre a migration e o fim dos dois deploys.

- [ ] **Step 5: Roteiro manual de verificação**

Com uma conta de teste, conferir:
1. cadastro novo, com o e-mail de confirmação chegando com a marca EasyAgenda+;
2. login e abertura do painel;
3. criar um profissional e um serviço;
4. criar um agendamento, concluir e conferir o lançamento no caixa;
5. exportar o relatório em PDF e conferir o cabeçalho;
6. enviar foto de profissional (bucket `professional-photos`);
7. conectar o WhatsApp por QR code e trocar uma mensagem com o bot, conferindo que ele se apresenta como assistente do negócio;
8. desligar "Enviar lembretes por WhatsApp" e confirmar que a opção fica salva;
9. uma cobrança Pix no Asaas e uma no cartão pelo Stripe, em modo de teste.

- [ ] **Step 6: Limpeza**

Depois de tudo verificado: apagar o bucket `barber-photos` no Supabase e parar o Postgres local (`docker stop easyagenda-db`).

---

## Verificação de cobertura da especificação

| Item da especificação | Tarefa |
|---|---|
| Renomeação de tabelas, colunas, índices, restrições, função e políticas de RLS | 7 |
| Bucket `professional-photos` | 7, 13 |
| Variáveis das mensagens salvas no banco | 7 |
| Colunas mortas da Meta e configurações sem efeito | 6, 7 |
| `whatsapp_menu_options` fora do schema do Prisma | 7, 8 |
| Rotas `/business` e `/professionals`, sem rota antiga | 8, 9 |
| Campos e códigos de erro da API | 8 |
| Marca no backend (pacote, Asaas, e-mail, bot, seeds, `.env.example`) | 8, 10 |
| Prefixo de instância `easyagenda` | 8 |
| Proxies, tipos e componentes do frontend | 9 |
| Chaves do navegador | 9 |
| `BACKEND_ORIGIN` no lugar do endereço fixo | 9 |
| Marca no frontend, SEO, páginas legais, termos em português | 10 |
| Logotipo provisório | 11 |
| Lembrete respeitando a configuração | 4 |
| Teste grátis de 14 dias | 5 |
| Rotas de diagnóstico removidas | 3 |
| Testes quebrados corrigidos | 1 |
| CI com typecheck e testes obrigatórios | 2 |
| Roteiro de troca de domínio | 12 |
| Backup, variáveis, migration e roteiro manual | 13 |
