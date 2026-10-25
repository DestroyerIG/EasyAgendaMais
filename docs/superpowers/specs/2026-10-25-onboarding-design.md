# Onboarding guiado, segmentos e vocabulário — fase 6

## Contexto
O sub-projeto C da Fundação ("segmentos, vocabulário e onboarding") nunca ganhou fase própria. Hoje:
- O cadastro pede nome do negócio, responsável, WhatsApp, CPF/CNPJ, e-mail e senha. Depois de confirmar o e-mail, `AuthConfirmView` manda para `/login?confirmed=1` (ou `/pagamento`) e o login leva direto ao painel vazio.
- O segmento (`business_settings.segment`: `unhas`, `cilios_sobrancelhas`, `cabelo`, `barbearia`, `estetica`, `outro`) só é escolhido em Ajustes › CRM, começa como `outro` e só muda os campos da ficha técnica.
- Não há slug na criação da conta: a Minha página só existe depois que a dona escolhe o endereço.
- Os textos dizem "profissional", "negócio" e "a cliente" para todo mundo, inclusive para barbearia.

Referências do Stitch em `docs/design/stitch/onboarding/` (e as versões "ajustada" em `docs/design/stitch/projeto/`):
- `step1-negocio.html` — Seu negócio (segmento e "sozinha ou com equipe")
- `step2-horarios.html` — Horários
- `step3-servicos.html` — Serviços sugeridos do segmento
- `step4-pagina.html` — Sua página (logo, cor, galeria)
- `step5-whatsapp.html` — WhatsApp e link

O `DESIGN.md` fixa: sempre 5 etapas, com estes nomes e nesta ordem, iguais em todas as telas.

## Decisões do dono (25/10)
1. **Só contas novas.** O onboarding abre sozinho no primeiro acesso depois de confirmar o e-mail. Contas que já existem não são interrompidas.
2. **Etapas 1 a 3 obrigatórias.** Seu negócio, Horários e Serviços precisam ser concluídos para entrar no painel. Sua página e WhatsApp podem ser pulados.
3. **Vocabulário completo nesta fase.** Os termos mudam por segmento no painel, na página pública, na bancada e nas mensagens do bot.
4. **"Atendo sozinha" cria a profissional** com o nome da responsável, já ligada aos serviços da etapa 3.

## Escopo
1. **Fluxo `/onboarding`** com as 5 etapas do Stitch, barra de progresso e "Voltar". Cada etapa salva ao avançar; quem fecha o navegador volta para a etapa em que parou.
2. **Etapa 1 · Seu negócio:**
   - Segmento em cartões (Barbearia, Unhas, Cílios e Sobrancelha, Salão de Beleza, Estética & Bem-estar, Outro). Vem pré-marcado com o segmento escolhido na landing, quando houver (`?segmento=` no link de cadastro, guardado no cadastro).
   - "Atendo sozinha(o)" ou "Tenho equipe".
   - Grava `business_settings.segment` e o modo de equipe. Trocar o segmento depois continua em Ajustes.
