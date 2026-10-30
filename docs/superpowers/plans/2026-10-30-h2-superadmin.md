# H2: SuperAdmin (plano de implementação)

> **Para agentes:** SUB-SKILL OBRIGATÓRIA: use superpowers:subagent-driven-development (recomendado) ou superpowers:executing-plans para implementar este plano tarefa por tarefa. Os passos usam checkbox (`- [ ]`) para acompanhamento.

**Objetivo:** o SuperAdmin passa a ter três telas fiéis ao Stitch: Visão geral, Gestão de negócios e Detalhes do negócio. Elas respondem quanto entra por mês, quem está perto de virar cliente pagante e quem está perto de ir embora, e permitem agir na hora. Todo número vem do banco.

**Arquitetura:**
- Uma consulta SQL (`painelRepository.linhasNegocios`) traz uma linha por negócio, com os campos e agregados de que as três telas precisam.
- Funções puras (`painel.rules.ts`) calculam o status de cada negócio, o MRR, a conversão, os cancelamentos, os cartões e os negócios em risco.
- O status de cobrança usa `calcularEstadoConta` da H1. Nenhuma regra de contingência é repetida.
- Filtro de status, paginação e cartões rodam em memória sobre essas linhas. **(Decisão do plano:** o status depende da regra da H1, que é TypeScript. Repetir a regra em SQL quebraria a fonte única. Com a base de hoje, de dezenas de negócios, a consulta única é barata. Rever se a base passar de uns 5 mil negócios.)
- O detalhe soma consultas próprias (LTV, uso, auditoria) e reaproveita `billingInfoService.faturas`.

**Tecnologia:** Express + Prisma (SQL cru, como o `adminRepository`), Zod, Vitest com Prisma mockado e supertest, Next.js (App Router) + Tailwind com tokens do DESIGN.md e Material Symbols.

**Spec:** `docs/superpowers/specs/2026-10-28-item-h-superadmin-contingencia-venda-design.md` (parte H2). Referências do Stitch em `docs/design/stitch/projeto/`, nas versões "ajustada":
- `easyagenda-superadmin-visao-geral-de-operacoes-ajustada--5f2465.html`
- `easyagenda-superadmin-gestao-de-negocios-e-assinantes-ajustada--9e95f6.html`
- `easyagenda-superadmin-detalhes-do-negocio-sa-2041-ajustada--b916d3.html`

## Restrições globais

- Textos em português do Brasil, em frase normal, com maiúscula só na primeira palavra.
- Nenhum número inventado para preencher o layout. Sem dado, a tela mostra "—" ou um estado vazio.
- Preços só de `PLAN_PRICES` (`backend/src/config/planCatalog.ts`). O SQL de hoje com 49/99/199 fixos sai.
- Planos na tela: Solo, Equipe e Salão (ids `basico`, `profissional`, `premium`). Não há plano anual.
- Segmentos: `barbearia`, `unhas`, `cilios_sobrancelhas`, `cabelo`, `estetica` e `outro` (`SEGMENTOS_VALIDOS` em `backend/src/config/vocabulario.ts`).
- Fuso das contas de mês e dia: `America/Sao_Paulo`. Colunas `timestamp` sem fuso (`created_at`, `paid_at`, `canceled_at`, `subscription_current_period_end`) guardam UTC: no SQL, converta com `col AT TIME ZONE 'UTC'` antes de comparar.
- Status do SuperAdmin (`StatusAdmin`) e rótulos:
  - `ativo`: Ativo
  - `teste`: Teste
  - `carencia`: Em carência
  - `bloqueado_cobranca`: Bloqueado por cobrança
  - `teste_encerrado`: Teste encerrado
  - `bloqueado_admin`: Bloqueado pelo admin
  - `cancelado`: Cancelado
  - **(Decisão do plano:** "Teste encerrado" não está na lista da spec. Sem ele, o fim do teste sem pagamento ficaria sem status.)
- Pagante = status `ativo` ou `carencia`. É a base do MRR, como diz a spec.
- Rotas sob `/admin` continuam com `authMiddleware` + `requireAdmin`. O frontend continua com `useRequireRole({ allowedRoles: ['platform_admin'] })`.
- Toda ação do SuperAdmin pede motivo (mínimo de 3 caracteres) e grava no `AuditLog`. A rota nova exige o motivo também no backend.
- Sem migração.
- Frontend:
  - só tokens do DESIGN.md e Material Symbols, sem `lucide` nas telas do admin;
  - todo arquivo novo ou reescrito em `src/app/admin` e `src/components/admin` entra em `frontend/src/lib/themedPaths.ts` (pastas inteiras: `'src/app/admin'` e `'src/components/admin'`);
  - o `ForcedDark` sai do admin.
- O `backend/.env` aponta para produção. Não rode nada que escreva no banco.
- O PR não abre ao fim deste plano. O dono pede o PR quando quiser.

## Pontos de atenção na revisão

1. **Negócio sem pagamento nenhum, sem segmento ou sem plano conhecido.** Plano fora do catálogo vale 0 no MRR, e segmento nulo ou desconhecido conta como `outro`. Nada pode virar `NaN` nem quebrar a tela. Teste na Tarefa 1.
2. **Divisão por zero.** Conversão sem negócio criado no período, retenção sem pagante no mês anterior e variação do MRR sem MRR anterior devolvem `null`, e a tela mostra "—". Teste na Tarefa 1.
3. **Virada do mês no fuso.** Um pagamento às 23h do dia 31 em São Paulo (02h UTC do dia 1º) conta no mês que terminou. Teste na Tarefa 1, com `inicioDoMes`.
4. **Faturas de negócio bloqueado pelo admin.** `billingInfoService.faturas` lê o contexto só de negócio `active = true` e lança erro nos outros. O detalhe precisa abrir mesmo assim, com `faturas: null`. Teste na Tarefa 4.
5. **Estender teste de quem tem assinatura no gateway.** Com `stripe_subscription_id` ou `provider_subscription_id`, o teste é do gateway, e o webhook desfaria a mudança. A rota responde 409 e não muda nada. Teste na Tarefa 5.

---

### Tarefa 1: Regras do painel (funções puras)

**Arquivos:**
- Criar: `backend/src/modules/admin/painel.rules.ts`
- Teste: `backend/src/__tests__/adminPainelRules.test.ts`

