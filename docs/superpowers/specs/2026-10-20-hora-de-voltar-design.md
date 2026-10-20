# Sub-projeto 2C-2a — WhatsApp: Hora de voltar (e fila de envio cadenciada)

Data: 2026-10-20 · Branch: `feat/hora-de-voltar` (sai da `main` com 2B e 2C-1)

## Intenção
A dona vê, numa tela só, as clientes que passaram do tempo de voltar e as chama de volta pelo WhatsApp com convites que já sugerem horários livres — sem digitar mensagem por mensagem e sem arriscar o número com disparos em rajada. É a primeira aba do WhatsApp no Stitch e a escolhida pelo dono para começar o 2C-2 ("comece por hora de voltar que é a primeira tela"). O dono pediu para começar sem rodada de perguntas: as decisões abaixo marcadas **(decisão do Claude)** são minhas, tomadas a partir do Stitch e do que o sistema já tem.

Referência visual: `docs/design/stitch/projeto/studio-aurora-whatsapp-hora-de-voltar-ajustada--ab3e69.html` (versão nova). Visual fiel ao Stitch, com dados reais.

## Objetivos
1. Lista de "oportunidades": clientes com retorno vencido, com atraso, último serviço, profissional, última visita, ciclo e 2 encaixes sugeridos.
2. Prévia do WhatsApp em tempo real para a cliente escolhida, com os horários e o link de auto-agendamento.
3. Envio individual ("Enviar") e em lote ("Enviar convites no WhatsApp (N)") por uma **fila cadenciada** gravada no banco.
4. "Testar envio no meu número".

## Não objetivos
- Automações (7 regras) e Campanhas: próximas partes do 2C-2 (a fila desta parte será reaproveitada pelas Campanhas).
- Editor de modelo de mensagem salvo por negócio (o texto é ajustável por cliente no "Ver texto", sem salvar modelo).
- Link de auto-agendamento personalizado por cliente (usa o link da página pública do negócio).

## Anti-objetivos
- Disparar em rajada (risco de bloqueio do número).
- Mandar convite para quem revogou consentimento ou respondeu SAIR.
- Mandar o mesmo convite repetidamente para a mesma cliente.
- Mostrar número inventado (recuperação estimada tem de vir de valor real e dizer que é estimativa).

## Regras
**Quem aparece (decisão do Claude, igual à pendência "retorno vencido" da Hoje do 2B):** cliente ativa, com última visita há no máximo 120 dias, `retornoPrevisto.venceuHa > 0` (de `resumirCliente`, `backend/src/modules/crm/crmMetrics.ts`), **sem agendamento futuro** que ocupe a agenda. Ordem: maior atraso primeiro; empate por nome.
- "Ciclo recomendado" = `cicloMedio` da cliente (ou o ciclo de retorno do CRM do negócio quando a cliente não tem ciclo próprio, como o 2B já faz em `retornoPrevisto`).
- Último serviço e profissional = da última visita.

**Quem pode receber (decisão do Claude):** todas, **exceto** consentimento `revogado` ou número em opt-out (SAIR). Motivo: as boas práticas do próprio Stitch dizem "clientes que já agendaram ou autorizaram avisos"; quem está na lista já agendou. Clientes bloqueadas aparecem na lista com o selo "Não recebe mensagens" e sem caixa de seleção.

**Intervalo entre convites (decisão do Claude):** cliente que recebeu convite da Hora de voltar nos últimos **7 dias** aparece com "Convite enviado há N dias", fica fora de "Selecionar todas" e o "Enviar" pede confirmação ("Ela já recebeu um convite há N dias. Enviar de novo?").

**Encaixes:** até 2 próximas vagas nos próximos 7 dias com a **profissional da última visita** (se ela não estiver ativa, qualquer profissional), com duração ≥ a duração do último serviço, a partir de agora, no fuso do negócio. Reaproveita `proximasVagas` (`backend/src/modules/dashboard/today.service.ts`), estendida com `professionalId?` e `duracaoMinima?`. Formato curto "Qua 14:30" (e longo na mensagem: "Quarta-feira (22/out) às 14:30").

**Recuperação estimada:** soma do **valor da última visita** de cada cliente da lista filtrada (selecionadas, quando há seleção). Rótulo "Recuperação Estimada" com dica "Soma do valor da última visita de cada cliente". "Oportunidades" = quantidade na lista filtrada.

**Filtros:** Profissional (Todas + profissionais ativas) e Atraso ("Todos os níveis" / "Apenas com encaixe ideal" = com pelo menos 1 encaixe). Ordenação fixa "Maior atraso".

**Mensagem (decisão do Claude, adaptada do Stitch para qualquer segmento):**
```
Oi, {primeiro_nome}! 💕 Aqui é da equipe do {negocio}.
Notamos que seu {servico} com {profissional} já completou {dias} dias e deve estar precisando daquele cuidado especial ✨
Temos {qtd} opções para você nesta semana:
1️⃣ {encaixe_1}
2️⃣ {encaixe_2}
Posso garantir seu horário em algum desses? Se preferir outro dia, é só me avisar!
```
- Sem encaixes: a parte dos horários vira "Me conta o melhor dia para você que eu encontro um horário!".
- Com 1 encaixe: "Temos uma opção para você nesta semana:" e só a linha 1️⃣.
- Link de auto-agendamento (chave "Link de auto-agendamento", ligada por padrão quando o negócio tem página pública): acrescenta a linha final "Se preferir, agende sozinha por aqui: {link}" com `{FRONTEND_URL}/agendar/{slug}`. Sem página pública, a chave fica desabilitada com a dica "Publique sua página em Minha página".
- "Ver texto" abre um modal com o texto daquela cliente **editável** antes de enviar (não salva modelo).
- A prévia (coluna da direita) mostra o texto da cliente escolhida (a primeira da lista por padrão; clicar num cartão escolhe), em balão estilo WhatsApp com o nome do negócio e "HOJE".