3. **Etapa 2 · Horários:** dias abertos, abertura e fechamento, intervalo da agenda e pausa (almoço). Usa os campos que Ajustes já tem (`dias_abertos`, `opening_time`, `closing_time`, `slot_interval_minutes`). A pausa vai para a profissional criada na etapa 1 (`professionals.break_start/break_end`); com equipe, fica para o cadastro de cada uma.
4. **Etapa 3 · Serviços:** a lista sugerida do segmento (catálogo no backend), com os mais comuns já marcados. A dona desmarca, ajusta nome, duração, preço e sinal (%), e pode incluir um serviço próprio. Pelo menos um serviço é obrigatório. Se algum tiver sinal, pede a chave Pix (a mesma de Ajustes).
5. **Etapa 4 · Sua página:** endereço (slug, com a checagem de disponibilidade que já existe, sugerido a partir do nome), logo, cor de destaque e até 6 fotos. Reaproveita as rotas da Minha página. "Pular por enquanto" segue para a etapa 5 sem publicar.
6. **Etapa 5 · WhatsApp e link:** o QR da conexão (o mesmo painel de WhatsApp › Conexão) e, se a página foi criada, o link para copiar e compartilhar. "Pular conexão" e "Ir para o painel" concluem o onboarding.
7. **Primeiros passos na tela Hoje:** se a etapa 4 ou 5 foi pulada, um cartão "Termine de configurar" lista o que falta (publicar a página, conectar o WhatsApp, chave Pix quando houver sinal). Cada item leva à tela certa, some quando fica pronto, e o cartão pode ser dispensado.
8. **Vocabulário por segmento:** um dicionário único no backend, enviado ao frontend no `/auth/me` e no payload da página pública, aplicado em:
   - painel (navegação, títulos, botões, estados vazios, filtros, relatórios, comissões, Caixa, agenda);
   - página pública de agendamento e Minha página;
   - bancada e convite da profissional;
   - mensagens padrão do bot e das automações (os textos que a dona já editou não mudam).

## Fora do escopo
- Horário diferente por dia da semana (o modelo atual tem um horário só para os dias abertos). Fica registrado como pendência.
- Tolerância entre atendimentos e "retorno sugerido" por serviço (não há coluna; o radar de retorno usa o histórico da cliente).
- Mudar o painel conforme "sozinha ou com equipe" além de criar a profissional.
- Onboarding para contas antigas e para a recepção (`employee`) ou a profissional (`professional`).
- Traduzir textos que a dona digitou (nomes, mensagens editadas, descrições).

## Modelo de dados
Migração `20261028120000_onboarding` (só adições):
- `businesses.onboarding_etapa SMALLINT NOT NULL DEFAULT 1` — próxima etapa a mostrar (1 a 5).
- `businesses.onboarding_concluido_em TIMESTAMP(3) NULL` — preenchido ao concluir ou pular a etapa 5.
- `businesses.primeiros_passos_dispensado_em TIMESTAMP(3) NULL` — o cartão da tela Hoje foi dispensado.
- `businesses.segmento_cadastro VARCHAR(20) NULL` — o segmento escolhido na landing, só para pré-marcar a etapa 1.
- `business_settings.modo_equipe VARCHAR(10) NULL` — `sozinha` ou `equipe`.
- **Backfill:** `UPDATE businesses SET onboarding_etapa = 6, onboarding_concluido_em = now()` em todas as contas que já existem, para elas não caírem no fluxo.

## Regras
- **Pendente** quando `onboarding_concluido_em` é nulo. **Bloqueante** quando também `onboarding_etapa <= 3`: o painel manda para `/onboarding` (só para `tenant_admin`; a recepção e o SuperAdmin passam direto).
- A etapa só avança no servidor quando os dados dela são válidos; voltar não apaga nada.
- Etapa 1 com "sozinha": cria (ou atualiza, se já existir) uma profissional com o nome da responsável. Com "equipe", não cria; a dona cadastra em Serviços. Trocar de "sozinha" para "equipe" depois não apaga a profissional criada.
- Etapa 3: cria os serviços marcados numa transação. Repetir a etapa (voltou e avançou de novo) não duplica: os serviços criados pelo onboarding são atualizados pelo nome. Com "sozinha", a profissional fica ligada a todos.
- Sinal só com chave Pix válida (a mesma validação de Ajustes).
- Etapa 5 ou "Pular": grava `onboarding_concluido_em` e `onboarding_etapa = 6`.
- Vocabulário: cada segmento define profissional (singular, plural, gênero), cliente (gênero), negócio (nome e gênero) e serviço. O padrão (`outro`) mantém os textos de hoje. Sem segmento, vale o padrão.

