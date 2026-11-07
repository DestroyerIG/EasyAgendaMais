# Recebimentos automáticos, começando pelo Mercado Pago: design

Data: 05/11/2026. Decisões do dono na conversa: integração opcional, começar pelo Mercado Pago, conexão feita inteira pelo próprio negócio, e uma tela de passos com a logo de cada gateway. As decisões marcadas como "escolha do Claude" estão abertas à revisão.

## Por quê

Hoje o sinal cai na chave Pix do negócio e o sistema não sabe quando. O dono precisa olhar o banco e clicar em "Confirmar" na aba Aguardando Pix. Se demorar, a reserva expira mesmo com o sinal pago, e o cliente fica sem resposta.

Com um gateway conectado, o pagamento confirma a reserva sozinho e o cliente final também pode pagar com cartão. O dinheiro continua indo direto para a conta do negócio, sem passar pela EasyAgenda+.

O Mercado Pago vem primeiro porque aparece em 7 dos 8 sistemas concorrentes analisados. Não há pesquisa pública de uso por segmento, então essa é a melhor evidência disponível, não um dado de participação de mercado.

## Objetivos

1. O dono conecta o Mercado Pago sozinho, sem suporte e sem conhecimento técnico.
2. Um sinal pago confirma a reserva sem ação humana, e o cliente vê a confirmação na mesma tela.
3. O cliente final escolhe entre as formas que o negócio liberou: Pix ou cartão.
4. Uma falha do gateway nunca impede a reserva: o sistema volta para a chave Pix e a confirmação manual.
5. Asaas, InfinitePay e PagBank entram depois sem refazer a tela nem o fluxo da reserva.

## Fora do escopo

- Asaas, InfinitePay e PagBank funcionando. Eles aparecem na lista como "Em breve".
- Devolução automática de sinal. Devolver continua sendo feito pelo dono no Mercado Pago.
- Clube e pacotes, que seguem com a confirmação manual.
- Parcelamento: o sinal é sempre à vista.
- Formulário de cartão dentro do EasyAgenda+.
- Comissão da EasyAgenda+ sobre o sinal.

## Anti-objetivos

- Confirmar uma reserva sem pagamento real, por aviso falso ou repetido.
- Um dado de cartão passar pelos nossos servidores.
- Um token de acesso aparecer em tela, log ou resposta de API.
- O dono descobrir só pelo cliente que a integração parou de funcionar.

## Como funciona para o dono do negócio

### Lista de gateways

Nova seção "Recebimentos" em Ajustes, visível só para `tenant_admin`, com um cartão por gateway: logo, nome e situação (Conectado, Disponível ou Em breve). Clicar em Mercado Pago abre a tela de passos. Os cartões "Em breve" não abrem nada (escolha do Claude).

Só um gateway fica ativo por negócio. A chave Pix de "Minha página" continua obrigatória, porque é o plano B (escolha do Claude).

### Tela de passos do Mercado Pago

Tela própria dentro do painel, com a logo no topo e estes passos:

1. **Tenha uma conta no Mercado Pago.** Links para entrar e para criar conta.
2. **Cadastre uma chave Pix na conta.** Explica onde fazer isso e avisa que é a chave da conta do Mercado Pago, não a de "Minha página".
3. **Conecte sua conta.** Botão "Conectar com o Mercado Pago". O dono entra no site deles, autoriza e volta para esta tela.
4. **Escolha o que o cliente pode usar.** Pix já vem marcado, e cartão é opcional.
5. **Pronto.** Mostra a conta conectada e o aviso de que os novos sinais serão confirmados sozinhos.

O dono não digita chave, token nem código. Antes de conectar, a tela avisa:

- As taxas são cobradas pelo Mercado Pago e saem do valor do sinal, com link para a tabela deles.
- No cartão, o dinheiro pode levar mais tempo para ficar disponível.
- No cartão, o cliente pode contestar a compra no banco, e o valor pode voltar para ele. Esse aviso precisa de um aceite antes de ligar o cartão.

### Depois de conectar

