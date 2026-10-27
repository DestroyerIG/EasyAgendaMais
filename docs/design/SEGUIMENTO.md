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
4. **Blocos alimentados por `conteudoDemo.ts` precisam virar dado real ou sair da tela** antes de publicar para clientes reais — hoje a tela reconstruída de Plano, entre outras (o WhatsApp já não usa `conteudoDemo`, desde o 2C-1), misturam dado real com exemplo fixo de `conteudoDemo.ts` para preencher seções que o backend ainda não alimenta.
5. **As três áreas "em breve"** (Clube e pacotes, Relatórios e Minha página) já viraram funcionalidade real. O Clube foi a última, no sub-projeto 4.
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

Falta de teste automatizado em telas com lógica nova (tarefas 9 e 11):
- `FinanceModule.tsx`/`FinanceChart.tsx` (saldo do caixa, percentuais por forma de pagamento) e `frontend/src/app/dashboard/planos/page.tsx` (consistência plano/fatura) não têm nenhum teste automatizado cobrindo a lógica de agregação nova. Nenhum dos dois briefs exigiu teste explicitamente e os revisores concordaram que não é achado bloqueante, mas são as duas telas desta entrega com mais cálculo derivado e zero cobertura.

Ícones fora do padrão Material Symbols:
- Dois ícones `lucide` continuam no `EmptyState`, fora do padrão Material Symbols.
- `ExpensesTable.tsx` e `ExpenseModal.tsx` (tarefa 9) também ainda usam ícones `lucide-react` — não fizeram parte do escopo da tarefa 9 (o plano só listava `FinanceModule.tsx`, `FinanceChart.tsx` e `ExpensesTable.tsx`, mas a revisão confirmou que `ExpensesTable.tsx` já estava conforme aos tokens visuais e não precisou de mudança, então os ícones lucide dela não foram trocados).
- `IconButton`, `EmptyState` e `ModalFooter` (`frontend/src/components/ui/`) ainda tipam a prop `icon` como `LucideIcon` nativamente e dependem do adaptador `materialIcon()` (`frontend/src/lib/materialIconAdapter.tsx`, nascido na correção da tarefa 10) para aceitar um nome de Material Symbol. Agora que o DESIGN.md declara Material Symbols Outlined como padrão de ícone do produto, mudar o tipo desses três componentes para aceitar Material Symbols diretamente (sem o adaptador) é limpeza futura, não desta entrega.

Sub-projeto 2B (pendências conhecidas da revisão final):
- O índice único `lower(name)` das etiquetas (`tags_business_id_lower_name_key`) existe só no SQL da migração e está fora do schema do Prisma. Toda migração nova gerada por `prisma migrate dev` vai conter um `DROP INDEX` desse índice; esse DROP deve ser removido à mão antes de aplicar, senão a unicidade das etiquetas some sem aviso.
- O índice único parcial `whatsapp_envios_cliente_ativo_key` (`business_id, client_id, origin` onde `status` é `na_fila` ou `enviando` e `client_id` não é nulo, 2C-2a) também existe só no SQL da migração `20261020120000_whatsapp_envios` e está fora do schema do Prisma. Remova à mão qualquer `DROP INDEX` dele que o `prisma migrate dev` gerar, senão volta o risco de convite duplicado para a mesma cliente.
- "Excluir cliente" ficou fora do 2B: não existe `DELETE /clients/:id`. Exige decisão de produto sobre histórico de atendimentos, caixa e LGPD (apagar fotos do storage, anonimizar em vez de apagar etc.).

Sub-projeto 2C-1 (WhatsApp: conversas e base de envio):
- O índice único parcial `whatsapp_messages_business_provider_key` também está fora do `schema.prisma`: todo `migrate diff`/`migrate dev` futuro vai propor um `DROP` dele. Remover a linha à mão, como a do índice das etiquetas.
- O nome de quem atende na central é derivado (dona = nome do dono do negócio; funcionária = início do e-mail), porque `users` não tem nome. Pendência: campo de nome do usuário.
- `POST /whatsapp/send` (envio manual, sem uso no frontend) ainda não grava a mensagem na central.
- O 2C-2 (campanhas) traz a cadência de envio e o rodapé "SAIR" automático; só então o texto das boas práticas do Stitch pode voltar.

Sub-projeto 2C-2a (WhatsApp: Hora de voltar), pendências conhecidas:
- O fuso da previsão de envio no frontend é fixo `America/Sao_Paulo`: o front não recebe o fuso do negócio.
- O lote não pede confirmação para cliente que recebeu convite recente e foi marcada à mão (a confirmação só vale para quem entra pela seleção padrão).
- O dedupe da fila não é atômico: não há índice único parcial em `whatsapp_envios`, então duas requisições simultâneas podem enfileirar o mesmo convite.
- Um envio interrompido (processo caiu no meio) vira `falhou` após 10 min e não é reenviado, de propósito, para não duplicar mensagem.

