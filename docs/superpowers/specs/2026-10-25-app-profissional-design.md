# App da profissional (PWA) — fase 5

## Contexto
O painel hoje é da dona (e da recepção, papel `employee`). A profissional não tem login: vê a agenda pelo celular da dona ou pelo WhatsApp. A fase 3 deixou o "acesso da profissional aos próprios números" para esta fase.

O papel `employee` existe, mas não há como criá-lo (não há convite) e ele não está ligado a um cadastro de profissional. Ele passa por `requireTenantRoles` e enxerga o salão inteiro: Caixa, todos os clientes, configurações de comissão. Por isso a profissional **não** usa esse papel.

Referências do Stitch em `docs/design/stitch/projeto/`:
- `minha-agenda-do-dia-pwa-profissional--2c03bd.html` (Hoje na bancada)
- `ficha-rapida-da-cliente-pwa-profissional--4faec7.html` (Ficha rápida)
- `fechar-atendimento-pwa-profissional--29883f.html` (Fechar atendimento)
- `meus-numeros-e-comissoes-pwa-profissional--6e6598.html` e `studio-aurora-meus-ganhos-visao-profissional--98d611.html` (Meus números)

## Decisões do dono (25/10)
1. **Acesso por convite por e-mail.** A dona convida pela tela da profissional; ela cria a própria senha e o login fica ligado ao cadastro dela.
2. **Fechar atendimento: a dona decide.** Uma chave em Ajustes: "A profissional cobra no app" (fecha a comanda e entra no Caixa) ou "Só prepara a comanda" (padrão: adiciona produtos e foto; a recepção cobra).
3. **Meus números: só a parte dela.** Líquido a receber no período, composição, extrato por comanda e próximo repasse. Sem faturamento da casa. Avaliações das clientes ficam fora (o sistema não coleta).
4. **Planos Equipe e Salão.** O Solo tem uma profissional só, a própria dona.
5. **Entram também (pedido do dono, 25/10):** avaliações das clientes, push de notificação, e reagendar ou cancelar pelo app.

## Escopo
1. **Convite e login:**
   - "Convidar para o app" no cadastro da profissional (dona), com o e-mail dela.
   - E-mail com link `/convite/[token]` (validade de 7 dias, uso único). A profissional cria a senha e entra.
   - Reenviar e revogar o convite; "Remover acesso" bloqueia o login sem apagar a profissional.
2. **Papel `professional`** ligado a `professionals.id`, com rotas próprias em `/api/v1/bancada/*`, sempre filtradas pela profissional do login.
3. **PWA:** manifest, ícones, service worker que guarda só a casca (sem dados offline) e "Adicionar à tela inicial".
4. **Telas** em `/bancada` com barra inferior Agenda · Clientes · Atendimento · Números:
   - **Hoje na bancada:** a próxima cliente em destaque (ficha técnica, alerta, último trabalho), o cronograma do dia e "Iniciar atendimento".
   - **Ficha rápida:** cliente, ficha técnica, alerta, fotos recentes, últimas 3 visitas com ela e anotações.
   - **Fechar atendimento:** itens, produtos, foto do trabalho, demonstrativo e "sua comissão estimada"; cobrar ou "Enviar para a recepção", conforme a chave.
   - **Meus números:** período (quinzena padrão), líquido, composição, adiantamentos, extrato, PDF do extrato e as avaliações dela.
5. **Avaliações das clientes:** o comprovante da comanda no WhatsApp leva o link `/avaliar/[token]`. A cliente dá de 1 a 5 estrelas e um comentário opcional.
6. **Push de notificação** (Web Push, no app e no painel): a profissional recebe os eventos dela; a dona recebe as notificações do sino.
7. **Reagendar e cancelar pelo app:** só os agendamentos dela, com aviso à dona e, se ela marcar, à cliente.
8. **Painel:** quem entra com papel `professional` vai para `/bancada`; o painel `/` fica fechado para esse papel.

## Fora do escopo
- Meta de produção com bônus e "Solicitar adiantamento".
- Uso offline com dados.
- Agenda de outras profissionais e trocar a profissional de um agendamento (continua com a recepção).
- Avaliações na página pública (Minha página) e resposta da dona à avaliação.
- Autoclave e outros avisos de biossegurança do Stitch.
- Profissional mudar o próprio cadastro, comissão ou horário.

