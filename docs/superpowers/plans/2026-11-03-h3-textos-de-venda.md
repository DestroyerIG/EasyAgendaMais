# H3: textos de venda, plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** a landing, a página de nail designers e os cards de preço só afirmam o que o sistema faz, no plano em que faz. As listas de recursos saem do catálogo único.

**Architecture:**
- O `backend/src/config/planCatalog.ts` continua sendo a fonte dos planos. O frontend ganha uma cópia tipada (`frontend/src/lib/planCatalog.ts`), e um teste de igualdade importa o arquivo do backend e compara as duas. A landing é pública e estática, por isso a cópia, e não uma chamada a `GET /billing/plans`.
- Os textos mudam no próprio arquivo de cada seção.
- Um teste de "promessas proibidas" lê o código-fonte e trava as frases falsas que este plano remove.
- Os ícones `lucide` das páginas de venda viram Material Symbols (`components/ui/Icon.tsx`).

**Tech Stack:** Next.js App Router, Tailwind com os tokens do DESIGN.md, Vitest + Testing Library (frontend), Vitest (backend).

**Spec:** `docs/superpowers/specs/2026-10-28-item-h-superadmin-contingencia-venda-design.md`, seção "H3. Textos de venda".

## Global Constraints

- Só frontend e o `planCatalog.ts`. Nada de migração ou de escrita no banco. O `backend/.env` aponta para produção.
- A regra da spec: "só afirmar o que existe, no plano em que existe".
- Texto em frase normal, com maiúscula só na primeira palavra. Respostas e textos em PT-BR.
- Ids internos dos planos (`basico`/`profissional`/`premium`) não mudam. O cliente vê Solo / Equipe / Salão.
- Os depoimentos continuam marcados como "Depoimento de exemplo". Não inventar número de clientes nem resultado.
- Fora de escopo:
  - os textos dos botões do painel;
  - páginas por segmento além de nail designers;
  - as telas `/dashboard/planos` e `/dashboard/planos/comparar`, exceto o que quebrar com a mudança do catálogo.
- O PR leva a tabela "antes e depois" desta página (seção "Textos aprovados") para o dono aprovar.

## Fatos conferidos no código (base das correções)

| Fato | Onde |
|---|---|
| Sinal é só percentual por serviço (`depositPercentage`); não existe valor fixo | `backend/src/modules/publicBooking/publicBooking.service.ts` (`calcDeposit`) |
| Sinal é Pix copia e cola estático na chave da dona; ninguém confirma sozinho. A dona confirma no painel (`aguardando_pagamento` → `confirmado`) | `publicBooking.service.ts`, `appointments.service.ts:144` |
| A reserva com sinal segura o horário por 15, 30 ou 60 min (padrão 15) e depois libera | `whatsappAutomacoes/automacoes.rules.ts` (`sinal_pix.toleranciaMin`) |
| Sinal só existe no agendamento pelo link. O robô do WhatsApp cria o agendamento já `confirmado`, sem sinal | `services/whatsapp/whatsappFlowService.ts` (`appointmentService.create`) |
| O robô funciona por menu numerado ("1 Agendar um horário"…) | `services/whatsapp/whatsappConstants.ts` (`DEFAULT_MENU_OPTIONS`) |
| Lembrete: um só, 2 h antes **ou** na véspera; ligado por padrão | `automacoes.rules.ts` (`lembrete.modo`), `automacoes.service.ts` (`montar`) |
| Confirmação ("responda 1 ou 2"), Hora de voltar e lista de espera começam **desligadas** | `automacoes.service.ts` (`montar`: `false` sem linha salva) |
| Lista de espera: no cancelamento com 60 min ou mais de antecedência, avisa até 1, 3 ou 5 entradas compatíveis (serviço, profissional, dia, turno), com o link. Quem agenda primeiro fica com a vaga | `whatsappAutomacoes/gatilhos.service.ts` (`aoCancelar`), `entradaCompativel` |
| Hora de voltar: prazo pelo ciclo da cliente ou por dias fixos (padrão 21) | `automacoes.rules.ts` (`retorno`) |
| O teste grátis é de 14 dias no plano **Equipe**, sem cartão | `services/authService.ts` (`TRIAL_PLAN = 'profissional'`), `config/trial.ts` |
| A dona cancela a assinatura sozinha em Ajustes › Plano | `frontend/src/app/dashboard/planos/page.tsx` (`cancelSubscription`) |
| Não há atendimento a domicílio, taxa de deslocamento nem intervalo entre endereços | busca por `domicil`/`deslocamento`: nada |
| O onboarding é no painel, em 5 etapas, e não pelo WhatsApp | fase 6 |
| Lista de espera e campanhas funcionam em todos os planos | `SEGUIMENTO.md`, linha 107 |
| Comissões, relatórios e app da profissional começam no Equipe; clube e salão-parceiro só no Salão | `FEATURE_MATRIX` |
| Não há suporte prioritário (fila ou canal à parte) | decisão da spec |