Sub-projeto 2C-2b (WhatsApp: Automações), pendências conhecidas:
- Migração `20261021120000_whatsapp_automacoes` aplicada em produção. O registro não ficou aqui, mas o `prisma migrate deploy` aplica as pendentes em ordem, e as migrações seguintes (a partir de `20261023120000_whatsapp_campanhas`) foram aplicadas assim. Ela cria `whatsapp_automacoes` e `whatsapp_respostas_pendentes` (com RLS), e acrescenta `appointments.client_confirmed_at`/`confirmation_sent_at`, `whatsapp_envios.prioridade`/`appointment_id` e `business_settings.google_review_url`.
- As rotinas (confirmação, radar de retorno, aniversário, avaliação, lembrete) não checam a permissão de plano `whatsapp_automation`, igual ao lembrete que já está em produção. Um negócio que perder o plano com uma regra ligada continua disparando. As rotas da tela checam o plano.
- O SQL cru das métricas (`metricas.repository.ts`: receita recuperada, taxa de resposta, faltas evitadas, vagas preenchidas) nunca rodou num banco real. Os testes mockam o repositório. Conferir os números na primeira semana em produção.
- `created_at` sem fuso nas consultas das métricas depende de a sessão do banco estar em UTC.
- O sinal "pago no mês" é aproximado pela mensagem `sinal_pix` com uma folga de 1 h. A receita da lista de espera conta a vaga ocupada por quem recebeu a mensagem `lista_espera` enviada (não a oferta manual) em até 7 dias.
- Trocar o lembrete de "2 horas antes" para "Véspera" no meio do dia deixa sem lembrete os agendamentos de hoje que ainda não receberam o de 2 h.
- O lembrete na véspera marca `reminder_sent` quando entra na fila, como a confirmação faz com `confirmation_sent_at`. Se a fila pular o item (SAIR, consentimento, agendamento cancelado), o agendamento fica marcado como lembrado e entra assim nos números de "lembrete" do Hoje e do CRM.
- Depois que a cliente responde à confirmação, o "Obrigada!" do sistema é uma saída nova e invalida a espera da avaliação do mesmo número, se houver. Uma nota mandada logo em seguida vai para o robô.
- A espera de resposta também é ignorada quando a sessão do robô teve atividade depois dela (o critério usa a última atividade da sessão, que cobre "sessão iniciada depois").
- O spec ainda diz confirmação entre 07:00 e 12:00; o código aceita 08:00–12:00 porque a fila só envia a partir das 08:00.
- Se o processo cair entre enfileirar a confirmação e gravar `confirmation_sent_at`, a cliente pode receber a confirmação duas vezes.
- O índice único parcial do 2C-2a (`whatsapp_envios_cliente_ativo_key`) permite só uma confirmação ativa por cliente: o segundo agendamento da mesma cliente é confirmado na rodada seguinte, depois que o primeiro sair da fila.
- O botão "Testar envio" manda para o WhatsApp cadastrado no negócio (`business.whatsapp`), não para o número da sessão conectada, como já faz o teste da Hora de voltar.
- Ao trocar o modo do lembrete com o texto padrão, a prévia do modal ainda mostra o texto padrão do modo antigo. O novo texto aparece depois de salvar, porque o frontend não conhece os dois textos padrão.
- Minors parados nas revisões: `notaAvaliacao` aceita "+5" e "-5"; uma linha curta cuja variável ficou vazia some inteira; `expiresAt` da espera de resposta usa `Date.now()`; faltam testes de erro em `agendamentoParaEnvio`, de virada de dia, de `toleranciaMin` customizado no agendamento público e de integração do SQL das métricas; a taxa de resposta é exibida sem casa decimal.