## Modelo de dados
- `users.professional_id` (uuid, nulo, único, FK `professionals` com SetNull). Obrigatório quando `role = 'professional'`.
- `profissional_convites`: `id`, `business_id`, `professional_id`, `email`, `token_hash` (sha256), `expira_em`, `aceito_em`, `revogado_em`, `criado_por`, `criado_em`. Um convite aberto por profissional (o novo revoga o anterior).
- `business_settings.profissional_cobra` (boolean, padrão false).
- `comandas.enviada_recepcao_em` (timestamp, nulo): quando a profissional preparou e mandou para a recepção.
- `comandas.avaliacao_token_hash` (char 64, nulo, único): gerado no fechamento, quando o comprovante sai.
- `avaliacoes`: `id`, `business_id`, `comanda_id` (único), `professional_id`, `client_id`, `nota` (1 a 5), `comentario` (até 500, nulo), `criado_em`.
- `push_inscricoes`: `id`, `user_id`, `endpoint` (único), `p256dh`, `auth`, `user_agent`, `criado_em`, `ultimo_erro_em`.

## Regras
- **Convite:**
  - Só a dona (`tenant_admin`), só nos planos Equipe e Salão (recurso `app_profissional: 'profissional'`) e só para profissional ativa.
  - E-mail já usado por outro usuário: recusado ("Este e-mail já tem acesso ao EasyAgenda+").
  - Aceitar: confere o token (hash, validade, não usado, não revogado); cria o usuário no Supabase Auth já confirmado (o link prova o e-mail) e o usuário local com `role = 'professional'` e `professional_id`; marca `aceito_em`; abre a sessão.
  - Profissional desativada ou "Remover acesso": usuário `blocked`. Reconvidar desbloqueia.
- **Escopo do papel `professional`:**
  - Rotas do painel continuam com `requireTenantRoles` (`tenant_admin`, `employee`): a profissional não passa por elas.
  - `/bancada/*` usa `requireRole(['professional'])` e o `professional_id` do login. Nada vem do corpo ou da URL para escolher a profissional.
  - Clientes visíveis: só quem tem agendamento com ela (passado, ou de hoje em diante). Fora disso, 404.
  - Agendamentos e comandas: só os dela.
  - Plano caiu para o Solo ou assinatura bloqueada: as rotas respondem como o FeatureGate (403 `FEATURE_NOT_AVAILABLE`) e a tela mostra "Fale com o salão".
- **Atendimento:**
  - "Iniciar atendimento" usa a mesma transição de status do painel (`confirmado → em_atendimento`) e abre a comanda.
  - Ela pode adicionar serviços e produtos, a foto do trabalho (vai para a galeria da cliente) e a nota da ficha.
  - Desconto e gorjeta: só com `profissional_cobra`.
  - Com `profissional_cobra = false`: "Enviar para a recepção" salva o rascunho, marca `enviada_recepcao_em` e notifica no sino ("Comanda de Mariana pronta para cobrar"). A comanda aparece no painel como hoje, com o selo "Pronta para cobrar".
  - Com `profissional_cobra = true`: fecha pela mesma `closeComanda`, com as mesmas regras de Caixa (caixa fechado não abre pela profissional: "Peça para a recepção abrir o caixa"), clube e comissão.
- **Avaliações:**
  - O link vale 14 dias depois do fechamento e serve para uma avaliação só. Vencido ou usado: "Obrigada! Esta avaliação já foi registrada" ou "Este link expirou".
  - Só sai com o comprovante: comanda sem WhatsApp não gera link.
  - A página pública mostra o salão, a profissional, o serviço e a data; nada mais da cliente.
  - Nota até 3 vira notificação no sino da dona (`avaliacao_baixa`). Toda avaliação notifica a profissional (push).
  - A profissional vê média, quantidade e os comentários dela. A dona vê o bloco "Avaliações" em Relatórios, por profissional, com a lista.
