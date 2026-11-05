# Busca geral do painel: design

Data: 05/11/2026. O dono pediu para montar o desenho direto a partir da sugestão feita na conversa, sem rodada de perguntas. As decisões abaixo são do Claude e estão abertas à revisão do dono.

## Por quê

A barra de pesquisa do painel só funciona na tela de Clientes, onde filtra a lista. Nas outras telas ela fica desativada, com a dica "A busca chega junto com essa área", e no celular nem aparece. Os textos prometem mais do que ela faz: "Buscar agendamento ou cliente" na Agenda e "Buscar conversa, cliente ou disparo" no WhatsApp.

Quem atende precisa achar uma cliente ou um horário em segundos, de qualquer tela, sem passar pelo menu.

## Objetivos

1. Uma busca que funciona em todas as telas do painel, no computador e no celular.
2. Encontrar clientes por nome, telefone ou e-mail e abrir a ficha.
3. Encontrar os agendamentos de uma cliente e abrir o horário na agenda.
4. Ir para qualquer tela ou ação comum digitando o nome.
5. Nenhum texto da barra promete o que ela não faz.

## Fora do escopo

- Buscar conversas e disparos do WhatsApp, comandas, lançamentos do caixa e pacotes do Clube.
- Buscas recentes, sugestões antes de digitar e tolerância a erro de digitação.
- App da bancada: o papel `professional` usa só esse app e o painel fica fechado para ele (`AppShell.tsx`).
- SuperAdmin, que tem as próprias telas.

## Como funciona para quem usa

### Computador

A barra fica ativa em todas as telas, com o texto "Buscar cliente, agendamento ou tela..." e a dica `Ctrl K`. O atalho (`Cmd K` no Mac) leva o foco para ela.

A partir de 2 letras, ou 3 números, abre uma lista logo abaixo da barra:

```
Clientes
  Carla Souza            (83) 99999-0000
  Carla Mendes           (83) 98888-0000
Agendamentos
  Carla Souza · Corte    Amanhã, 14:30 · João
  Carla Souza · Barba    12/10, 09:00 · João
Telas
  Caixa
  Novo agendamento
```

As setas andam pela lista, Enter abre o item marcado e Esc fecha. O clique faz o mesmo. Ao abrir um item, a barra limpa e a lista fecha.

### Celular

Uma lupa na barra de cima, ao lado do sino, abre a busca em tela cheia, com a mesma lista.

### Tela de Clientes

No computador, a barra continua filtrando a lista enquanto a pessoa digita e não abre a lista de resultados: mostrar as mesmas clientes em dois lugares só confunde. O texto muda para "Filtrar clientes por nome ou telefone...". No celular, a lupa abre a busca geral, como nas outras telas.

### Estados

| Situação | O que aparece |
|---|---|
| Buscando | As telas encontradas na hora e uma linha discreta "Buscando..." nos outros grupos |
| Nada encontrado | "Nada encontrado para "termo"." |
| Falha na busca | As telas encontradas e "Não foi possível buscar clientes agora." |
| Conta bloqueada (402) | Só as telas |

## Destino de cada resultado

| Resultado | Vai para |
|---|---|
| Cliente | `/clientes/<id>` (já existe) |
| Agendamento | `/agendamentos?data=<AAAA-MM-DD>&agendamento=<id>` (novo) |
| Tela ou ação | O `href` do item |

`AppointmentModule.tsx` passa a ler `data` e `agendamento`: muda o dia, abre o `PainelDetalhesAgendamento` daquele horário e limpa a URL com `router.replace`, como já faz com `?novo=1` e `?espera=<id>`.

## Backend

Novo módulo `backend/src/modules/busca`, com a rota `GET /api/v1/busca?q=<termo>`.

- **Acesso:** `authMiddleware`, `requireTenantRoles` e `requireFeature('clients')`, as mesmas travas das rotas de clientes. O `businessId` vem sempre de `req.user`, nunca do pedido.
- **Validação:** `q` com zod, sem espaços nas pontas, de 2 a 80 caracteres.
- **Resposta:** `{ clientes: [...], agendamentos: [...] }`, com até 5 itens em cada grupo.

```ts
cliente: { id, nome, telefone }
agendamento: { id, data, hora, status, clienteNome, servicoNome, profissionalNome }
```

### Clientes

Não dá para reaproveitar `crmService.insights`, como a sugestão inicial previa. Ele monta todos os indicadores de todas as clientes antes de filtrar, o que é caro demais para rodar enquanto a pessoa digita.