Sub-projeto 2C-2c (WhatsApp: Campanhas), pendências conhecidas:
- Migração `20261023120000_whatsapp_campanhas` **aplicada em produção em 24/10/2026**, antes de juntar o código. Ela cria `whatsapp_campanhas` (com RLS) e o índice `whatsapp_envios (business_id, lote_id, status)` (no Prisma o campo é `batchId`, mapeado para a coluna `lote_id`).
- Uma campanha agendada que entra em envio sobe o limite do negócio para a cadência dela (até 60/h) enquanto tiver itens pendentes, inclusive para lembretes e confirmações. Depois de um item de campanha de 10/h, o próximo envio do negócio (mesmo um lembrete) espera de 270 a 450 s.
- Duas clientes com o mesmo telefone contam e recebem duas vezes (o público não deduplica por telefone).
- Cancelamento: o status da campanha e os itens da fila mudam na mesma transação, e a fila pula ("Campanha cancelada") qualquer item de campanha cujo lote não está em envio. Um item que estava saindo no instante do cancelamento e voltou para a fila (checagem falhou) também é pulado no tick seguinte. Fica só o item que já estava reservado e cujas checagens passaram: esse sai.
- Dois POSTs simultâneos de uma campanha nova podem criar duas campanhas que dividem o público.
- `{horarios_livres}` (corrigido): cada cliente recebe horários a partir da própria previsão de chegada + 2 h (início + posição × 3600 / cadência, dentro da janela de envio, arredondado para cima até :00/:30). A semana é carregada uma vez a partir do início; quem sai tarde pode ficar com menos horários ou nenhum (a linha some). Os dois horários vêm juntos com " ou ".
- A tela usa o fuso America/Sao_Paulo para "hoje" e para os horários; o backend valida no fuso do negócio.
- A cadência de 60/h rende cerca de 40/h na prática: a rotina roda a cada minuto e manda 1 por negócio por rodada, e o intervalo de 45–75 s faz várias rodadas caírem sem envio.
- Itens de campanha não vencem: se o WhatsApp ficar desconectado por dias, a campanha sai inteira quando reconectar (e os horários livres do texto podem já ter passado).
- Cada prévia do público recalcula o público inteiro (CRM, visitas, opt-outs e agenda da semana).
- O modal de detalhes carrega todos os itens do lote, sem paginação.
- O rótulo "Agendar" pode mostrar por um instante a contagem antiga enquanto a prévia recarrega.
- Minors parados nas revisões: o modal de detalhes não tem "Tentar de novo"; o indicador de passos é heurístico; falta teste de `opcoes` (precisa de banco).

Sub-projeto 2D (Plano e cobrança, comparação e upgrade), pendências conhecidas:
- Migração `20261024120000_plano_cobranca` aplicada em produção em 24/10/2026, com autorização do dono (`migrate status` limpo antes e depois; só adições).
- Nada da troca de plano rodou no Stripe ou no Asaas de verdade: os testes mockam os dois. Antes de publicar, testar em modo de teste: upgrade no cartão (cobrança da diferença e cartão recusado), downgrade no cartão (schedule criado e virada na renovação), upgrade no Pix (QR, pagamento e webhook) e cancelar cada um.
- No Stripe, desligar a troca de plano no Customer Portal e deixar só a atualização do cartão. Senão a troca pelo portal pula a regra de profissionais e o proporcional da tela.
- Pix continua sendo cobrança avulsa por mês (não é assinatura recorrente no Asaas). Gerar a cobrança do mês seguinte ainda marca a assinatura como `pending` até o pagamento, então a tela só oferece "Gerar cobrança Pix" quando a assinatura já está sem pagamento. Cobrança recorrente de verdade no Pix (Pix Automático ou assinatura do Asaas) fica para depois.
- Trocar a forma de pagamento (Pix para cartão ou o contrário) não entrou: o checkout de hoje criaria uma segunda assinatura em paralelo.
- Uma cobrança Pix do mês seguinte gerada antes de um upgrade sai no preço antigo.
- Os valores proporcionais da prévia são calculados pela tela. No cartão, o Stripe cobra o valor que ele mesmo calcula, que pode diferir em centavos.
- "Lista de espera" e "Campanhas" aparecem no Stitch como exclusivas do Equipe, mas funcionam em todos os planos. A matriz da comparação mostra o que o backend separa de fato. Tirar recursos do Solo é decisão de venda.
- Os botões "Dúvidas financeiras" e "Fale com nosso financeiro" só aparecem com `NEXT_PUBLIC_SUPPORT_WHATSAPP` configurado no frontend.

Sub-projeto 3 (Relatórios e Comissões), pendências conhecidas:
- Migração `20261025120000_relatorios_comissoes` aplicada em produção em 24/10/2026, com autorização do dono (`migrate status` limpo antes e depois; só adições).
- As telas não foram vistas no navegador com dado real, porque o `.env` local aponta para produção. Conferir: a apuração de uma quinzena com comandas fechadas, o marcar como pago com adiantamento e o mapa de ocupação.
- **Ocupação:** usa o horário do negócio e o intervalo da profissional. Quem trabalha só alguns dias aparece com ocupação baixa nos outros. A escala por profissional fica para depois.
- **Origem "Hora de voltar e campanhas":** é atribuição por janela de 7 dias depois do envio, e não clique rastreado.
- **Salão-parceiro:** a tela não gera contrato nem calcula imposto, só mostra o aviso para confirmar com o contador.

