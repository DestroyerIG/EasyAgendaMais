# Seguimento do design system

O que ficou em aberto depois da reconstrução das telas do painel a partir das referências Google Stitch (sub-projetos B a I). A maior parte é decisão sua ou melhoria pequena, mas a seção seguinte lista bloqueadores reais de lançamento — leia-a primeiro.

## 🚨 Bloqueadores de lançamento

### Divergência de preço do plano Solo — dinheiro envolvido, decisão do dono antes de lançar

**`docs/design/DESIGN.md` promete R$ 39,90/mês pelo plano Solo. O sistema de cobrança cobra R$ 49,90/mês pelo mesmo plano, hoje, em produção.**

- `docs/design/DESIGN.md:68` (antes desta tarefa) — Solo R$ 39,90/mês.
- `backend/src/services/billingService.ts:486-490` — R$ 49,90.
- `backend/src/integrations/asaas/service.ts:148-150` — R$ 49,90, cobrado via Asaas.
- `backend/src/modules/billing/billing.controller.ts:9-11` — R$ 49,90.
- A tela Ajustes › Plano (tarefa 11) mostra o preço real, R$ 49,90 — não o do DESIGN.md — porque exibir um valor que o cliente não paga seria uma mentira na tela.

Ou o `DESIGN.md` está desatualizado (a repaginação de preços do relançamento nunca chegou ao backend) ou o backend precisa passar a cobrar o valor prometido. Isto não é um ajuste de documentação: qualquer lugar que mostre R$ 39,90 (marketing, DESIGN.md, telas futuras) enquanto o Asaas cobra R$ 49,90 é risco financeiro e legal real para os clientes do negócio. Precisa da sua decisão antes do lançamento.

### Dois padrões contraditórios de horário padrão no backend

`backend/src/repositories/businessSettingsRepository.ts:57-58` preenche horário ausente com `09:00`/`20:00`, indistinguível de um valor configurado de propósito, enquanto `DEFAULT_SCHEDULE_SETTINGS` (`backend/src/services/scheduleSettingsService.ts:20-21`) usa `08:00`/`18:00` para o mesmo caso — e `allowWalkins` e `autoConfirmAppointments` também divergem entre os dois pontos. Um negócio sem linha de configuração salva recebe respostas diferentes dependendo de qual dos dois caminhos responde, e o motor de agendamento usa um dos dois. Isto é um bloqueador, não uma melhoria futura.

### `pending_registrations` não existe em nenhuma migração do Prisma

A tabela `pending_registrations` é referenciada pelo fluxo de cadastro, mas nenhuma migração do Prisma a cria. Em um ambiente novo (banco limpo, `prisma migrate deploy`), o cadastro quebra por falta da tabela.

### O plano Básico promete lembretes por WhatsApp que o próprio sistema bloqueia para esse plano

- `frontend/src/lib/plans.ts:26` — o array `features` do plano `basico` inclui "Lembretes automáticos via WhatsApp".
- `frontend/src/lib/subscriptionAccess.ts:49` — `FEATURE_REQUIREMENTS.whatsapp_automation` exige o plano `profissional` ou superior; `WhatsAppModule.tsx:426` já bloqueia o Básico (Solo) e mostra a mensagem de upgrade.

Um cliente que lê a lista de recursos do plano Básico (nesta tela ou na página de preços) vê uma promessa que a própria tela do WhatsApp nega para a mesma conta. É divergência de conteúdo pré-existente entre dois arquivos que este pacote de correções não tocou — decida se `plans.ts` sai da lista do Básico ou se `subscriptionAccess.ts` passa a liberar WhatsApp no Básico.

## Decisões que dependem de você