A rota nova lê só `id`, `name`, `phone` e `email` das clientes ativas do negócio e filtra no Node, com as mesmas regras de `semAcento` e `digitos` de `crm.service.ts`. Essas duas funções vão para um utilitário compartilhado.

- Nome e e-mail: contém o termo, sem diferenciar acento nem maiúscula.
- Telefone: só quando o termo tem 3 dígitos ou mais.
- Ordem: quem começa com o termo vem antes, depois ordem alfabética.

Assim a acentuação funciona como na tela de Clientes e **não há migração**, porque o banco não tem `unaccent` nem `pg_trgm`. O caminho serve para os tamanhos atuais. Se algum negócio passar de cerca de 20 mil clientes, troca-se por `unaccent` e `pg_trgm`, sem mudar a resposta da rota.

### Agendamentos

Uma consulta pelos agendamentos das clientes encontradas, antes do corte em 5, limitada às 50 primeiras, sem os cancelados. Primeiro vêm os futuros, do mais próximo ao mais distante, depois os passados, do mais recente ao mais antigo, até completar 5.

A data de "hoje" segue o fuso do negócio, como no restante da agenda. A regra de quem vê o quê é a de `GET /appointments`: se aquela rota restringir o papel `employee`, a busca faz o mesmo.

### Privacidade

O termo pode ser nome ou telefone e vai na URL. Por isso:

- a resposta sai com `Cache-Control: no-store`;
- o termo não entra em log. Conferir o log de pedidos do `server.ts` e do proxy `/api`, e mascarar a query string dessa rota se ela for gravada.

## Frontend

### Telas e ações

Uma lista fixa em `frontend/src/lib/buscaTelas.ts`, montada de `NAV_ITEMS` e `SETTINGS_TABS` (`navigation.ts`), com a ação "Novo agendamento" (`NEW_APPOINTMENT_HREF`) e sinônimos simples, como "financeiro" para Caixa e "configurações" para Ajustes. O filtro roda no navegador, sem esperar o servidor, e mostra até 4 itens.

Telas que o plano não libera continuam aparecendo: ao abrir, a `FeatureGate` da tela já explica o que fazer. Os rótulos usam o vocabulário do segmento (`useVocabulario`).

### Componentes

- `components/shell/BuscaGeral.tsx`: o campo e a lista do computador. Substitui `TopBarSearch`.
- `components/shell/BuscaResultados.tsx`: a lista, usada no computador e no celular.
- `components/shell/BuscaCelular.tsx`: a tela cheia, com `@radix-ui/react-dialog`, já instalado.
- `hooks/useBuscaGeral.ts`: espera 250 ms depois da última tecla, cancela o pedido anterior e descarta respostas antigas.
- `TopBarSearchContext` continua: quando a tela registra uma busca própria, como Clientes, a barra filtra a tela e não abre a lista. O contexto ganha o campo `placeholder`.

Saem `SEARCH_PLACEHOLDER` e a dica "A busca chega junto com essa área". Nenhuma dependência nova.

### Acessibilidade

O campo usa `role="combobox"` e a lista `role="listbox"`, com `aria-expanded`, `aria-controls` e `aria-activedescendant`. O número de resultados é anunciado em uma região `aria-live`. `Ctrl K` não dispara dentro de outro campo de texto, a não ser que a barra já esteja em foco.

## Testes

**Backend**

- Encontra por nome sem acento, por parte do telefone e por e-mail.
- Nunca devolve dado de outro negócio.
- Ignora clientes inativas e agendamentos cancelados.
- Ordena agendamentos futuros antes dos passados e corta em 5.
- Devolve 400 para termo curto e 401 sem login.

**Frontend**

- A lista só abre com o mínimo de caracteres e faz um pedido só para vários toques seguidos.
- Resposta antiga não sobrescreve a nova.
- Setas, Enter e Esc funcionam, e `Ctrl K` leva o foco à barra.
- Em Clientes, a barra filtra e não abre a lista.
- `?data=` e `?agendamento=` abrem o dia e o painel certos e a URL é limpa.
- Falha ou bloqueio ainda mostram as telas.

**Conferência visual:** 1280 px e 390 px, nos temas claro e escuro, com mock local.

## Publicação

Sem migração. O backend vai junto com o frontend. Se o frontend entrar antes, as telas funcionam e os outros grupos mostram a mensagem de falha até o backend subir.

## Decisões para o dono revisar

1. A barra da tela de Clientes filtra a lista em vez de abrir a busca geral.
2. Telas bloqueadas pelo plano aparecem na busca e explicam o bloqueio ao abrir.
3. Clientes inativas e agendamentos cancelados ficam de fora.
4. Agendamentos só são encontrados pela cliente, não pelo nome do serviço ou da profissional.
