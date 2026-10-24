# Sub-projeto 2D — Ajustes › Plano e cobrança, comparação e upgrade

Data: 2026-10-24 · Branch: `feat/plano-cobranca` (sai da `main` com a 2C-2c)

## Intenção
A dona vê numa tela só o plano que paga, quando vence, como paga e o que já pagou, e troca de plano sem falar com ninguém. Hoje a tela `/dashboard/planos` mistura dado real com exemplo fixo (`conteudoDemo.plano`: cartão salvo, faturas, NFS-e) e quase todos os botões mostram "recurso a caminho". A 2D troca o exemplo por dado real, liga os botões que dá para ligar e cria a tela de comparação e upgrade.

Referências visuais (fiel ao Stitch, com dados reais):
- `docs/design/stitch/projeto/studio-aurora-ajustes-plano-e-cobranca-equipe-2026--cf22b5.html` (Plano e cobrança; a versão `5c85da` é a mesma tela com dados antigos de "Plano Pro")
- `docs/design/stitch/projeto/studio-aurora-comparacao-e-upgrade-de-planos-corrigida--9b0ac9.html` (Comparação e upgrade)

## Decisões do dono (24/10/2026)
1. **Preço do Solo continua R$ 49,90** (o Stitch mostra 39,90). Preços: Solo 49,90 · Equipe 99,90 · Salão 199,90.
2. **Plano anual fica para depois.** O seletor Mensal/Anual e o botão "Trocar para anual" não aparecem.
3. **Upgrade vale na hora e cobra a diferença proporcional. Downgrade vale na próxima renovação.**
4. **Recursos que ainda não existem aparecem com o selo "Em breve"** na comparação (Clube e pacotes, Salão-parceiro, várias unidades). Faturas sem o botão NFS-e.

## Objetivos
1. Tela Plano e cobrança 100% com dado real: plano, status, próxima cobrança, recursos do plano, forma de pagamento e histórico de faturas.
2. Tela Comparação e upgrade (`/dashboard/planos/comparar`) com os 3 planos, a matriz de recursos e o FAQ.
3. Troca de plano: upgrade imediato com proporcional, downgrade agendado e "Cancelar downgrade".
4. Cancelar assinatura com confirmação e "Reativar" enquanto o período não acaba.
5. Atualizar a forma de pagamento (cartão pelo portal do Stripe; Pix gera a próxima cobrança).

## Não objetivos
- Plano anual, NFS-e, "Relatório de Gastos" e exportação CSV/Excel.
- Pausar assinatura (o Stitch fala em "pausar ou cancelar", mas só existe cancelar).
- Mudar preços ou cupons.
- Landing e SuperAdmin (item H).
- Recursos novos do Salão (Clube, Salão-parceiro e várias unidades ficam para as fases 3 e 4).

## Anti-objetivos
- Mostrar cartão, fatura ou data que não vieram do provedor ou do banco.
- Cobrar duas vezes o mesmo upgrade (dois cliques, webhook repetido).
- Liberar o plano novo antes de o pagamento da diferença no Pix ser confirmado.
- Deixar o downgrade passar com mais profissionais ativas do que o plano novo permite.

## Regras

**Fonte única dos planos (decisão do Claude):** preços, nomes, limite de profissionais e matriz de recursos ficam num catálogo só no backend (`backend/src/config/planCatalog.ts`), exposto por `GET /billing/plans`. Hoje o preço está repetido em `frontend/src/lib/plans.ts`, `PLAN_VALUES` (`billingService.ts`) e `PROFESSIONAL_LIMITS` (`professionalService.ts`). Os três passam a ler do catálogo. O frontend mantém `plans.ts` só para a landing, com teste que confere que bate com o catálogo.

