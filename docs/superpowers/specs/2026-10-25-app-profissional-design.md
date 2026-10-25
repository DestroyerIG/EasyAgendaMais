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
4. **Planos Equipe e Salão.** O Solo tem uma profissional só, a própria dona. Push de notificação fica para depois.

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
   - **Meus números:** período (quinzena padrão), líquido, composição, adiantamentos, extrato e PDF do extrato.
5. **Painel:** quem entra com papel `professional` vai para `/bancada`; o painel `/` fica fechado para esse papel.

## Fora do escopo
- Avaliações das clientes, meta de produção com bônus e "Solicitar adiantamento".
- Push de notificação e uso offline com dados.
- Agenda de outras profissionais, reagendar e cancelar pelo app (continua com a recepção).
- Autoclave e outros avisos de biossegurança do Stitch.
- Profissional mudar o próprio cadastro, comissão ou horário.

## Modelo de dados
- `users.professional_id` (uuid, nulo, único, FK `professionals` com SetNull). Obrigatório quando `role = 'professional'`.
- `profissional_convites`: `id`, `business_id`, `professional_id`, `email`, `token_hash` (sha256), `expira_em`, `aceito_em`, `revogado_em`, `criado_por`, `criado_em`. Um convite aberto por profissional (o novo revoga o anterior).
- `business_settings.profissional_cobra` (boolean, padrão false).
- `comandas.enviada_recepcao_em` (timestamp, nulo): quando a profissional preparou e mandou para a recepção.

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
| PUT | `/business/settings` | dona: ganha `profissionalCobra` |

## Telas
- **Cadastro da profissional (painel):** bloco "Acesso ao app" com o estado (sem acesso, convite enviado em dd/mm, ativo desde dd/mm, removido) e as ações.
- **Ajustes:** chave "A profissional cobra no app", com a explicação dos dois modos.
- **`/convite/[token]`:** "Camila, o Studio Aurora te convidou para o EasyAgenda+", senha e confirmação, e "Entrar". Convite vencido ou usado: mensagem e "Peça um novo convite ao salão".
- **`/bancada`:** as quatro telas do Stitch, no celular primeiro, com a mesma marca e os tokens do painel. No computador, coluna central.
- **Painel:** selo "Pronta para cobrar" na Agenda e no Caixa para comanda com `enviada_recepcao_em`.

## Testes
- **Regras:** token (validade, uso único, revogado), escopo de clientes, chave de cobrança.
- **Serviço:** convite (criar, reenviar revoga o anterior, e-mail em uso), aceitar (cria Supabase e local, sessão), remover acesso, iniciar, enviar para a recepção e fechar pela profissional.
- **Rotas:** a profissional não acessa nenhuma rota do painel (amostra: `/clients`, `/cash`, `/comandas/settings`, `/reports`); `employee` e dona não acessam `/bancada`; cliente de outra profissional dá 404; plano Solo dá 403.
- **Frontend:** convite, as quatro telas, a chave em Ajustes, o bloco de acesso e o redirecionamento por papel; themeCompliance.

## Riscos
- **Supabase Auth:** criar o usuário já confirmado depende da chave de serviço no backend. Se faltar, o aceite falha com erro claro e nada local é criado.
- **Papel novo em código antigo:** qualquer rota que use só `authMiddleware` (sem papel) passaria a aceitar a profissional. A tarefa inclui varrer as rotas e um teste que tenta uma amostra.
- **Fechar pelo celular:** com `profissional_cobra`, o dinheiro entra na gaveta pela mão da profissional. O texto da chave em Ajustes deixa isso claro.