## Review Focus

1. **Card com o plano atual (`currentPlan`), dentro do painel.** O `PricingPlansSection` também aparece para quem já assina. A troca da lista de recursos não pode sumir com o selo "Plano atual" nem com os botões de checkout. A Task 2 testa isso.
2. **Catálogo do backend muda sem a cópia do frontend.** O teste de igualdade quebra no CI do frontend. Ele importa o arquivo real, e não uma regex sobre o texto. A Task 1 testa isso.
3. **"Várias unidades" sem o selo.** O item "em breve" precisa aparecer como "Várias unidades (em breve)" no card da landing, e não como recurso pronto. A Task 2 testa isso.
4. **A calculadora com o controle que não muda nada.** "Atendimentos por dia" não entra na conta: ou sai, ou passa a entrar. Este plano tira o controle. A Task 4 testa que a tela mostra a fórmula.
5. **Frase falsa que volta por cópia de outro arquivo.** O teste de promessas proibidas lê todos os arquivos de venda, e não só o que cada tarefa mexeu. Ele é criado na Task 3 e recebe linhas novas nas tarefas seguintes.

---

## Textos aprovados (tabela "antes e depois")

Esta tabela vai no corpo do PR. O implementador usa exatamente o texto da coluna "Depois". As "decisões do Claude" ficam marcadas para o dono rever.

### Cards de preço (`PricingPlansSection` e `planCatalog.ts`)

| Onde | Antes | Depois |
|---|---|---|
| Solo, lista | Página com galeria · Bot de WhatsApp · Lembrete e confirmação · Sinal via Pix · Radar de Retorno · Ficha de clientes · Caixa | Página com galeria · Bot de WhatsApp · Lembrete e confirmação · Sinal via Pix · Hora de voltar · Lista de espera · Campanhas · Ficha de clientes · Caixa |
| Equipe, lista | Tudo do Solo + · Comissões · Acesso das profissionais · Lista de espera · Campanhas e relatórios | Tudo do Solo + · Comissões · App da profissional · Relatórios e exportação |
| Salão, lista | Tudo do Equipe + · Clube e pacotes · Salão-parceiro · Várias unidades · Suporte prioritário | Tudo do Equipe + · Clube e pacotes · Salão-parceiro · Várias unidades (em breve) |
| Subtítulo | texto fixo | vem de `limiteProfissionais`: "1 profissional", "Até 5 profissionais", "Profissionais ilimitadas" |
| Matriz da comparação | linha "Suporte prioritário" | sai. Entram "Lista de espera com aviso automático" e "Campanhas no WhatsApp", liberadas nos três planos |
| `/pagamento`, descrição e lista | `SAAS_PLANS.description` e `features`, escritas à mão ("Agenda inteligente com encaixes", "Relatórios avançados e metas", "Base pronta para multiunidade", "Suporte prioritário"…) | `descricao` e `destaques` do catálogo **(decisão do Claude: a página de pagamento é venda e tinha a mesma lista à mão)** |

### Landing (`app/page.tsx`, `Hero.tsx` e `PublicFooter.tsx`)

