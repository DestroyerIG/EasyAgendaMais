# Robô cobra o sinal do agendamento — design

## Intenção
Hoje o robô do WhatsApp cria o agendamento já `confirmado`; o sinal só existe na página pública (`/agendar/<slug>`). O proprietário quer que, se ele ativar, o robô também cobre o sinal: a cliente agenda no chat, paga o sinal e só então o horário fica garantido.

## Objetivos
- Opção por negócio, **desligada por padrão**, que o proprietário liga e desliga.
- Com a opção ligada e o serviço com `depositPercentage > 0`, o robô cria a reserva `aguardando_pagamento` (segura o horário pelo prazo da automação `sinal_pix`: 15/30/60 min) e envia o sinal.
- Forma de pagamento: **sempre a padrão do negócio** (`conexaoService.formas()[0] ?? 'pix'`), sem perguntar à cliente. Pix manda o copia e cola em mensagem separada; cartão/InfinitePay manda o link.
- Pago o sinal (webhook, conferência a cada minuto ou confirmação manual na agenda), o robô envia a mensagem de **agendamento confirmado** (a `confirmation_message` do robô, com serviço, profissional, data, horário e valor) e limpa a sessão.
- Prazo vencido sem pagamento: o robô avisa a cliente (mensagem nova, editável) e a sessão é limpa.
- Cliente que escreve enquanto espera o pagamento recebe resposta coerente; `0` cancela a pré-reserva e volta ao menu.

## Não objetivos
- Perguntar a forma de pagamento no chat.
- Cobrar sinal na remarcação.
- Mudar a página pública, o webhook, a conferência de cobranças ou a expiração, além do que está descrito aqui.
- Cobrança por serviço sem `depositPercentage`.

## Anti-objetivos (falha mesmo que "funcione")
- Reserva fantasma segurando horário sem Pix enviado.
- Duas mensagens de confirmação seguidas à cliente.
- Mudar o comportamento de quem não ligou a opção.
- Simulador gravando reserva ou cobrança de verdade.

## Decisões do proprietário do projeto
1. Forma de pagamento sempre a padrão do negócio.
2. Aviso de expiração entra junto.
3. Depois do pagamento o robô envia a mensagem confirmando o agendamento.

## Escolhas do arquiteto (a conferir)
- A opção vive em `Business.botCobraSinal` (ao lado de `pixKey`) e é editada na tela Ajustes › Recebimentos.
- Só liga com chave Pix salva; sem ela o sinal não teria como ser cobrado.
- A regra de "quanto cobrar" reaproveita `Service.depositPercentage`, como a página pública.
- Reservas do robô têm `source = 'whatsapp'`; só elas recebem a `confirmation_message` ao pagar. As da página pública mantêm "sinal confirmado".
- A criação da reserva com sinal é extraída de `publicBooking.createPendingAppointment` para um serviço compartilhado.
- Textos novos do robô ficam em `textos_extras` (editáveis no catálogo de textos).
- No simulador, com a opção ligada, o robô mostra a mensagem do sinal com um código de teste e `AVISO_TESTE`, sem gravar nada.

## Deixado ao construtor
Nomes internos, organização dos testes, redação exata dos textos padrão (seguir o tom dos existentes).