Sub-projeto 4 (Clube e pacotes), pendências conhecidas:
- Migração `20261026120000_clube_pacotes` aplicada em produção em 25/10/2026, com autorização do dono (`migrate status` limpo antes e depois; só adições).
- As telas não foram vistas no navegador com dado real, porque o `.env` local aponta para produção. Conferir: vender um clube no balcão (pago e Pix a receber), confirmar o Pix, fechar uma comanda coberta, a linha "Clube" no Caixa e a adesão pela página pública.
- **Confirmação manual:** o Pix cai na conta do salão e o sistema não sabe quando. Se a dona não confirmar, a cliente fica em atraso e a sessão não é debitada. Pix Automático ou gateway do salão ficam para depois.
- **Falta não se desfaz:** como `faltou` é status final, uma falta que debitou sessão por engano não devolve a sessão. Hoje o caminho é a dona dar desconto numa próxima comanda.
- **Uma sessão coberta por comanda:** só o serviço principal é coberto. Serviços extras pagam normal (com o desconto de sócia, se houver).

Sub-projeto 5 (App da profissional), pendências conhecidas:
- **Chaves VAPID:** gerar (`npx web-push generate-vapid-keys`) e configurar `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` e `VAPID_SUBJECT` (ex.: `mailto:suporte@...`) no backend. Sem elas, o botão "Ativar notificações" não aparece e nada quebra.
- **E-mail do convite:** depende do SMTP do backend. Sem SMTP, a dona copia o link no cadastro da profissional.
- **Supabase:** o aceite cria o usuário já confirmado com a chave de serviço do backend.
- **iPhone:** o push só funciona com o app na tela de início (iOS 16.4+). A tela explica.
- As telas não foram vistas no navegador com dado real, porque o `.env` local aponta para produção. Conferir: convidar e aceitar, a agenda do dia, iniciar e enviar para a recepção (e fechar com a chave ligada), reagendar e cancelar com aviso, Meus números, o link de avaliação no comprovante e o push no celular.

Sub-projeto 6 (Onboarding guiado, segmentos e vocabulário), pendências conhecidas:
- **Migração `20261028120000_onboarding` aplicada em produção em 26/10.** Ela cria as colunas e marca todos os negócios que já existem como onboarding concluído (backfill).
- **Vocabulário fora das telas principais:** resolvido em 26/10 (`feat/vocabulario-restante`). Entraram os PDFs de comissões e o comprovante de repasse, o aviso do salão-parceiro, os motivos de cancelamento da bancada, os públicos das campanhas ("Todos os clientes", "Inativos"), a coluna "Sem profissional" da agenda, o cargo na barra superior, a tela do convite (o convite agora traz o vocabulário do negócio) e os textos de Caixa, conversas, Hora de voltar, robô, clube, etiquetas, galeria e Ajustes. O `adaptar` passou a acertar a sequência de determinantes ("todas as clientes" → "todos os clientes") e "quantas"/"algumas". "Cliente" sem artigo e o menu não mudam: a palavra é a mesma em todos os segmentos. Landing, planos e SuperAdmin seguem genéricos de propósito, e "salão" continua fixo nos textos do salão-parceiro.
- **Texto padrão do painel:** sem segmento ("outro"), o painel passou a dizer "a profissional" em todo lugar ("Nova profissional", "Nenhuma cliente encontrada"), onde antes misturava os gêneros.
- **Mensagens do bot já editadas pela dona** não mudam com o segmento; só os textos que ainda estão no padrão.
- As telas não foram vistas no navegador com dado real, porque o `.env` local aponta para produção. Conferir: criar uma conta nova pela landing com `?segmento=`, passar pelas 5 etapas (sozinha e equipe), pular as etapas 4 e 5, o cartão "Termine de configurar", trocar o segmento em Ajustes › CRM e ver os termos mudarem no painel e na página pública.

