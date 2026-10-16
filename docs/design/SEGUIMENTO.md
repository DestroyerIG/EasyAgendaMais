# Seguimento do design system

O que ficou em aberto depois da reconstrução das telas do painel a partir das referências Google Stitch (sub-projetos B a I). A maior parte é decisão sua ou melhoria pequena, mas a seção seguinte lista bloqueadores reais de lançamento — leia-a primeiro.

## 🚨 Bloqueadores de lançamento

Nenhum aberto. Resolvidos no branch `fix/bloqueadores-venda` (2026-10-13):

- **Preço do Solo:** vale R$ 49,90 (o que o Asaas cobra); DESIGN.md já corrigido.
- **Nomes de plano:** o cliente vê Solo / Equipe / Salão em todas as telas, mensagens de erro do backend e SuperAdmin. Ids internos (`basico`/`profissional`/`premium`) e Asaas inalterados.
- **WhatsApp no Solo:** `whatsapp_automation` passou a exigir o Solo (backend e frontend), então a promessa "Lembretes automáticos via WhatsApp" é verdadeira. O Equipe trocou "Bot WhatsApp com fluxos avançados" por "Exportação do financeiro em PDF", que é exclusiva dele.
- **`pending_registrations`:** criada pela migração `20260529000000_create_pending_registrations` (no-op onde já existe).
- **Horário padrão:** fonte única em `backend/src/config/scheduleDefaults.ts` (09:00–20:00, aceita encaixe, não confirma sozinho), igual ao DEFAULT do banco e ao formulário de Ajustes.

## Decisões que dependem de você

1. **Uma passada de revisão nos textos dos botões.** Hoje convivem dois estilos: "Novo Agendamento", "Novo Cliente", "Nova Opção", "GERAR RELATÓRIO" de um lado, e "Salvar preferências", "Atualizar senha", "Ver planos" do outro. A regra do projeto é frase normal, com maiúscula só na primeira palavra. Mudar um texto de cada vez deixa a tela mais desigual, não menos, então isso pede uma passada única com a sua aprovação.
2. **O título aparece duas vezes no celular:** uma na barra de cima e outra no cabeçalho da tela. Foi assim que o plano pediu. Se incomodar, dá para esconder um dos dois.
3. **Verde do WhatsApp com texto branco** fica em 4,36:1 de contraste, um pouco abaixo do mínimo recomendado para texto pequeno. A cor vem do DESIGN.md.
4. **Blocos alimentados por `conteudoDemo.ts` precisam virar dado real ou sair da tela** antes de publicar para clientes reais — hoje as telas reconstruídas de WhatsApp e Plano, entre outras, misturam dado real com exemplo fixo de `conteudoDemo.ts` para preencher seções que o backend ainda não alimenta.
5. **As três áreas "em breve"** (referentes a Clube e pacotes, Relatórios e Minha página, conforme o estado atual do painel) esperam os sub-projetos D a I para virarem funcionalidade real.
6. **Decidir se a tela Hoje mostra centavos** nos valores monetários — pendente de definição visual.
7. **A paleta por tela (decisão 2, "cada tela usa a paleta do seu próprio arquivo") não foi aplicada.** Os tokens `surface-m3`/`brand-text-m3` (`frontend/src/styles/globals.css:63-64,91-92`) existem e estão documentados no `DESIGN.md`, mas `grep -rnE "(bg|text|border)-(surface-m3|brand-text-m3)" frontend/src` não encontra nenhum uso — as telas usam `text-brand-text` uniforme em vez da cor `text-primary` que os sete arquivos de referência Material 3 usam 44 vezes. Decida na conferência visual se aplica os tokens tela a tela ou se remove os dois do DESIGN.md.
8. **O Stitch mostra "Retenção casa R$ 55" na comanda de exemplo**, o que só fecha se a gorjeta sair da casa; o sistema segue a decisão de que gorjeta não é faturamento (retenção R$ 75 no mesmo exemplo).
9. **"Receita recuperada via lembretes" virou "Confirmados por lembrete".** A definição é honesta e sem atribuição de causa: conta o que foi confirmado depois de um lembrete, sem afirmar que o lembrete gerou a receita.

## Dívida técnica e itens parados (não são bloqueadores, não afirmam fato falso)

Da tarefa 6 (painel de detalhes do agendamento):
- No computador, a tela pinta um quadro como folha inferior (mobile) por um instante antes de `useEffect` decidir que a largura é de computador — falha visual de primeiro quadro, não de dado.

Da tarefa 7 (lista de clientes):
- Cobertura de teclado/acessibilidade do formulário mobile não foi testada nesse breakpoint específico; fica parado, sem teste, não é regressão desta entrega.

Da geometria de agendamento (dado que falta na API):
- Se alguma tarefa desta entrega deixou rótulo divergente entre a tela de Caixa e o PDF gerado, não foi identificado um caso específico nesta varredura; sinalizar se aparecer.

