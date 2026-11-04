# Asaas como único meio de cobrança, e teste de 7 ou 14 dias

Data: 03/11/2026.

As marcas **(dono)** indicam decisões tomadas na conversa com o dono. As marcas **(decisão do Claude)** indicam decisões que ele pode rever na leitura.

## Por que

Hoje a assinatura do EasyAgenda+ tem dois sistemas de cobrança: o **Stripe** (cartão) e o **Asaas** (Pix). Cada mudança na assinatura precisa funcionar nos dois, e o dinheiro fica em dois lugares. O dono quer um projeto mais simples e tudo num lugar só. O Asaas passa a cobrar também no cartão, e o Stripe sai do código e do banco.

Aproveitando a mudança, o teste grátis passa a ter dois níveis **(dono)**:
- **7 dias sem cadastrar cartão**;
- **14 dias com o cartão cadastrado**. O cartão só é cobrado no fim do teste.

**Não há clientes pagando pelo Stripe (dono).** Por isso não há assinantes para migrar, só a remoção.

## Objetivos

1. A dona do negócio assina no **Pix** ou no **cartão**, sempre pelo Asaas.
2. **O cartão é digitado na página do Asaas, nunca no EasyAgenda+ (dono).** Usa-se o Checkout Asaas (`POST /v3/checkouts`) com:
   - `chargeTypes: ['RECURRENT']`;
   - `billingTypes: ['CREDIT_CARD']`;
   - `subscription: { cycle: 'MONTHLY', nextDueDate }`.

   O Asaas guarda o cartão e cobra na data `nextDueDate`, e depois todo mês.
3. **Teste em dois níveis (dono).** A dona escolhe no cadastro, e quem começa sem cartão pode cadastrar depois e ganhar mais 7 dias.
4. **Durante o teste, o cartão só é cobrado no fim do teste (dono).**
5. **Cupom vale só na primeira mensalidade, no cartão e no Pix (dono).**
6. **Todo o código do Stripe sai:**
   - checkout, portal, preços, provider, webhook, leitura de faturas e de cartão;
   - a biblioteca `stripe`;
   - as variáveis `STRIPE_*` do `.env.example`.
7. **As colunas `stripe_*` de `businesses` e a tabela `subscription_events` saem do banco (dono).** A tabela hoje só serve ao webhook do Stripe; o Asaas usa `billing_webhook_events` e `billing_payments`.

## O teste grátis em dois níveis

### Na tela

- **No cadastro**, depois dos dados do negócio, a dona vê duas opções lado a lado:
  - **"Testar 7 dias grátis"**, com a linha "Sem cartão. Entra agora.";
  - **"Testar 14 dias grátis"**, com a linha "Com cartão cadastrado. A primeira cobrança só acontece em DD/MM; cancele antes e nada é cobrado."
- **Ao escolher 14 dias**, ela escolhe o plano (Solo, Equipe ou Salão; o padrão é Equipe), vai para a página do Asaas, cadastra o cartão e volta para o painel.
- **Durante o teste sem cartão**, um aviso no painel oferece "Cadastre o cartão e ganhe mais 7 dias de teste". O mesmo convite aparece em Ajustes › Plano.
- **Landing, cards de preço, página de nail designers e FAQ** trocam "14 dias grátis · sem cartão" pela regra nova: "7 dias grátis sem cartão, ou 14 dias com cartão cadastrado". O teste `promessasProibidas` da H3 ganha a frase antiga "14 dias grátis no cadastro · sem cartão" para ela não voltar.

### As regras

- **Teste sem cartão:** 7 dias a partir do cadastro. O plano do teste continua sendo o Equipe (`TRIAL_PLAN`), como hoje.
- **Teste com cartão:** 14 dias a partir do **cadastro**, não do dia em que o cartão entrou **(dono: quem cadastra no meio ganha mais 7 e chega a 14)**.
  - O fim do teste vira `cadastro + 14 dias`, e esse é o `nextDueDate` da assinatura no Asaas.
  - Durante o teste, ela continua no plano Equipe. Na primeira cobrança, passa para o plano que escolheu ao cadastrar o cartão.