**Interfaces:**
- Consome: `calcularEstadoConta` (`modules/conta/estadoConta.rules.ts`), `normalizeInternalSubscriptionStatus` (`services/billing/statusMapper.ts`), `PLAN_PRICES`, `SEGMENTOS_VALIDOS`.
- Produz:
  ```ts
  export interface LinhaNegocio {
    id: string; nome: string; dono: string; email: string; whatsapp: string;
    cpfCnpj: string | null; endereco: string | null; segmento: string | null;
    plano: string; statusAssinatura: string; ativo: boolean;
    inadimplenteDesde: Date | null; jaPagou: boolean; fimDoPeriodo: Date | null; pix: boolean;
    criadoEm: Date; canceladoEm: Date | null; onboardingConcluido: boolean;
    temInstanciaWhatsapp: boolean; whatsappConectadoEm: Date | null; ultimoEnvioEm: Date | null;
    agendamentos30d: number; ultimoAgendamentoEm: Date | null;
    primeiroPagamentoEm: Date | null; pagouMesAnterior: boolean;
  }
  export type StatusAdmin = 'ativo' | 'teste' | 'carencia' | 'bloqueado_cobranca' | 'teste_encerrado' | 'bloqueado_admin' | 'cancelado';
  export type TipoAlerta = 'cobranca' | 'teste_sem_onboarding' | 'whatsapp' | 'sem_agendamento';
  export function inicioDoMes(agora: Date, mesesAtras?: number): Date;  // meia-noite do dia 1º em America/Sao_Paulo
  export function precoDoPlano(plano: string): number;                   // 0 fora do catálogo
  export function segmentoDe(segmento: string | null): string;          // 'outro' fora da lista
  export function statusAdmin(l: LinhaNegocio, agora: Date): StatusAdmin;
  export function resumoMrr(ls: LinhaNegocio[], agora: Date): { mrr: number; mrrMesAnterior: number; variacaoPct: number | null; novos: number; churn: number };
  export function resumoTestes(ls: LinhaNegocio[], agora: Date): { ativos: number; vencendo48h: number; novosNaSemana: number };
  export function conversaoPorSegmento(ls: LinhaNegocio[], agora: Date, dias: number): {
    geral: { criados: number; pagantes: number; taxaPct: number | null };
    segmentos: Array<{ segmento: string; criados: number; pagantes: number; taxaPct: number | null; ticketMedio: number | null }>;
  };
  export function resumoCancelamentos(ls: LinhaNegocio[], agora: Date): { cancelamentosMes: number; churnContas: number; receitaCancelada: number; retencaoPct: number | null };
  export function cartoesGestao(ls: LinhaNegocio[], agora: Date): {
    base: number; pagantes: number; mrr: number; ticketMedio: number | null;
    testes: number; testesVencemHoje: number; conversaoPct: number | null;
    inadimplentes: number; valorPendente: number; bloqueioTotal: number;
  };
  export function negociosEmRisco(ls: LinhaNegocio[], agora: Date): Array<{
    id: string; nome: string; dono: string; whatsapp: string; segmento: string; plano: string;
    tipo: TipoAlerta; desde: Date; mrr: number;
  }>;
  ```

Regras que os testes fixam:
- `statusAdmin`:
  - `!ativo` → `bloqueado_admin`, antes de qualquer outra regra;
  - senão, `calcularEstadoConta({ status: normalizeInternalSubscriptionStatus(statusAssinatura), inadimplenteDesde, jaPagou, fimDoPeriodo, agora, pix })` decide:
    - `ativa` com status `trialing` → `teste`; `ativa` com outro status → `ativo`;
    - `carencia` → `carencia`;
    - `bloqueada` com motivo `cobranca` → `bloqueado_cobranca`, `teste` → `teste_encerrado` e `cancelada` → `cancelado`.
- `resumoMrr`:
  - `mrr` = Σ preço dos pagantes;
  - `mrrMesAnterior` = Σ preço de quem tem `pagouMesAnterior`;
  - `novos` = Σ preço dos pagantes com `primeiroPagamentoEm >= inicioDoMes(agora)`;
  - `churn` = Σ preço de quem tem `pagouMesAnterior` e status `cancelado` ou `bloqueado_cobranca`;
  - `variacaoPct` = `(mrr - mrrMesAnterior) / mrrMesAnterior * 100`, ou `null` quando `mrrMesAnterior` é 0;
  - o preço é o do plano atual, porque não há histórico de troca de plano.
- `resumoTestes`:
  - `ativos` = status `teste`;
  - `vencendo48h` = testes com `fimDoPeriodo` em `(agora, agora + 48 h]`;
  - `novosNaSemana` = testes com `criadoEm >= agora - 7 dias`.
- `conversaoPorSegmento`:
  - coorte = `criadoEm >= agora - dias`, e pagante da coorte = `jaPagou`;
  - `taxaPct` = pagantes / criados × 100, ou `null` quando criados é 0;
  - `ticketMedio` = média do preço dos pagantes de hoje naquele segmento (fora da coorte), ou `null` quando não há nenhum;
  - devolve sempre os 6 segmentos, na ordem de `SEGMENTOS_VALIDOS`.
- `resumoCancelamentos`:
  - `cancelamentosMes` = `canceladoEm >= inicioDoMes(agora)`;
  - `churnContas` e `receitaCancelada` vêm do mesmo critério do `churn`;
  - `retencaoPct` = `(base - churnContas) / base * 100`, com base = quantos têm `pagouMesAnterior`, ou `null` quando a base é 0.
- `cartoesGestao`:
  - `testesVencemHoje` = testes cujo `fimDoPeriodo` cai no dia local de `agora`;
  - `conversaoPct` = a `geral.taxaPct` de `conversaoPorSegmento(ls, agora, 30)`;
  - `inadimplentes` = `carencia` + `bloqueado_cobranca`, e `valorPendente` = Σ preço deles;
  - `bloqueioTotal` = só `bloqueado_cobranca`.
- `negociosEmRisco`: no máximo um alerta por negócio, o primeiro que casar nesta ordem:
  1. `cobranca`: status `carencia` ou `bloqueado_cobranca`; `desde` = `inadimplenteDesde ?? agora`;
  2. `teste_sem_onboarding`: status `teste`, `fimDoPeriodo` em `(agora, agora + 48 h]` e `!onboardingConcluido`; `desde` = `criadoEm`;
  3. `whatsapp`: status `ativo`, `teste` ou `carencia`; `temInstanciaWhatsapp`, `whatsappConectadoEm === null` e `ultimoEnvioEm < agora - 2 dias`; `desde` = `ultimoEnvioEm`. **(Decisão do plano:** o sistema apaga `whatsapp_connected_at` ao desconectar e não guarda a hora da queda. O último envio que saiu é a "última conexão conhecida" que a spec pede. Sem envio nenhum, não há alerta.)
  4. `sem_agendamento`: status `ativo` ou `carencia`, `jaPagou` e `(ultimoAgendamentoEm ?? primeiroPagamentoEm) < agora - 7 dias`; `desde` = esse valor.
  - A lista sai ordenada pela ordem acima e, dentro do mesmo tipo, pelo `desde` mais antigo.
  - `mrr` = preço do plano. No teste é o valor em potencial, e a tela diz "potencial".