| Onde | Antes | Depois |
|---|---|---|
| Hero, selo | Dados protegidos LGPD | Dados tratados conforme a LGPD |
| Hero, "Sem cartão de crédito · Cancele quando quiser" | — | mantém (conferido: teste sem cartão, cancelamento em Ajustes › Plano) |
| Dor 01, texto | …Você define a porcentagem ou valor fixo (ex: R$ 30) para travar a vaga. O Pix é gerado automaticamente e confirmado em segundos. | Quem paga com antecedência comparece. Você define o percentual do sinal em cada serviço. Quem agenda pelo seu link recebe o Pix copia e cola na hora, e você confirma o pagamento no painel. |
| Dor 01, painel | Ativo em todos os serviços · Cobrado no ato do agendamento web · 30% ou R$ 30,00 | Definido por serviço · Cobrado no agendamento pelo link · 30% do serviço |
| Dor 02, título | Radar de Retorno automático no ciclo exato | Hora de voltar: o convite de retorno no tempo certo |
| Dor 02, texto | Cada serviço tem um ciclo natural de retorno (unhas a cada 21 dias, barba a cada 15 dias). O sistema avisa o cliente no momento certo, antes que ele procure a concorrência. | Você liga a automação e escolhe o prazo: o intervalo de cada cliente ou um número fixo de dias (21 por padrão). Quando chega a hora, o cliente recebe o convite no WhatsApp, antes de procurar a concorrência. |
| Dor 02, painel | Radar de Retorno (21 dias) | Hora de voltar (21 dias) |
| Dor 03, título | Lista de espera inteligente que preenche a vaga | Lista de espera que avisa quem quer a vaga |
| Dor 03, texto | Quando alguém desmarca, o EasyAgenda+ notifica imediatamente os clientes que marcaram interesse naquele dia e turno, reocupando a cadeira sem esforço. | Com a automação ligada, quando alguém desmarca com pelo menos 1 hora de antecedência, o EasyAgenda+ avisa no WhatsApp até 1, 3 ou 5 clientes da lista que combinam com o horário, com o link para agendar. Quem agendar primeiro fica com a vaga. |
| Dor 03, painel | 4 clientes na fila de espera · Disparo de aviso simultâneo via WhatsApp · Preenchido em 4 min | 4 clientes na lista de espera · Aviso para as 3 primeiras que combinam com o horário · 3 avisos enviados |
| Dor 04, texto | …com divisão automática conforme as regras do seu negócio. | …com divisão automática conforme as regras do seu negócio. Comissões nos planos Equipe e Salão. |
| Dor 05, texto | …sem acessar o faturamento geral do negócio. | …sem acessar o faturamento geral do negócio. Nos planos Equipe e Salão. |
| Depois, item 2 | Sinal antecipado via Pix que praticamente zera o no-show e garante o faturamento. | Sinal via Pix no agendamento pelo link, que desestimula a falta. |
| Depois, item 3 | Lembretes automáticos enviados via WhatsApp com 24h e 2h de antecedência. | Lembrete automático no WhatsApp 2 horas antes ou na véspera, como você preferir. |
| Depois, item 4 | Comissões e rateio calculados automaticamente em tempo real. | Comissões calculadas automaticamente nos planos Equipe e Salão. |
| Calculadora, sobretítulo | Simulação real de faturamento | Simulação com os seus números |
| Depoimento 3 | O Radar de Retorno traz clientes de volta… | A Hora de voltar traz clientes de volta… |
| FAQ, teste grátis | …recebe acesso completo a todos os recursos da plataforma por 14 dias, sem exigir cartão de crédito no cadastro. Se optar por não continuar, o acesso é encerrado sem cobranças automáticas. | Você cria sua conta em poucos minutos e usa o plano Equipe completo por 14 dias, sem cartão de crédito. No fim do teste você escolhe o plano; se não assinar, o acesso fica pausado e nada é cobrado. |
| FAQ, equipe | …e o extrato de comissão dos atendimentos que realizaram. | …e o extrato de comissão dos atendimentos que realizaram. O acesso da equipe faz parte dos planos Equipe e Salão. |
| CTA final, texto | Junte-se a estúdios e profissionais que pararam de perder dinheiro para o no-show e para as noites de domingo respondendo mensagens. | Pare de perder dinheiro com faltas e de passar o domingo respondendo mensagens. **(decisão do Claude: não dá para afirmar uma base de clientes)** |
| Rodapé, selo | 100% em Conformidade LGPD · Seus dados e de seus clientes seguros | Dados tratados conforme a LGPD · Veja a política de privacidade (link para `/privacidade`) |
| Rodapé, recursos | Radar de Retorno | Hora de voltar |

### Calculadora (`RoiCalculator.tsx`)

| Antes | Depois |
|---|---|
| Controle "Atendimentos por dia", que não entra na conta | sai **(decisão do Claude)** |
| Com cobrança de sinal Pix antecipado e lembretes automáticos em 24h e 2h: | Com sinal via Pix e lembrete automático: |
| Você recupera até X todos os meses. | Você pode recuperar até X por mês. |
| (sem premissas) | Parágrafo abaixo do resultado: "Como calculamos: faltas por semana × 4 semanas × ticket médio. O valor recuperado supõe que o sinal e o lembrete evitam 9 em cada 10 faltas. É uma estimativa, não uma garantia." |

### Simulador do WhatsApp (`WhatsAppSimulator.tsx`)

Ele passa a mostrar o fluxo real do robô, por menu e sem sinal:

| # | De | Texto |
|---|---|---|
| 1 | cliente | Oi! Tem horário pra sexta à tarde? |
| 2 | robô | Olá! Bem-vinda ao Studio Exemplo. Responda com o número:<br>1️⃣ Agendar um horário<br>2️⃣ Ver nossos serviços<br>3️⃣ Cancelar agendamento |
| 3 | cliente | 1 |
| 4 | robô | Horários livres na sexta, 24/10:<br>1️⃣ 14:00<br>2️⃣ 16:30 |
| 5 | cliente | 1 |
| 6 | robô (confirmado) | Agendamento confirmado para sexta às 14:00. Você recebe um lembrete por aqui antes do horário. |