**Fila de envio cadenciada (decisão do Claude, base reaproveitada pelas Campanhas):**
- Tabela nova `whatsapp_envios`: negócio, cliente (opcional), telefone, texto, origem, `agendado_para`, status (`na_fila` | `enviado` | `falhou` | `cancelado` | `pulado`), motivo, `enviado_em`, `lote_id` (opcional).
- Rotina a cada minuto: por negócio, envia **no máximo 1 mensagem por vez**, respeitando **intervalo aleatório de 45 a 90 s** desde o último envio da fila e **no máximo 25 por hora**; só entre **08:00 e 20:00** no fuso do negócio (fora disso espera a próxima janela). Antes de enviar, confere de novo opt-out, consentimento revogado e WhatsApp conectado; se não puder, marca `pulado` com o motivo (desconectado: fica na fila até reconectar, sem perder).
- O envio passa por `sendWhatsAppMessage` com a origem nova **`retorno`** (bloqueada por opt-out como as automáticas; grupo "Lembretes e confirmações automáticas" na Conexão; rótulo "Convite Hora de voltar"), então fica gravado no histórico e na central de conversas como os demais.
- O cartão mostra o estado: "Na fila (envio previsto ~HH:MM)", "Enviado", "Não enviado: {motivo}".
- "Enviar" individual entra na fila na frente (`agendado_para = agora`), o lote entra em ordem de atraso.

**Testar envio no meu número:** envia **na hora** (fora da fila) o texto da prévia para o número do próprio negócio (`Business.whatsapp`), origem `sistema`. Desconectado → aviso "WhatsApp desconectado. Reconecte na aba Conexão."

## Tela (ab3e69)
- Aba **Hora de voltar** entra como **primeira** aba do módulo WhatsApp (ordem: Hora de voltar · Automações · Conversas · Conexão; Campanhas entra depois). A aba padrão continua Conversas quando conectado.
- Cabeçalho: "● RETENÇÃO ATIVA · Sugestões de vagas em aberto", título "Hora de voltar", descrição "Clientes com manutenção ou retorno recomendado vencido. Oportunidades para preencher horários vagos esta semana."; à direita os cartões "Recuperação Estimada R$ X" e "Oportunidades N".
- Barra: filtros Profissional e Atraso; "N selecionadas"; botão principal verde "Enviar convites no WhatsApp (N)"; "Selecionar todas (N)"; "Ordenado por: Maior atraso".
- Cartões: caixa de seleção, iniciais, nome, selo "N dias atrasada", "Serviço · Profissional", "Última visita: há N dias • Ciclo recomendado: N dias", "Encaixes:" com chips dos horários (ou "Sem encaixe nesta semana"), botões "Ver texto" e "Enviar"; estados de fila/enviado/não recebe.
- Coluna direita: "Prévia do WhatsApp" + "Tempo real", "Simulação para {nome} · Variáveis preenchidas automaticamente.", balão, chave "Link de auto-agendamento", "Testar envio no meu número" ("Envia exatamente a mensagem acima para {número do negócio}"), "Dica de conversão" ("Convites com horários sugeridos costumam receber mais respostas do que mensagens genéricas.").
- Vazio: "Nenhuma cliente com retorno vencido agora. Quando alguém passar do ciclo, ela aparece aqui." Desconectado: faixa "WhatsApp desconectado. Reconecte na aba Conexão." e envios desabilitados (a lista continua).
- Celular: coluna única (lista; a prévia vira o modal do "Ver texto"; barra de envio fixa embaixo).

## API (módulo `modules/whatsappRetorno/`, guard `authMiddleware + requireTenantRoles + requireFeature('whatsapp_automation')`)
- `GET /whatsapp/retorno?professionalId=&somenteComEncaixe=` → `{ resumo: { recuperacaoEstimada, oportunidades }, linkAgendamento: string | null, numeroNegocio: string | null, itens: OportunidadeDto[] }`, onde `OportunidadeDto` traz cliente, atraso, serviço, profissional, última visita, ciclo, encaixes (`{ inicio ISO, curto, longo }`), `podeReceber` + motivo, `ultimoConvite` (data) e `envio` (último envio da fila: status, previsto, motivo).
- `POST /whatsapp/retorno/enviar` `{ itens: [{ clientId, texto? }], incluirLink: boolean }` → enfileira (texto montado no servidor quando não vier; vindo, até 4096 caracteres) e devolve os envios criados. Recusa clientes que não podem receber (400 com motivo por cliente) e não duplica cliente já `na_fila`.
- `POST /whatsapp/retorno/testar` `{ clientId, incluirLink }` → envia na hora para o número do negócio.
- Isolamento por negócio, `:id`/UUID inválido → 404, mensagens em pt-BR.

## Migração (só adições)
`whatsapp_envios` (+ índices por negócio/status/agendado_para) e RLS. Aplicação em produção pede autorização do dono.

## Testes
Backend: regra de quem aparece (ativa, 120 dias, vencido, sem futuro), quem pode receber (revogado/opt-out), intervalo de 7 dias, encaixes por profissional e duração, montagem da mensagem (0/1/2 encaixes, com/sem link), recuperação estimada, fila (cadência 45–90 s, 25/h, janela 08–20 h no fuso, opt-out/revogado na hora do envio → pulado, desconectado → espera), não duplicar `na_fila`, isolamento.
Frontend: lista/filtros/seleção/contadores, prévia muda ao escolher cliente, "Ver texto" editável, envio individual e em lote (estados de fila), bloqueadas sem seleção, testar envio, vazio, desconectado, celular.