- [ ] **Passo 1: escrever os testes**, com uma fábrica `linha(parcial)` de valores neutros (status `active`, `jaPagou: true`, plano `profissional`). Casos mínimos:
  - `statusAdmin`:
    - `ativo: false` com status `active` → `bloqueado_admin`;
    - `trialing` → `teste`;
    - `past_due`, já pagou, `inadimplenteDesde` há 3 dias → `carencia`;
    - o mesmo há 8 dias → `bloqueado_cobranca`;
    - `incomplete` sem pagamento → `teste_encerrado`;
    - `canceled` → `cancelado`.
  - `precoDoPlano('anual')` → `0`; `segmentoDe(null)` e `segmentoDe('xyz')` → `'outro'`.
  - `resumoMrr`:
    - 2 Equipe ativos e 1 Solo em carência → `mrr === 2 * PLAN_PRICES.profissional + PLAN_PRICES.basico`;
    - sem ninguém com `pagouMesAnterior` → `variacaoPct === null`;
    - um Equipe com `pagouMesAnterior` que hoje está `canceled` → `churn === PLAN_PRICES.profissional`.
  - `inicioDoMes(new Date('2026-11-01T02:30:00Z'))` → `2026-10-01T03:00:00.000Z`, porque ainda é 31/10 em São Paulo.
  - `conversaoPorSegmento`:
    - lista vazia → 6 segmentos com `taxaPct === null` e `geral.taxaPct === null`;
    - 4 `unhas` criados há 10 dias, 1 com `jaPagou` → `unhas.taxaPct === 25`.
  - `resumoCancelamentos` sem pagantes no mês anterior → `retencaoPct === null`.
  - `negociosEmRisco`:
    - um negócio em carência e com o WhatsApp caído sai uma vez só, com `tipo: 'cobranca'`;
    - `ultimoEnvioEm` nulo não gera alerta de `whatsapp`;
    - teste vencendo em 30 h com `onboardingConcluido: false` gera `teste_sem_onboarding`, e com `true` não gera nada;
    - pagante com o último agendamento há 8 dias gera `sem_agendamento`, e há 6 dias não gera.
- [ ] **Passo 2: rodar e ver falhar.** Rode `cd backend && npx vitest run src/__tests__/adminPainelRules.test.ts`. Esperado: FAIL, porque o módulo não existe.
- [ ] **Passo 3: implementar `painel.rules.ts`** com as assinaturas acima. `inicioDoMes` usa `Intl.DateTimeFormat` com `timeZone: 'America/Sao_Paulo'` para achar ano e mês locais e devolve a meia-noite local em UTC. São Paulo não tem horário de verão desde 2019: o deslocamento é −03:00 fixo, e um comentário deve dizer isso.
- [ ] **Passo 4: rodar e ver passar.** Mesmo comando. Esperado: PASS.
- [ ] **Passo 5: commit.** `feat(superadmin): regras do painel sobre o estado da conta`

---

### Tarefa 2: Consulta das linhas de negócio

**Arquivos:**
- Criar: `backend/src/modules/admin/painel.repository.ts`
- Teste: `backend/src/__tests__/adminPainelRepository.test.ts`

**Interfaces:**
- Consome: `LinhaNegocio` (Tarefa 1), `prisma`.
- Produz:
  ```ts
  export const SQL_PAGAMENTOS_CONFIRMADOS: Prisma.Sql; // CTE pagamentos(business_id, pago_em timestamptz, valor numeric)
  export const painelRepository = {
    linhasNegocios(): Promise<LinhaNegocio[]>;
    linhaNegocio(id: string): Promise<LinhaNegocio | null>;
  };
  ```

- [ ] **Passo 1: escrever o teste**, com `prisma.$queryRaw` mockado devolvendo uma linha crua em snake_case, como o Postgres devolve (contagens como `bigint` ou string, datas como `Date`, `segment: null`). Afirmações:
  - `agendamentos30d` é `number`;
  - `segmento` é `null`;
  - `jaPagou` e `pagouMesAnterior` são booleanos;
  - `pix` é `true` quando `provider = 'asaas'` ou `payment_method = 'pix'`;
  - `fimDoPeriodo` usa `current_period_end` e cai para `subscription_current_period_end` quando o primeiro é nulo;
  - `linhaNegocio` devolve `null` quando a consulta vem vazia.
- [ ] **Passo 2: rodar e ver falhar.** Rode `npx vitest run src/__tests__/adminPainelRepository.test.ts`. Esperado: FAIL.
- [ ] **Passo 3: implementar.** Uma consulta com o CTE de pagamentos e um `WHERE` opcional por id. Origem de cada campo:
  - `pagamentos`: `UNION ALL` de `billing_payments` com `paid_at IS NOT NULL` (`pago_em = paid_at AT TIME ZONE 'UTC'`, `valor = amount`) e de `subscription_events` com `event_type IN ('invoice.paid','invoice.payment_succeeded')` e `amount_paid > 0` (mesmo `CASE` com regex de `subscriptionRepository.getBusinessBillingContext`; `valor = amount_paid / 100`).
  - `ja_pagou`: mesma expressão de `getBusinessBillingContext`, para não divergir da H1.
  - `primeiro_pagamento_em`: `MIN(pago_em)`.
  - `pagou_mes_anterior`: existe pagamento com `pago_em` em `[início do mês anterior, início do mês atual)`, com os limites no fuso de São Paulo: `date_trunc('month', now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo'`.
  - `segment`: `LEFT JOIN business_settings`.
  - `agendamentos_30d`: `COUNT` de `appointments` com `created_at AT TIME ZONE 'UTC' >= now() - interval '30 days'`.
  - `ultimo_agendamento_em`: `MAX(created_at)` de `appointments`.
  - `ultimo_envio_em`: `MAX(enviado_em)` de `whatsapp_envios` com `status = 'enviado'`.
  - `tem_instancia_whatsapp`: `whatsapp_instance_name IS NOT NULL`.
  - `onboarding_concluido`: `onboarding_concluido_em IS NOT NULL`.

  Use subconsultas `LEFT JOIN LATERAL` agregadas por negócio, como o `tenant_base` de `adminRepository.listTenants`. Um mapeador `paraLinha(row)` converte os tipos.
- [ ] **Passo 4: rodar e ver passar.** Mesmo comando. Esperado: PASS.
- [ ] **Passo 5: commit.** `feat(superadmin): linhas de negócio para o painel`

---

### Tarefa 3: Visão geral e lista de negócios na API