- **Cartão cadastrado depois do fim do teste de 7 dias** não estende nada: é uma assinatura comum, com `nextDueDate` hoje e cobrança na hora **(decisão do Claude)**.
- **Cancelar durante o teste com cartão:**
  - a assinatura no Asaas é removida e nada é cobrado;
  - ela continua usando até o fim do teste;
  - o período volta para 7 dias? **Não:** ela já ganhou os 14, e cancelar só impede a cobrança **(decisão do Claude)**.
- **Contas em teste no dia do deploy** mantêm a data de fim que já têm, de 14 dias **(decisão do Claude)**. A regra nova vale para cadastros feitos depois do deploy.
- **"Estender teste" do SuperAdmin (H2)** continua funcionando sobre a data de fim. No teste com cartão, estender também move o `nextDueDate` da assinatura no Asaas.
  - Se o Asaas não deixar mudar o `nextDueDate` sem tokenização (ver o risco 1), o botão fica desabilitado nesses casos, com o motivo.
- **Constantes:**
  - `TRIAL_DAYS` (backend `config/trial.ts` e frontend `lib/constants.ts`) dá lugar a `TESTE_SEM_CARTAO_DIAS = 7` e `TESTE_COM_CARTAO_DIAS = 14`, uma única fonte para cada lado;
  - um teste confere que backend e frontend batem.
- **Saber se o cartão está cadastrado:** é preciso guardar se o teste é com ou sem cartão e o id da assinatura do Asaas. Os campos `provider`, `subscription_id`/`asaas_subscription_id` e `payment_method` já existem, e quem implementar confere se bastam antes de criar coluna nova.

## Como fica cada fluxo de cobrança

| Fluxo | Hoje no cartão (Stripe) | Passa a ser (Asaas) |
|---|---|---|
| Assinar no cartão depois do teste | Checkout do Stripe | Checkout Asaas recorrente com `nextDueDate` hoje. A dona volta ao sistema, e o acesso é liberado quando o webhook do Asaas confirmar o pagamento |
| Cadastrar cartão no teste | Checkout do Stripe com `trial_period_days` | Checkout Asaas recorrente com `nextDueDate` = fim do teste (cadastro + 14). Nada é cobrado agora |
| Primeira cobrança no fim do teste | Stripe cobra sozinho | Asaas cobra sozinho no `nextDueDate`. Pagamento confirmado: a conta vira ativa no plano escolhido. Falhou: segue a contingência da H1 |
| Cupom no cartão | Não era aplicado | Desconto só na primeira mensalidade **(dono)**. A assinatura nasce com o valor cheio, e a primeira cobrança recebe o desconto (`discount` na cobrança ou ajuste do valor só dela). Se o Asaas não permitir isso sem tokenização, a primeira mensalidade sai com o valor cheio e o desconto vira crédito na segunda; quem implementar escolhe e registra |
| Faturas em Ajustes › Plano | Lista do Stripe + Pix do Asaas | Só cobranças do Asaas (cartão e Pix), com o link da fatura |
| Forma de pagamento | Bandeira e final lidos do Stripe | Bandeira e final que o Asaas devolve na cobrança paga (`creditCard.creditCardBrand`/`creditCardNumber`), quando houver; senão "Cartão de crédito" |
| Atualizar o cartão | Portal do Stripe | Abre a fatura em aberto (ou a próxima) no Asaas. Ver o risco 2 |
| Upgrade no cartão | Stripe cobrava a diferença proporcional | Cobrança avulsa no Asaas com a diferença proporcional, paga na página do Asaas, como o upgrade no Pix de hoje. Depois de paga, o plano muda, e o valor da assinatura passa a ser o novo a partir do próximo ciclo |
| Downgrade no cartão | Agendado no Stripe | Agendado no sistema, como hoje. O valor da assinatura no Asaas é atualizado para o próximo ciclo, sem mexer em cobranças já geradas **(decisão do Claude)** |
| Cancelar no cartão | `cancel_at_period_end` no Stripe | A assinatura é removida no Asaas, e a dona usa até o fim do período pago (ou do teste) |
| Reativar no cartão dentro do período pago | Stripe desfazia o cancelamento | `POST /subscriptions/{id}/restore` (já existe em `asaasService.reactivateSubscription`), sem digitar o cartão de novo **(decisão do Claude)**. Se a assinatura não puder ser restaurada, novo checkout |
| Pagamento falhou (contingência) | Portal do Stripe | Link da fatura vencida do Asaas. O "Já paguei" continua consultando o gateway (`resync`) |
| Trocar de Pix para cartão ou o contrário | Não existia | Fora deste trabalho |

