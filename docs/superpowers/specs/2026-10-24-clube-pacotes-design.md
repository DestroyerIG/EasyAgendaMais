# Sub-projeto 4 — Clube e pacotes

Data: 2026-10-24 · Branch: `feat/clube-pacotes` (sai da `main` com a fase 3, PR #10)

## Intenção
O salão vende dois tipos de oferta, e o sistema controla saldo, cobrança e uso sem planilha:
- **clube:** uma assinatura mensal com X sessões por mês;
- **pacote:** sessões pagas antes.

Na comanda, a sessão coberta sai a R$ 0,00 para a cliente. A profissional continua com a comissão sobre o valor da sessão. Hoje `/dashboard/clube` é uma página "em breve" e não existe nada no banco.

Referências visuais (fiel ao Stitch, com dados reais):
- `docs/design/stitch/projeto/studio-aurora-clube-e-pacotes-gestao-de-planos--3ed137.html` (Planos e pacotes)
- `docs/design/stitch/projeto/studio-aurora-assinantes-e-pacotes-ativos-retoque-final--3ad7a1.html` (Assinantes e pacotes ativos)
- `docs/design/stitch/projeto/studio-aurora-comanda-com-debito-de-pacote-janela-completa--f852ab.html` (comanda com débito)
- `docs/design/stitch/projeto/studio-aurora-pagina-de-adesao-ao-clube-corrigida--257172.html` e `…-mobile--f22861.html` (adesão pública)

## Decisões do dono (24/10/2026)
1. **Mensalidade do clube pela chave Pix do salão, com confirmação manual.** Todo mês o sistema gera o Pix (BR Code com valor) na chave do salão e manda pelo WhatsApp. A dona confirma o recebimento. Não entra gateway novo. É o mesmo modelo do sinal Pix de hoje.
2. **Clube e pacotes só no plano Salão.** Sai o selo "Em breve".
3. **A comissão da sessão coberta é sobre o valor por sessão:**
   - no pacote, preço ÷ sessões;
   - no clube, mensalidade ÷ sessões do mês.

   O percentual é o da profissional, gravado na comanda.
4. **A página pública de adesão entra agora**, pela Minha página. A assinatura começa quando a dona confirma o primeiro Pix.

## Objetivos
1. **Planos e pacotes** (`/clube`): criar, editar, pausar e arquivar ofertas, com serviços inclusos, regras de uso, profissionais e benefícios.
2. **Assinantes e pacotes ativos** (`/clube/assinantes`):
   - contratos com saldo, próximo vencimento, forma e status;
   - vincular cliente;
   - confirmar pagamento e reenviar a cobrança;
   - cancelar e exportar em CSV.
3. **Comanda:** reconhece o contrato que cobre o serviço, debita a sessão, mostra "Sessão 4 de 10" e cobra só o resto.
4. **Cobrança mensal do clube:** gera a cobrança, manda o Pix no WhatsApp, marca o atraso e suspende o uso enquanto houver atraso.
5. **Adesão pública** (`/agendar/[slug]/clube/[id]`): a cliente escolhe o clube, informa nome e WhatsApp, e recebe o Pix.
6. **Integrações:**
   - Caixa: recebimentos de clube e pacote entram nas entradas do dia.
   - Relatórios: o faturamento soma esses recebimentos.
   - Ficha da cliente: mostra o selo do contrato.

## Não objetivos
- Débito automático por gateway (Pix Automático, cartão recorrente, Asaas do salão). Na adesão, o Stitch mostra "Assinar com Pix Automático" e "Cartão". Aqui sai só "Assinar com Pix".
- Parcelamento do pacote no sistema. "Em até 6x" é texto: a dona passa na maquininha e registra como cartão.
- Check-in por QR code, prioridade de horário, reagendamento com aviso mínimo e isenção de sinal no agendamento público. Esses benefícios aparecem só como texto.
- Pausar a assinatura da cliente (só cancelar). "Importar modelo".
- A tela "Assinatura vencida / modo de contingência" do Stitch. Ela trata da assinatura do salão no EasyAgenda+, e não do clube da cliente; fica para outra fase.

## Anti-objetivos
- Debitar duas vezes a mesma sessão (comanda salva duas vezes, fechamento repetido).
- Liberar uso de clube em atraso ou de pacote vencido ou sem saldo.
- Contar o mesmo dinheiro duas vezes no Caixa ou nos Relatórios (venda do pacote mais sessão coberta).
- Ativar a assinatura pública sem a dona confirmar o Pix.
- Gerar Pix sem chave Pix cadastrada no negócio.

## Regras

### Ofertas (`clube_ofertas`)
- **Campos comuns:**
  - `tipo`: `clube` ou `pacote`;
  - nome, descrição e preço (> 0);
  - serviços inclusos (1 ou mais);
  - profissionais permitidas (vazio = todas);
  - benefícios em texto livre (até 6 linhas, só exibição);
  - `desconto_extras_pct` (0–100);
  - `publica` (aparece na adesão; só clube);
  - `status`: ativa, pausada (não vende, contratos seguem) ou arquivada.
- **`desconto_extras_pct`** é um desconto real: na comanda de quem tem contrato ativo daquela oferta, ele vale sobre os itens que não foram cobertos.
- **Clube:**
  - `sessoes_por_ciclo` (1–31, ou ilimitado);
  - `intervalo_minimo_dias` (0–60);
  - as sessões não acumulam de um mês para o outro.

  Ilimitado exige `sessoes_referencia` (padrão 4), que só serve para calcular o valor por sessão.
- **Pacote:**
  - `total_sessoes` (2–100);
  - `validade_dias` (30–730), contada da **primeira sessão** como no Stitch. Sem uso, conta da compra mais a validade × 2 (decisão do Claude, para não ficar eterno).
- **`falta_debita`** (as duas): o agendamento marcado como "faltou" debita uma sessão, se o contrato cobria o serviço.
- **Valor por sessão:**
  - pacote: preço ÷ total de sessões;
  - clube: preço ÷ sessões por ciclo (ou ÷ `sessoes_referencia`).

  Arredonda para baixo no centavo. O valor fica gravado no contrato no momento da venda.
- **Editar a oferta** não muda contratos que já existem: preço, sessões e valor por sessão ficam no contrato. Serviços, profissionais e regras de uso valem da edição em diante.

### Contratos (`clube_contratos`)
- **Status:** `aguardando_pagamento` → `ativo` → `em_atraso` (só clube) → `cancelado`, `concluido` (pacote sem saldo) ou `expirado` (pacote vencido).
- **Pacote:**
  - a venda gera uma cobrança única;
  - o pagamento na hora (dinheiro, débito, crédito ou Pix já recebido) ativa o contrato direto;
  - o Pix a receber deixa o contrato em `aguardando_pagamento`.
- **Clube:**
  - o ciclo é mensal a partir do dia da ativação; dia 29 a 31 vira o último dia em meses mais curtos;
  - a cobrança do ciclo seguinte é gerada 3 dias antes do vencimento e vai para a fila do WhatsApp com o Pix copia e cola;
  - sem confirmação até o fim do dia do vencimento, a rotina de hora em hora passa o contrato para `em_atraso`;
  - confirmar o pagamento volta o contrato para `ativo`, e o ciclo pago começa no vencimento original;
  - o ciclo começa com o saldo cheio quando é pago.
- **Uma cliente** pode ter vários contratos, mas só um contrato ativo da mesma oferta.
- **Cancelar** (com confirmação):
  - no clube, vale no fim do ciclo pago, com status `cancelado` e uso liberado até lá, e as cobranças pendentes são canceladas;
  - no pacote, encerra na hora e não devolve dinheiro.
- **Cobrança (`clube_cobrancas`):**
  - é única por (contrato, competência);
  - guarda valor, vencimento, Pix copia e cola, status (pendente, paga ou cancelada), forma, data do pagamento, quem confirmou e a sessão de caixa do dia.

  Confirmar duas vezes não duplica.

### Débito na comanda (`clube_usos`)
- **Ao abrir a comanda,** o sistema procura o contrato que cobre o serviço principal. As condições:
  - contrato ativo, ou cancelado ainda dentro do ciclo pago;
  - serviço incluso e profissional permitida;
  - saldo no ciclo ou no pacote;
  - intervalo mínimo respeitado;
  - pacote dentro da validade.

  Se houver mais de um contrato, vale o que vence antes. A comanda mostra o selo "Clube / pacote ativo" e o item "Coberto pelo pacote · Sessão 4 de 10", com a chave ligada.
- **A dona pode desligar a cobertura** (a cliente prefere pagar). Sem contrato válido, a comanda explica o motivo, por exemplo "Clube em atraso desde 15/10" ou "Sem saldo neste mês".
- **Comanda com cobertura:**
  - o item fica com `unit_price` cheio para referência, mas `cobertura_contrato_id`, `valor_coberto` (= valor por sessão) e preço cobrado R$ 0,00;
  - `calcularComanda` passa a aceitar itens cobertos: eles **não** entram em serviços, subtotal, receita nem total cobrado;
  - eles **entram** na base de comissão de serviço, pelo `valor_coberto`;
  - a cópia do frontend (`frontend/src/lib/comanda.ts`) muda junto, com os mesmos testes.
- **Fechar a comanda** grava o uso na mesma transação. O uso é único por item de comanda e conta no saldo. A comanda fechada não volta.
- **Falta:** com `falta_debita`, marcar "faltou" grava um uso sem comanda (motivo `falta`). Voltar o status desfaz o uso.

### Dinheiro, Caixa e Relatórios
- **No Caixa:** a cobrança de clube ou pacote confirmada entra nas entradas do dia na forma informada. Ela aparece como linha "Clube/pacote · Nome da cliente" e conta na gaveta, se foi em dinheiro. Precisa de caixa aberto para confirmar em dinheiro, como a comanda.
- **Faturamento dos Relatórios:** passa a ser comandas mais recebimentos de clube e pacote. A sessão coberta não soma de novo, porque a comanda cobra R$ 0,00 dela. O ticket médio continua só sobre comandas.
- **Comissões (fase 3):**
  - a comissão da sessão coberta já sai gravada no item, e a apuração soma sem mudança;
  - "Serviços" na apuração inclui o `valor_coberto`;
  - por isso o faturamento produzido da tela de Comissões passa a incluir as sessões cobertas, e é o que a profissional produziu.

### Adesão pública
- **Rota:** `/agendar/[slug]/clube/[ofertaId]`, só para oferta de clube ativa e `publica`, de negócio no plano Salão e com chave Pix.
- **Fluxo:**
  1. A cliente informa nome e WhatsApp e aceita os termos, com o mesmo consentimento LGPD do agendamento público.
  2. O sistema reaproveita a cliente pelo telefone, ou cria uma nova.
  3. Cria o contrato em `aguardando_pagamento` e a cobrança com o Pix.
  4. A tela mostra o QR, o copia e cola, e a frase "Assim que o salão confirmar o pagamento, sua assinatura começa".
  5. A dona recebe uma notificação no sino.
- **Limites:**
  - limite de requisições como no agendamento público;
  - uma adesão pendente por telefone e oferta, e a segunda devolve a mesma cobrança;
  - adesão pendente há mais de 7 dias é cancelada pela rotina.
- **Minha página:** ganha a seção "Clube" com os cartões das ofertas públicas.

### Acesso e planos
- **API:** recurso `clube: 'premium'` em `planPermissions` (backend) e em `subscriptionAccess` (frontend). As rotas do painel usam `requireFeature('clube')` e os papéis do Caixa. Criar, editar e arquivar oferta e cancelar contrato exigem `tenant_admin`.
- **Catálogo:**
  - `clube` premium passa de `em_breve` para `true`;
  - sai "Clube e pacotes" de `PLAN_EM_BREVE.premium`;
  - `?recurso=clube` na comparação.
- **Fora do Salão:** `/clube` mostra o FeatureGate. Na comanda, contratos que já existem continuam sendo debitados se o plano cair: a cliente já pagou. Vender, criar oferta e a adesão pública ficam bloqueados.

## Dados (migração `20261026120000_clube_pacotes`)
- **`clube_ofertas`:**
  - id, business_id, tipo, nome, descricao, preco;
  - sessoes_por_ciclo NULL, sessoes_referencia, intervalo_minimo_dias, total_sessoes NULL, validade_dias NULL;
  - falta_debita, desconto_extras_pct, beneficios TEXT[], publica, status, created_at, updated_at.
- **`clube_oferta_servicos`:** oferta_id e service_id (PK composta).
- **`clube_oferta_profissionais`:** oferta_id e professional_id (PK composta).
- **`clube_contratos`:**
  - id, business_id, oferta_id, client_id, tipo, status, origem (painel ou publico);
  - preco, valor_sessao, sessoes_por_ciclo, intervalo_minimo_dias, total_sessoes, sessoes_usadas;
  - ativado_em, ciclo_inicio, ciclo_fim, valido_ate;
  - cancelado_em, cancela_em, created_by, created_at;
  - índices (business_id, status) e (business_id, client_id).
- **`clube_cobrancas`:**
  - id, business_id, contrato_id, competencia DATE, valor, vencimento DATE, status;
  - pix_copia_cola, forma, pago_em, confirmado_por, cash_session_id, created_at;
  - UNIQUE (contrato_id, competencia).
- **`clube_usos`:**
  - id, business_id, contrato_id, comanda_item_id UNIQUE NULL, appointment_id NULL;
  - service_id, data, valor_sessao, motivo (atendimento ou falta), created_at;
  - UNIQUE (contrato_id, appointment_id).
- **`comanda_items`:** recebe `cobertura_contrato_id UUID NULL` e `valor_coberto DECIMAL(10,2) NOT NULL DEFAULT 0`.

A migração só cria colunas e tabelas, sem apagar nada. Ela é aplicada só com autorização do dono, pelo session pooler.

## API
| Método | Rota | O que faz |
|---|---|---|
| GET/POST | `/clube/ofertas` | lista com contadores (contratos ativos, MRR ou receita) e cria |
| PUT | `/clube/ofertas/:id` | edita, pausa ou arquiva |
| GET | `/clube/contratos?tipo&status&busca&pagina` | lista e indicadores (ativos, MRR, em atraso, cancelamento em 30 dias) |
| POST | `/clube/contratos` | vincula a cliente `{ofertaId, clientId, pagamento: {forma, pago}}` |
| POST | `/clube/contratos/:id/cancelar` | cancela |
| POST | `/clube/cobrancas/:id/confirmar` | confirma `{forma}` |
| POST | `/clube/cobrancas/:id/reenviar` | põe o Pix de novo na fila do WhatsApp |
| GET | `/clube/contratos/export.csv` | CSV |
| GET | `/clube/clientes/:clientId` | contratos da cliente (ficha e comanda) |
| GET | `/public/:slug/clube` e `/public/:slug/clube/:ofertaId` | ofertas públicas |
| POST | `/public/:slug/clube/:ofertaId/adesao` | adesão `{nome, telefone, consentimento}` |

A comanda (`GET/PUT/POST /comandas/:id`) passa a devolver `cobertura` (contrato, sessão X de Y, motivo de bloqueio) e aceitar `usarCobertura: boolean`.

## Telas
- **Clube e pacotes** (abas "Planos e pacotes" e "Assinantes e pacotes ativos"):
  - Planos e pacotes: cartões como no Stitch `3ed137`, com filtros Todos, Clubes e Pacotes e o status; "+ Novo plano ou pacote" e "Editar" num modal com os campos acima.
  - Assinantes: os 4 indicadores e a tabela do `3ad7a1`. Cada linha tem "Confirmar pagamento", "Cobrar" (reenviar) e "Cancelar". A tela tem "+ Vincular cliente a plano" e "Exportar CSV".
- **Comanda:** selo, item coberto, chave "Usar pacote" e motivo de bloqueio, como no `f852ab`.
- **Adesão pública:** como no `257172` (mobile `f22861`), com um botão "Assinar com Pix".
- **Ficha da cliente e drawer do agendamento:** chip com o nome da oferta e o saldo.

## Testes
- **Regras puras:**
  - valor por sessão, ciclos (dia 31, fevereiro) e intervalo mínimo;
  - saldo do ciclo e do pacote, validade da primeira sessão e escolha do contrato que vence antes;
  - `calcularComanda` com item coberto, nas duas cópias.
- **Serviço:**
  - venda paga e venda pendente;
  - confirmar duas vezes;
  - cobrança do ciclo gerada uma vez só e atraso que bloqueia o uso;
  - cancelar o clube com uso até o fim do ciclo;
  - fechamento que grava o uso uma vez só;
  - falta que debita e desfaz;
  - adesão pública repetida que devolve a mesma cobrança.
- **Rotas:** feature `clube` fora do Salão, papéis e validação.
- **Frontend:** telas do clube, comanda com cobertura, adesão e themeCompliance.

## Riscos
- **Confirmação manual depende da dona.** Pix não confirmado vira atraso e bloqueia o uso. O texto da tela deixa isso claro, e o sino avisa as cobranças vencidas.
- **Mexer na `calcularComanda`** afeta todo fechamento. Os testes atuais continuam valendo: sem item coberto, o resultado é idêntico.
- **WhatsApp desconectado:** a cobrança fica na fila como hoje, e a tela mostra "Não enviada" com "Cobrar" para tentar de novo ou copiar o Pix.

## Ajustes feitos na implementação
- **Desconto de sócia gravado à parte.** A comanda ganhou `desconto_clube`. O `discount_amount` continua com o desconto total (manual + sócia), e a tela mostra e envia só o manual.
- **Cobrança paga:** o status da cobrança é `paga` (não `confirmada`).
- **Ciclo vencido sem pagamento:** depois do `cicloFim`, a sessão fica bloqueada com "Mensalidade de dd/mm aguardando pagamento", mesmo antes de a rotina marcar o atraso.
- **Falta não se desfaz.** `faltou` é status final do agendamento, então não existe "desfazer falta" para devolver a sessão.
- **Selo da cliente sem trava de plano.** `GET /clube/clientes/:id` exige só login e papel: quem caiu do Salão continua vendo os contratos já pagos da cliente.
- **Caixa do dia:** entram as mensalidades e pacotes recebidos naquela sessão de caixa, mais os confirmados sem caixa aberto naquele dia. Cada um vira uma linha "Clube" na lista do Caixa, sem abrir comanda.
- **Vitrine pública:** só aparece com chave Pix cadastrada e plano Salão em dia. Fora disso, a seção "Clube" some e a adesão responde 404.
- **Comanda fechada:** mostra o item coberto pelo que foi gravado, sem o número da sessão.
- **Evolução de 6 meses:** o recebimento do clube entra em "Serviços", no mês em que foi pago.
- **Telas "em breve":** com o Clube, o componente `EmBreve` ficou sem uso e saiu.