**Arquivos:**
- Criar: `backend/src/modules/admin/painel.service.ts`
- Modificar:
  - `backend/src/validators/schemas/adminSchemas.ts`: troca `adminTenantListQuerySchema`;
  - `backend/src/controllers/adminController.ts`: `getAdminMetrics` e `getAdminTenants` passam para o serviço novo, e entra `exportAdminTenants`;
  - `backend/src/routes/admin.ts`: entra `GET /tenants/export.csv`, antes de `/tenants/:id`.
- Remover: `backend/src/services/adminMetricsService.ts`, `adminRepository.getPlatformMetrics` e `adminRepository.listTenants`, se não sobrar uso (confira com `grep`).
- Teste: `backend/src/__tests__/adminPainelRotas.test.ts`

**Interfaces:**
- Consome: `painelRepository.linhasNegocios` e as regras da Tarefa 1.
- Produz:
  - `GET /admin/metrics?periodDays=30` → `{ atualizadoEm: string, mrr, testes, conversao, cancelamentos, emRisco, disparos24h }`, com os retornos das funções da Tarefa 1. `disparos24h` vem de `painelRepository.disparos24h(): Promise<Array<{ origem: string; enviados: number; falhos: number }>>`: `whatsapp_envios` das últimas 24 h, agrupados por `origin`.
  - `GET /admin/tenants`, com query `{ page=1, limit (6|20|50|100, padrão 20), busca?, segmento?, status?: StatusAdmin, plano? }` → `{ data: NegocioListado[], meta: { total, page, limit, totalPages }, cartoes, segmentos: Array<{ segmento, total }> }`. Tipos:
    - `NegocioListado = { id, nome, dono, email, whatsapp, endereco, segmento, plano, preco, status: StatusAdmin, whatsappConectado: boolean, whatsappConectadoEm, agendamentos30d, ultimaAtividadeEm, diasRestantesTeste: number | null }`;
    - `ultimaAtividadeEm` = `ultimoAgendamentoEm`;
    - `diasRestantesTeste` é calculado só para `teste`.
  - `GET /admin/tenants/export.csv` aceita os mesmos filtros, sem paginação, e devolve `text/csv; charset=utf-8` com `Content-Disposition: attachment; filename="negocios.csv"`. Formato do backup da H1: BOM, `;` e `linhaCsv` de `modules/crm/csv.js`. Colunas: Negócio, Dono, E-mail, WhatsApp, Segmento, Plano, Valor, Status, WhatsApp conectado, Agendamentos (30 dias), Última atividade.
  - Regras de filtro:
    - `busca` compara, sem distinguir maiúsculas nem acentos, com nome, dono e e-mail, e só os dígitos com WhatsApp e CPF/CNPJ;
    - `segmentos` conta a base inteira, sem nenhum filtro;
    - `cartoes` = `cartoesGestao` da base inteira;
    - ordem: criação mais recente primeiro.

- [ ] **Passo 1: escrever os testes de rota**, com `authMiddleware` mockado (`role: 'platform_admin'`) e o `painelRepository` mockado. Casos:
  - `GET /admin/metrics` → 200, com `mrr.mrr` igual à soma esperada e `atualizadoEm` em ISO;
  - `GET /admin/tenants?status=carencia` devolve só os negócios em carência, e `meta.total` conta só eles;
  - `?limit=6&page=2` com 8 negócios → 2 itens e `totalPages: 2`;
  - `?limit=7` → 400;
  - `?busca=83988421920` acha o negócio cujo WhatsApp é `(83) 98842-1920`;
  - `export.csv` → 200, `content-type` com `text/csv`, primeira linha começando com o BOM e com `Negócio;Dono`;
  - `role: 'tenant_admin'` → 403 em `/admin/metrics`.
- [ ] **Passo 2: rodar e ver falhar.** Rode `npx vitest run src/__tests__/adminPainelRotas.test.ts`. Esperado: FAIL.
- [ ] **Passo 3: implementar `painelService.visaoGeral(periodDays)`, `painelService.listar(filtros)` e `painelService.exportarCsv(filtros)`**, além dos controllers, do schema e da rota. Cada chamada lê `linhasNegocios()` uma vez e usa um `agora = new Date()` só.
- [ ] **Passo 4: rodar e ver passar**, junto com os testes que já existem do admin. Rode `npx vitest run src/__tests__/adminPainel*` e depois `npx tsc --noEmit`. Esperado: PASS e nenhum erro de tipo.
- [ ] **Passo 5: commit.** `feat(superadmin): visão geral e lista de negócios pelo estado da conta`

---

### Tarefa 4: Detalhe do negócio e auditoria na API

**Arquivos:**
- Modificar:
  - `backend/src/modules/admin/painel.service.ts`: entram `detalhe(id)` e `auditoria(id, filtros)`;
  - `backend/src/modules/admin/painel.repository.ts`: entram `ltv(id)`, `uso(id)` e `auditoria(id, categoria, page, limit)`;
  - `backend/src/controllers/adminController.ts`: `getAdminTenantDetails` passa a usar `painelService.detalhe`, e entram `getAdminTenantAudit` e `exportAdminTenantAudit`;
  - `backend/src/routes/admin.ts`: entram `GET /tenants/:id/auditoria` e `GET /tenants/:id/auditoria.csv`;
  - `backend/src/validators/schemas/adminSchemas.ts`: entra `adminTenantAuditQuerySchema = paginationQuerySchema.extend({ categoria: z.enum(['todos','financeiro','sistema','operador']).default('todos') })`.
- Remover: `adminRepository.getTenantDetails`, se não sobrar uso.
- Teste: `backend/src/__tests__/adminPainelDetalhe.test.ts`