1. **Uma passada de revisão nos textos dos botões.** Hoje convivem dois estilos: "Novo Agendamento", "Novo Cliente", "Nova Opção", "GERAR RELATÓRIO" de um lado, e "Salvar preferências", "Atualizar senha", "Ver planos" do outro. A regra do projeto é frase normal, com maiúscula só na primeira palavra. Mudar um texto de cada vez deixa a tela mais desigual, não menos, então isso pede uma passada única com a sua aprovação.
2. **O título aparece duas vezes no celular:** uma na barra de cima e outra no cabeçalho da tela. Foi assim que o plano pediu. Se incomodar, dá para esconder um dos dois.
3. **Verde do WhatsApp com texto branco** fica em 4,36:1 de contraste, um pouco abaixo do mínimo recomendado para texto pequeno. A cor vem do DESIGN.md.
4. **Blocos alimentados por `conteudoDemo.ts` precisam virar dado real ou sair da tela** antes de publicar para clientes reais — hoje várias telas reconstruídas (Clientes, WhatsApp, entre outras) misturam dado real com exemplo fixo de `conteudoDemo.ts` para preencher seções que o backend ainda não alimenta.
5. **As três áreas "em breve"** (referentes a Clube e pacotes, Relatórios e Minha página, conforme o estado atual do painel) esperam os sub-projetos D a I para virarem funcionalidade real.
6. **Três cores da legenda da Agenda** (aguardando, em atendimento, faltou) ficam inertes enquanto a API tiver só três status possíveis; a coluna `status` é `varchar` livre no Prisma, então nada impede os valores extras — é preciso decidir o conjunto final de status antes de a legenda fazer sentido.
7. **Decidir se a tela Hoje mostra centavos** nos valores monetários — pendente de definição visual.
8. **O mesmo plano tem nomes diferentes em telas diferentes.** `planos/page.tsx:172` diz "Plano Solo (Mensal)"; `PricingPlansSection` (mesma página, rodapé) diz "Básico/Profissional/Premium"; o bloqueio do WhatsApp diz "Profissional ou Premium" (`WhatsAppModule.tsx:426-428`); a barra lateral diz "Solo/Equipe/Salão". O plano desta migração mandou não tocar em `PricingPlansSection.tsx`, o que por si só entra em conflito com unificar os nomes — decisão sua, para a conferência visual (Tarefa 13).
9. **A paleta por tela (decisão 2, "cada tela usa a paleta do seu próprio arquivo") não foi aplicada.** Os tokens `surface-m3`/`brand-text-m3` (`frontend/src/styles/globals.css:63-64,91-92`) existem e estão documentados no `DESIGN.md`, mas `grep -rnE "(bg|text|border)-(surface-m3|brand-text-m3)" frontend/src` não encontra nenhum uso — as telas usam `text-brand-text` uniforme em vez da cor `text-primary` que os sete arquivos de referência Material 3 usam 44 vezes. Decida na conferência visual se aplica os tokens tela a tela ou se remove os dois do DESIGN.md.

## Dívida técnica e itens parados (não são bloqueadores, não afirmam fato falso)

Da tarefa 6 (painel de detalhes do agendamento):
- No computador, a tela pinta um quadro como folha inferior (mobile) por um instante antes de `useEffect` decidir que a largura é de computador — falha visual de primeiro quadro, não de dado.
- `faixaDoAtendimento('23:30', 150)` não faz a volta da meia-noite (mostra "23:30 às 26:00" em vez de "23:30 às 01:30").
- Uma linha em negrito fica vazia quando `service_name` está ausente no agendamento.
- Tocar no corpo de um cartão já arrastado (swipe) abre o painel em vez de desfazer o swipe — conflito entre os dois gestos.

Da tarefa 7 (lista de clientes):
- Cobertura de teclado/acessibilidade do formulário mobile não foi testada nesse breakpoint específico; fica parado, sem teste, não é regressão desta entrega.

Da geometria de agendamento (dado que falta na API):
- `service.durationMinutes` não existe no DTO de `/appointments`. Toda a geometria da linha do tempo da Agenda — altura dos blocos, o "60 min" do cartão, ocupação e tamanho das vagas livres — descansa sobre o valor de exemplo `60`.
- `client_phone` deixou de aparecer no cartão de agendamento.
- `ownerName` não está na sessão: a saudação da tela Hoje mostra o nome do negócio, e a pílula do celular perdeu o nome por causa disso.
- Falta pré-preencher o formulário de novo agendamento a partir de um horário livre clicado — hoje o rótulo foi corrigido justamente porque prometia isso e o formulário abria vazio.
- Se alguma tarefa desta entrega deixou rótulo divergente entre a tela de Caixa e o PDF gerado, não foi identificado um caso específico nesta varredura; sinalizar se aparecer.