Sub-projeto 7 (Login com Google e Google Agenda), pendências conhecidas:
- **Migração `20261029120000_google_agenda` aplicada em produção em 26/10.** Cria as três tabelas do Google Agenda.
- **Configuração externa:** Google Cloud, Supabase e variáveis, no passo a passo `docs/google-configuracao.md`. Sem ela, nada aparece.
- **Verificação do Google** para os escopos de agenda: até aprovar, só os usuários de teste (até 100) conectam a agenda. O login não depende dela.
- **Conferir no primeiro teste real:** o retorno do login (`/auth/callback`) trata o fluxo implícito (`#access_token`) e o PKCE (`?code=`) do Supabase; confirmar qual deles o projeto usa.
- **Ocupado na grade:** o "Ocupado (Google)" aparece só na visão de dia e nas colunas de quem tem agendamento no dia; o aviso no modal vale para qualquer profissional.
- **Bot do WhatsApp:** remarcações e cancelamentos pelo bot chegam ao Google pelo cron, em até 1 minuto.
- **Uma instância:** o `state` do OAuth é de uso único em memória. Com mais de uma instância do backend, mover para o banco.
- **Testado em produção em 26/10:** o login com Google e a conexão do Google Agenda funcionaram em https://www.easybarber.tech. O app continua em modo Teste no Google, e o acesso dos usuários de teste expira em 7 dias.
- **Domínio:** o dono vai trocar o domínio `easybarber.tech`. Depois da troca, faltam: `FRONTEND_URL` do Render no domínio novo, o backend num subdomínio próprio, o domínio autorizado na marca do app no Google e a verificação do app.

## Infraestrutura

- **Resolvido em 27/10:** o `docker-compose.yml` e o `setup.ps1` passaram a usar o Prisma (`supabase-stub.sql` + `prisma migrate deploy`), sem os SQL antigos e sem `AUTH_PROVIDER_MODE`. Os Dockerfiles foram corrigidos: no backend, o `npm ci` de produção falhava no `prisma generate`; no frontend, faltavam o caminho do standalone, a pasta `public` e as `NEXT_PUBLIC_*` no build. Falta subir o compose do zero numa máquina com o Docker rodando, porque a validação foi só de sintaxe.

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
- Sub-projeto 2C-1: central de conversas do WhatsApp e base de envio. Migração `20261016120000_whatsapp_conversas` (três tabelas: conversas, mensagens e opt-outs; `whatsapp_connected_at`; `politica_message` em `whatsapp_bot_config`). Decisões:
  - Regra B de quem entra na central: cliente cadastrada, número com conversa existente ou com sessão do robô ativa. A conversa de um número novo começa na primeira resposta do robô; o "oi" inicial dele não é gravado.
  - SAIR descadastra e VOLTAR reativa, com sinônimos (PARAR, STOP, DESCADASTRAR; CANCELAR ficou de fora porque colide com "Cancelar agendamento" do robô). VOLTAR só reativa quando o número está em opt-out; fora disso segue para o robô, texto inteiro, sem distinguir maiúsculas, acentos ou pontuação nas pontas. O SAIR automático (antes pendente do 2C) está feito.
  - Prazos: volta ao robô após 12 h sem mensagem numa conversa `humano`; conversa do robô finaliza após 24 h; mensagens guardadas por 180 dias.
  - Abas provisórias: Automações hospeda Menu, Mensagens e Simulador até o 2C-2.
  - Desvios do Stitch: "Latência" removida; "Solicitar aumento" virou nota; saúde da conexão calculada pela taxa de falha; "PARAR" virou "SAIR".
  - Boas práticas da aba Conexão reescritas para afirmar só o que o sistema faz (sem "proteções inteligentes", sem cadência de 45 a 90 s, sem rodapé automático; variáveis reais `{nome_cliente}`/`{horario}`).
  - Aviso de sinal Pix confirmado é `pix_recibo` (transacional, não bloqueado pelo SAIR).
  - Abrir uma conversa a marca como lida.
- Sub-projeto 2C-2a: aba "Hora de voltar" do WhatsApp (convites de retorno). Migração `20261020120000_whatsapp_envios` (aplicada em produção em 2026-10-20, com autorização do dono; inclui a tabela `whatsapp_avatares` das fotos de perfil). Decisões (marcadas como "decisão do Claude" no spec `docs/superpowers/specs/2026-10-20-hora-de-voltar-design.md`):
  - Quem aparece: cliente ativa, última visita há no máximo 120 dias, retorno vencido (`venceuHa > 0`), sem agendamento futuro que ocupe a agenda; ordem por maior atraso, depois nome.
  - Quem pode receber: todas, exceto consentimento revogado ou opt-out (SAIR). Convite há menos de 7 dias fica fora de "Selecionar todas" e o envio pede confirmação.
  - Fila cadenciada: 1 envio por vez por negócio, intervalo aleatório de 45 a 90 s, no máximo 25 por hora, só entre 08:00 e 20:00 no fuso do negócio; reconfere opt-out/revogado/conexão na hora e espera se desconectado.
  - Origem nova `retorno` ("Convite Hora de voltar"), bloqueada por opt-out e no grupo "automaticas" da Conexão.
  - Encaixes: até 2 vagas nos próximos 7 dias, com a profissional da última visita; texto editável e teste no próprio número.
  - A fila (`whatsapp_envios`) será reaproveitada pelas Campanhas (2C-2b).