**O Pix não muda.** Hoje ele não é uma assinatura no Asaas: cada mês é uma cobrança avulsa, gerada por um checkout novo. Isso continua igual. O cartão é a primeira assinatura recorrente de verdade no Asaas.

## Mudanças por área

### Backend

- **Sai:**
  - `config/stripe.ts`, `services/stripeCheckoutService.ts`, `services/stripePricingService.ts` e `services/billing/providers/stripeBillingProvider.ts`;
  - as rotas `/billing/webhook(s)/stripe`, a exceção delas em `middleware/auth.ts` e o `stripeWebhookMiddleware`;
  - o tratamento de eventos do Stripe em `subscriptionService.ts` (incluindo `applyTrial`) e o uso de `subscription_events` em `subscriptionRepository.ts`.
- **`billingProviderFactory`:** `card` passa a ir para o Asaas. `boleto` (que apontava para o Stripe e não é usado) sai **(decisão do Claude)**.
- **`resolveBillingProviderFromContext`:** deixa de devolver `stripe`.
- **Asaas:**
  - criação do Checkout recorrente de cartão;
  - webhook com os eventos do checkout (`CHECKOUT_PAID`, `CHECKOUT_CANCELED`, `CHECKOUT_EXPIRED`) e com as cobranças de cartão (`billingType: 'CREDIT_CARD'`) tratadas como as de Pix;
  - remover e restaurar a assinatura;
  - atualizar o valor no downgrade e no upgrade.
- **`estadoConta.rules.ts`:**
  - a regra que trata o cartão diferente do Pix existe por causa do Stripe;
  - com o Asaas, o cartão segue a regra do Pix se o Asaas não avançar o período numa cobrança de cartão não paga;
  - quem implementar confirma no `mapper.ts` e no webhook antes de unificar.
- **SuperAdmin (H2):**
  - o `SQL_PAGAMENTOS_CONFIRMADOS` perde o ramo de `subscription_events`;
  - o LTV e o "já pagou" passam a vir só de `billing_payments`;
  - o mesmo vale para os `EXISTS (… subscription_events …)` de `painel.repository.ts` e `subscriptionRepository.ts`;
  - o `adminRepository` e o SQL do `cronService.ts` deixam de ler `stripe_*`.
- **Migração:**
  - remove as colunas `stripe_*` e a tabela `subscription_events`;
  - põe `provider = NULL` nas linhas que ainda têm `provider = 'stripe'` **(decisão do Claude)**;
  - acrescenta o que for preciso para o teste com cartão (ver "Saber se o cartão está cadastrado");
  - **só roda em produção com autorização explícita do dono.**

### Frontend

- **Checkout:**
  - `lib/billing.ts`, `PricingPlansSection.tsx`, `/pagamento`, `dashboard/page.tsx` e `/comparar` deixam de tratar `provider === 'stripe'`;
  - o cartão redireciona para a URL do Checkout Asaas.
- **Cadastro:** as duas opções de teste. A tela do cadastro está em `frontend/src/app/cadastro` e no fluxo `CompletarCadastroView`.
- **Painel:** o aviso "Cadastre o cartão e ganhe mais 7 dias".
- **`dashboard/planos/page.tsx`:**
  - faturas e forma de pagamento vêm só do Asaas;
  - "Atualizar cartão" abre a fatura do Asaas;
  - o convite do cartão aparece durante o teste.
- **`PagamentoContingencia.tsx`:** no cartão, abre a fatura vencida do Asaas.
- **Rota proxy:** sai `frontend/src/app/api/billing/webhook/stripe/route.ts`.
- **Textos:**
  - "checkout com cartão via Stripe ou pagamento Pix via Asaas" e "Cartão abre checkout Stripe…" viram "Pague no cartão ou no Pix";
  - "Pagamento com cartão processado pela Stripe." vira "Pagamento com cartão processado pelo Asaas.";
  - termos e privacidade citam só o Asaas;
  - selos e FAQ seguem a regra dos 7 e 14 dias.
- **Fora do escopo:** os arquivos que só citam "stripe" como listra visual (`StatusChip`, `AppointmentCard` etc.) não têm relação com o Stripe e não mudam.

### Infraestrutura (dono, depois do deploy)