Da rodada de correção final (revisão do branch inteiro, não corrigidos por instrução — só registrados):
- "Faturamento" significa coisas diferentes em telas diferentes no mesmo dia: o realizado (dinheiro que já entrou) no Hoje, e o previsto (soma de tudo que não foi cancelado, incluindo o que ainda vai acontecer) na Agenda. Nenhum dos dois está errado isoladamente, mas a mesma palavra descreve dois números diferentes se alguém comparar as duas telas.
- `DashboardCards.tsx` usa `text-success`/`text-warning` como texto pequeno em vez das variantes `-text` (`text-success-text`/`text-warning-text`) que o resto das telas reconstruídas usa para texto sobre fundo claro — inconsistência de token, sem efeito de contraste percebido nas classes tocadas por esta correção.
- Nomes de equipe inventados (Camila, Bruna, Paula, usados nos exemplos de `conteudoDemo.ts`) convivem com a equipe real na mesma tela Hoje — um nome de exemplo ao lado de um nome real pode ler como se fizessem parte do mesmo quadro de profissionais.
- Textos congelados que não mudam com o tempo: "(2026)" nos botões "Filtrar por ano" e "Carregar histórico completo" de `planos/page.tsx`; "Hoje, 11:42" no histórico de mensagens do WhatsApp (`conteudoDemo.whatsapp.historicoRecente`); "Nenhuma denúncia registrada" fixo ao lado da contagem de denúncias em `ConnectionPanel.tsx`. (O quarto texto congelado que esta lista citava, "8 em 2026" do painel de detalhes do agendamento, não existe mais — a correção do achado I1 desta mesma rodada removeu o bloco de ciclo médio/total de visitas por um motivo diferente, consistência de dado entre telas, não este.)

Falta de teste automatizado em telas com lógica nova (tarefas 9 e 11):
- `FinanceModule.tsx`/`FinanceChart.tsx` (saldo do caixa, percentuais por forma de pagamento) e `frontend/src/app/dashboard/planos/page.tsx` (consistência plano/fatura) não têm nenhum teste automatizado cobrindo a lógica de agregação nova. Nenhum dos dois briefs exigiu teste explicitamente e os revisores concordaram que não é achado bloqueante, mas são as duas telas desta entrega com mais cálculo derivado e zero cobertura.

Ícones fora do padrão Material Symbols:
- Dois ícones `lucide` continuam no `EmptyState`, fora do padrão Material Symbols.
- `ExpensesTable.tsx` e `ExpenseModal.tsx` (tarefa 9) também ainda usam ícones `lucide-react` — não fizeram parte do escopo da tarefa 9 (o plano só listava `FinanceModule.tsx`, `FinanceChart.tsx` e `ExpensesTable.tsx`, mas a revisão confirmou que `ExpensesTable.tsx` já estava conforme aos tokens visuais e não precisou de mudança, então os ícones lucide dela não foram trocados).
- `IconButton`, `EmptyState` e `ModalFooter` (`frontend/src/components/ui/`) ainda tipam a prop `icon` como `LucideIcon` nativamente e dependem do adaptador `materialIcon()` (`frontend/src/lib/materialIconAdapter.tsx`, nascido na correção da tarefa 10) para aceitar um nome de Material Symbol. Agora que o DESIGN.md declara Material Symbols Outlined como padrão de ícone do produto, mudar o tipo desses três componentes para aceitar Material Symbols diretamente (sem o adaptador) é limpeza futura, não desta entrega.

## Melhorias técnicas pequenas

- O Vitest imprime um aviso de configuração a cada execução. Silenciar exige renomear `vitest.config.ts` para `.mts` ou declarar `"type": "module"`.
- Linhas da lista de clientes abrem o painel por clique, sem acesso por teclado. Já era assim antes da migração.
- `formatLastVisit` e `formatDate` repetem a mesma formatação de data em arquivos diferentes.
- As "etiquetas" de status aparecem em cinco receitas de estilo ligeiramente diferentes; um componente `Chip` no kit resolveria.

## O que a migração deixou pronto

- Tokens de cor claros e escuros, com o tema seguindo o aparelho, e `ForcedDark` isolando as telas que continuam escuras de propósito.
- Kit de componentes em `frontend/src/components/ui/`, com galeria em `/dev/ui` (só em desenvolvimento).
- Um teste de conformidade que reprova cor fixa nos arquivos migrados e também reprova arquivo novo que ninguém cadastrou na lista.
- Dois tokens novos, `success-text` e `warning-text`, porque `success` e `warning` não têm contraste suficiente como texto no tema claro.
- Quatro tokens novos das telas reconstruídas a partir da referência Stitch (tarefas 6-11): `surface-m3`, `brand-text-m3`, `tertiary` e `tertiary-container`, registrados no DESIGN.md.
- Ícones do produto padronizados em Material Symbols Outlined (decisão de 2026-09-23), registrado no DESIGN.md.