Da rodada de correção final (revisão do branch inteiro, não corrigidos por instrução — só registrados):
- "Faturamento" significa coisas diferentes em telas diferentes no mesmo dia: o realizado (dinheiro que já entrou) no Hoje, e o previsto (soma de tudo que não foi cancelado, incluindo o que ainda vai acontecer) na Agenda. Nenhum dos dois está errado isoladamente, mas a mesma palavra descreve dois números diferentes se alguém comparar as duas telas.
- `DashboardCards.tsx` usa `text-success`/`text-warning` como texto pequeno em vez das variantes `-text` (`text-success-text`/`text-warning-text`) que o resto das telas reconstruídas usa para texto sobre fundo claro — inconsistência de token, sem efeito de contraste percebido nas classes tocadas por esta correção.
- Textos congelados que não mudam com o tempo: "Hoje, 11:42" no histórico de mensagens do WhatsApp (`conteudoDemo.whatsapp.historicoRecente`); "Nenhuma denúncia registrada" fixo ao lado da contagem de denúncias em `ConnectionPanel.tsx`. (O quarto texto congelado que esta lista citava, "8 em 2026" do painel de detalhes do agendamento, não existe mais — a correção do achado I1 desta mesma rodada removeu o bloco de ciclo médio/total de visitas por um motivo diferente, consistência de dado entre telas, não este.)

Falta de teste automatizado em telas com lógica nova (tarefas 9 e 11):
- `FinanceModule.tsx`/`FinanceChart.tsx` (saldo do caixa, percentuais por forma de pagamento) e `frontend/src/app/dashboard/planos/page.tsx` (consistência plano/fatura) não têm nenhum teste automatizado cobrindo a lógica de agregação nova. Nenhum dos dois briefs exigiu teste explicitamente e os revisores concordaram que não é achado bloqueante, mas são as duas telas desta entrega com mais cálculo derivado e zero cobertura.

Ícones fora do padrão Material Symbols:
- Dois ícones `lucide` continuam no `EmptyState`, fora do padrão Material Symbols.
- `ExpensesTable.tsx` e `ExpenseModal.tsx` (tarefa 9) também ainda usam ícones `lucide-react` — não fizeram parte do escopo da tarefa 9 (o plano só listava `FinanceModule.tsx`, `FinanceChart.tsx` e `ExpensesTable.tsx`, mas a revisão confirmou que `ExpensesTable.tsx` já estava conforme aos tokens visuais e não precisou de mudança, então os ícones lucide dela não foram trocados).
- `IconButton`, `EmptyState` e `ModalFooter` (`frontend/src/components/ui/`) ainda tipam a prop `icon` como `LucideIcon` nativamente e dependem do adaptador `materialIcon()` (`frontend/src/lib/materialIconAdapter.tsx`, nascido na correção da tarefa 10) para aceitar um nome de Material Symbol. Agora que o DESIGN.md declara Material Symbols Outlined como padrão de ícone do produto, mudar o tipo desses três componentes para aceitar Material Symbols diretamente (sem o adaptador) é limpeza futura, não desta entrega.

Sub-projeto 2B (pendências conhecidas da revisão final):
- O índice único `lower(name)` das etiquetas (`tags_business_id_lower_name_key`) existe só no SQL da migração e está fora do schema do Prisma. Toda migração nova gerada por `prisma migrate dev` vai conter um `DROP INDEX` desse índice; esse DROP deve ser removido à mão antes de aplicar, senão a unicidade das etiquetas some sem aviso.
- O "SAIR" automático por WhatsApp (a cliente responde SAIR e o consentimento é revogado) fica para o 2C. Hoje a revogação é feita pela dona na ficha da cliente, e o lembrete automático já respeita a revogação. A página pública não promete mais o SAIR. O 2C (disparos) deve nascer respeitando o estado de consentimento: "não informado" recebe como hoje; "revogado" nunca recebe.
- "Excluir cliente" ficou fora do 2B: não existe `DELETE /clients/:id`. Exige decisão de produto sobre histórico de atendimentos, caixa e LGPD (apagar fotos do storage, anonimizar em vez de apagar etc.).

## Melhorias técnicas pequenas

- O Vitest imprime um aviso de configuração a cada execução. Silenciar exige renomear `vitest.config.ts` para `.mts` ou declarar `"type": "module"`.
- `formatLastVisit` e `formatDate` repetem a mesma formatação de data em arquivos diferentes.
- As "etiquetas" de status aparecem em cinco receitas de estilo ligeiramente diferentes; um componente `Chip` no kit resolveria.

## O que a migração deixou pronto

- Tokens de cor claros e escuros, com o tema seguindo o aparelho, e `ForcedDark` isolando as telas que continuam escuras de propósito.
- Kit de componentes em `frontend/src/components/ui/`, com galeria em `/dev/ui` (só em desenvolvimento).
- Um teste de conformidade que reprova cor fixa nos arquivos migrados e também reprova arquivo novo que ninguém cadastrou na lista.
- Dois tokens novos, `success-text` e `warning-text`, porque `success` e `warning` não têm contraste suficiente como texto no tema claro.
- Quatro tokens novos das telas reconstruídas a partir da referência Stitch (tarefas 6-11): `surface-m3`, `brand-text-m3`, `tertiary` e `tertiary-container`, registrados no DESIGN.md.
- Ícones do produto padronizados em Material Symbols Outlined (decisão de 2026-09-23), registrado no DESIGN.md.
- Sub-projeto 2A: comanda com produtos, desconto, gorjeta e repasse; caixa do dia com abertura, sangria e fechamento; status em atendimento e faltou; intervalo de almoço; referências do Stitch completas em `docs/design/stitch/projeto/`.
- Sub-projeto 2B: Hoje e CRM reais (sem dados de exemplo), ficha técnica por segmento, fotos privadas da cliente, consentimento LGPD, etiquetas e lista de espera.