- **Push:**
  - Web Push com chaves VAPID (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`). Sem as chaves, o botão "Ativar notificações" não aparece e nada quebra.
  - A pessoa ativa no aparelho (permissão do navegador); cada aparelho é uma inscrição. Desativar apaga a inscrição.
  - Profissional recebe: agendamento novo com ela, agendamento dela cancelado ou reagendado pela recepção, avaliação nova.
  - Dona recebe: as mesmas notificações que entram no sino (o push sai junto do `notify`).
  - O serviço de push respondeu 404 ou 410: a inscrição é apagada. Outros erros: marca `ultimo_erro_em` e segue.
  - No iPhone, só funciona com o app adicionado à tela inicial (iOS 16.4+). A tela explica isso.
- **Reagendar e cancelar:**
  - Só agendamento dela, de hoje em diante, que ainda não começou (nem em atendimento, concluído, falta ou cancelado).
  - Reagendar: escolhe dia e horário na agenda dela (mesma disponibilidade e mesmo bloqueio de conflito do painel). Trocar a profissional fica com a recepção.
  - Cancelar: pede o motivo (lista curta e "Outro"). Usa a mesma transição do painel, então dispara a lista de espera.
  - O sinal segue a regra do painel: o sistema não devolve. A tela avisa "O sinal pago fica com o salão. Combine a devolução com a recepção".
  - "Avisar a cliente pelo WhatsApp" vem marcado: manda a mensagem de reagendamento ou cancelamento pela fila do WhatsApp.
  - A dona é avisada no sino: "Camila reagendou Mariana para 18/09 às 15:00" ou "Camila cancelou Mariana (motivo)".
- **Meus números:** usa a apuração da fase 3 (`comissoes.service`) para a profissional do login, só leitura. Repasse "pago" mostra a data; "a pagar" mostra "Próximo repasse: combine com o salão". Nada da casa (retenção, faturamento total) aparece.

## API
| Método | Rota | Quem |
|---|---|---|
| POST | `/professionals/:id/convite` | dona: cria ou reenvia o convite |
| DELETE | `/professionals/:id/convite` | dona: revoga o convite aberto |
| POST | `/professionals/:id/acesso/remover` | dona: bloqueia o login |
| GET | `/public/convite/:token` | público: nome do salão e da profissional, ou 410 |
| POST | `/public/convite/:token/aceitar` | público: `{senha}`; cria o login e a sessão |
| GET | `/bancada/hoje` | profissional: agenda do dia e a próxima cliente |
| GET | `/bancada/clientes/:id` | profissional: ficha rápida |
| PUT | `/bancada/clientes/:id/nota` | profissional: anotação da bancada |
| POST | `/bancada/agendamentos/:id/iniciar` | profissional |
| GET/PUT | `/bancada/comandas/:id` | profissional: ler e salvar o rascunho |
| POST | `/bancada/comandas/:id/enviar` | profissional: mandar para a recepção |
| POST | `/bancada/comandas/:id/fechar` | profissional, só com `profissional_cobra` |
| POST | `/bancada/clientes/:id/fotos` | profissional: foto do trabalho |
| GET | `/bancada/numeros?inicio&fim` | profissional: apuração dela |
| GET | `/bancada/numeros/extrato.pdf` | profissional |
| GET | `/bancada/avaliacoes?inicio&fim` | profissional: média e lista dela |
| GET | `/bancada/horarios?agendamento&data` | profissional: horários livres dela para reagendar |
| POST | `/bancada/agendamentos/:id/reagendar` | profissional: `{data, hora, avisarCliente}` |
| POST | `/bancada/agendamentos/:id/cancelar` | profissional: `{motivo, avisarCliente}` |
| GET | `/public/avaliar/:token` | público: dados da avaliação, ou 410 |
| POST | `/public/avaliar/:token` | público: `{nota, comentario}` |
| GET | `/push/chave` | logado: chave pública VAPID, ou 404 sem chaves |
| POST | `/push/inscricoes` | logado: inscreve o aparelho |
| DELETE | `/push/inscricoes` | logado: `{endpoint}` |
| GET | `/reports/avaliacoes?inicio&fim` | dona: por profissional |
| PUT | `/business/settings` | dona: ganha `profissionalCobra` |

## Telas
- **Cadastro da profissional (painel):** bloco "Acesso ao app" com o estado (sem acesso, convite enviado em dd/mm, ativo desde dd/mm, removido) e as ações.
- **Ajustes:** chave "A profissional cobra no app", com a explicação dos dois modos.
- **`/convite/[token]`:** "Camila, o Studio Aurora te convidou para o EasyAgenda+", senha e confirmação, e "Entrar". Convite vencido ou usado: mensagem e "Peça um novo convite ao salão".
- **`/bancada`:** as quatro telas do Stitch, no celular primeiro, com a mesma marca e os tokens do painel. No computador, coluna central.
- **Painel:** selo "Pronta para cobrar" na Agenda e no Caixa para comanda com `enviada_recepcao_em`; bloco "Avaliações" em Relatórios; "Ativar notificações" no sino.
- **`/avaliar/[token]`:** "Como foi seu atendimento com Camila?", cinco estrelas, comentário e "Enviar". Depois: "Obrigada pela avaliação!".
- **App:** "Reagendar" e "Cancelar" no cartão do agendamento e na ficha rápida; "Ativar notificações" no topo, com a explicação do iPhone.

## Testes
- **Regras:** token (validade, uso único, revogado), escopo de clientes, chave de cobrança.
- **Serviço:** convite (criar, reenviar revoga o anterior, e-mail em uso), aceitar (cria Supabase e local, sessão), remover acesso, iniciar, enviar para a recepção e fechar pela profissional.
- **Rotas:** a profissional não acessa nenhuma rota do painel (amostra: `/clients`, `/cash`, `/comandas/settings`, `/reports`); `employee` e dona não acessam `/bancada`; cliente de outra profissional dá 404; plano Solo dá 403.
- **Avaliações:** link gerado só com o comprovante, uso único, vencido, nota fora de 1 a 5, notificação da nota baixa.
- **Push:** envio junto do `notify`, inscrição apagada no 410, sem chaves VAPID nada é enviado (biblioteca mockada).
- **Reagendar e cancelar:** agendamento de outra profissional dá 404, status que já começou é recusado, conflito de horário, aviso à cliente só quando marcado, notificação da dona.
- **Frontend:** convite, as quatro telas, avaliação pública, reagendar e cancelar, ativar notificações, a chave em Ajustes, o bloco de acesso e o redirecionamento por papel; themeCompliance.

## Riscos
- **Supabase Auth:** criar o usuário já confirmado depende da chave de serviço no backend. Se faltar, o aceite falha com erro claro e nada local é criado.
- **Papel novo em código antigo:** qualquer rota que use só `authMiddleware` (sem papel) passaria a aceitar a profissional. A tarefa inclui varrer as rotas e um teste que tenta uma amostra.
- **Push depende de configuração:** as chaves VAPID precisam ser geradas e postas no backend antes de publicar. Sem elas, o resto funciona.
- **Avaliação falsa:** o link é por comanda e de uso único, mas quem tiver o link pode avaliar. Por isso o link só vai para o WhatsApp da cliente.
- **Mensagem à cliente no cancelamento:** sai pela fila, que respeita o opt-out. Se o WhatsApp estiver desconectado, a tela diz que o aviso não foi enviado.
- **Fechar pelo celular:** com `profissional_cobra`, o dinheiro entra na gaveta pela mão da profissional. O texto da chave em Ajustes deixa isso claro.

## Ajustes feitos na implementação
- **Rotas da dona em `/equipe`:** convite, revogar, remover e reativar ficam em `/equipe/profissionais/:id/...`, e a lista de estados em `GET /equipe/acessos`. A chave "a profissional cobra" tem rota própria (`GET/PUT /equipe/configuracao`), sem passar pelo salvamento geral de Ajustes, que regrava tudo.
- **Rotas públicas fora de `/public`:** `/convites/:token` e `/avaliacoes/:token`, para não colidir com `/public/:slug`.
- **Reativar acesso:** `POST /equipe/profissionais/:id/acesso/reativar` desbloqueia o login sem novo convite.
- **Link do convite na resposta:** a dona pode copiar e mandar por onde quiser quando o e-mail não sai (SMTP desligado).
- **Avaliações na mesma tabela:** a nota pelo link grava em `whatsapp_ratings` com `origem = 'link'`; a da automação continua `whatsapp`. Uma nota por agendamento, venha de onde vier, e a automação já pula quem avaliou.
- **Link novo a cada comprovante:** reenviar o comprovante troca o token; o link anterior deixa de valer.
- **Reagendar só confirmado**, como no painel (aguardando o sinal só cancela).
- **Aviso à cliente:** sai pela fila com origem `painel_evento`, que respeita o opt-out.
- **Extrato em PDF no aparelho** (jsPDF, como os PDFs de Relatórios), sem rota no backend.
- **Rotas extras da bancada:** `GET /bancada/hoje?data=` (agenda de outro dia, sem destaque), `GET /bancada/clientes?busca=` (as clientes dela, aba Clientes) e `GET /bancada/atalhos` (serviços e produtos para a comanda).
- **Reagendar e cancelar no cartão da agenda.** A ficha rápida mostra a cliente, não um agendamento, então as ações ficaram só na agenda.
- **Selo "Pronta para cobrar":** na Agenda (cartão) e no Caixa (linha aberta, `prontaParaCobrar`). O link da notificação abre o Caixa, sem abrir a comanda sozinho.
- **Push nunca derruba a operação:** o texto é montado dentro de um `try`, e o envio não lança.