**Interfaces:**
- Consome: `painelRepository.linhaNegocio`, `statusAdmin`, `billingInfoService.faturas(businessId, null)`, `professionalLimit(plan)`.
- Produz `GET /admin/tenants/:id` com a resposta abaixo, ou 404 `NotFoundError('Negócio')`:
  ```ts
  {
    negocio: NegocioListado & { cpfCnpj: string | null; slug: string | null; criadoEm: string; suspensoMotivo: string | null; statusAssinatura: string; fimDoPeriodo: string | null; temAssinaturaGateway: boolean; jaPagou: boolean; usuarioDonoId: string | null };
    ltv: { total: number; ciclos: number; desde: string | null };
    proximaCobranca: { data: string; valor: number } | null; // next_due_date ?? fimDoPeriodo, só para ativo e carência
    faturas: FaturaDto[] | null;                               // null quando billingInfoService falha
    uso: {
      profissionaisAtivas: number; limiteProfissionais: number | null; // null = sem limite
      agendamentosMes: number; agendamentosComSinalMes: number;
      clientes: number; clientesNovosMes: number;
      lembretesLigados: boolean;                                       // business_settings.whatsapp_reminders
      enviosMes: { enviados: number; falhos: number };
      paginaPublica: string | null;                                    // `${FRONTEND_URL sem barra final}/agendar/${slug}`; null sem slug ou sem FRONTEND_URL
    };
  }
  ```
  - `GET /admin/tenants/:id/auditoria` → `{ data: Array<{ id, criadoEm, acao, status, ator: string | null, detalhes, ip }>, meta }`. Regras:
    - só registros com `target_business_id = id`, do mais recente para o mais antigo;
    - `financeiro` = `action_type ~ '^(SUBSCRIPTION|TRIAL|BILLING)'`;
    - `sistema` = `actor_user_id IS NULL`;
    - `operador` = ator com `role = 'platform_admin'`;
    - `ator` = e-mail do ator.
  - `GET /admin/tenants/:id/auditoria.csv` usa o mesmo filtro, sem paginação, até 5.000 linhas, com as colunas Data, Ação, Status, Ator, IP e Detalhes. Os detalhes vão em JSON numa célula.
  - `usuarioDonoId` é o mesmo dono do `LEFT JOIN LATERAL` de `getTenantDetails`. As ações de bloquear e desbloquear usuário precisam dele.

- [ ] **Passo 1: escrever os testes**, com o repositório e o `billingInfoService` mockados. Casos:
  - id inexistente → 404;
  - `billingInfoService.faturas` rejeitando → 200 com `faturas: null`;
  - LTV com 3 pagamentos de 99 → `{ total: 297, ciclos: 3 }`;
  - plano `premium` → `limiteProfissionais: null`;
  - sem `FRONTEND_URL` → `paginaPublica: null`, e com `FRONTEND_URL=https://x.tech/` e slug `ana` → `https://x.tech/agendar/ana`;
  - auditoria com `categoria=financeiro` → o repositório recebe `'financeiro'`;
  - `auditoria.csv` → `text/csv` com o cabeçalho `Data;Ação;Status;Ator;IP;Detalhes`.
- [ ] **Passo 2: rodar e ver falhar.** Rode `npx vitest run src/__tests__/adminPainelDetalhe.test.ts`. Esperado: FAIL.
- [ ] **Passo 3: implementar.** O LTV soma o CTE `SQL_PAGAMENTOS_CONFIRMADOS` daquele negócio. "Mês" no uso é o mês local, com `inicioDoMes`. `agendamentosComSinalMes` conta `deposit_amount > 0`.
- [ ] **Passo 4: rodar e ver passar.** Rode `npx vitest run src/__tests__/adminPainel*` e `npx tsc --noEmit`. Esperado: PASS.
- [ ] **Passo 5: commit.** `feat(superadmin): detalhe do negócio com LTV, uso, faturas e auditoria`

---

### Tarefa 5: Estender o teste grátis

**Arquivos:**
- Modificar:
  - `backend/src/validators/schemas/adminSchemas.ts`: entra `adminExtendTrialBodySchema = z.object({ confirmation: z.literal('CONFIRM'), dias: z.coerce.number().int().min(1).max(30), reason: z.string().trim().min(3).max(255) })`. Aqui o motivo é obrigatório;
  - `backend/src/services/adminService.ts`: entra `estenderTeste`;
  - `backend/src/repositories/adminRepository.ts`: entra `estenderTeste(id, dias)`;
  - `backend/src/controllers/adminController.ts` e `backend/src/routes/admin.ts`: entra `PATCH /tenants/:id/trial`.
- Teste: `backend/src/__tests__/adminEstenderTeste.test.ts`

**Interfaces:**
- Consome: `painelRepository.linhaNegocio` (status, `jaPagou`, `fimDoPeriodo`), `estadoContaService.invalidar(id)`, `auditLogService.logAdminAction` e `safeLogFailure`.
- Produz `PATCH /admin/tenants/:id/trial` → `{ tenantId, fimDoTeste: string }`. Regras:
  - 404 quando o negócio não existe;
  - 409 `ConflictError('O teste só pode ser estendido para quem está em teste ou terminou o teste sem pagar.')` quando o status não é `trialing` nem `incomplete` sem `jaPagou`;
  - 409 `ConflictError('Este teste é controlado pelo gateway de pagamento.')` quando há `stripe_subscription_id` ou `provider_subscription_id`;
  - no caso válido: `UPDATE businesses SET subscription_status = 'trialing', subscription_current_period_end = GREATEST(COALESCE(subscription_current_period_end, NOW()), NOW()) + make_interval(days => dias), subscription_updated_at = NOW() WHERE id = ... RETURNING subscription_current_period_end`;
  - auditoria `actionType: 'TRIAL_EXTENDED'`, com `details: { dias, reason, fimAnterior, fimNovo }`, e `estadoContaService.invalidar(id)`.

  A base é o maior entre o fim atual e agora. Assim, um teste já vencido ganha os dias a partir de hoje, e não a partir do vencimento.

- [ ] **Passo 1: escrever os testes de rota.** Casos:
  - `trialing` sem gateway, com o fim em 2 dias e `dias: 5` → 200, e a auditoria `TRIAL_EXTENDED` gravada;
  - `incomplete` com `jaPagou: true` → 409, sem `UPDATE`;
  - `trialing` com `stripe_subscription_id` → 409;
  - `dias: 31` → 400;
  - sem `reason` → 400;
  - o cache do estado é invalidado no caso válido.
- [ ] **Passo 2: rodar e ver falhar.** Rode `npx vitest run src/__tests__/adminEstenderTeste.test.ts`. Esperado: FAIL.
- [ ] **Passo 3: implementar**, no estilo de `overrideStatus`, com `ensureConfirmed` e o log de falha.
- [ ] **Passo 4: rodar e ver passar.** Mesmo comando, depois `npx tsc --noEmit`. Esperado: PASS.
- [ ] **Passo 5: commit.** `feat(superadmin): estender o teste grátis com motivo e auditoria`

---

### Tarefa 6: Casca do admin no tema do painel, tipos e redirecionamentos