| Segmento | Profissional | Negócio | Cliente |
|---|---|---|---|
| barbearia | o barbeiro / os barbeiros | a barbearia | o cliente |
| unhas | a nail designer / as nail designers | o estúdio | a cliente |
| cilios_sobrancelhas | a lash designer / as lash designers | o estúdio | a cliente |
| cabelo | a cabeleireira / as cabeleireiras | o salão | a cliente |
| estetica | a esteticista / as esteticistas | a clínica | a cliente |
| outro | a profissional / as profissionais | o negócio | a cliente |

## API
Módulo novo `modules/onboarding` (`tenant_admin`):
- `GET /onboarding` — etapa atual, se está pendente, dados já salvos de cada etapa e o pré-preenchimento (segmento da landing, nome da responsável, slug sugerido).
- `GET /onboarding/catalogo?segmento=` — serviços sugeridos (nome, duração, preço, sinal %, marcado por padrão).
- `PUT /onboarding/negocio` — `{ segmento, modoEquipe }`.
- `PUT /onboarding/horarios` — `{ diasAbertos, abertura, fechamento, intervaloMinutos, pausa? }`.
- `PUT /onboarding/servicos` — `{ servicos: [{ nome, duracaoMinutos, preco, sinalPct? }], chavePix? }`.
- `POST /onboarding/concluir` — conclui (etapas 4 e 5 são opcionais).
- `POST /onboarding/primeiros-passos/dispensar`.
- A etapa 4 usa `/business/public-page` e a 5 usa as rotas de WhatsApp que já existem; o `GET /onboarding` só lê o estado delas.

Alterações:
- `POST /auth/register` aceita `segmento` opcional (vai para `segmento_cadastro`).
- `GET /auth/me` traz `onboarding: { pendente, bloqueante, etapa }` e `vocabulario`.
- O payload público da página de agendamento traz `vocabulario`.
- Novo `GET /onboarding/primeiros-passos` (ou dentro do `GET /dashboard/hoje`) com os itens pendentes.

## Telas
- `/onboarding` fora do AppShell, com o cabeçalho do Stitch (marca, selo do teste grátis, "Ambiente seguro"), as 5 etapas nomeadas e a barra de progresso. No celular, a lista de etapas vira "Etapa X de 5".
- Cartão "Termine de configurar" no topo da tela Hoje.
- Ajustes › CRM: trocar o segmento avisa que os termos, a ficha técnica e as sugestões mudam.
- Hook `useVocabulario()` no frontend (do `AuthContext`; na página pública, do payload) e um helper `termo()` para concordância ("a profissional"/"o barbeiro", "dela"/"dele").

## Testes
- Backend: regras do onboarding (bloqueante, avanço só com dado válido, sozinha cria a profissional, serviços não duplicam, sinal sem Pix recusa, concluir), catálogo por segmento, `register` com segmento, `me` com onboarding e vocabulário, dicionário completo para todos os segmentos.
- Frontend: cada etapa (validação, salvar e avançar, voltar), redirecionamento do painel quando bloqueante, recepção não é redirecionada, cartão de primeiros passos, `termo()` e telas-chave com vocabulário de barbearia e de unhas.
- Migração conferida com `migrate diff`; backfill verificado com `migrate status` antes e depois.

## Riscos
- **Vocabulário espalhado:** são cerca de 500 ocorrências de "profissional" em 55 arquivos, além de "a cliente". A troca é feita tela por tela com o helper e um teste que procura textos fixos nas telas principais; ocorrências em textos raros podem escapar e ficam listadas no SEGUIMENTO.
- **Concordância de gênero:** frases com "ela/dela" precisam do helper; não dá para trocar só a palavra.
- **Mensagens do bot já personalizadas:** só os textos padrão mudam; o que a dona editou fica como está.
- **Contas novas sem e-mail confirmado** não chegam ao onboarding (o fluxo de confirmação não muda).
- O `.env` local aponta para produção: testes sempre com prisma mockado; a migração só com autorização do dono.