- Sub-projeto 2C-2b: aba "Automações" do WhatsApp, com sete regras: confirmação 24 h antes, cobrança de sinal Pix, radar de retorno, lista de espera automática, lembrete, aniversário e pedido de avaliação. Migração `20261021120000_whatsapp_automacoes`, **pendente de aplicação em produção** (ver pendências acima). Entrou:
  - Backend `backend/src/modules/whatsappAutomacoes/`: regras com texto editável e config validada (`CONFIG_SCHEMA`), respostas "1/2" da confirmação e nota 1 a 5 da avaliação, gatilhos (cancelamento → lista de espera, reserva com sinal, comanda fechada → avaliação), rotinas no cron, painel de resultados e histórico de disparos.
  - Tela fiel ao Stitch (`studio-aurora-whatsapp-automacoes-ajustada`): cartões com interruptor, resultados do mês, modais Configurar regra (variáveis inseridas no cursor, campos por regra, prévia em balão do WhatsApp, "Restaurar texto padrão"), Histórico de disparos, Nova automação e Testar envio.
  - Agenda: selo "Confirmou pelo WhatsApp" no cartão e no painel de detalhes quando `client_confirmed_at` existe.
  - Decisões:
    - Na primeira leitura só o lembrete fica ligado: herda `whatsapp_reminders` e o `reminder_message` legado. As outras seis começam desligadas.
    - Prioridade na fila: confirmação 1, regras normais 5, campanha 9. `aniversario`, `avaliacao` e `campanha` são bloqueadas pelo SAIR e entram no grupo "automaticas"; `sinal_pix` não é bloqueado e fica no grupo "pix".
    - "1" ou "2" só são interceptados quando existe uma espera de resposta válida (menos de 24 h) e ninguém falou com a cliente depois dela. Uma saída posterior para o número (robô, equipe ou outra automação; ficam de fora a confirmação, a avaliação e as notas internas do painel) apaga a espera. A conversa com a equipe (`humano`) ou com o robô ativo depois da espera também não é interceptada. Fora disso, seguem para o robô.
    - Confirmação e avaliação têm uma espera cada por número; com as duas pendentes, "1"/"2" (e "sim"/"não") respondem a confirmação e as notas 3 a 5 vão para a avaliação.
    - A fila pula a confirmação com "Confirmação fora da véspera" e o lembrete com "Lembrete fora da véspera" quando o dia local já não é a véspera do agendamento (fila atrasada ou WhatsApp desconectado). O texto padrão da avaliação não fala mais "hoje".
    - Horários: confirmação entre 08:00 e 12:00; lembrete na véspera entre 08:00 e 18:00 (Zod e modal), para a fila (25/h até 20:00) dar conta; lembrete que a fila pula por estar fora da véspera ou que falha volta a `reminder_sent = false`. A saída de `lembrete` não invalida a espera de resposta da confirmação.
    - O lembrete na véspera passa pela fila (origem `lembrete`, prioridade 1, agendamento vinculado), com cadência, janela, SAIR e consentimento da fila. O de 2 h continua com envio direto.
    - Lista de espera automática: pula consentimento revogado e a própria cliente que cancelou; candidatas são as entradas `aguardando` e as `oferecida` há mais de 24 h (aguardando primeiro, depois as ofertas mais antigas). "Vagas preenchidas" conta agendamentos criados (não cancelados nem esperando Pix) por quem recebeu `lista_espera` nos 7 dias anteriores, o mesmo critério da receita.
    - Radar no modo personalizado: entra quem está há pelo menos N dias sem vir, mesmo sem o ciclo vencido (a tela Hora de voltar continua pelo ciclo). Até 120 dias sem vir, ou até N se N for maior.
    - O interruptor "Enviar lembretes por WhatsApp" saiu de Configurações; no lugar há um aviso com link para WhatsApp › Automações. O `whatsapp_reminders` legado só vale como valor inicial da regra.
    - O link do Google da avaliação só aceita http/https também no backend. O aniversário que falhou ou foi pulado não conta como "já recebeu neste ano".
    - Os textos dos cartões são os do Stitch com a config padrão e acompanham a config quando ela muda. A taxa de resposta aparece como número inteiro.
    - O texto igual ao padrão é salvo como `null`, então a regra volta a seguir o texto padrão (inclusive o do modo do lembrete).
    - O texto legado do lembrete passa por `renderizarTexto` (apara espaços e junta quebras de linha repetidas).