**Arquivos:**
- Modificar:
  - `frontend/src/app/admin/layout.tsx`: sai o `ForcedDark`, e o esqueleto de carregamento usa tokens;
  - `frontend/src/components/admin/AdminLayoutShell.tsx`, `AdminSidebar.tsx`, `AdminTopbar.tsx`, `AdminStatusBadge.tsx` e `AdminConfirmModal.tsx`: tokens e Material Symbols;
  - `frontend/src/types/admin.ts`: tipos da API nova, com os nomes das Tarefas 3 a 5;
  - `frontend/src/lib/adminApi.ts`: `getMetrics`, `getTenants(filtros)`, `exportTenantsCsv(filtros): Promise<Blob>`, `getTenantDetails(id)`, `getTenantAudit(id, filtros)`, `exportTenantAuditCsv(id, categoria): Promise<Blob>` e `extendTrial(id, dias, reason)`;
  - `frontend/src/lib/themedPaths.ts`: entram `'src/components/admin'`, `'src/app/admin/layout.tsx'`, `'src/app/admin/page.tsx'` e `'src/app/admin/negocios'` (a pasta `src/app/admin` inteira só na Tarefa 10);
  - `frontend/src/app/admin/metrics/page.tsx`, `tenants/page.tsx` e `subscriptions/page.tsx`: cada um passa a só chamar `redirect()` de `next/navigation` (`/admin`, `/admin/negocios` e `/admin/negocios?status=carencia`).
- Criar:
  - `frontend/src/lib/adminRotulos.ts`: rótulos de status, plano e segmento, e a função `mensagemAlerta(tipo, dono, negocio)`;
  - `frontend/src/app/admin/negocios/page.tsx` e `negocios/[id]/page.tsx`, vazios por enquanto, com o título;
  - `frontend/src/components/admin/AcaoComMotivoModal.tsx`: modal com motivo obrigatório (mínimo de 3 caracteres) e um campo extra opcional (`dias`, para estender o teste).
- Remover: `AdminMetricCard.tsx`, se ninguém mais usar.
- Teste: `frontend/src/components/admin/__tests__/AcaoComMotivoModal.test.tsx` e `frontend/src/lib/__tests__/adminRotulos.test.ts`

**Interfaces:**
- Produz:
  - Menu do admin, nesta ordem: Visão geral (`/admin`, `monitoring`), Negócios (`/admin/negocios`, `storefront`), Cupons (`/admin/coupons`, `sell`) e Auditoria (`/admin/logs`, `security`).
  - `mensagemAlerta(tipo: TipoAlerta, dono: string, negocio: string): string`, com estes textos (só o primeiro nome do dono):
    - `cobranca`: `Oi, {dono}! Aqui é do EasyAgenda+. A mensalidade do {negocio} ainda não foi confirmada. Quer ajuda para regularizar? Dá para pagar pelo Pix direto no painel.`
    - `teste_sem_onboarding`: `Oi, {dono}! Aqui é do EasyAgenda+. O teste grátis do {negocio} termina em breve e a configuração ainda não foi concluída. Quer ajuda para terminar?`
    - `whatsapp`: `Oi, {dono}! Aqui é do EasyAgenda+. O WhatsApp do {negocio} está desconectado, então os lembretes não estão saindo. Quer ajuda para reconectar?`
    - `sem_agendamento`: `Oi, {dono}! Aqui é do EasyAgenda+. O {negocio} não registra agendamentos há alguns dias. Está tudo certo por aí? Podemos ajudar?`
  - O link sai de `linkWhatsapp(telefone, mensagem)` em `frontend/src/lib/whatsappLink.ts`, que já põe o 55.
  - `<AcaoComMotivoModal titulo descricao rotuloConfirmar perigo? campoDias? onConfirmar(motivo, dias?) onFechar />`.

- [ ] **Passo 1: escrever os testes.** Casos:
  - `mensagemAlerta('whatsapp', 'Carla Renata Silva', 'Studio Aurora')` começa com `Oi, Carla!` e contém `Studio Aurora`;
  - o modal deixa "Confirmar" desabilitado com motivo de 2 caracteres e habilitado com 3;
  - com `campoDias`, `dias` fora de 1 a 30 desabilita o botão;
  - `onConfirmar` recebe `('motivo ok', 5)`.
- [ ] **Passo 2: rodar e ver falhar.** Rode `cd frontend && npx vitest run src/components/admin src/lib/__tests__/adminRotulos.test.ts`. Esperado: FAIL.
- [ ] **Passo 3: implementar** os arquivos acima. O admin passa a seguir o tema do aparelho, como o painel.
- [ ] **Passo 4: rodar e ver passar**, incluindo o `themeCompliance`. Rode `npx vitest run src/components/admin src/lib src/__tests__/themeCompliance.test.ts` e `npx tsc --noEmit`. Esperado: PASS. As páginas `coupons` e `logs` ainda têm cores fixas e vão reprovar no `themeCompliance`. Elas mudam na Tarefa 10, então até lá deixe as duas fora da lista: troque `'src/app/admin'` pelas páginas exatas e ponha a pasta inteira só na Tarefa 10.
- [ ] **Passo 5: commit.** `feat(superadmin): casca no tema do painel, API nova e rotas antigas redirecionadas`

---

### Tarefa 7: Tela Visão geral (`/admin`)

**Arquivos:**
- Modificar: `frontend/src/app/admin/page.tsx`
- Criar: `frontend/src/components/admin/visaoGeral/` (`CartaoMrr.tsx`, `CartaoTestes.tsx`, `CartaoConversao.tsx`, `CartaoCancelamentos.tsx`, `ConversaoPorSegmento.tsx`, `TabelaEmRisco.tsx` e `DisparosWhatsapp.tsx`)
- Teste: `frontend/src/app/admin/__tests__/VisaoGeral.test.tsx`

**Interfaces:**
- Consome: `adminApi.getMetrics`, `mensagemAlerta`, `linkWhatsapp`, rótulos.

Conteúdo, fiel ao Stitch, com os desvios da spec:
- O cabeçalho mostra "Atualizado às HH:MM" (de `atualizadoEm`) e um botão de recarregar. "Tempo real", "Exportar BI" e o seletor de período não entram.
- MRR:
  - valor, variação em % (com "—" quando é `null`), Novos e Churn em reais;
  - sem o bloco "Expansão".
- Testes grátis ativos:
  - `ativos`, "+{novosNaSemana} nesta semana" e "Vencendo em 48 h: {vencendo48h}";
  - o texto "Contas em período experimental de {TRIAL_DAYS} dias" usa 14, de uma constante do frontend. Confira se `frontend/src/lib` já tem `TRIAL_DAYS` antes de criar outra.
- Conversão geral:
  - taxa, "{pagantes} de {criados} convertidos" e a diferença em pontos para a meta;
  - `META_CONVERSAO_PCT = 25`, constante em `ConversaoPorSegmento.tsx`.
- Cancelamentos do mês: `cancelamentosMes`, "Receita cancelada no período: R$ {receitaCancelada}" e "Retenção {retencaoPct}%".
- Conversão por segmento:
  - 6 colunas com barra da taxa e a linha da meta de 25%;
  - em cada uma, "Testes no período: {criados}", "Pagantes: {pagantes}" e "Ticket médio: R$ {ticketMedio}/mês";
  - o selo do Stitch embaixo de cada segmento ("Alta retenção orgânica" etc.) não entra, porque seria inventado.
