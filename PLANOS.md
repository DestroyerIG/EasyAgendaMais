# Planos e controle de acesso

Regras de plano, assinatura e permissão por recurso. Atualizado em 11/11/2026.

Fontes de verdade:
- `backend/src/config/planCatalog.ts`: preço, nome, limite de profissionais e matriz da comparação. O frontend lê por `GET /billing/plans`.
- `backend/src/config/planPermissions.ts`: plano mínimo de cada recurso e o efeito do status da assinatura.
- `backend/src/config/trial.ts`: prazo do teste grátis.

`frontend/src/lib/plans.ts` existe só para a landing e tem um teste que confere os preços com o catálogo.

## Planos

| Nome que a cliente vê | Id interno | Preço | Profissionais | Para quem |
|---|---|---|---|---|
| Solo | `basico` | R$ 49,90/mês | 1 | Autônomas |
| Equipe | `profissional` | R$ 99,90/mês | Até 5 | Estúdios |
| Salão | `premium` | Sob consulta | Ilimitadas | Salões |

Os ids internos continuam `basico`, `profissional` e `premium` no banco e no Asaas. A cliente só vê Solo, Equipe e Salão, inclusive nas mensagens de erro e no SuperAdmin.

Não há plano anual.

### Salão sob consulta

- O catálogo tem `preco: null` e `sobConsulta: true` para o Salão. A tela mostra "Sob consulta" e o botão "Falar com a gente" (`NEXT_PUBLIC_WHATSAPP_CONTACT_URL`).
- O **SuperAdmin define o valor mensal combinado** de cada negócio (`businesses.metadata.valorMensalCombinado`, resolvido por `backend/src/config/valorPlano.ts`). Com o valor definido, a dona assina ou faz o upgrade no checkout normal.
- Quem já estava no Salão antes da mudança continua em **R$ 199,90** (`VALOR_SALAO_LEGADO`) até ter um valor combinado. Esse valor não aparece em tela de venda.
- Cobrar por unidade ainda não existe: o valor é um só por negócio, e a gestão de várias unidades continua "em breve".

## Matriz de recursos (tela de comparação)

| Grupo | Recurso | Solo | Equipe | Salão |
|---|---|---|---|---|
| Agendamento e recepção | Página com galeria e agendamento online | ✓ | ✓ | ✓ |
| | Bot de WhatsApp, lembretes e confirmação | ✓ | ✓ | ✓ |
| | Ficha de clientes e sinal via Pix | ✓ | ✓ | ✓ |
| | Hora de voltar (radar de retorno) | ✓ | ✓ | ✓ |
| Equipe e operação | Controle de caixa | ✓ | ✓ | ✓ |
| | Profissionais na grade | 1 | Até 5 | Ilimitadas |
| | Comissões | — | ✓ | ✓ |
| | Relatórios e exportação | — | ✓ | ✓ |
| | App da profissional | — | ✓ | ✓ |
| Expansão e gestão avançada | Salão-parceiro | — | — | ✓ |
| | Clube e pacotes de serviços | — | — | ✓ |
| | Gestão de várias unidades | — | — | Em breve |

- Lista de espera, campanhas, automações e Google Agenda funcionam em todos os planos.
- O login com Google é para qualquer dona.
- O Google Agenda da profissional depende do app, que exige Equipe ou Salão.

## Recursos por plano (backend)

| Recurso (`Feature`) | Plano mínimo | O que libera |
|---|---|---|
| `dashboard` | Solo | Tela Hoje |
| `appointments` | Solo | Agenda e lista de espera |
| `clients` | Solo | CRM, ficha, fotos e etiquetas |
| `services` | Solo | Serviços, profissionais e produtos |
| `finance` | Solo | Comanda, caixa e despesas |
| `whatsapp_automation` | Solo | WhatsApp inteiro: conexão, robô, conversas, Hora de voltar, automações e campanhas |
| `advanced_admin` | Solo | Ajustes do negócio |
| `billing` | Solo | Plano e cobrança |
| `subscription_status` | Solo | Situação da assinatura |
| `reports` | Equipe | Relatórios, comissões e resumo mensal |
| `exports` | Equipe | Exportações (PDF e CSV) |
| `app_profissional` | Equipe | Convite, acesso e app da profissional (`/bancada`) |
| `salao_parceiro` | Salão | Modo salão-parceiro nas comissões |
| `clube` | Salão | Clube e pacotes |

A checagem fica em `backend/src/middleware/subscriptionGuard.ts` (`requireFeature`) e em `featureAccessService.ts`. Sem permissão, a API responde `402`.