**Matriz de recursos (do Stitch 9b0ac9, com o que existe hoje):**
| Grupo | Recurso | Solo | Equipe | Salão |
|---|---|---|---|---|
| Agendamento e recepção | Página com galeria e agendamento online | ✓ | ✓ | ✓ |
| | Bot de WhatsApp, lembretes e confirmação | ✓ | ✓ | ✓ |
| | Ficha de clientes e sinal via Pix | ✓ | ✓ | ✓ |
| | Hora de voltar (radar de retorno) | ✓ | ✓ | ✓ |
| Equipe e operação | Caixa | ✓ | ✓ | ✓ |
| | Profissionais | 1 | até 5 | ilimitadas |
| | Comissões | — | ✓ | ✓ |
| | Relatórios e exportação | — | ✓ | ✓ |
| | Acesso das profissionais | — | Em breve | Em breve |
| Expansão | Salão-parceiro | — | — | Em breve |
| | Clube e pacotes | — | — | Em breve |
| | Várias unidades | — | — | Em breve |
| | Suporte prioritário | — | — | ✓ |

A matriz só lista o que o backend de fato separa por plano (`FEATURE_REQUIREMENTS`) ou marca "Em breve". **Decisão do Claude:** "Lista de espera" e "Campanhas" não entram na linha do Equipe como no Stitch, porque hoje funcionam em todos os planos (`whatsapp_automation` é do Solo). Tirar esses recursos de quem paga o Solo é decisão de venda e fica fora da 2D.

**Upgrade (Equipe → Salão, Solo → Equipe ou Salão):**
- **Cartão (Stripe):** `subscriptions.update` com o Price novo e `proration_behavior: 'always_invoice'`. O Stripe cobra a diferença na hora. O plano muda quando a fatura da diferença é paga (webhook `invoice.paid`); se a cobrança falhar, o plano não muda e a tela diz "Não conseguimos cobrar a diferença no cartão".
- **Pix (Asaas):** cobrança avulsa da diferença proporcional = `(preço novo − preço atual) × dias restantes ÷ dias do ciclo`, arredondada para baixo em centavos, mínimo R$ 5,00 (abaixo disso o upgrade sai sem cobrança). A assinatura do Asaas é atualizada para o valor novo a partir da próxima cobrança (`PUT /subscriptions/{id}` com `value`, sem `updatePendingPayments`). O plano só muda quando o webhook confirma o pagamento da avulsa. A tela mostra o QR Code e o copia-e-cola, como o checkout Pix já faz.
- Prévia antes de confirmar: "Você paga R$ X hoje (diferença proporcional de N dias). A partir de DD/MM, R$ Y por mês."
- Idempotência: um upgrade pendente por negócio. Pedir de novo devolve a mesma cobrança.

**Downgrade (Salão → Equipe ou Solo, Equipe → Solo):**
- Fica agendado para o fim do período (`plano_agendado` + `plano_agendado_em`). Até lá continua tudo liberado.
- **Bloqueio (decisão do Claude):** se houver mais profissionais ativas do que o plano novo permite, o downgrade é recusado com "O plano Solo permite 1 profissional. Desative N antes de mudar." A conta é refeita na hora da troca. Se ainda passar do limite, a troca é adiada e a dona é avisada na tela.
- Cartão: o Stripe agenda a troca para a renovação (`proration_behavior: 'none'` aplicado na virada, via subscription schedule). Pix: a assinatura do Asaas passa a cobrar o valor novo a partir da próxima cobrança.
- Faixa na tela: "Seu plano muda para Equipe em DD/MM." com "Cancelar mudança".

**Cancelar assinatura:** confirmação em modal com a data de acesso real ("Você mantém acesso até DD/MM"). Usa o `/billing/cancel` que já existe. Cancelada e ainda no período → botão "Reativar assinatura" (`/billing/reactivate`).

**Forma de pagamento:** cartão → bandeira, final, titular e validade vêm do Stripe (`payment_method` padrão da assinatura); "Atualizar método de pagamento" abre o portal do Stripe (`/subscriptions/portal`, que já existe). Pix → "Pix · cobrança mensal" e a próxima cobrança em aberto com QR Code e copia-e-cola; o botão gera a cobrança Pix se não houver uma aberta. Trocar de Pix para cartão (ou o contrário) usa o checkout que já existe e só vale a partir da próxima cobrança. **Decisão do Claude:** o Stitch mostra cartão e Pix lado a lado como se os dois estivessem ativos. Na tela real aparece só a forma em uso, e a outra entra como opção "Pagar com cartão" ou "Pagar com Pix".