- Negócios em risco:
  - colunas Negócio e responsável, Segmento, Alerta, Há quanto tempo, MRR e Ação;
  - textos dos alertas:
    - `cobranca`: "Cobrança em atraso";
    - `teste_sem_onboarding`: "Teste vence em até 48 h sem configuração concluída";
    - `whatsapp`: "WhatsApp desconectado";
    - `sem_agendamento`: "Sem agendamentos novos";
  - a ação é "Avisar no WhatsApp", um link `target="_blank"` de `linkWhatsapp`;
  - o nome do negócio leva a `/admin/negocios/{id}`;
  - vazio: "Nenhum negócio em risco agora.";
  - "Disparar resgate em lote" e "Ver fila completa" não entram.
- Disparos de WhatsApp (24 h): enviados e falhos por origem, com rótulos para `lembrete`, `confirmacao`, `sinal_pix`, `retorno` e "Outros" para o resto. **(Decisão do plano:** o bloco está no Stitch e a spec não o tira. A "taxa 99,4%" vira a conta real enviados / (enviados + falhos), com "—" quando não há envio.)

- [ ] **Passo 1: escrever o teste** com `adminApi.getMetrics` mockado. Casos:
  - mostra `R$ 297,00` para `mrr.mrr = 297`;
  - `variacaoPct: null` mostra "—";
  - não existe o texto "Expansão" nem "Exportar BI";
  - a tabela de risco tem um link com `href` começando por `https://wa.me/55`;
  - lista de risco vazia mostra "Nenhum negócio em risco agora.";
  - recarregar chama `getMetrics` de novo.
- [ ] **Passo 2: rodar e ver falhar.** Rode `npx vitest run src/app/admin/__tests__/VisaoGeral.test.tsx`. Esperado: FAIL.
- [ ] **Passo 3: implementar**, seguindo o HTML do Stitch para grade, hierarquia e espaçamento.
- [ ] **Passo 4: rodar e ver passar.** Mesmo comando e `npx tsc --noEmit`. Esperado: PASS.
- [ ] **Passo 5: commit.** `feat(superadmin): visão geral com MRR, conversão por segmento e negócios em risco`

---

### Tarefa 8: Tela Gestão de negócios (`/admin/negocios`)

**Arquivos:**
- Modificar: `frontend/src/app/admin/negocios/page.tsx`
- Criar: `frontend/src/components/admin/negocios/` (`CartoesGestao.tsx`, `FiltrosNegocios.tsx` e `TabelaNegocios.tsx`)
- Teste: `frontend/src/app/admin/negocios/__tests__/GestaoNegocios.test.tsx`

**Interfaces:**
- Consome: `adminApi.getTenants`, `adminApi.exportTenantsCsv`, rótulos.

Conteúdo:
- Cartões:
  - Base total;
  - Assinaturas ativas, com MRR e ticket médio;
  - Testes em andamento, com quantos vencem hoje e a conversão média;
  - Alerta de inadimplência, com contagem, "R$ {valorPendente} pendente" e "{bloqueioTotal} em bloqueio total".
- Filtros:
  - pílulas de segmento com contagem, mais "Todos";
  - busca com o placeholder "Buscar por nome, e-mail, WhatsApp ou CPF/CNPJ" e espera de 300 ms;
  - status, com os 7 rótulos e "Todos";
  - plano: Solo, Equipe, Salão e "Todos".
- O estado dos filtros e da página fica na URL (`useSearchParams`). Assim, o redirecionamento de `/admin/subscriptions?status=carencia` cai filtrado.
- Colunas:
  - Negócio e cidade: nome, dono e `endereco` quando houver, sem inventar cidade;
  - Segmento;
  - Plano e valor ("Equipe · R$ 99,90/mês");
  - Status, com "{n} dias restantes" embaixo para teste;
  - WhatsApp: "Conectado" ou "Desconectado";
  - Agendamentos (30 dias);
  - Última atividade, em tempo relativo ("Há 3 dias"), ou "—";
  - Ações: "Ver detalhes", que leva a `/admin/negocios/{id}`.
- Paginação: "Exibindo {de}–{até} de {total} negócios", itens por página 6, 20, 50 e 100, anterior e próxima.
- "Exportar CSV" baixa o filtro atual.
- "+ Novo negócio manual", "Saúde WhatsApp: Instável", volume em reais e o rodapé técnico (latência, réplica, sessão) não entram.

- [ ] **Passo 1: escrever o teste** com `adminApi.getTenants` mockado. Casos:
  - clicar na pílula "Unhas" chama `getTenants` com `segmento: 'unhas'` e `page: 1`;
  - escolher "Em carência" chama com `status: 'carencia'`;
  - a linha de teste mostra "3 dias restantes";
  - sem `endereco`, nenhuma cidade aparece;
  - "Exportar CSV" chama `exportTenantsCsv` com os filtros atuais;
  - não existe o texto "Novo negócio manual".
- [ ] **Passo 2: rodar e ver falhar.** Rode `npx vitest run src/app/admin/negocios/__tests__/GestaoNegocios.test.tsx`. Esperado: FAIL.
- [ ] **Passo 3: implementar.**
- [ ] **Passo 4: rodar e ver passar.** Mesmo comando e `npx tsc --noEmit`. Esperado: PASS.
- [ ] **Passo 5: commit.** `feat(superadmin): gestão de negócios com filtros, paginação e CSV`

---

### Tarefa 9: Tela Detalhes do negócio (`/admin/negocios/[id]`)

**Arquivos:**
- Modificar: `frontend/src/app/admin/negocios/[id]/page.tsx`
- Criar: `frontend/src/components/admin/detalhe/` (`CabecalhoNegocio.tsx`, `CartoesNegocio.tsx`, `AcoesSuperAdmin.tsx`, `LinhaDoTempoCobranca.tsx`, `UsoEmProducao.tsx` e `AuditoriaNegocio.tsx`)
- Teste: `frontend/src/app/admin/negocios/[id]/__tests__/DetalheNegocio.test.tsx`

**Interfaces:**
- Consome:
  - `adminApi.getTenantDetails`, `getTenantAudit`, `exportTenantAuditCsv` e `extendTrial`;
  - as ações que já existem em `adminApi`: `blockTenant`, `unblockTenant`, `resyncSubscription`, `overrideSubscriptionPlan`, `overrideSubscriptionStatus` e `cancelSubscriptionAdmin`;
  - `AcaoComMotivoModal`.

Conteúdo:
- Trilha "SuperAdmin › Negócios › {nome}".
- Cabeçalho:
  - nome, id curto `#{id.slice(0, 8)}`, status, dono, e-mail, WhatsApp e endereço (só se houver);
  - sem "Engine", sem "Cliente verificado" e sem "#SA-".
