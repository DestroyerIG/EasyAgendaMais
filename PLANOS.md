# Planos e controle de acesso

Regras de plano, assinatura e permissão por recurso. Atualizado em 27/10/2026.

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
| Salão | `premium` | R$ 199,90/mês | Ilimitadas | Salões |

Os ids internos continuam `basico`, `profissional` e `premium` no banco, no Stripe e no Asaas. A cliente só vê Solo, Equipe e Salão, inclusive nas mensagens de erro e no SuperAdmin.

Não há plano anual.

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
| | Suporte prioritário | — | — | ✓ |

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

- 14 dias (`TRIAL_DAYS`), uma vez por negócio.
- A rotina das 03:00 marca como `incomplete` o teste vencido sem assinatura.

## Pagamento

### Cartão (Stripe)
- Assinatura recorrente, checkout e Customer Portal (só para atualizar o cartão; a troca de plano pelo portal deve ficar desligada).
- Variáveis: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID_BASICO`, `STRIPE_PRICE_ID_PROFISSIONAL`, `STRIPE_PRICE_ID_PREMIUM` e as variantes `_ONE_TIME`.

### Pix (Asaas)
- Cobrança mensal avulsa com QR code. O acesso só é liberado depois que o webhook confirma o pagamento.
- O valor vem do catálogo (`PLAN_PRICES`).
- Variáveis: `ASAAS_API_KEY`, `ASAAS_BASE_URL`, `ASAAS_WEBHOOK_TOKEN`, `ASAAS_BILLING_DESCRIPTION`, `ASAAS_TIMEOUT_MS`.

## Troca de plano (`/billing/change-plan`)

- **Upgrade** vale na hora e cobra a diferença proporcional:
  - no cartão, o Stripe cobra com `pending_if_incomplete`;
  - no Pix, sai uma cobrança avulsa da diferença, e o plano novo só vale depois do pagamento.
- **Downgrade** vale na próxima renovação:
  - no cartão, por um schedule do Stripe;
  - no Pix, pelo campo `plano_agendado` e pela rotina de hora em hora.
- O downgrade agendado pode ser cancelado (`DELETE /billing/change-plan`).
- A prévia (`/billing/change-plan/preview`) mostra o proporcional. No cartão, o Stripe pode diferir em centavos.

## Onde o gate é aplicado

- Backend: `requireFeature` nas rotas e `bancada.middleware.ts` no app da profissional.
- Frontend: `frontend/src/hooks/useSubscriptionAccess.ts` e `frontend/src/components/billing/FeatureGate.tsx`.

O frontend melhora a experiência, mas a autorização final é sempre do backend.