**Histórico de faturas:**
- Pix: `billing_payments` do negócio.
- Cartão: faturas do Stripe (`invoices.list` pelo customer), sem gravar no banco.
- Colunas do Stitch: data, referência/período ("Mensalidade EasyAgenda+ Equipe", "Período: 15/set a 14/out"), valor, forma, status (Pago, Em aberto, Vencido, Cancelado, Estornado) e "Fatura" (link `invoiceUrl` do Asaas ou `hosted_invoice_url` do Stripe, quando houver). A diferença de upgrade aparece como "Diferença do upgrade para Salão".
- Filtro por ano (anos com fatura). Mostra as 4 últimas e "Carregar histórico completo".
- Sem fatura: "Nenhuma cobrança ainda. A primeira aparece aqui quando for gerada."

**Recursos inclusos no seu plano:** do catálogo. A linha das profissionais usa o número real: "Até 5 profissionais na grade · Carla, Bruno e 3 vagas livres".

**Status sem pagamento** (`pending`, `past_due`, `unpaid`, `incomplete`): faixa no topo com o motivo e o botão de pagar (gerar Pix ou ir ao portal do cartão). O guard de status já libera só `billing` e `subscription_status` nesses casos; a tela precisa funcionar com essas duas permissões.

**Em teste grátis (`trialing`):** "Período de teste · termina em DD/MM", sem histórico, e "Escolher plano" leva à comparação.

**Gatilho de upgrade (do Stitch 9b0ac9):** a faixa "Recurso exclusivo" do topo da comparação aparece quando a tela é aberta com `?recurso=<feature>`. O `FeatureGate` e o `PlanLimitError` (limite de profissionais) passam a mandar para `/dashboard/planos/comparar?recurso=…`. O texto varia por recurso. Sem `recurso`, a faixa não aparece.

**Fale com nosso financeiro via WhatsApp / Dúvidas financeiras:** link `wa.me` para o número de suporte em `SUPPORT_WHATSAPP` (variável de ambiente). Sem a variável, os dois botões somem.

## Telas

**Plano e cobrança (cf22b5)**, rota `/dashboard/planos` (aba "Plano e cobrança" de Ajustes, que já existe):
- Cabeçalho: selo de status ("Assinatura ativa" etc.) · nome do negócio, título, descrição. "Relatório de Gastos" não aparece; "Dúvidas financeiras" só com `SUPPORT_WHATSAPP`.
- Cartão do plano: "Plano Equipe (Mensal)", selo, preço, "Próxima cobrança: DD de mês de AAAA (em N dias)", recursos inclusos, "Sem multas de fidelidade ou taxa de cancelamento.", botão "Mudar de plano" → comparação. Faixas de downgrade agendado e de upgrade pendente (Pix aguardando pagamento).
- Cartão Forma de pagamento (real, ver regras).
- Histórico de faturas (real).
- Bloco Cancelar assinatura (ou Reativar). Rodapé "Cobrança segura intermediada por Asaas…" só quando o provedor é Asaas; com Stripe, "Pagamento com cartão processado pela Stripe".
- A seção `PricingPlansSection` sai do rodapé desta tela (a comparação a substitui).
- Celular: coluna única; a tabela de faturas vira lista de cartões.

**Comparação e upgrade (9b0ac9)**, rota `/dashboard/planos/comparar`:
- Faixa "Recurso exclusivo" (só com `?recurso=`).
- Título "Planos flexíveis para a escala do {negócio}", subtítulo.
- 3 cartões com preço, "O que está incluso", selo "Recomendado" no próximo plano acima do atual, botões "Plano atual (Ativo)", "Fazer upgrade para X" ou "Mudar para X". Os recursos "Em breve" aparecem com o selo também nos cartões.
- Matriz comparativa (tabela acima), com a coluna do plano atual destacada.
- Bloco "Segurança jurídica" (Lei 13.352) com selo "Em breve", sem o botão "Baixar modelo de contrato" até a fase 3.
- FAQ "Como funciona a cobrança proporcional?", "A liberação é imediata?" e "Posso voltar para o Equipe?", com o texto ajustado às regras acima (downgrade na renovação, Pix libera quando o pagamento confirma).
- Modal de confirmação da troca: prévia do valor, forma de pagamento atual, "Confirmar upgrade". No Pix, o modal passa a mostrar o QR Code e acompanha o pagamento (consulta a cada 5 s, como o checkout Pix faz hoje).