A tela passa a mostrar conta conectada, formas liberadas, data da última confirmação automática e o botão Desconectar.

- **Desconectar:** pede confirmação e informa quantas reservas estão pendentes. Os tokens são apagados, novas reservas voltam ao fluxo manual, e as pendentes ficam na aba Aguardando Pix para confirmação manual.
- **Conexão com problema:** se a autorização vencer ou for retirada, a tela mostra "Reconectar" e o dono recebe um aviso no sino.

### Aba Aguardando Pix

Continua igual, com o botão manual como plano B. Cada reserva com cobrança automática ganha o selo "Automático".

## Como funciona para o cliente final

Na etapa de pagamento da página pública, a escolha de forma aparece só quando o negócio liberou mais de uma. Pix vem primeiro e marcado. Os rótulos "Sinal Pix" e "Sinal pago via Pix" passam a acompanhar a forma usada.

**Pix:** a tela é a mesma de hoje, com QR Code e copia e cola gerados pelo Mercado Pago. A mensagem de WhatsApp com o código segue igual, porque ela já recebe o `pixPayload`. A confirmação aparece sozinha pela consulta que a página já faz.

**Cartão:** a reserva é criada e o cliente vai para o Checkout Pro do Mercado Pago, só com cartão e à vista. Ao voltar, vê a situação real da reserva:

- Aprovado: tela de confirmação.
- Em análise: "Estamos aguardando a confirmação do pagamento", e a página segue consultando.
- Recusado ou desistiu: enquanto o prazo durar, pode tentar de novo ou trocar para Pix.

A volta do Checkout é uma navegação nova, às vezes em outro navegador, e o estado atual da página se perde. A página pública precisa de um endereço próprio da reserva, que remonte a tela pelo id. Por isso, a consulta pública da reserva passa a devolver serviço, data, hora, profissional e valores, sem nenhum dado pessoal do cliente.

## Como funciona por dentro

### Conexão (OAuth)

Mesmo desenho do Google Agenda: rota `conectar` devolve a URL de autorização com `state` assinado, e uma rota pública `callback` recebe o código. Usa PKCE e o escopo `offline_access`.

- O token de acesso dura 180 dias. A renovação devolve um novo `refresh_token`, que precisa ser salvo a cada vez.
- Uma rotina diária renova quem está a menos de 30 dias de vencer (escolha do Claude). Se falhar, marca a conexão como `precisa_reconectar` e avisa o dono.
- Os tokens ficam cifrados com AES-256-GCM, como em `googleAgenda.crypto.ts`, mas com chave própria. Generalizar a função é decisão do plano.
- Sem as variáveis de ambiente, a seção de Recebimentos não aparece, como em `googleConfigurado()`.

### Estrutura para vários gateways

- **Backend:** um adaptador por gateway, com a mesma interface: montar a autorização, trocar e renovar tokens, criar cobrança Pix, criar checkout de cartão e consultar pagamento.
- **Frontend:** um catálogo de dados por gateway com logo, situação, passos, avisos e tipo de conexão (`autorizacao`, `chave` ou `usuario`). A tela de passos é uma só e monta o conteúdo pelo catálogo, incluindo campos quando o gateway pedir uma chave, como o Asaas.

### Dados

Duas tabelas novas, com RLS ligado na migração.

`conexoes_recebimento`: `business_id` (único), `gateway`, `situacao` (`ativa`, `precisa_reconectar`), `conta_externa_id`, `conta_nome`, tokens cifrados, `token_expira_em`, `aceita_pix`, `aceita_cartao`, `aceite_cartao_em`, datas.

`cobrancas_sinal`: `business_id`, `appointment_id`, `gateway`, `forma` (`pix`, `cartao`), `valor`, `situacao` (`pendente`, `paga`, `expirada`, `recusada`, `devolvida`, `contestada`), `id_externo`, `pagamento_externo_id`, `forma_paga` (`pix`, `credito`, `debito`), `pago_em`, datas.