## Status da assinatura

| Status | Acesso |
|---|---|
| `active`, `trialing` | Conforme o plano |
| `pending`, `past_due`, `unpaid`, `incomplete`, `canceled` | Só `billing` e `subscription_status` |

Cancelar mantém o acesso até o fim do período pago, no cartão e no Pix.

## Limite de profissionais

Vem de `limiteProfissionais` no catálogo (`professionalLimit`). O cadastro de profissional recusa passar do limite, e o downgrade é bloqueado enquanto houver mais profissionais ativas do que o plano novo permite.

## Teste grátis

Dois níveis, em `backend/src/config/trial.ts` (o frontend tem uma cópia em `lib/constants.ts`, com teste de igualdade):

- **7 dias sem cartão** (`TESTE_SEM_CARTAO_DIAS`), desde o cadastro.
- **14 dias com o cartão cadastrado** (`TESTE_COM_CARTAO_DIAS`), também desde o cadastro: quem cadastra o cartão no meio do teste chega aos 14. O cartão só é cobrado no fim do teste, e cancelar antes não cobra nada.
- O teste roda no plano Equipe (`TRIAL_PLAN`) ou no que a pessoa escolheu no cadastro, e a primeira cobrança passa para o plano escolhido.
- Cartão cadastrado depois do fim do teste de 7 dias não estende nada: é uma assinatura comum, cobrada na hora.
- O SuperAdmin pode estender o teste; no teste com cartão, o vencimento da assinatura no Asaas é movido junto.
- A rotina das 03:00 marca como `incomplete` o teste vencido sem assinatura. Quem cadastrou cartão segue para o Asaas cobrar, a menos que tenha cancelado.

## Pagamento

Tudo passa pelo **Asaas**. O Stripe foi removido do código e do banco (migração `20261104120000_remove_stripe`).

### Cartão (Asaas)
- Assinatura recorrente criada no **Checkout do Asaas** (`POST /v3/checkouts`, ciclo mensal). O cartão é digitado na página do Asaas, nunca no EasyAgenda+.
- O token do cartão fica só no servidor (`/billing/status` não o devolve). A **tokenização** precisa estar habilitada na conta Asaas de produção para reativar no cartão, estender o teste com cartão e mudar o valor da assinatura numa troca de plano.
- "Atualizar cartão" é "Pagar a fatura com outro cartão".

### Pix (Asaas)
- Cobrança mensal avulsa com QR code. O acesso só é liberado depois que o webhook confirma o pagamento.
- O valor vem do catálogo (`PLAN_PRICES`) ou, no Salão, do valor combinado (`valorMensal`).
- O Pix exige CPF/CNPJ válido, que a tela de pagamento pede quando falta.

### Variáveis e cupom
- Variáveis: `ASAAS_API_KEY`, `ASAAS_BASE_URL`, `ASAAS_WEBHOOK_TOKEN`, `ASAAS_BILLING_DESCRIPTION`, `ASAAS_TIMEOUT_MS`.
- O cupom vale só na primeira mensalidade, no cartão e no Pix.

## Troca de plano (`/billing/change-plan`)

- **Upgrade** vale na hora e cobra a diferença proporcional:
  - no cartão e no Pix, sai uma cobrança avulsa da diferença (marcada `:upgrade`), e o plano novo só vale depois do pagamento.
- **Downgrade** vale na próxima renovação:
  - no Pix, pelo campo `plano_agendado` e pela rotina de hora em hora;
  - no cartão, o valor da assinatura no Asaas muda já no agendamento (inclusive a cobrança do próximo ciclo).
- O downgrade agendado pode ser cancelado (`DELETE /billing/change-plan`).
- A prévia (`/billing/change-plan/preview`) mostra o proporcional.

## Recebimentos do negócio (não é a assinatura)

O que a dona recebe das clientes (sinal e saldo da comanda) **não passa pela EasyAgenda+**: cai direto na conta do negócio, pelo Mercado Pago, pela InfinitePay ou pela chave Pix dele. Isso vale em todos os planos. Ver `docs/FUNCIONALIDADES.md` › Recebimentos.

## Onde o gate é aplicado

- Backend: `requireFeature` nas rotas e `bancada.middleware.ts` no app da profissional.
- Frontend: `frontend/src/hooks/useSubscriptionAccess.ts` e `frontend/src/components/billing/FeatureGate.tsx`.

O frontend melhora a experiência, mas a autorização final é sempre do backend.