- Apagar as variáveis `STRIPE_*` no Render e na Vercel.
- Desligar o webhook e a conta no Stripe.
- No Asaas, cadastrar o webhook dos eventos de Checkout, se o webhook atual não os receber.

## Ordem do deploy (decisão do Claude)

A migração apaga colunas que o backend atual lê. Por isso a ordem é:

1. **PR com o código novo** (backend e frontend). O backend novo já não lê nada do Stripe, e o `schema.prisma` deixa de declarar essas colunas. O Prisma ignora as colunas que ainda existem no banco.
2. **Deploy do backend**, depois do frontend.
3. **Conferência antes da migração.** O dono roda no banco (só leitura):
   - quantos `businesses` têm `stripe_subscription_id` ou `stripe_customer_id` preenchido;
   - quantos têm `provider = 'stripe'`;
   - quantas linhas `subscription_events` são de pagamento (`invoice.paid`/`invoice.payment_succeeded`).

   Se houver pagamento real, o histórico é copiado para `billing_payments` antes de apagar; senão, segue.
4. **A migração**, com autorização do dono.

Se o teste com cartão precisar de coluna nova, ela entra numa migração separada, que roda **antes** do deploy do backend. Ela só acrescenta, então não quebra o backend antigo.

## Fora

- Formulário de cartão dentro do sistema.
- Trocar uma assinatura ativa de Pix para cartão (ou o contrário).
- Boleto.
- Mudar preços ou planos.

## Anti-objetivos

- Nenhum dado de cartão passa pelo servidor do EasyAgenda+.
- Ninguém é cobrado durante o teste. Quem cancela antes do fim do teste não paga nada.
- A dona nunca fica bloqueada porque o webhook do cartão demorou: o "Já paguei" e o `resync` continuam valendo.
- Nenhuma tela cita o Stripe depois do deploy.
- Nenhuma tela promete "14 dias sem cartão".

## Riscos

| Risco | Cuidado |
|---|---|
| 1. A documentação do Checkout Asaas indica, mas não diz com todas as letras, que o cartão só é cobrado no `nextDueDate`. Mudar valor ou vencimento de assinatura no cartão pode exigir tokenização habilitada na conta | **Primeiro passo da implementação:** no ambiente de testes do Asaas (sandbox), conferir: (a) checkout recorrente com `nextDueDate` daqui a 14 dias não cobra na hora; (b) dá para mudar o `value` e o `nextDueDate` da assinatura criada pelo checkout; (c) o desconto só na primeira cobrança. Se (a) falhar, o plano para e volta ao dono. Se (b) ou (c) falharem, entram os caminhos alternativos descritos acima |
| 2. Pagar uma fatura com outro cartão pode não trocar o cartão salvo da assinatura | Conferir no sandbox. Se não trocar, o botão vira "Pagar a fatura com outro cartão", sem prometer troca do cartão salvo |
| 3. A migração apaga dados de produção | Conferência do passo 3 da ordem do deploy |
| 4. Webhook do cartão e do checkout com campos diferentes do Pix | Testes com payloads de cartão e de checkout |
| 5. Cadastro antigo em teste no dia do deploy | Mantém a data de fim que já tem; teste cobrindo uma conta com 14 dias sem cartão criada antes da regra nova |

## Como conferir

- **Testes:**
  - checkout de cartão no teste (`nextDueDate` = cadastro + 14) e depois do teste (`nextDueDate` hoje);
  - 7 dias sem cartão; cartão cadastrado no dia 3 (fim no dia 14) e no dia 9 (cobra na hora);
  - webhook de cartão pago, vencido e estornado, e de checkout pago, cancelado e expirado;
  - cupom só na primeira mensalidade;
  - upgrade, downgrade, cancelar e reativar no cartão;
  - faturas e forma de pagamento só do Asaas;
  - contingência no cartão;
  - SuperAdmin sem `subscription_events`.
- **Teste de guarda:** nenhum arquivo importa `stripe` nem cita "Stripe" em texto visível; nenhuma tela promete "14 dias" sem cartão.
- **Conferência visual:** cadastro com as duas opções, aviso do painel e Ajustes › Plano.
- **Em produção, depois do deploy:** um cadastro de teste com cartão real (confere a data da primeira cobrança no painel do Asaas e cancela) e uma assinatura no cartão sem teste, estornada pelo painel do Asaas.