- Sub-projeto 2C-2c: aba "Campanhas" do WhatsApp. Migração `20261023120000_whatsapp_campanhas`, aplicada em produção em 24/10/2026. Entrou:
  - Backend `backend/src/modules/whatsappCampanhas/`: público por segmento (em risco, reativação, aniversariantes, VIPs, todas) com filtro de profissional e de último serviço, prévia real, salvar rascunho, agendar, cancelar, listar e detalhar. Cada cliente vira um item da fila com origem `campanha`, prioridade 9 e `lote_id` (`batchId`) = id da campanha. O agendamento enfileira em massa (`filaEnvios.enfileirarLote`: 1 consulta de quem já está na fila, `createMany` com `skipDuplicates` e 1 leitura do lote), para caber nos 30 s do proxy.
  - Fila: a cadência escolhida (10, 25 ou 60 por hora) vale para os itens da campanha; o limite do negócio é o maior entre 25 e a cadência das campanhas com itens pendentes.
  - Tela fiel ao Stitch (`studio-aurora-whatsapp-nova-campanha-ajustada`): lista com as 5 situações (Rascunho, Agendada, Enviando, Concluída, Cancelada), cancelamento confirmado no cartão, detalhes com contagens e motivo de cada item, e "Nova campanha" em 3 passos com prévia no celular e simulação de entrega. Ordem das abas: Hora de voltar · Automações · Campanhas · Conversas · Conexão.
  - Decisões:
    - Variáveis: `{primeiro_nome}`, `{profissional}`, `{servico}`, `{horarios_livres}` (até 2 encaixes da semana do início) e `{link}` (some a linha sem `FRONTEND_URL`). Rodapé fixo "Responda SAIR para não receber novidades." depois de uma linha em branco.
    - Intervalo depois de um item de campanha: 3600/cadência × (0,75 a 1,25), nunca abaixo de 45 s (10/h: 270–450 s; 25/h: 108–180 s; 60/h: 45–75 s).
    - Quem já está na fila de outra campanha fica de fora da nova; o agendamento informa quantas eram. Se todas já estavam, a campanha volta a rascunho com aviso.
    - Início de hoje a hoje + 30 dias, de 08:00 a 19:30 em passos de 30 min; padrão amanhã às 10:00. Previsão = total ÷ cadência, com "continua no dia seguinte às 08:00" quando passa das 20:00.
    - "Concluída" não é gravada: é calculada (agendada, início passado, nada pendente). Campanha concluída não pode ser cancelada.
    - Qualquer falha depois de marcar como agendada cancela os itens já criados e volta a campanha para rascunho. O erro devolve o id do rascunho (`details: [{ campanhaId }]`) em qualquer classe de erro; erro inesperado vira 500 "Não foi possível agendar a campanha." com o original no log. A tela passa a salvar no rascunho em vez de criar outro.
    - Na hora do envio, a fila usa `estaEmOptOutOuFalha`: se não der para ler o SAIR, o item volta para a fila e tenta no próximo tick (nunca envia às cegas). Os outros chamadores continuam com `estaEmOptOut`, que devolve false em erro.
    - Público vazio ou erro de validação responde 400 (o projeto não tem classe de erro 422).
- Sub-projeto 2D: Ajustes › Plano e cobrança com dado real e a tela nova de comparação e upgrade (`/planos/comparar`). Migração `20261024120000_plano_cobranca`, aplicada em produção em 24/10/2026. Entrou:
  - Catálogo único dos planos em `backend/src/config/planCatalog.ts` (preço, limite de profissionais, matriz), usado pelo checkout, pelo Pix, pelo limite de profissionais e por `GET /billing/plans`.
  - Troca de plano (`/billing/change-plan`): upgrade na hora com a diferença proporcional (Stripe com `pending_if_incomplete`, Pix com cobrança avulsa marcada `:upgrade`), downgrade na renovação (schedule no Stripe, `plano_agendado` e rotina de hora em hora no Pix), bloqueio por profissionais ativas e cancelar a mudança.
  - Faturas reais (`/billing/invoices`, Pix do banco e cartão do Stripe) e forma de pagamento real (`/billing/payment-method`).
  - Correções que apareceram no caminho: cancelar o Pix bloqueava o painel na hora (agora mantém o acesso até o fim do período); a consulta do Pix e o webhook tratariam a diferença do upgrade como mensalidade; o webhook do Stripe preferia o `metadata.plan` ao plano do Price.
  - `conteudoDemo.ts` saiu (o último uso era a tela de Plano).
