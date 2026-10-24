# Sub-projeto 3 — Relatórios e Comissões (Salão-parceiro)

Data: 2026-10-24 · Branch: `feat/relatorios-comissoes` (sai da `main` com a 2D, PR #9)

## Intenção
A dona fecha a quinzena sabendo quanto deve a cada profissional, paga e deixa o acerto registrado. Também vê numa tela só como o salão está indo: ticket, faltas, ocupação da grade, de onde vêm os agendamentos e a evolução do faturamento. Hoje a comanda já grava a comissão de cada item, mas nada soma, paga ou mostra isso, e `/dashboard/relatorios` é uma página "em breve".

Referências visuais (fiel ao Stitch, com dados reais):
- `docs/design/stitch/projeto/studio-aurora-comissoes-e-salao-parceiro-ajustada--f4df6a.html` (Comissões; a `bd2b20` traz adiantamentos, CNPJ do MEI e o aviso da lei)
- `docs/design/stitch/projeto/studio-aurora-relatorios-e-indicadores-operacionais--a56db8.html` (Relatórios; a `c74cf0` é a mesma tela com textos mais longos)

## Decisões do dono (24/10/2026)
1. **Salão-parceiro entra nesta fase, só no plano Salão.** A comissão tradicional vale no Equipe e no Salão. Sai o selo "Em breve" do salão-parceiro.
2. **Repasse com "Marcar como pago" e adiantamentos.** O sistema apura, a dona lança adiantamentos e marca como pago quando faz o Pix por fora. O histórico fica salvo.
3. **Período padrão é a quinzena** (1 a 15 e 16 ao fim do mês). Também há mês atual, mês anterior e intervalo livre.
4. **Relatórios entram completos:** indicadores do topo, mapa de ocupação, origem dos agendamentos e evolução de 6 meses.

## Objetivos
1. Tela Comissões (`/dashboard/relatorios/comissoes`): apuração por profissional no período, com totais, adiantamentos, "Marcar como pago", comprovante e exportação para o contador.
2. Modo salão-parceiro (plano Salão): os mesmos números apresentados como cota-parte do salão e da profissional, com CNPJ do MEI e o aviso da Lei 13.352/2016.
3. Tela Relatórios (`/dashboard/relatorios`) com dado real: 4 indicadores com comparação ao período anterior, mapa de ocupação, origem dos agendamentos, evolução de 6 meses e exportação.
4. Cadastro: CNPJ (MEI) e especialidade da profissional, e o modelo de repasse do negócio em Ajustes.

## Não objetivos
- Fazer o Pix de repasse pelo sistema ("Autorizar repasses Pix (lote)" do Stitch). O pagamento é feito por fora e só registrado.
- Emitir nota fiscal, gerar contrato de parceria ou calcular imposto ("Bitributação zero" e "Homologação ativa" do Stitch não aparecem).
- Comissão por faixa de meta, comissão por serviço ou regras escalonadas. Vale o percentual que já existe: o da profissional, ou o padrão do negócio.
- Acesso da profissional aos próprios números (fica para a fase 5, PWA).
- Escala de horário por profissional. A ocupação usa o horário do negócio e o intervalo de cada profissional.
- Insight escrito por IA. O texto do mapa de ocupação sai de regra fixa.

## Anti-objetivos
- Recalcular comissão de comanda fechada. A apuração soma o que a comanda gravou no fechamento.
- Pagar duas vezes o mesmo período da mesma profissional.
- Descontar o mesmo adiantamento em dois repasses.
- Mostrar número de exemplo. Sem dado, a tela diz que não tem dado.
- Liberar o salão-parceiro fora do plano Salão, inclusive pela API.

## Regras

### Apuração (comissões)
- **Base:** comandas com status fechada e `closed_at` dentro do período, no fuso do negócio (`getBusinessScheduleSettings().timezone`, como o Caixa). Uma comanda entra pela profissional da comanda (`comandas.professional_id`).
- **Por profissional:**
  - Atendimentos é o número de comandas.
  - Serviços e produtos são a soma de `services_total` e `products_total`.
  - Comissão de serviço e de produto vem da soma de `comanda_items.commission_amount` por `kind`. Esse valor já sai com o desconto rateado (2A).
  - Gorjetas é a soma de `tip_amount`. A gorjeta vai 100% para a profissional e não entra no faturamento.
  - Adiantamentos são os abertos da profissional com data até o fim do período.
  - A pagar = comissão + gorjetas − adiantamentos. Nunca fica abaixo de zero: o que sobrar de adiantamento continua aberto para o próximo repasse.
- **Totais do topo:**
  - Faturamento produzido = Σ (serviços + produtos − desconto). É a mesma `revenue` da comanda, sem gorjeta.
  - Cota das profissionais = Σ comissões.
  - Cota do salão = faturamento − cota das profissionais.
  - Gorjetas.
  - A retenção média é cota do salão ÷ faturamento.
- **Profissional inativa** com comanda no período aparece na apuração, com o selo "Inativa".
- **Período sem comanda:** a linha não aparece. A tela vazia diz "Nenhuma comanda fechada neste período".

### Repasse e adiantamento
- **Marcar como pago** grava um repasse com:
  - profissional e período (início e fim);
  - a foto dos valores no momento: serviços, produtos, comissão, gorjetas, adiantamentos descontados e valor pago;
  - forma (Pix, dinheiro ou transferência), data, quem marcou e uma observação opcional.

  O repasse fica único por (negócio, profissional, início, fim). Um segundo clique devolve o repasse que já existe, sem duplicar.
- **Ao pagar,** os adiantamentos abertos que entraram no cálculo ficam ligados ao repasse e deixam de ser abertos. Se o adiantamento passar do valor a pagar, ele é consumido até zerar o repasse e o resto continua aberto. Para isso, o adiantamento guarda o valor já abatido. Tudo roda numa transação só.
- **Desfazer pagamento** (só a dona, com confirmação): apaga o repasse e devolve os adiantamentos para abertos.
- **Valor mudou depois de pago:** isso acontece quando uma comanda do período é reaberta ou editada. A linha mostra "Pago" e o aviso "Diferença de R$ X desde o pagamento". A dona desfaz e paga de novo, se quiser. Não há ajuste automático.
- **Comprovante:** PDF do repasse com negócio, profissional, CNPJ do MEI (se houver), período, valores e forma, gerado no navegador com jsPDF, como o recibo do Caixa.
- **Adiantamento:** valor (> 0), data (padrão hoje, não pode ser futura), descrição opcional. Dá para excluir enquanto não foi abatido. Não mexe no Caixa. Se saiu dinheiro da gaveta, a dona lança a sangria no Caixa, como já faz hoje.
- **Status da linha:**
  - "Pendente": tem valor a pagar e não tem repasse.
  - "Pago": tem repasse.
  - "Sem valor": a pagar é zero e não tem repasse. Nesse caso não há botão.

### Salão-parceiro (só plano Salão)
- `business_settings.modelo_repasse` vale `comissao` (padrão) ou `salao_parceiro`. Mudar para `salao_parceiro` exige `requireFeature('salao_parceiro')`, um recurso novo no plano Salão. Em outro plano, a API responde 403 PLAN_REQUIRED.
- **As contas são as mesmas.** O percentual da profissional é a cota-parte dela, e o resto é a cota do salão. Muda o texto:
  - "Comissão" passa a ser "Cota da profissional".
  - Entra a coluna "Cota do salão".
  - Aparece o aviso da Lei 13.352/2016 com "Confirme o enquadramento com seu contador".
- **O seletor "Comissão tradicional | Salão-parceiro"** no topo da tela muda o modo de exibição e grava a preferência no negócio. No Equipe, a opção salão-parceiro aparece com cadeado e leva a `/planos/comparar?recurso=salao_parceiro`.
- **No modo salão-parceiro:** a profissional sem CNPJ cadastrado mostra "Sem CNPJ" em alerta, com link para o cadastro. Isso não impede o pagamento.
- **Rebaixamento:** se o plano cair para Equipe com o modo salão-parceiro ligado, a tela mostra o modo tradicional. O valor gravado fica e volta se o plano voltar a ser Salão.

### Exportar para o contador
CSV (separador `;`, decimais com vírgula, UTF-8 com BOM, como a exportação de clientes) e PDF. Os dois trazem:
- uma linha por profissional, com CNPJ, atendimentos, serviços, produtos, cota ou comissão, gorjetas, adiantamentos, a pagar e status;
- os totais;
- o aviso da lei, no modo salão-parceiro.

O CSV sai do backend (`GET /reports/commissions/export.csv`). O PDF é gerado no navegador.

### Relatórios
- **Período:**
  - O padrão são os últimos 30 dias. Também há mês atual, mês anterior e intervalo livre de até 366 dias.
  - A comparação é com o período anterior de mesmo tamanho.
  - As datas usam o fuso do negócio.
- **Faturamento:** soma da `revenue` das comandas fechadas (serviços + produtos − desconto), sem gorjeta. É a mesma definição da apuração.
- **Ticket médio:** faturamento ÷ número de comandas fechadas, com a variação % contra o período anterior.
- **Retorno no ciclo:** % das clientes atendidas no período que tinham `cicloMedio` (crmMetrics) e voltaram até o ciclo + 20% depois da visita anterior. Sem base (menos de 5 clientes com ciclo), mostra "—" e o texto "Poucos dados ainda".
- **Taxa de faltas:** faltou ÷ (concluído + faltou) dos agendamentos com data no período. O subtítulo diz "Sinal Pix + lembrete ativo" quando o negócio tem sinal em algum serviço e os lembretes do WhatsApp ligados. Senão, mostra "Ative o sinal Pix para reduzir faltas", com link para Serviços.
- **Faturamento do mês contra a meta:**
  - Sempre o mês corrente, qualquer que seja o período escolhido.
  - Meta mensal = `daily_revenue_goal` × dias abertos do mês (`dias_abertos`).
  - Sem meta, o card mostra o faturado e o link "Definir meta" para Ajustes.
- **Mapa de ocupação:**
  - É feito por profissional ativa × dia da semana × turno: manhã antes das 12h, tarde a partir das 12h.
  - Ocupação = minutos agendados ÷ minutos disponíveis no período.
    - Agendados conta os agendamentos confirmado, em_atendimento, concluído e faltou, pela duração do serviço.
    - Disponível é o horário de abertura e fechamento nos dias abertos, menos o intervalo da profissional.
  - Dia fechado mostra "Fechado" em cinza.
  - A célula usa 4 níveis de cor com os tokens do tema, e a última linha é a média do salão.
  - **Insight:** a célula aberta de menor ocupação média vira "Terça de manhã está com 42% de ocupação. Que tal uma campanha para clientes que não vêm há mais de 30 dias?", com o botão "Criar campanha" para `/whatsapp/campanhas`. Com menos de 2 semanas de dados, o insight não aparece.
- **Origem dos agendamentos** (agendamentos não cancelados com data no período), com quantidade, % e faturamento das comandas fechadas de cada origem:
  - "Página pública" = `source = publico`.
  - "Bot do WhatsApp" = `source = whatsapp`.
  - "Balcão / painel" = `source = painel`.
  - **"Hora de voltar e campanhas" (decisão do Claude):** a cliente recebeu um envio de WhatsApp com origem `retorno` ou `campanha` (status enviado) até 7 dias antes de o agendamento ser criado. Essa regra tem prioridade sobre as outras.
- **Evolução de 6 meses:** barras empilhadas de serviços e produtos dos 6 meses até o atual, com a linha da meta mensal (se houver). No mês atual, a barra vem tracejada com a projeção (faturado ÷ dias decorridos × dias do mês).
- **Rodapé, 3 cartões:**
  - "Vendas de produtos": % dos produtos na receita do período.
  - "Projeção de fechamento": a projeção do mês e quantos dias faltam.
  - "Horários de pico": o dia e o turno de maior ocupação.
- **Exportar relatório:** PDF com os indicadores, a tabela de origem e a evolução, em tabelas (sem imagem do gráfico).

### Acesso e planos
- **Leitura:** Relatórios e Comissões usam `requireFeature('reports')`, do Equipe para cima, e os mesmos papéis do Financeiro.
- **Ações:** marcar e desfazer pagamento, adiantamentos, mudar o modelo de repasse e editar CNPJ ou especialidade exigem `requireRole(['tenant_admin'])`.
- **No Solo:** as duas telas mostram o FeatureGate com upgrade para `/planos/comparar?recurso=reports`.
- **Catálogo (`planCatalog.ts`):**
  - Em `salao_parceiro`, premium passa de `em_breve` para `true`.
  - Sai "Salão-parceiro" de `PLAN_EM_BREVE.premium`.
  - Entra o recurso `salao_parceiro: 'premium'` em `planPermissions` (backend) e em `subscriptionAccess` (frontend).
- **Navegação:**
  - Relatórios ganha abas "Visão geral" e "Comissões".
  - O breadcrumb fica "Relatórios / Comissões".
  - A página "em breve" sai.

## Dados (migração `20261025120000_relatorios_comissoes`)
- `business_settings.modelo_repasse VARCHAR(20) NOT NULL DEFAULT 'comissao'`
- `professionals.cnpj VARCHAR(20) NULL`, `professionals.especialidade VARCHAR(80) NULL`
- `repasses`:
  - id, business_id, professional_id, periodo_inicio DATE, periodo_fim DATE;
  - servicos, produtos, comissao_servico, comissao_produto, gorjetas, adiantamentos, valor_pago (DECIMAL 10,2);
  - modelo VARCHAR(20), forma VARCHAR(20), pago_em TIMESTAMPTZ, pago_por UUID, observacao TEXT, created_at;
  - UNIQUE (business_id, professional_id, periodo_inicio, periodo_fim);
  - índice (business_id, periodo_fim).
- `adiantamentos`:
  - id, business_id, professional_id, valor DECIMAL(10,2), valor_abatido DECIMAL(10,2) DEFAULT 0, data DATE, descricao VARCHAR(255);
  - created_by UUID, created_at;
  - índice (business_id, professional_id, data).
- `repasse_adiantamentos`: repasse_id, adiantamento_id, valor (quanto daquele adiantamento entrou naquele repasse). PK composta, cascade pelo repasse.

A migração só cria colunas e tabelas, sem apagar nada. Ela é aplicada em produção só com autorização do dono, pelo session pooler, como nas fases anteriores.

## API (novas rotas em `/api/reports`)
| Método | Rota | O que faz |
|---|---|---|
| GET | `/overview?inicio&fim` | indicadores, comparação, origem e rodapé |
| GET | `/occupancy?inicio&fim` | mapa de ocupação e insight |
| GET | `/evolution` | 6 meses de serviços e produtos, meta e projeção |
| GET | `/commissions?inicio&fim` | apuração, totais, modo e status por profissional |
| GET | `/commissions/export.csv?inicio&fim` | CSV para o contador |
| POST | `/commissions/payouts` | marca como pago `{professionalId, inicio, fim, forma, observacao?}` |
| DELETE | `/commissions/payouts/:id` | desfaz o pagamento |
| GET | `/advances?professionalId&abertos` | lista adiantamentos |
| POST | `/advances` | lança adiantamento |
| DELETE | `/advances/:id` | exclui adiantamento não abatido |
| PUT | `/settings/payout-model` | `{modelo}`; salão-parceiro exige o plano Salão |

CNPJ e especialidade entram no corpo que o cadastro de profissional já aceita.

## Telas
- **Comissões:**
  - Topo: seletor de período (quinzena atual por padrão, com setas para as quinzenas anterior e seguinte), seletor de modo, botões "Lançar adiantamento" e "Exportar para o contador" (CSV ou PDF).
  - 4 cartões de totais e a tabela de apuração. No celular a tabela vira cartões.
  - Por linha: "Marcar como pago" abre um modal com valor, forma e observação. Uma linha paga mostra "Comprovante" e o menu com "Desfazer pagamento".
  - O adiantamento aberto aparece na coluna com "−R$ X".
- **Relatórios:** como o Stitch `a56db8`, com o seletor de período, "Exportar relatório", os 4 indicadores, o mapa, a origem, a evolução e os 3 cartões do rodapé. Gráficos em SVG com tokens, sem biblioteca nova.
- **Profissional (modal que já existe):** campos CNPJ (MEI) com máscara e validação de dígito, e especialidade.
- **Ajustes:** "Modelo de repasse" junto da comissão padrão. A opção salão-parceiro fica com cadeado fora do plano Salão.

## Testes
- **Regras puras:**
  - apuração (comissão, gorjeta, adiantamento parcial, a pagar nunca negativo);
  - quinzenas, incluindo fevereiro e o mês de 31 dias;
  - retorno no ciclo, faltas, ocupação (dia fechado, intervalo, turno);
  - origem (prioridade do retorno, janela de 7 dias) e projeção.
- **Serviço:**
  - pagar duas vezes devolve o mesmo repasse;
  - o adiantamento é consumido em parte e o resto fica aberto;
  - desfazer devolve os adiantamentos;
  - diferença depois do pagamento;
  - salão-parceiro barrado fora do Salão.
- **Rotas:** papéis (só tenant_admin paga), feature `reports` no Solo e formato do CSV.
- **Frontend:**
  - Comissões: dados reais, marcar como pago, modo salão-parceiro e cadeado no Equipe.
  - Relatórios: indicadores, vazio e insight escondido sem dados.
  - Também o themeCompliance das novas rotas e o teste do catálogo atualizado.

## Riscos
- **Volume:** a ocupação e a origem leem agendamentos de até um ano. As consultas usam os índices por `business_id` e data e agregam no banco quando dá. Se ficar lento, entra cache curto por negócio (fora do escopo agora).
- **Fuso:** comanda fechada perto da meia-noite cai no dia do fuso do negócio, e não em UTC. Isso tem teste específico.
- **Salão-parceiro é tema jurídico.** A tela não promete enquadramento. Ela mostra o aviso para confirmar com o contador.

## Ajustes feitos na implementação
- **Modelo de repasse num lugar só.** O seletor "Comissão tradicional | Salão-parceiro" fica no topo da tela de Comissões e grava no negócio. Ele não foi repetido em Ajustes, para não haver dois controles do mesmo valor.
- **Comanda fechada não reabre hoje.** O status só vai de rascunho para fechada. O aviso "Diferença desde o pagamento" fica como proteção, para o caso de uma reabertura entrar no futuro.
- **Ocupação e período:** o mapa usa o mesmo período da tela (padrão de 30 dias). Domingo só aparece se o negócio abre no domingo. Segunda fechada aparece como "Fechado", como no Stitch.
- **Serviços e produtos na evolução:** o desconto da comanda é rateado entre serviços e produtos, na proporção de cada um, para a soma bater com o faturamento.
- **Adiantamento para quem não teve comanda:** o modal lista todas as profissionais ativas, não só as da apuração. O desconto acontece no primeiro repasse com valor.
- **Pagar sem comanda no período** é recusado ("Nenhuma comanda fechada desta profissional no período").