- Saem o bloco "Pix Copia e Cola Gerado" e o selo "Sinal confirmado!". O último balão fica com o selo "Agendamento confirmado".
- O cartão ao lado ("Sinal direto na sua conta…") ganha no fim: "O sinal é cobrado no agendamento pelo seu link."

### Página de nail designers (`app/nail-designers/page.tsx`)

| Onde | Antes | Depois |
|---|---|---|
| Dor 01, solução | A vaga só é reservada com o comprovante de R$ 20, R$ 30 ou o percentual que você estipular. O dinheiro cai direto na sua conta, sem intermediação. | Quem agenda pelo seu link paga um sinal no Pix, no percentual que você define em cada serviço. O dinheiro cai direto na sua conta, sem intermediação. |
| Dor 02, rótulo | Solução: Radar de Retorno inteligente | Solução: Hora de voltar |
| Dor 02, solução | O sistema calcula o ciclo ideal (18 a 21 dias) e manda um WhatsApp preventivo convidando para a manutenção antes de haver quebra. | Você liga a automação e define o prazo (21 dias por padrão, ou o intervalo de cada cliente). Quando chega a hora, a cliente recebe no WhatsApp o convite para a manutenção, antes de haver quebra. |
| Galeria, sobretítulo | Inovação exclusiva | Galeria na sua página |
| Galeria, texto | A cliente clica no modelo que ela ama e vai direto para o cadastro já com aquele serviço em mente. | Ver a Task 6, passo 1: o texto depende do que a página pública faz. |
| FAQ, sinal | O horário selecionado fica reservado temporariamente por 15 minutos. Se ela não enviar o comprovante Pix dentro do prazo, o sistema cancela a pré-reserva e libera o horário na sua agenda. | O horário fica reservado pelo prazo que você escolher: 15, 30 ou 60 minutos. Você confirma o Pix no painel; se o pagamento não for confirmado nesse prazo, o horário volta a ficar livre na sua agenda. |
| FAQ, domicílio | Sim! Você pode habilitar atendimento externo, definindo uma taxa de deslocamento por região e um intervalo automático entre os procedimentos… | Funciona para organizar a agenda, o sinal e os lembretes. Ainda não há taxa de deslocamento nem intervalo automático entre endereços: por enquanto, inclua o tempo de deslocamento na duração do serviço. **(decisão do Claude)** |
| CTA, rodapé | Configuração guiada em 5 minutos pelo WhatsApp. Sem dados de cartão. | Configuração guiada em 5 etapas, direto no painel. Sem dados de cartão. |

Os textos conferidos e mantidos ficam fora da tabela. O implementador lista no PR qualquer frase nova que não bater com o sistema.

---

### Task 1: Catálogo único com cópia tipada no frontend

**Files:**
- Modify: `backend/src/config/planCatalog.ts`
- Create: `frontend/src/lib/planCatalog.ts`
- Create: `frontend/src/lib/__tests__/planCatalog.test.ts`
- Modify: `frontend/src/lib/plans.ts`, `frontend/src/lib/__tests__/plans.test.ts`, `frontend/src/app/pagamento/page.tsx`
- Check: `backend/src/__tests__/planChangeRules.test.ts`, `frontend/src/app/dashboard/planos/comparar/page.tsx`

**Interfaces:**
- Produces:
  - `CATALOGO_PLANOS: CatalogoPlanos`, com o tipo de `@/lib/billing`;
  - `planoDoCatalogo(id: PlanId): PlanoCatalogo`;
  - `rotuloEquipe(limite: number | null): string`, que devolve `null → 'Profissionais ilimitadas'`, `1 → '1 profissional'` e `n → 'Até n profissionais'`.
  - Todos em `frontend/src/lib/planCatalog.ts`.

- [ ] **Step 1: Testes que falham**
  - Em `frontend/src/lib/__tests__/planCatalog.test.ts`:
    - `'a cópia do frontend é igual ao catálogo do backend'` importa o backend por caminho absoluto, para o `tsc` do Next não seguir o import, e compara com `toEqual`:
      ```ts
      const caminho = resolve(__dirname, '../../../../backend/src/config/planCatalog.ts');
      const backend = await import(/* @vite-ignore */ caminho);
      expect(CATALOGO_PLANOS).toEqual(backend.getPlanCatalog());
      ```
      No Windows, se o caminho absoluto falhar, use `pathToFileURL(caminho).href`.
    - `'rotuloEquipe'` cobre os três casos acima.
    - `'nenhum plano promete suporte prioritário'` confere que nem os `destaques` nem a matriz trazem `/Suporte prioritário/`.
    - `'lista de espera e campanhas aparecem no Solo'` confere que os `destaques` do `basico` contêm `'Lista de espera'` e `'Campanhas'`.
  - Em `plans.test.ts`, os testes que usam `features` e `description` passam a ler `planoDoCatalogo(id).destaques`/`descricao`. O teste "o Solo promete WhatsApp" continua, agora sobre o catálogo.

