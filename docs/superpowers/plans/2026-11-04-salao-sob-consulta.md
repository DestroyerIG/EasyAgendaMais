# Salão sob consulta: plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** o plano Salão deixa de ter preço fixo (R$ 199,90) e passa a ser "sob consulta". Quem quer o Salão fala com a gente, e o SuperAdmin define o valor mensal combinado daquele negócio, que vale no checkout (Pix ou cartão), no upgrade e na assinatura do Asaas.

**Pedido do dono (04/11/2026):** "o Salão dá a possibilidade de abranger mais de um salão por vez; não quero que ele tenha valor definido, e sim sob consulta". O dono pediu para pular as perguntas, então as decisões abaixo são **do Claude**.

## Decisões (do Claude)

1. **Catálogo:**
   - o Salão passa a ter `preco: null` e `sobConsulta: true`;
   - Solo e Equipe continuam com preço fixo.
2. **Valor do negócio:** `businesses.metadata.valorMensalCombinado` (número, em reais), sem migração.
   - **Regra:** `valorMensal(negocio, plano)` devolve o preço do catálogo para Solo e Equipe. No Salão, devolve o valor combinado.
   - **Negócio que já está no Salão sem valor combinado:** continua em R$ 199,90 (`VALOR_SALAO_LEGADO`) até o SuperAdmin definir outro valor.
3. **Assinar ou fazer upgrade para o Salão sem valor combinado:** responde 409, código `SALAO_SOB_CONSULTA`, mensagem "O plano Salão é sob consulta. Fale com a gente para combinar o valor."
4. **SuperAdmin:** nova ação "Definir valor do Salão" no detalhe do negócio, com valor mensal e motivo.
   - grava o valor combinado e o `desired_plan = 'premium'`;
   - registra na auditoria;
   - se o negócio já está no Salão no cartão, muda o valor da assinatura no Asaas (`updatePendingPayments: true`).
5. **Venda:**
   - O card do Salão mostra "Sob consulta" e o botão "Falar com a gente", que abre o WhatsApp de contato com uma mensagem pronta. Se o negócio logado tiver valor combinado, o card mostra esse valor e o checkout normal.
   - A comparação, a troca de plano e o convite do cartão seguem a mesma regra.
6. **Painel do SuperAdmin:** MRR, preço do negócio e próxima cobrança do Salão usam o valor combinado, ou o legado.

## Tarefas

### Task 1: Valor mensal no backend
- `backend/src/config/planCatalog.ts`:
  - `PlanoCatalogo.preco: number | null`;
  - `sobConsulta: boolean`;
  - `VALOR_SALAO_LEGADO = 199.9`;
  - `PLAN_PRICES` fica só com Solo e Equipe mais o legado, e passa a ser usado apenas como referência interna.
- `backend/src/config/valorPlano.ts`, com:
  - `valorMensal(negocio: { plan?: unknown; metadata?: unknown }, plano: PlanId): number | null`;
  - `SalaoSobConsultaError` (409 `SALAO_SOB_CONSULTA`).
- **Onde passa a valer:**
  - checkout (Pix e cartão);
  - prévia e troca de plano (o proporcional usa os valores do negócio);
  - valor da assinatura de cartão na troca de plano;
  - reativação com token;
  - `billing/status` devolve `valorSalao` (o combinado, ou null).
- **Testes:** `backend/src/__tests__/salaoSobConsulta.test.ts`.

### Task 2: SuperAdmin define o valor
- `PATCH /admin/subscriptions/:id/valor-salao` com `{ valor, reason, confirmation }`. O valor vai de 1 a 99999, com duas casas.
  - grava os dados e a auditoria `SALAO_VALUE_SET`;
  - no cartão, atualiza o Asaas.
- Painel (`painel.repository` e `painel.rules`): o preço do Salão vem do valor combinado, ou do legado.
- **Frontend:**
  - `adminApi.definirValorSalao`;
  - ação em `AcoesSuperAdmin` com o modal de motivo, que ganha um campo de valor;
  - o detalhe mostra o valor combinado.
- **Testes:** os da rota e das regras do painel.

### Task 3: Telas de venda e de plano
- `frontend/src/lib/planCatalog.ts`: a cópia acompanha o backend, e o teste de igualdade quebra se divergirem.
- **Card do Salão no `PricingPlansSection`:**
  - sem valor combinado: "Sob consulta" e o link "Falar com a gente";
  - com valor combinado: o valor e o checkout.
- **Outras telas:** comparação, `TrocaPlanoModal`, `/pagamento`, Ajustes › Plano, `ConviteCartao` (o Salão só aparece com valor combinado) e `TelaContingencia`.
- **Textos:** "Profissionais ilimitadas · várias unidades" segue no card. O FAQ da landing não muda.
- **Testes:** os das telas, mais o `promessasProibidas` (nenhum "R$ 199,90" nas telas de venda).

### Task 4: Documentos, revisão e PR
- ROADMAP e SEGUIMENTO.
- Revisão final por um revisor novo.
- PR.
