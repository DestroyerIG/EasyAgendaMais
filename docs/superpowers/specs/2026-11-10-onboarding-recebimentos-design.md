# Onboarding: etapa "Recebimentos" (design)

## Intenção
Hoje, na etapa 3 (Serviços), a dona marca "Exigir sinal via Pix" e cadastra a chave Pix. Ela ainda não sabe como o sinal funciona nem que existem integrações (Mercado Pago, InfinitePay). A chave Pix e o sinal passam a ser configurados numa etapa própria, **Recebimentos**, que explica o sinal e deixa escolher como receber.

## Objetivos
- Nova etapa 4 "Recebimentos" no onboarding, com a mesma casca (`CascaOnboarding`), rodapé e progresso das outras. Sua página vira a 5 e WhatsApp e link vira a 6.
- A etapa explica como o sinal funciona e oferece: Mercado Pago, InfinitePay (conectam de verdade), Asaas e PagBank ("Em breve", desabilitados), Pix manual (chave) e "Não vou cobrar sinal agora".
- O "Exigir sinal" por serviço (com %) sai da etapa Serviços e vai para a etapa Recebimentos, e só aparece quando há uma forma de receber (gateway conectado ou chave Pix). O sinal sempre exige a chave Pix (já salva ou informada na etapa): a página pública monta o Pix do sinal por ela, e com um gateway conectado a chave é a reserva (campo "Chave Pix (reserva)").
- Etapa **pulável** ("Configurar depois"); não bloqueia o painel (obrigatórias continuam sendo 1 a 3).
- Mercado Pago (OAuth): o retorno cai direto em `/onboarding` (etapa 4), já conectado. Fora do onboarding, o retorno continua indo para Ajustes.

- **Google Agenda** vira um card opcional na etapa 2 (Horários): "Já usa o Google Agenda?", para os compromissos pessoais da dona bloquearem horários na página. Reusa o `GoogleAgendaCard` de Ajustes (só a dona, qualquer plano), com a mesma ideia de origem no `state`: o retorno do Google cai em `/onboarding`. Não bloqueia o "Continuar" e some se o Google não estiver configurado no ambiente.

## Não objetivos
- Mudar a conexão dos gateways, ativar Asaas/PagBank, mexer em Ajustes › Recebimentos ou na página pública.
- Mudar o cartão "Termine de configurar" (`primeirosPassos`).

## Decisões (dadas pela dona do produto)
- Google Agenda na etapa Horários (opção 1), não em "WhatsApp e link".
- Retorno do OAuth direto ao onboarding (opção B). A etapa salva no servidor (etapa 4) é a proteção para quem fechar a aba no meio.
- Pular = "Configurar depois": os serviços ficam sem sinal.
- O sinal por serviço mora na nova etapa.

## Decisões do builder (marcadas como escolha minha)
- Cap da etapa passa de 5 para 6 e `ETAPA_CONCLUIDA` de 6 para 7. Migração SQL soma 1 à etapa de quem está pendente na etapa >= 4 (sem isso essas pessoas cairiam na tela errada).
- `salvarServicos` deixa de mexer no sinal (não zera o sinal ao voltar à etapa 3); só `salvarRecebimentos` grava `depositPercentage`.
- A origem do OAuth vai assinada dentro do `state` (campo `o`); estados antigos sem `o` valem "ajustes".
- O formulário da InfinitePay é extraído de `InfinitePayPassos` para um componente reutilizado nas duas telas.
- Pular não grava nada: a etapa salva continua 4 (igual ao que Sua página faz hoje).