- [ ] **Step 2: Rodar e ver falhar**
  - Run: `cd frontend && npx vitest run src/lib/__tests__/planCatalog.test.ts src/lib/__tests__/plans.test.ts`
  - Expected: FAIL (o módulo `@/lib/planCatalog` não existe).

- [ ] **Step 3: Mudar o catálogo do backend**
  - `destaques`:
    - `basico`: `['Página com galeria', 'Bot de WhatsApp', 'Lembrete e confirmação', 'Sinal via Pix', 'Hora de voltar', 'Lista de espera', 'Campanhas', 'Ficha de clientes', 'Caixa']`;
    - `profissional`: `['Comissões', 'App da profissional', 'Relatórios e exportação']`;
    - `premium`: `['Clube e pacotes', 'Salão-parceiro']`.
  - A contagem de profissionais sai dos `destaques`: ela já está em `limiteProfissionais`.
  - `PLAN_EM_BREVE` não muda.
  - `FEATURE_MATRIX`:
    - sai a linha `suporte`;
    - entram, depois de `retorno`, `{ id: 'lista_espera', grupo: 'Agendamento e recepção', titulo: 'Lista de espera com aviso automático', basico: true, profissional: true, premium: true }` e `{ id: 'campanhas', grupo: 'Agendamento e recepção', titulo: 'Campanhas no WhatsApp', basico: true, profissional: true, premium: true }`.
  - Atualizar o comentário do topo para citar o teste de igualdade novo.

- [ ] **Step 4: Criar `frontend/src/lib/planCatalog.ts`**
  - `CATALOGO_PLANOS` é a cópia literal de `getPlanCatalog()`, com `emBreve` em cada plano.
  - Acrescentar `planoDoCatalogo` e `rotuloEquipe`.
  - Comentário de uma linha: "Cópia do backend/src/config/planCatalog.ts; o teste de igualdade quebra se divergirem."

- [ ] **Step 5: Limpar `plans.ts` e `/pagamento`**
  - Em `SaaSPlan`, saem `description` e `features`.
  - Em `app/pagamento/page.tsx`:
    - a descrição vem de `planoDoCatalogo(plan.id).descricao`;
    - a lista vem de `[rotuloEquipe(limite), ...destaques]`, sem cortar em 5.
  - Rodar `npx tsc --noEmit` para achar outro uso de `features` ou `description` de plano e trocá-lo pelo catálogo.

- [ ] **Step 6: Conferir as telas que leem o catálogo pela API**
  - Em `dashboard/planos/comparar/page.tsx`, se os cards dependiam da linha de contagem nos `destaques`, mostrar `rotuloEquipe(plano.limiteProfissionais)` no lugar.
  - O `dashboard/planos/page.tsx` já monta a contagem sozinho: não muda.

- [ ] **Step 7: Rodar os testes**
  - Run:
    - `cd frontend && npx vitest run src/lib && npx tsc --noEmit`
    - `cd backend && npx vitest run src/__tests__/planChangeRules.test.ts && npx tsc --noEmit`
  - Expected: tudo PASS. Se o backend tiver um teste que conta as linhas da matriz, ajustar o número.

- [ ] **Step 8: Commit**
  ```bash
  git add backend/src/config/planCatalog.ts frontend/src/lib frontend/src/app/pagamento frontend/src/app/dashboard/planos
  git commit -m "feat(planos): catálogo único com cópia tipada na landing"
  ```

### Task 2: Cards de preço a partir do catálogo

**Files:**
- Modify: `frontend/src/components/marketing/PricingPlansSection.tsx`
- Create: `frontend/src/components/marketing/__tests__/PricingPlansSection.test.tsx`

**Interfaces:**
- Consumes: `CATALOGO_PLANOS`, `planoDoCatalogo` e `rotuloEquipe` (Task 1).
- Produces:
  - `recursosDoCartao(id: PlanId): string[]`, exportada do próprio componente;
  - `PLAN_DISPLAY` reduzido a `{ ctaLabel }`, renomeado para `CTA_DO_PLANO`.