- Sub-projeto 3: Relatórios (`/relatorios`) e Comissões (`/relatorios/comissoes`) com dado real. Migração `20261025120000_relatorios_comissoes`, aplicada em produção em 24/10/2026. Entrou:
  - Apuração por profissional no período (quinzena por padrão), somando o que cada comanda gravou no fechamento, mais gorjetas e menos adiantamentos.
  - "Marcar como pago" com a foto dos valores. É idempotente pela chave única e roda numa transação com o abatimento dos adiantamentos. Também entraram desfazer pagamento, comprovante em PDF e exportação para o contador em CSV e em PDF.
  - Modo salão-parceiro só no plano Salão (recurso `salao_parceiro`), com cota-parte, CNPJ do MEI e o aviso da Lei 13.352/2016. Saiu o "Em breve" da comparação.
  - Relatórios com:
    - ticket médio, retorno no ciclo, faltas e faturamento do mês contra a meta, cada um comparado ao período anterior;
    - mapa de ocupação por turno, com insight e horário de pico;
    - origem dos agendamentos e evolução de 6 meses com projeção.
  - CNPJ (MEI) e especialidade no cadastro da profissional.
- Sub-projeto 4: Clube e pacotes (`/clube` e `/clube/assinantes`), só no plano Salão (recurso `clube`). Migração `20261026120000_clube_pacotes`, aplicada em produção em 25/10/2026. Entrou:
  - Clube por assinatura mensal (sessões por mês não cumulativas, intervalo mínimo, desconto de sócia) e pacote pré-pago (validade contada da 1ª sessão).
  - Venda no balcão (paga ou "Pix a receber" com o copia e cola no WhatsApp), confirmação manual idempotente, reenviar cobrança, cancelar e CSV.
  - Rotina de hora em hora: Pix do próximo ciclo 3 dias antes, atraso que bloqueia o uso e avisa no sino, pacote vencido e adesão pendente cancelada em 7 dias.
  - Comanda: a sessão coberta sai a R$ 0,00 com a chave "Usar clube/pacote", o motivo quando não cobre, a comissão sobre o valor por sessão e o uso gravado no fechamento.
  - Recebimentos do clube no Caixa (linha "Clube"), no faturamento, na evolução e nas comissões.
  - Adesão pública em `/agendar/[slug]/clube/[ofertaId]` e a seção "Clube" na Minha página.
  - Selo do clube na ficha da cliente e no detalhe do agendamento. Saiu o "Em breve" do Clube na comparação de planos.
- Sub-projeto 5: App da profissional (PWA em `/bancada`), nos planos Equipe e Salão (recurso `app_profissional`). Migração `20261027120000_app_profissional`, aplicada em produção em 25/10/2026. Entrou:
  - Convite por e-mail no cadastro da profissional (com link para copiar), aceite com senha em `/convite/[token]`, revogar, remover e reativar o acesso.
  - Bancada: agenda do dia (e de outros dias), destaque da próxima cliente com alergia, ficha e último trabalho, iniciar atendimento e as clientes dela com ficha rápida, nota e foto.
  - Atendimento: comanda com extras, comissão estimada e "Enviar para a recepção"; com a chave "A profissional cobra no app" (Ajustes), forma de pagamento, desconto, gorjeta e fechar.
  - Reagendar e cancelar pelo app, com aviso à cliente no WhatsApp e push para a profissional quando a recepção mexe na agenda dela.
  - Meus números por quinzena (resumo, avaliações, extrato e PDF).
  - Avaliação da cliente pelo link do comprovante (`/avaliar/[token]`), bloco "Avaliações" em Relatórios e aviso no sino para nota baixa.
  - PWA instalável (manifesto, ícones, service worker com tela offline) e notificações push (VAPID), também no sino do painel.
  - Selo "Pronta para cobrar" na Agenda e no Caixa. A profissional que entra no painel vai para `/bancada`.
- Sub-projeto 6: Onboarding guiado (`/onboarding`), segmentos e vocabulário por segmento. Migração `20261028120000_onboarding`, aplicada em 26/10. Entrou:
  - Cinco etapas do Stitch: negócio (segmento e sozinha/equipe), horários, serviços sugeridos por segmento (com sinal e chave Pix), página de agendamento e WhatsApp com o link. As etapas 1 a 3 são obrigatórias e o painel só abre depois delas; 4 e 5 podem ser puladas.
  - Quem atende sozinha já sai com o próprio cadastro de profissional, com a pausa dela.
  - O segmento escolhido na landing chega marcado na etapa 1. Contas que já existiam não passam pelo onboarding.
  - Cartão "Termine de configurar" na tela Hoje com o que ficou pulado (página, WhatsApp, Pix), que pode ser dispensado.
  - Vocabulário por segmento (barbeiro, nail designer, lash designer, cabeleireira, esteticista) no painel, na bancada, na página pública e nas mensagens padrão do bot, com a concordância de gênero. Trocar o segmento em Ajustes › CRM avisa e atualiza os termos na hora.