Uma reserva pode ter mais de uma cobrança, porque o cliente pode trocar de forma. `pagamento_externo_id` é único por gateway, o que impede processar o mesmo pagamento duas vezes.

### Criação da reserva

`createPendingAppointment` recebe a forma escolhida. Depois de gravar a reserva, fora da transação com trava, chama o gateway:

1. Conexão ativa e Pix: cria a ordem em `POST /v1/orders`, com `expiration_time` igual à tolerância da reserva, chave de idempotência e `external_reference` iguais ao id da cobrança, e devolve o código do Mercado Pago. O `/v1/payments` foi descartado na conferência: respondeu 401 com as credenciais de teste.
2. Conexão ativa e cartão: cria a preferência do Checkout com `external_reference` igual ao id da cobrança, as três URLs de volta e o mesmo vencimento, e devolve `checkoutUrl`.
3. Sem conexão, ou gateway com erro ou lento (limite de 8 segundos, escolha do Claude): usa o `buildPixPayload` de hoje e registra o erro no log. Se o cliente escolheu cartão, a tela explica e oferece o Pix.

A chamada ao gateway não pode ficar dentro da transação, para não segurar a trava do horário.

### Confirmação

A confirmação que hoje vive em `appointments.service.ts` (mensagem de WhatsApp, notificação e aviso ao profissional) vira uma função única, usada pelo botão manual e pelo automático. O texto da mensagem não muda.

Webhook: `POST /api/v1/recebimentos/webhook/mercadopago`, um único endereço por aplicação, configurado no painel do Mercado Pago com os tópicos `order` e `payment`. A API de Orders não aceita aviso por cobrança. O negócio é encontrado pelo `user_id` do aviso. A rota entra em `webhookPaths`.

1. Responde 200 rápido e processa em seguida.
2. Não confia no corpo do aviso. Com o token do negócio, descobre a `external_reference` do recurso avisado e busca o pagamento em `/v1/payments/search`. Essa busca é a fonte única, porque o id na ordem é diferente do id numérico do pagamento.
3. Só confirma se o pagamento estiver `approved`, com a cobrança pertencendo ao negócio do aviso e valor igual ao da cobrança.
4. Grava `paga` e confirma a reserva pelo compare-and-set existente. Repetições não têm efeito.

Essa consulta torna a confirmação segura mesmo sem validar a assinatura `x-signature`, sobre a qual a documentação se contradiz. Validar a assinatura fica como camada adicional, se funcionar no teste.

Rede de segurança: uma rotina a cada minuto consulta cobranças `pendentes` até 30 minutos depois do vencimento (escolha do Claude), para cobrir avisos perdidos.

### Casos difíceis

- **Pago depois do prazo:** `updateStatus` recusa reservas vencidas, e isso continua valendo para o botão manual. No automático, a função entra na trava de profissional e dia e confere o conflito. Como a rotina já pode ter cancelado a reserva, e `TRANSITIONS` não permite sair de `cancelado`, esse caso precisa de um caminho próprio, restrito a reservas públicas canceladas por vencimento. Um cancelamento feito pelo dono ou pelo cliente nunca é revertido: esse caso segue a regra de horário ocupado. Horário livre: confirma. Horário ocupado: cobrança `paga`, reserva não confirmada, alerta ao dono com nome, valor e a orientação de devolver no Mercado Pago, e mensagem ao cliente dizendo que o negócio vai entrar em contato (escolha do Claude).
- **Pagamento em dobro:** se o cliente pagar as duas cobranças da reserva, a segunda fica registrada e o dono recebe alerta para devolver. Isso também vale para Pix pago depois de o dono confirmar à mão.
- **Devolução ou contestação depois de confirmado:** a cobrança muda para `devolvida` ou `contestada` e o dono recebe alerta. A reserva não é cancelada sozinha, porque essa decisão é dele.
- **Cancelamento da reserva:** não devolve nada automaticamente. Cancelar uma reserva com sinal pago lembra o dono de devolver, se for o caso.
- **Reserva expirada sem pagamento:** a cobrança vira `expirada`. A rotina de hoje continua cancelando a reserva.