- [ ] **Step 1: Testes que falham** (com `AuthContext`, `useRouter`, `billingApi` e `useToast` mockados, como nos outros testes de componente do projeto)
  - `'Solo lista os destaques do catálogo'`: `recursosDoCartao('basico')` é igual a `planoDoCatalogo('basico').destaques`.
  - `'Equipe e Salão começam pelo plano anterior'`:
    - `recursosDoCartao('profissional')[0] === 'Tudo do Solo +'`;
    - `recursosDoCartao('premium')` termina com `'Várias unidades (em breve)'`;
    - nenhum item é `'Suporte prioritário'`.
  - `'card mostra a equipe pelo limite'`: o render tem `'1 profissional'`, `'Até 5 profissionais'` e `'Profissionais ilimitadas'`.
  - `'plano atual continua marcado'`: com `currentPlan="profissional"` e `subscriptionStatus="active"`, o selo/estado de plano atual que o componente já mostra hoje continua no card do Equipe. Ler o componente para achar o texto exato.

- [ ] **Step 2: Rodar e ver falhar**
  - Run: `cd frontend && npx vitest run src/components/marketing/__tests__/PricingPlansSection.test.tsx`
  - Expected: FAIL.

- [ ] **Step 3: Implementar**
  - `recursosDoCartao`:
    - `basico` devolve os `destaques`;
    - `profissional` devolve `['Tudo do Solo +', ...destaques]`;
    - `premium` devolve `['Tudo do Equipe +', ...destaques, ...emBreve.map((r) => `${r} (em breve)`)]`.
  - O nome do card vem de `planoDoCatalogo(id).nome`, e o subtítulo de `rotuloEquipe`.
  - Apagar o comentário antigo sobre "segue literalmente o export do Stitch".
  - Trocar `CheckCircle2` e `QrCode` (lucide) por `<Icon name="check_circle" />` e `<Icon name="qr_code_2" />`.

- [ ] **Step 4: Rodar os testes**
  - Run: `cd frontend && npx vitest run src/components/marketing src/__tests__/themeCompliance.test.ts`
  - Expected: PASS.

- [ ] **Step 5: Commit** `feat(landing): cards de preço com a lista do catálogo`

### Task 3: Textos da landing, do herói e do rodapé, e teste de promessas proibidas

**Files:**
- Modify:
  - `frontend/src/app/page.tsx`
  - `frontend/src/components/marketing/landing/Hero.tsx`
  - `frontend/src/components/marketing/landing/HeroPhoneMockup.tsx` (só ícones)
  - `frontend/src/components/marketing/PublicFooter.tsx`
  - `frontend/src/components/marketing/PublicNavbar.tsx` (só ícones)
- Create: `frontend/src/components/marketing/__tests__/promessasProibidas.test.ts`

**Interfaces:**
- Produces: em `promessasProibidas.test.ts`, a tabela `const PROIBIDAS: { arquivo: string; frases: RegExp[] }[]`, que as Tasks 4 a 6 completam.

- [ ] **Step 1: Teste que falha**
  - O teste lê cada `arquivo` com `readFileSync` (caminho relativo a `frontend/`) e espera que nenhuma `frases` apareça.
  - Ele também espera que nenhum arquivo de `ARQUIVOS_DE_VENDA` importe `'lucide-react'`. `ARQUIVOS_DE_VENDA` cobre `src/app/page.tsx`, `src/app/nail-designers/page.tsx`, `src/app/pagamento/page.tsx` e todo `src/components/marketing/**`.
  - Linhas iniciais:
    - `src/app/page.tsx`: `/valor fixo/`, `/confirmado em segundos/`, `/simultâneo/`, `/Preenchido em/`, `/24h e 2h/`, `/Radar de Retorno/`, `/todos os recursos da plataforma/`, `/praticamente zera/`, `/Junte-se a/`;
    - `src/components/marketing/PublicFooter.tsx`: `/Conformidade LGPD/`, `/Radar de Retorno/`;
    - `src/components/marketing/landing/Hero.tsx`: `/Dados protegidos LGPD/`;
    - `src/components/marketing/PricingPlansSection.tsx`: `/Suporte prioritário/`, `/Radar de Retorno/`.

- [ ] **Step 2: Rodar e ver falhar**
  - Run: `cd frontend && npx vitest run src/components/marketing/__tests__/promessasProibidas.test.ts`
  - Expected: FAIL. O teste do lucide também falha, porque as Tasks 4 a 6 ainda não rodaram. Marque esse caso com `it.todo` até a Task 6, que o liga.

- [ ] **Step 3: Aplicar os textos**
  - Aplicar exatamente a coluna "Depois" das tabelas "Landing" desta página.
  - O selo do rodapé vira um `<Link href="/privacidade">` com as duas linhas novas.