## API (módulo `modules/billing/`)
Guard: `authMiddleware + requireTenantRoles`, com `requireFeature('billing')` nas ações e `requireFeature('subscription_status')` nas leituras. Isolamento por negócio, mensagens em pt-BR.
- `GET /billing/plans` → catálogo (público para a landing, sem auth).
- `GET /billing/status` → o que já devolve **+** `planoAgendado`, `planoAgendadoEm`, `upgradePendente` (`{ plano, valor, paymentId, pixCopyPaste, qrCode }` ou `null`), `profissionaisAtivas`.
- `GET /billing/payment-method` → `{ tipo: 'card', bandeira, final, titular, validade } | { tipo: 'pix', cobrancaAberta } | null`.
- `GET /billing/invoices?ano=` → `{ anos: number[], itens: FaturaDto[] }`.
- `POST /billing/change-plan/preview` `{ plan }` → `{ tipo: 'upgrade' | 'downgrade', valorHoje, valorMensalNovo, aPartirDe, dias, bloqueio?: { motivo } }`.
- `POST /billing/change-plan` `{ plan }` → upgrade: cartão `{ status: 'pago' | 'falhou' }`, Pix `{ status: 'aguardando', paymentId, pixCopyPaste, qrCode }`; downgrade: `{ agendadoPara }`. Mesmo plano → 400. Downgrade bloqueado → 409 com o motivo.
- `DELETE /billing/change-plan` → cancela o downgrade agendado ou o upgrade Pix ainda não pago (cancela a cobrança avulsa no Asaas).
- Webhooks que já existem: Asaas `PAYMENT_RECEIVED`/`CONFIRMED` da avulsa de upgrade → aplica o plano; Stripe `invoice.paid` da proporcional → aplica o plano. Idempotentes pela tabela de eventos que já existe.
- Rotina diária no cron: aplica os downgrades agendados vencidos (com a checagem de profissionais).

## Migração (só adições)
`businesses`: `plano_agendado VARCHAR(50) NULL`, `plano_agendado_em TIMESTAMPTZ NULL`. `billing_payments`: `tipo VARCHAR(20) NOT NULL DEFAULT 'mensalidade'` (`mensalidade` | `upgrade`) e `plano VARCHAR(50) NULL`. Aplicação em produção pede autorização do dono.

## Testes
Backend:
- Catálogo único (preço, limite e matriz batem com o checkout e o limite de profissionais).
- Cálculo proporcional (dias restantes, arredondamento, mínimo de R$ 5).
- Upgrade no cartão (sucesso, falha, sem mudar o plano antes de pagar).
- Upgrade no Pix: avulsa criada uma vez só, webhook aplica o plano, webhook repetido não aplica duas vezes, cancelar o pendente.
- Downgrade: agendado, bloqueado por profissionais, aplicado pelo cron, adiado se ainda passar do limite, cancelado.
- Faturas Pix e Stripe (filtro por ano, status), forma de pagamento nos dois provedores e sem provedor.
- Status estendido e isolamento por negócio.

Frontend:
- Plano e cobrança: ativa, teste, inadimplente, cancelada com reativar, downgrade agendado, upgrade Pix pendente, sem faturas, filtro por ano, celular.
- Comparação: plano atual destacado, selo Recomendado, "Em breve", faixa `?recurso=`, prévia e confirmação do upgrade (cartão e Pix com QR), downgrade bloqueado.
- Os dois botões de suporte com e sem `SUPPORT_WHATSAPP`.
- Teste que confere que `plans.ts` bate com o catálogo.

## Riscos
- O Stripe e o Asaas em modo de teste precisam estar configurados no ambiente local para o teste manual. Sem as chaves, o roteiro manual cobre só os estados mockados.
- A troca agendada no Stripe usa subscription schedules. Se a conta usar o Customer Portal com troca de plano ligada, as duas vias podem brigar: desligar a troca de plano no portal e deixar só a atualização do cartão.
- `conteudoDemo.plano` sai. Conferir que nenhuma outra tela o usa antes de apagar.
