# Mercado Pago: conferências no ambiente de teste

Data: 06/11/2026. Conta de teste `TESTUSER...`, com a tag `test_user`, conferida em `GET /users/me` antes de qualquer cobrança. As ordens criadas foram canceladas, menos a aprovada com `APRO`, que recusa o cancelamento (409).

## Resultado

| Item | Resultado | Decisão |
|---|---|---|
| API do Pix | `POST /v1/payments` responde 401 "Unauthorized use of live credentials" com e-mail de pagador. `POST /v1/orders` funciona | Pix pela API de Orders |
| E-mail do pagador | Orders exige `payer.email`, `payer.customer_id` ou `payer.id`. Só nome ou telefone dão 400 | Enviar endereço técnico, sem campo novo na reserva |
| Endereço técnico | `reserva-abc123@easybarber.tech` foi aceito, assim como e-mail comum e `test@testuser.com` | Vale para teste. Confirmar no teste real, com atenção a recusa antifraude |
| CPF | Não foi exigido | Não pedir |
| Vencimento do Pix | `expiration_time` em ISO 8601. `PT15M` e `PT31M` foram aceitos e aplicados | Usar a tolerância da reserva (15, 30 ou 60 min), sem mínimo extra |
| Conta sem chave Pix | A conta de teste gerou QR Code mesmo sem Pix em `/v1/payment_methods` | Não dá para detectar no teste. Sem conferência ao conectar; tratar a recusa na reserva |
| Aprovação simulada | `payer.first_name: 'APRO'` aprova. A ordem vira `processed/accredited` | Usar nos testes |
| Consulta do pagamento | `GET /v1/orders/:id` devolve `external_reference`. `GET /v1/payments/search?external_reference=` acha o pagamento como `approved`, com id numérico | A busca por referência é a fonte única, porque o id na ordem (`PAY...`) é diferente do numérico |
| Referência | UUID com hífens foi aceito em `external_reference` | Usar o id da cobrança |
| Aviso por cobrança | `notification_url` na ordem dá 400 `unsupported_properties` | Um webhook por aplicação, configurado no painel, com os tópicos `order` e `payment` |
| Checkout só com cartão | Preferência criada com `installments: 1` e exclusão de `ticket`, `bank_transfer`, `atm` e `digital_currency`. Vencimento por `expires` e `expiration_date_to` | Usar assim. Conferir no navegador se débito aparece |
| Taxas | A tela só linka a tabela do Mercado Pago | Sem valores fixos |

## Ainda em aberto

- **OAuth e PKCE:** precisa do Client Secret, que não foi usado aqui. Conferir no teste da Task 11.
- **Webhook de contas conectadas:** o corpo traz `user_id` segundo a documentação, mas falta confirmar que a aplicação recebe avisos das contas autorizadas. Se não receber, a rotina de cada minuto confirma sozinha, com atraso de até um minuto.
- **`/v1/payments` em produção:** o erro 401 pode ser só da credencial de teste. Orders funciona no teste e foi escolhida por isso.
- **Endereço técnico em produção:** o Mercado Pago pode tentar enviar comprovante ou aplicar antifraude. Se recusar, a decisão de pedir e-mail volta ao dono.