- [ ] **Step 4: Trocar os ícones**
  - Arquivos: `page.tsx`, `Hero.tsx`, `HeroPhoneMockup.tsx`, `PublicFooter.tsx` e `PublicNavbar.tsx`.
  - Nos dados (`painPoints`, `panelFoot`), o campo `icon` (componente) vira `icone: string` com o nome do Material Symbol.
  - Mapa:
    - Ban→`block`, Radar→`radar`, Hourglass→`hourglass_top`, Wallet→`account_balance_wallet`, Users→`group`, Lock→`lock`;
    - ShieldCheck→`verified_user`, Hand→`back_hand`, PenLine→`edit_note`, X→`close`, CheckCircle2→`check_circle`;
    - Star→`star` com `filled`, BadgeCheck→`verified`, Zap→`bolt`, ArrowRight→`arrow_forward`;
    - Calendar→`calendar_month`, Menu→`menu`, Clock→`schedule`, Info→`info`.
  - Os tamanhos seguem os `h-*`/`w-*` atuais, passados em `size` (por exemplo, `h-5` = 20).

- [ ] **Step 5: Rodar os testes**
  - Run: `cd frontend && npx vitest run src/components/marketing src/__tests__/themeCompliance.test.ts`
  - Expected: PASS.

- [ ] **Step 6: Commit** `fix(landing): textos que batem com o sistema e ícones Material`

### Task 4: Calculadora com as premissas na tela

**Files:**
- Modify: `frontend/src/components/marketing/landing/RoiCalculator.tsx`
- Create: `frontend/src/components/marketing/landing/__tests__/RoiCalculator.test.tsx`
- Modify: `frontend/src/components/marketing/__tests__/promessasProibidas.test.ts`

**Interfaces:**
- Produces: `calcularPerda(faltasSemana: number, ticketMedio: number): { prejuizoMensal: number; recuperado: number }`, exportada. Faz `prejuizo = faltas × 4 × ticket` e `recuperado = Math.round(prejuizo × 0.9)`.

- [ ] **Step 1: Testes que falham**
  - `calcularPerda(3, 120)` → `{ prejuizoMensal: 1440, recuperado: 1296 }`.
  - O render mostra `/Como calculamos: faltas por semana × 4 semanas × ticket médio/` e `/É uma estimativa, não uma garantia/`.
  - `screen.queryByText('Atendimentos por dia')` é `null`.
  - O render mostra `/Você pode recuperar até/`.
  - Em `PROIBIDAS`, a linha nova é `RoiCalculator.tsx: /24h e 2h/, /recupera até/`.

- [ ] **Step 2: Rodar e ver falhar**
  - Run: `cd frontend && npx vitest run src/components/marketing`
  - Expected: FAIL.

- [ ] **Step 3: Implementar a tabela "Calculadora"**
  - O parágrafo "Como calculamos…" fica em `text-xs text-muted`, abaixo do bloco "Com o EasyAgenda+".
  - O texto usa as constantes `SEMANAS_POR_MES` e `TAXA_RECUPERACAO_SINAL`, para a conta e a frase não divergirem: "9 em cada 10" vem de `TAXA_RECUPERACAO_SINAL * 10`.
  - `TrendingUp` vira `<Icon name="trending_up" />`.

- [ ] **Step 4: Rodar os testes**
  - Run: `cd frontend && npx vitest run src/components/marketing`
  - Expected: PASS.

- [ ] **Step 5: Commit** `fix(landing): calculadora mostra a conta e as premissas`

### Task 5: Simulador do WhatsApp com o fluxo real do robô

**Files:**
- Modify: `frontend/src/components/marketing/landing/WhatsAppSimulator.tsx`, `frontend/src/app/page.tsx` (texto do cartão do sinal)
- Create: `frontend/src/components/marketing/landing/__tests__/WhatsAppSimulator.test.tsx`
- Modify: `promessasProibidas.test.ts`

**Interfaces:**
- Produces: `export const bubbles: Bubble[]`, com `BotBubble` sem `pixLink` e com `confirmed?: boolean`.

- [ ] **Step 1: Testes que falham**
  - `bubbles` tem os 6 balões da tabela "Simulador", na ordem, com os textos exatos. As quebras de linha são `\n`, e o `<p>` ganha `whitespace-pre-line`.
  - Nenhum balão contém `/Pix|sinal/i`.
  - Com `vi.useFakeTimers()`, `vi.runAllTimers()` dentro de `act` até o 6º balão, o render mostra `'Agendamento confirmado'`.
  - Em `PROIBIDAS`, a linha nova é `WhatsAppSimulator.tsx: /Te avisamos 24h antes/, /Pix Copia e Cola/, /Sinal confirmado/`.

