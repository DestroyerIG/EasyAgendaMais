# Cobrança do saldo da comanda pelo gateway (Fase 2a)

Data: 10/11/2026. Continua a Fase 1 (PR #67: QR Code Pix manual dentro da comanda, na chave Pix do negócio).

## Intenção

Hoje, no balcão, o dono escolhe "Pix", "Débito" ou "Crédito" na comanda e confere o recebimento por conta própria. O que o dono quer é que o sistema **cobre o saldo e perceba sozinho que foi pago**, usando o que o negócio já conectou em Recebimentos:

- **Mercado Pago**: Pix com QR do próprio Mercado Pago, e cobrança direto na maquininha **Point**.
- **InfinitePay**: link de pagamento (Pix ou cartão) com QR, porque a maioria dos clientes usa InfinitePay e ela não tem integração com a maquininha.
- **Sem integração** (qualquer outra maquininha): o fluxo manual atual, só mais guiado.

Quando o pagamento é confirmado por Pix, Point ou link, **a comanda fecha sozinha** (decisão do dono).

## Metas

- Cobrar o saldo da comanda (já descontados sinal, desconto e clube) sem o dono digitar valor.
- Confirmar o pagamento por webhook, com a rotina de conferência a cada minuto como rede de segurança.
- Fechar a comanda sozinha na confirmação, com a mesma transação do fechamento manual (caixa, comissão, comprovante no WhatsApp, avaliação).
- Funcionar no painel (`ComandaModal`) e no app da profissional (`AtendimentoBancada`, só com "a profissional cobra" ligada). O dinheiro sempre vai para a conta ou chave do **negócio**, nunca para algo da profissional.
- Cada entrega (Pix MP, Point, link InfinitePay) poder ir a produção sozinha.

## Não-metas (ficam para depois)

- **Stone Connect** (Fase 2b; depende do cadastro de parceiro na Stone) e **Pagar.me**.
- Guardar NSU, final do cartão ou nome da maquininha no fluxo manual.
- Pagamento dividido (parte Pix, parte cartão), reembolso parcial, e reembolso pela nossa tela (o dono devolve no app do Mercado Pago ou da InfinitePay).
- Criar loja e caixa do Mercado Pago pela API (o dono faz no app do Mercado Pago; a tela só explica).
- Escolher parcelas na cobrança Point: o terminal pergunta ao cliente.
- Validar a assinatura (`x-signature`) do webhook. Continua valendo a regra atual: o aviso só diz onde olhar, a prova é a consulta ao gateway com o token do negócio.

## Anti-metas (seria falha mesmo funcionando)

- Cobrar valor diferente do saldo da comanda, ou fechar uma comanda com pagamento de valor diferente.
- Fechar duas vezes, ou fechar sem prova de pagamento.
- Perder um pagamento confirmado: se a comanda não puder fechar sozinha, o dono precisa ser avisado e o pagamento continua registrado.
- Misturar cobrança do sinal com cobrança do saldo (um sinal pago e um saldo pago na mesma reserva não são "pagamento em dobro").

## Restrições

- Migração só roda em produção com autorização do dono, e o Render **não** aplica migração no deploy: conferir `migrate status` depois do merge.
- Tokens e chaves nunca entram em log, URL ou mensagem de erro (padrão dos adaptadores atuais).
- Webhooks respondem 200 primeiro e nunca lançam; idempotentes.
- Telas novas entram em `lib/themedPaths.ts` e usam só tokens de cor (o `themeCompliance` proíbe cor fixa).
- Gateways ficam atrás da interface `Gateway` (hoje só Mercado Pago implementa; InfinitePay tem adaptador próprio). A Stone entrará depois pelo mesmo desenho.

## Decisões do dono

- Fase 2a = Pix e Point pelo Mercado Pago + link InfinitePay + manual guiado. Stone Connect é 2b; Pagar.me, depois.
- A comanda **fecha sozinha** quando o pagamento é confirmado.
- Profissional cobra pelo Pix e gateways **do negócio**, não por chave própria.

## Desenho

### Modelo de dados (uma migração)

Reaproveita `cobrancas_sinal` (o nome fica enganoso; renomear é fora de escopo). Já tem webhook, conferência e segurança prontos, e a comanda é 1:1 com o agendamento, então `appointment_id` continua servindo.

- `cobrancas_sinal.tipo VARCHAR(10) NOT NULL DEFAULT 'sinal'` (`'sinal'` | `'saldo'`).
- `cobrancas_sinal.usuario_id UUID NULL`: quem iniciou a cobrança do saldo; vira `closed_by` no fechamento automático.
- `cobrancas_sinal.terminal_id VARCHAR(100) NULL`: terminal Point usado.
- `forma` ganha o valor `'point'` (cabe em 10 caracteres). `situacao` ganha `'cancelada'`.
- `conexoes_recebimento.terminal_padrao_id VARCHAR(100) NULL`.
- Índice em `(appointment_id, tipo)`.

**Regra crítica:** toda consulta que hoje agrupa por `appointment_id` (substituir cobranças, expirar reserva, "outra cobrança paga", "reserva com sinal no cartão/cobrança pendente", devolução ao cancelar) deve **filtrar `tipo = 'sinal'`**. As cobranças de saldo têm ciclo próprio e não podem expirar nem cancelar a reserva.

### Comanda travada durante a cobrança

Com cobrança `pendente` do saldo, a comanda não pode ser alterada nem fechada manualmente (409 `COBRANCA_EM_ANDAMENTO`): o valor cobrado tem que continuar igual ao saldo. Para mudar algo ou trocar de forma, o dono cancela a cobrança. Só pode haver uma cobrança pendente de saldo por comanda; uma nova substitui a anterior (`substituida`).

### Endpoints

Painel (`tenant_admin` e papéis atuais, `requireFeature('finance')`, `comandaDeHojeNaCarencia`) e espelho em `/bancada/comandas/:id/...` (só com "a profissional cobra", só a comanda dela, como o Pix da Fase 1):

- `POST /comandas/:id/cobranca` com o corpo da comanda (mesmo `SaveComandaSchema`) mais `via: 'pix' | 'maquininha' | 'link'`. Grava o rascunho, calcula o saldo **no servidor**, cria a cobrança no gateway do negócio e devolve `CobrancaDto`: `{id, via, situacao, valor, codigoPix?, checkoutUrl?, terminal?, venceEm}`.
- `GET /comandas/:id/cobranca`: a cobrança ativa ou a última (a tela consulta a cada ~3 s enquanto pendente).
- `POST /comandas/:id/cobranca/cancelar`.
- O `GET /comandas/:id` ganha `recebimento: { gateway: 'mercadopago' | 'infinitepay' | null, terminalPadrao: {id, nome} | null }`, para a tela decidir que opções mostrar.
- Recebimentos (só o dono): `GET /recebimentos/maquininhas` (lista os terminais com o modo de operação), `POST /recebimentos/maquininhas/:id/pdv` (ativa o modo PDV), `PUT /recebimentos/maquininhas/padrao`.
- O `POST /comandas/:id/pix` da Fase 1 (Pix manual na chave) continua, e é o Pix usado quando não há Mercado Pago conectado.

Saldo ≤ 0, comanda fechada ou sem gateway compatível: 409, como na Fase 1.

### Gateways

**Mercado Pago** (`Gateway`, estendido; token do negócio, idempotência pela chave `cobrancaId`):
- Pix do saldo: reaproveita `criarPix` (ordem `online`, `external_reference = cobrancaId`).
- `criarOrdemPoint(token, cobranca, { terminalId, tipo: 'debit_card' | 'credit_card' })`: `POST /v1/orders` com `type: "point"`, `external_reference`, `transactions.payments[{amount: "80.00"}]` (sempre duas casas), `config.point.terminal_id` (exatamente como o `GET` devolve, formato `TIPO__SERIAL`), `config.payment_method.default_type`, `expiration_time` (padrão `PT15M`, mínimo `PT30S`, máximo `PT3H`). **Não enviar parcelas** (o terminal pergunta; a documentação tem campos conflitantes sobre o custo de parcelamento).
- `listarTerminais(token)`: `GET /terminals/v1/list`.
- `ativarPdv(token, terminalId)`: `PATCH /terminals/v1/setup` (um terminal por requisição).
- `cancelarOrdem(token, idExterno)`: `POST /v1/orders/{id}/cancel`. Ordem ainda `created`: cancela na hora. Ordem já no terminal (`at_terminal`): só os modelos Smart 1 e 2 aceitam; nos outros devolve 409 `cannot_cancel_order` e a tela diz "cancele também na maquininha".
- `consultarOrdem(token, idExterno)`: `GET /v1/orders/{id}`, traduzido para `PagamentoGateway`. Necessário porque a busca atual (`/v1/payments/search?external_reference=`) pode não achar pagamentos de ordens Point; a conferência de cobranças `forma = 'point'` usa a ordem.
- Eventos `order.processed | canceled | expired | failed | refunded` chegam pelo webhook de hoje (`type=order`). `action_required` não muda de estado: tratar como "continua pendente" e avisar o dono para olhar o terminal.

**InfinitePay** (adaptador atual): reaproveita `criarLink` com `order_nsu = cobrancaId` e o webhook `/webhook/infinitepay/:cobrancaId` (a confirmação por `confirmarInfinitePay` já confere com a chave do negócio). O link leva o cliente a uma página pública mínima de "Pagamento recebido" (a construir; é a URL de volta). A forma paga vem de `capture_method`; se vier nula, mantém a forma escolhida pelo dono.

### Confirmação e fechamento automático

`pagamentosService.avaliar` passa a ramificar por `cobranca.tipo`. Para `'saldo'` há uma função pura nova, `decidirSaldo({ cobranca, pagamento, agora })`, com decisões: `quitar`, `ignorar`, `marcar_recusada`, `marcar_cancelada`, `marcar_expirada`, `marcar_devolvida`, `alertar_valor_diferente`, `alertar_duplicado`. A regra do sinal (`decidirPagamento`, que mexe em reserva) não é tocada.

`quitar` grava a cobrança como `paga` e chama `comandasService.fecharPorPagamento`:

1. Comanda já fechada: nada a fazer (idempotência).
2. Confere que o valor pago é igual ao saldo da comanda **em centavos**; se diferir, **não fecha**, registra e alerta o dono.
3. Define a forma de pagamento real (`pix`, `debito`, `credito`) a partir do pagamento, e monta a entrada do fechamento a partir da comanda salva (extras, desconto, gorjeta, cobertura).
4. Fecha pelo mesmo `close` do fechamento manual, com `closed_by = cobranca.usuario_id`.
5. Caixa do dia fechado ou nunca aberto (`CASH_CLOSED` / `CASH_ALREADY_CLOSED`): **não lança**. A cobrança fica `paga`, a comanda continua em rascunho com a forma gravada, e o dono recebe a notificação "Pagamento de R$ X recebido; abra o caixa para fechar a comanda". Ao abrir o caixa, o fechamento manual funciona normalmente (a cobrança `paga` libera o fechamento sem cobrar de novo).
6. Qualquer outra falha do fechamento: registra em log, mantém `paga` e avisa o dono. O pagamento nunca se perde.

Recusada, cancelada ou expirada: a cobrança sai de `pendente`, a comanda destrava e a tela oferece "Tentar de novo".

A rotina de cada minuto (`conferirPendentes`) passa a conferir também cobranças de saldo; expiram sozinhas depois de `venceEm`. Prazos (escolha minha): Pix MP e Point 15 min; link InfinitePay 60 min.

### Telas

`PainelCobrarPix` vira `PainelCobrar`, compartilhado por `ComandaModal` e `AtendimentoBancada`. As opções vêm de `recebimento`:

| Forma na comanda | Mercado Pago conectado | InfinitePay conectada | Sem integração |
|---|---|---|---|
| Pix | "Gerar Pix" (QR do MP, automático). Link secundário "usar minha chave Pix" | "Gerar link" (QR do link) | QR na chave do negócio (Fase 1) |
| Débito / Crédito | "Enviar para a maquininha" (Point, se houver terminal padrão) | "Gerar link" | "Digite na maquininha: R$ X" (botão copiar) |
| Dinheiro | sem painel | sem painel | sem painel |

Estados da cobrança automática: criando, aguardando (QR, link ou "olhe a maquininha", com contagem do prazo e botão Cancelar), paga (a comanda passa para fechada e a tela mostra o resultado, ou o aviso de caixa), recusada/expirada/cancelada ("Tentar de novo"). Enquanto aguarda, a comanda fica travada na tela. O fechamento manual com cobrança `paga` e caixa fechado reaproveita o fluxo "Abrir caixa e fechar comanda".

Em Recebimentos, cartão novo "Maquininha Point" (só com Mercado Pago conectado): lista terminais com o modo de operação, botão "Ativar modo PDV", escolha do terminal padrão e, sem terminais, o passo a passo (criar loja e caixa no app do Mercado Pago, associar a maquininha, ativar o PDV).

## Escolhas minhas (não foram combinadas; conferir)

- Reaproveitar `cobrancas_sinal` com `tipo`, em vez de tabela nova.
- Os interruptores "aceita Pix / aceita cartão" de Recebimentos valem só para o **sinal** da reserva online; o saldo na comanda os ignora (a cobrança no balcão depende só de haver gateway ativo).
- Prazos: Pix MP e Point 15 min, link InfinitePay 60 min.
- A comanda fica travada (sem editar nem fechar à mão) enquanto há cobrança pendente; para mudar algo, cancela-se a cobrança.
- No fechamento automático, `closed_by` é quem iniciou a cobrança (o profissional, na Bancada).
- Se a InfinitePay não informar a forma paga, vale a forma que o dono escolheu na comanda.
- O Pix manual (chave do negócio) continua disponível como alternativa mesmo com Mercado Pago conectado.

## O que a documentação limita (para o teste real)

- A Point precisa estar em modo **PDV**, em loja e caixa; um terminal por caixa.
- Há sandbox: terminal de teste `NEWLAND_N950__SBX0000001` e `POST /v1/orders/{id}/events` para simular o status.
- Reembolso por API é de ordem inteira e só até 90 dias; esta fase não o expõe.
- **Não encontrado:** escopos de OAuth exigidos pela Point, valor mínimo/máximo. Validar no sandbox antes de produção; se faltar escopo, os negócios já conectados precisarão reconectar (tratar com a mensagem de reconexão que já existe).
- A documentação do Mercado Pago tem trechos conflitantes (custo de parcelamento, status do reembolso, prefixo do token de teste): seguir o que o sandbox aceitar.

## Ordem de entrega (3 PRs, cada um funciona sozinho)

1. **Núcleo + Pix do Mercado Pago:** migração, `tipo` e filtros, `decidirSaldo`, `fecharPorPagamento`, endpoints de cobrança, travamento da comanda, `PainelCobrar` com Pix MP e Pix manual, conferência a cada minuto.
2. **Point:** adaptador, terminais e modo PDV, cartão em Recebimentos, opção "Enviar para a maquininha".
3. **Link InfinitePay:** cobrança de saldo pelo link, página pública de retorno.

O manual guiado ("Digite na maquininha") entra no PR 1, porque não depende de gateway.

## A cargo de quem constrói

- Nomes de arquivos, funções e DTOs; divisão exata dos testes.
- Texto das mensagens e dos avisos (em português do Brasil, com o vocabulário do negócio).
- Como organizar o polling e o cancelamento na tela, desde que a comanda fique travada enquanto há cobrança pendente.
- Detalhes do passo a passo da Point, conforme a tela de Recebimentos existente.

## Testes exigidos

- `decidirSaldo`: todas as decisões, valor em centavos, duplicado, estorno.
- Serviço: fechamento automático feliz; caixa fechado; valor diferente; comanda já fechada; webhook repetido; falha do fechamento sem perder o pagamento.
- Filtro por `tipo` em cada consulta por reserva (um sinal pago e um saldo pago não geram alerta de "em dobro"; cancelar a reserva não mexe no saldo).
- Adaptador Mercado Pago (Point, terminais, PDV, cancelar, consultar ordem) com `fetch` simulado, e nenhum token em erro ou log.
- Rotas: papéis, profissional só com a chave e só a comanda dela, comanda travada (409), saldo zero.
- Telas: cada estado do painel, comanda travada durante a cobrança, travamento do fechamento manual, aviso de caixa fechado.
- Conferência real pendente: Pix de R$ 1 e Point no sandbox, depois uma maquininha real.