### Caixa e relatórios

O sinal continua abatido na comanda por `depositApplied`. O Caixa e a ficha mostram a forma do sinal. O plano deve conferir `cash.service.ts` e `comandas.service.ts`, porque um sinal no cartão não pode ser somado como Pix.

## Disponibilidade por plano

Todos os planos, porque "sinal via Pix" já está em todos (escolha do Claude). Isso pode mudar para um plano maior sem refazer nada.

## Logos

A "foto de cada gateway" foi entendida como a logo. Os arquivos vêm dos kits de marca oficiais, um por gateway, em `frontend/public/images/gateways/`, respeitando as regras de uso de cada marca. Não redesenhar logos. Antes do lançamento, conferir se o uso em tela de integração é permitido.

## O que o dono da EasyAgenda+ precisa fazer

- Criar uma aplicação no Mercado Pago na conta da EasyAgenda+, com a URL de retorno e o webhook nos tópicos `order` e `payment`, uma única vez.
- Colocar no Render: `MERCADOPAGO_CLIENT_ID`, `MERCADOPAGO_CLIENT_SECRET`, `MERCADOPAGO_REDIRECT_URI` e `RECEBIMENTOS_TOKEN_KEY`.
- Autorizar a migração em produção.
- Fazer um teste real com valor baixo, em Pix e cartão, usando um negócio próprio.
- Refazer a URL de retorno quando o domínio mudar.

## Conferências no ambiente de teste

Resultado em `docs/design/mercado-pago-verificacoes.md`. Decisões que saíram de lá:

1. **E-mail do pagador:** é obrigatório, mas um endereço técnico foi aceito. O sistema envia `reserva-<id da cobrança>@<domínio do site>`, sem campo novo na reserva. Vale confirmar no teste real. Se o Mercado Pago recusar em produção, a decisão de pedir e-mail volta ao dono.
2. **CPF:** não foi exigido.
3. **Conta sem chave Pix:** não dá para detectar no ambiente de teste, então não há conferência ao conectar. Se o Mercado Pago recusar o Pix na reserva, o cliente segue pelo Pix manual e o dono recebe um alerta, no máximo uma vez por dia, para conferir a chave.
4. **Vencimento:** a tolerância de 15, 30 ou 60 minutos é aceita como está.

Falta confirmar no teste completo: autorização com PKCE, recebimento de avisos de contas conectadas, e se o débito aparece no Checkout. Se os avisos não chegarem, a rotina confirma em até um minuto.

## Testes

- Regras em testes unitários: vencimento, pagamento atrasado, duplicidade, valor divergente e renovação do token.
- Webhook: aviso falso, repetido, fora de ordem e de outro negócio. Nenhum confirma indevidamente.
- Falha do gateway na reserva cai no Pix manual, e o horário continua travado corretamente.
- Tela de passos, escolha de forma e retorno do Checkout nos testes de frontend, com conferência visual local no fim.
- Teste completo no ambiente de testes do Mercado Pago antes do teste real.

## Referências

- [OAuth: introdução](https://www.mercadopago.cl/developers/en/docs/security/oauth/introduction)
- [OAuth: obter token](https://www.mercadopago.com.br/developers/en/docs/subscriptions/additional-content/security/oauth/creation)
- [OAuth: renovar token](https://www.mercadopago.com.br/developers/en/docs/security/oauth/renewal)
- [Pix na API](https://www.mercadopago.com.br/developers/en/docs/checkout-api/integration-configuration/integrate-with-pix)
- [Checkout Pro: URLs de volta](https://www.mercadopago.com.br/developers/en/docs/checkout-pro-preferences/configure-back-urls)
- [Checkout Pro: meios de pagamento](https://www.mercadopago.com.br/developers/pt/docs/checkout-pro/additional-settings/payment-methods)
- [Notificações](https://www.mercadopago.com.br/developers/pt/docs/qr-code/notifications)
- [Credenciais](https://mercadopago.com.br/developers/pt/docs/credentials)