- [ ] **Step 2: Rodar e ver falhar**
  - Run: `cd frontend && npx vitest run src/components/marketing`
  - Expected: FAIL.

- [ ] **Step 3: Implementar**
  - Trocar os balões e remover o bloco do Pix.
  - O selo do balão confirmado passa a dizer "Agendamento confirmado".
  - Ícones: BadgeCheck→`verified`, Bot→`smart_toy`, CheckCheck→`done_all`, CheckCircle2→`check_circle`, MoreVertical→`more_vert`, Phone→`call`, Video→`videocam`.
  - Em `page.tsx`, a frase nova vai no fim do `InfoCard` do sinal.

- [ ] **Step 4: Rodar os testes**
  - Run: `cd frontend && npx vitest run src/components/marketing`
  - Expected: PASS.

- [ ] **Step 5: Commit** `fix(landing): simulador mostra o robô por menu, sem sinal na conversa`

### Task 6: Página de nail designers e fim do lucide nas páginas de venda

**Files:**
- Modify: `frontend/src/app/nail-designers/page.tsx`, `promessasProibidas.test.ts`

- [ ] **Step 1: Conferir a galeria da página pública**
  - Abrir `frontend/src/app/agendar/[slug]/` e ver se tocar numa foto da galeria leva ao agendamento com o serviço já escolhido.
  - Se leva, o texto da galeria fica: "A cliente toca no modelo que ama e já cai no agendamento daquele serviço."
  - Se não leva, fica: "A cliente vê seus trabalhos na sua página e agenda o serviço logo abaixo."
  - Registrar no PR qual dos dois entrou e por quê.

- [ ] **Step 2: Teste que falha**
  - Em `PROIBIDAS`, a linha nova é `src/app/nail-designers/page.tsx: /comprovante/, /taxa de deslocamento por região/, /18 a 21 dias/, /Radar de Retorno/, /pelo WhatsApp\. Sem dados/, /Inovação exclusiva/, /R\$ 20, R\$ 30/`.
  - Trocar o `it.todo` do lucide (Task 3) por `it`.
  - Run: `cd frontend && npx vitest run src/components/marketing/__tests__/promessasProibidas.test.ts`
  - Expected: FAIL.

- [ ] **Step 3: Aplicar os textos e os ícones**
  - Aplicar a tabela "Página de nail designers".
  - Ícones:
    - UserX→`person_off`, AlarmClock→`alarm`, MessageCircleX→`speaker_notes_off`, ShieldCheck→`verified_user`, CheckCircle2→`check_circle`;
    - Image→`image`, Sparkles→`auto_awesome`, Star→`star` com `filled`, Zap→`bolt`, ArrowRight→`arrow_forward`.
  - `painPoints[].icon` vira `icone: string`.
  - Se `/pagamento` ainda importar `lucide`, trocar lá também: `ShieldCheck`→`verified_user` e os demais pelo nome equivalente.

- [ ] **Step 4: Rodar a suíte do frontend**
  - Run: `cd frontend && npx vitest run && npx tsc --noEmit && npm run lint`
  - Expected: tudo PASS.

- [ ] **Step 5: Commit** `fix(nail-designers): textos que batem com o sistema e ícones Material`

### Task 7: Conferência visual, documentos e PR

**Files:**
- Modify: `docs/ROADMAP.md` (linha H3), `docs/design/SEGUIMENTO.md`

- [ ] **Step 1: Conferência visual**
  - Rodar `cd frontend && npm run dev` e abrir `/`, `/nail-designers` e `/pagamento?plan=basico` (ou a rota que a página de pagamento usar) em 390 px e 1280 px.
  - Conferir:
    - os ícones aparecem (não o nome do símbolo em texto);
    - os cards trazem as listas novas e "Várias unidades (em breve)";
    - o simulador roda até "Agendamento confirmado";
    - a calculadora mostra "Como calculamos".
  - A landing não chama o backend, então não precisa de mock. Se `/pagamento` pedir login, conferir só o build.

- [ ] **Step 2: Documentos**
  - `SEGUIMENTO.md` ganha a seção "Item H3 (textos de venda), pendências conhecidas", com:
    - as decisões do Claude marcadas nas tabelas;
    - o texto escolhido para a galeria;
    - um aviso: a premissa de 90% da calculadora é uma estimativa sem dado próprio e deve ser trocada quando houver números de clientes reais.
  - No ROADMAP, a linha H3 vira `🟡 Implementada, aguardando PR`.

- [ ] **Step 3: Commit e PR**
  - Commit: `docs(h3): seguimento e roadmap`.
  - O corpo do PR leva as tabelas "antes e depois" desta página, com o que mudou na execução, para o dono aprovar.