- Cartões:
  - Plano atual: nome e "R$ {preco} / mês";
  - LTV: total, "{ciclos} ciclos" e "Desde {mês/ano}", ou "—" sem pagamento;
  - WhatsApp: "Conectado desde {data}" ou "Desconectado", sem latência.
- Ações:
  - Estender teste grátis: só aparece quando `statusAssinatura` é `trialing`, ou `incomplete` sem `jaPagou`, e sem `temAssinaturaGateway`; abre o modal com `campoDias`;
  - Bloquear ou Desbloquear acesso, conforme o status seja `bloqueado_admin`;
  - Sincronizar com o gateway;
  - Mudar plano: modal com a escolha do plano;
  - Mudar status: modal com a escolha entre `active`, `trialing`, `pending`, `past_due`, `unpaid`, `canceled` e `incomplete`;
  - Cancelar assinatura, com `perigo`;
  - toda ação usa o modal com motivo e, quando dá certo, recarrega o detalhe e a auditoria;
  - erro mostra a mensagem do backend num `Toast`;
  - "Login como negócio" e "Aplicar cupom" não entram.
- Linha do tempo de cobrança:
  - a próxima cobrança no topo, quando houver, com "Próxima cobrança · {data}" e o valor;
  - as `faturas` em ordem, cada uma com data, status, valor, forma e "2ª via" (link `url` em nova aba) quando há `url`;
  - `faturas: null` mostra "Não foi possível carregar as faturas agora.";
  - lista vazia mostra "Nenhuma fatura ainda.".
- Uso em produção:
  - Profissionais ativas: "{n} / {limite} vagas", ou "{n} · sem limite";
  - Sinal Pix: "{com sinal} de {total} agendamentos no mês", com "—" sem agendamento;
  - Clientes na base: total e "+{novos} novas no mês";
  - Lembretes do WhatsApp: "Ligados" ou "Desligados", com "{enviados} enviados e {falhos} falhos no mês";
  - Página pública: o link, ou "—";
  - "Grade de funcionamento" não entra, porque a spec não pede.
- Auditoria:
  - abas Todos, Financeiro, Sistema e Operador;
  - lista paginada com data, ação, ator e status;
  - "Exportar CSV" baixa a categoria atual;
  - o bloco "Segurança de dados e LGPD" não entra.

- [ ] **Passo 1: escrever o teste** com `adminApi` mockado. Casos:
  - mostra `#1a2b3c4d` para o id `1a2b3c4d-...`;
  - com `statusAssinatura: 'active'`, não existe "Estender teste grátis";
  - com `trialing` e sem gateway, existe, e confirmar com motivo e 5 dias chama `extendTrial(id, 5, motivo)`;
  - `faturas: null` mostra a frase de erro;
  - a aba "Financeiro" chama `getTenantAudit` com `categoria: 'financeiro'`;
  - não existem "Login como" nem "Aplicar cupom".
- [ ] **Passo 2: rodar e ver falhar.** Rode `npx vitest run "src/app/admin/negocios/[id]/__tests__/DetalheNegocio.test.tsx"`. Esperado: FAIL.
- [ ] **Passo 3: implementar.**
- [ ] **Passo 4: rodar e ver passar.** Mesmo comando e `npx tsc --noEmit`. Esperado: PASS.
- [ ] **Passo 5: commit.** `feat(superadmin): detalhes do negócio com ações, cobrança, uso e auditoria`

---

### Tarefa 10: Cupons e Auditoria no visual novo

**Arquivos:**
- Modificar: `frontend/src/app/admin/coupons/page.tsx` e `frontend/src/app/admin/logs/page.tsx`, com tokens e Material Symbols, sem mudar o comportamento;
- Modificar: `frontend/src/lib/themedPaths.ts`, que troca as páginas exatas da Tarefa 6 por `'src/app/admin'`.

- [ ] **Passo 1: trocar as classes fixas** (`gray-*`, `zinc-*`, `bg-black` etc.) pelos tokens, e os ícones `lucide` por Material Symbols.
- [ ] **Passo 2: rodar o `themeCompliance`** e os testes do admin com `npx vitest run src/app/admin src/components/admin` e o teste de tema. Esperado: PASS. Rode também `npx tsc --noEmit` e `npm run lint`. Esperado: sem erro.
- [ ] **Passo 3: commit.** `style(superadmin): cupons e auditoria nos tokens do painel`

---

### Tarefa 11: Conferência visual, documentação e verificação final

**Arquivos:**
- Modificar:
  - `docs/ROADMAP.md`: linha da H2 e a seção "Próximos passos";
  - `docs/design/SEGUIMENTO.md`: seção nova "Item H2 (SuperAdmin), pendências conhecidas".

- [ ] **Passo 1: suíte inteira.** Rode `cd backend && npx tsc --noEmit && npx vitest run` e `cd frontend && npx tsc --noEmit && npx vitest run && npm run lint`. Esperado: tudo passa. Se algum teste antigo do admin quebrar por causa da API nova, atualize-o para a forma nova. Não apague teste sem trocá-lo por um equivalente.
- [ ] **Passo 2: conferência visual com mock local**, conforme a memória do projeto: backend mock em node na porta 5000, fora do repositório, numa pasta temporária, e `next dev`. O mock responde:
  - `/api/v1/auth/me` com `role: 'platform_admin'`;
  - `/api/v1/admin/metrics`, `/admin/tenants`, `/admin/tenants/:id` e `/admin/tenants/:id/auditoria`, com dados no formato das Tarefas 3 e 4 que cubram os 7 status e os 4 tipos de alerta.

  Capture as três telas em 1440 px e 390 px, nos temas claro e escuro, e compare com o Stitch. Confira também que `/admin/tenants` e `/admin/metrics` redirecionam.
- [ ] **Passo 3: registrar no `SEGUIMENTO.md`:**
  - o SQL do painel nunca rodou num banco real: conferir MRR, conversão e em risco contra contagens manuais na primeira semana;
  - o MRR usa o preço do plano atual, sem histórico de troca;
  - o alerta de WhatsApp usa o último envio como última conexão conhecida;
  - a paginação é em memória: rever acima de uns 5 mil negócios;
  - o motivo segue opcional no backend das ações antigas (o frontend exige).
- [ ] **Passo 4: atualizar o `ROADMAP.md`.** Linha `| H2 | SuperAdmin nas três telas do Stitch | 🟡 Implementada, aguardando PR | — |`.
- [ ] **Passo 5: commit.** `docs(superadmin): seguimento e roadmap da H2`
- [ ] **Passo 6: rodar o app localmente** (memória `run-local-after-visual-work`) e passar ao dono os endereços para ele conferir.
