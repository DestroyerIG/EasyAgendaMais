# Design: Fundação EasyAgenda+ (sub-projeto A)

## Contexto

O produto nasceu como EasyBarber, um SaaS de agendamento para barbearias. O relançamento o transforma no EasyAgenda+, um sistema de agendamento para negócios de beleza e bem-estar (barbearia, nail designer, cílios e sobrancelha, salão), com redesign completo e novas funcionalidades.

O relançamento é grande demais para uma única especificação. Ele foi dividido em sub-projetos, cada um com sua especificação, seu plano e sua implementação:

| # | Sub-projeto | Depende de |
|---|---|---|
| A | Fundação: marca, nomes internos, higiene e CI | — |
| B | Design system e estrutura do painel | A |
| C | Segmentos, vocabulário e onboarding | A, B |
| D | Agenda e equipe | B, C |
| E | Página pública de agendamento e sinal via Pix | C, D |
| F | Caixa, comissões e relatórios | D |
| G | CRM e automações de WhatsApp | C, E, F |
| H | Planos, landing e SuperAdmin | A, B |
| I | Clube e pacotes | F |

Este documento especifica o **sub-projeto A**.

Estado da base no momento da especificação: `tsc --noEmit` passa; 420 de 423 testes passam (2 falham, 1 é pulado); há cerca de 5.700 ocorrências de `barbershop`/`barber` em 150 arquivos, sendo 27 com SQL escrito à mão e 11 migrations.

## Decisões que moldam o escopo

1. **Não existe domínio novo.** O endereço atual continua. O código deixa de ter endereços fixos, para que a troca de domínio seja feita por configuração. O roteiro dessa troca é escrito, mas não executado.
2. **Produção só tem contas de teste do próprio dono.** Não há compatibilidade com dados antigos: chaves do navegador, nomes de rota e nomes de coluna mudam sem alias e sem migração de preferências.
3. **A renomeação é completa, agora.** Banco, Prisma, TypeScript, rotas da API e frontend passam a usar `business` e `professional`. O custo dessa renomeação cresce a cada sub-projeto seguinte; com contas de teste, este é o momento mais barato.

## Objetivos

- O produto se chama EasyAgenda+ em tudo que é visível: interface, e-mails, bot, SEO, imagens de compartilhamento, páginas legais e nomes de pacote.
- Os nomes internos ficam neutros de segmento, no banco, no código e na API.
- Termos de barbearia saem dos textos da interface, substituídos por termos genéricos ("profissional", "negócio"), que servirão de padrão para o dicionário de vocabulário do sub-projeto C.
- Funcionalidades falsas e código morto saem.
- O CI barra regressão: typecheck e testes obrigatórios.

## Não-objetivos

- Segmentos e vocabulário por segmento (C).
- Visual novo, tokens do DESIGN.md e nova navegação (B).
- Textos de venda, landing e mudança de planos (H).
- Compra e troca de domínio: apenas o roteiro é escrito.
- Contratação de hospedagem paga: é pré-requisito de lançamento, não desta fatia.
- Qualquer funcionalidade nova.

## Mapa de nomes

| Hoje | Passa a ser |
|---|---|
| tabela `barbershops`, modelo `Barbershop` | `businesses`, `Business` |
| tabela `barbers`, modelo `Barber` | `professionals`, `Professional` |
| coluna `barbershop_id`, campo `barbershopId` | `business_id`, `businessId` |
| coluna `barber_id`, campo `barberId` | `professional_id`, `professionalId` |
| tabela `barbershop_settings` | `business_settings` |
| colunas `actor_barbershop_id`, `target_barbershop_id` | `actor_business_id`, `target_business_id` |
| função de RLS `current_barbershop_id()` | `current_business_id()` |
| bucket `barber-photos` | `professional-photos` |
| `barbershopSettingsRepository`, `barbershopSettingsService` | `businessSettingsRepository`, `businessSettingsService` |
| `barbershopBusinessSettingsService` (horários, intervalo, encaixe) | `scheduleSettingsService` |
| `barberService`, `barberController`, `barberRepository` | `professionalService`, `professionalController`, `professionalRepository` |
| `ServiceBarberModal` e demais componentes com "Barber" | `ServiceProfessionalModal` |
| `WHATSAPP_DEFAULT_BARBERSHOP_ID` | `WHATSAPP_DEFAULT_BUSINESS_ID` |
| `WHATSAPP_INSTANCE_BARBERSHOP_MAP` | `WHATSAPP_INSTANCE_BUSINESS_MAP` |
| prefixo de instância `easybarber` | `easyagenda` |
| chaves do navegador `easybarber:pixCheckout`, `easybarber.settings.v1`, `easybarber-theme` | `easyagenda:pixCheckout`, `easyagenda.settings.v1`, `easyagenda-theme` |
| textos "barbeiro(a)", "barbearia" | "profissional", "negócio" |
| variáveis das mensagens `{nome_barbearia}`, `{barbeiro}` | `{nome_negocio}`, `{profissional}` |

O papel `employee` continua com esse nome, já é neutro. O mapa de papéis antigos (`barber` → `employee`) fica como está.

## Banco de dados

Uma migration nova do Prisma, sem apagar dados. As migrations existentes não são editadas.

1. `ALTER TABLE ... RENAME` das tabelas `barbershops`, `barbers` e `barbershop_settings`.
2. `ALTER TABLE ... RENAME COLUMN` de `barbershop_id`, `barber_id`, `actor_barbershop_id` e `target_barbershop_id` em todas as tabelas que as têm.
3. Renomear índices e restrições para o padrão que o Prisma gera com os nomes novos (`businesses_pkey`, `professionals_business_id_fkey`, `business_settings_business_id_key`, `uq_businesses_whatsapp_instance_name_norm` e os demais). O nome dessa restrição única é lido pelo código em `whatsappInstanceService`, que passa a esperar o nome novo.
4. Apagar e recriar a função de RLS como `public.current_business_id()`, e recriar as políticas das tabelas com nomes novos (as políticas antigas são removidas por nome).
5. Criar o bucket `professional-photos` com as mesmas políticas de Storage do bucket antigo. As fotos de teste não são copiadas. O bucket `barber-photos` fica para exclusão manual.
6. `UPDATE` nas mensagens salvas de `whatsapp_bot_config` e `whatsapp_menu_options`, trocando `{nome_barbearia}` por `{nome_negocio}` e `{barbeiro}` por `{profissional}`.
7. Apagar colunas mortas de `businesses`: `whatsapp_phone_number_id`, `whatsapp_waba_id`, `whatsapp_access_token` (credenciais da API oficial da Meta, sem nenhum uso no código, e a conexão do produto é por QR code) e o índice `barbershops_whatsapp_phone_number_id_idx`.
8. Apagar colunas sem efeito de `business_settings`: `google_calendar_enabled`, `custom_webhook_url` e `email_reminders`.

A tabela `whatsapp_menu_options` existe no banco mas não é modelada no `schema.prisma`: o código a acessa por SQL escrito à mão, em `routes/whatsapp.ts` e nos serviços de WhatsApp. A coluna `barbershop_id` dela é renomeada na mesma migration, e as consultas passam a usar `business_id`.

Critério de aceite da migration: depois de `prisma migrate deploy`, a comparação entre `schema.prisma` e o banco não acusa nenhuma diferença nas tabelas modeladas. A ausência de `whatsapp_menu_options` no schema é uma diferença que já existe hoje e continua como está.

## Backend e API

- Rotas: `/api/v1/barbershop` passa a `/api/v1/business`, e `/barbershop/barbers` passa a `/business/professionals`. Sem rotas antigas em paralelo: o único consumidor é o frontend do projeto, que muda na mesma entrega.
- Corpo das respostas: `barbershopId` e `barbershop` passam a `businessId` e `business`.
- Códigos de erro: `barbershop_not_found`, `barbershop_active`, `barbershop_not_resolved` e `barbershop_validation_query_failed` passam a usar `business`.
- Endereços de webhook não contêm "barber" e não mudam. Nada precisa ser reconfigurado no Stripe, no Asaas ou na Evolution.
- Marca: nome e descrição dos pacotes `package.json`, `User-Agent` do Asaas (`EasyAgenda/1.0`), `ASAAS_BILLING_DESCRIPTION`, remetente e assuntos de e-mail, mensagem da rota raiz da API, nomes genéricos rejeitados pelo Asaas, scripts de seed e `.env.example`.
- Instâncias de WhatsApp: o prefixo de nomes novos passa a `easyagenda`. Nomes já gravados no banco continuam válidos e não são alterados, então as instâncias de teste seguem conectadas.
- Bot: "EasyBarber Bot" sai dos textos padrão. O assistente se apresenta como assistente do próprio negócio, e os textos padrão deixam de citar barbearia.

## Frontend

- Proxies: `app/api/barbershop/*` e `app/api/barbers/*` passam a `app/api/business/*` e `app/api/professionals/*`, acompanhando as rotas do backend.
- Tipos, componentes e chamadas passam a usar os nomes novos.
- Marca em: título e metadados, `opengraph-image`, `twitter-image`, navbar pública, rodapé, navbar do painel, barra lateral do SuperAdmin, telas de autenticação, cabeçalho do PDF financeiro, página de pagamento, termos de uso e política de privacidade.
- Logo: um logotipo em SVG com o texto "EasyAgenda+" na cor da marca, provisório, substituindo `icons/easybarber.png`. Um logo definitivo entra depois, sem mudança de código além do arquivo.
- Chaves do navegador passam a `easyagenda:*`, sem migrar valores antigos.
- `PRODUCTION_BACKEND_ORIGIN`, hoje fixo em `next.config.js`, passa a vir da variável `BACKEND_ORIGIN`, com o valor atual configurado na Vercel.

## Correções incluídas

1. O envio de lembrete em `cronService` passa a consultar a opção `whatsapp_reminders` do negócio e pula quem a desligou. Hoje a opção existe na tela e não tem efeito.
2. As opções sem efeito somem da tela de Ajustes, da API e das validações: Google Agenda, webhook personalizado e lembrete por e-mail.
3. Teste grátis unificado em **14 dias**, numa constante única usada pelo cadastro (hoje 14), pelo Stripe (hoje 7) e pela página de planos (hoje 7).
4. As rotas `/debug` do backend (diagnóstico do Asaas, marcadas como temporárias no próprio código) e a página `/debug/supabase` do frontend são apagadas, junto com a variável `DEBUG_TOKEN`.
5. Os 2 testes que falham hoje são corrigidos, verificando antes se o erro está no teste ou no código:
   - `auth.test.ts`: cadastro devolve plano `profissional` onde o teste espera `basico`;
   - `asaasService.test.ts`: a segunda chamada do fluxo Pix não bate com `/payments`.
6. CI: o job de lint do backend, que roda com `|| true` e só procura arquivos `.js` num projeto TypeScript, é substituído por `npm run typecheck` e `npm test`, ambos obrigatórios. O job do frontend continua com `npm run build`.

## Fatias de execução

Cada fatia é um commit próprio e termina com typecheck e testes passando.

1. **Rede de segurança** — corrigir os 2 testes, apagar as rotas de diagnóstico, tornar typecheck e testes obrigatórios no CI.
2. **Higiene** — lembrete respeitando a opção do negócio, teste grátis de 14 dias numa constante única, opções sem efeito fora da tela e da API.
3. **Banco** — migration, `schema.prisma`, repositórios e os 27 arquivos com SQL escrito à mão.
4. **Backend** — serviços, controllers, rotas, validações, variáveis de ambiente, bot, integrações e testes.
5. **Frontend** — proxies, tipos, componentes e chamadas.
6. **Marca e textos** — logo, SEO e imagens de compartilhamento, e-mails, textos do bot, páginas legais, nomes de pacote, chaves do navegador e troca dos termos de barbearia.

## Verificação

- Automática, a cada fatia: `tsc --noEmit` no backend e no frontend, e a suíte de 423 testes. Nenhuma fatia fecha com teste vermelho.
- Banco: aplicar a migration num banco de desenvolvimento e comparar o schema com o banco, exigindo diferença zero.
- Manual, num ambiente de teste, depois da fatia 5: cadastro, login, criar profissional e serviço, agendar, concluir o atendimento e conferir o caixa; conectar o WhatsApp por QR code e trocar uma mensagem com o bot; uma cobrança Pix no Asaas e uma no cartão pelo Stripe, em modo de teste.

## Publicação

1. Backup do banco no Supabase, com o script de reversão da migration escrito e guardado, já que o Prisma não desfaz migration.
2. Renomear as variáveis de ambiente no Render e na Vercel (`WHATSAPP_DEFAULT_BUSINESS_ID`, `WHATSAPP_INSTANCE_BUSINESS_MAP`, `BACKEND_ORIGIN`) e remover `DEBUG_TOKEN`.
3. Aplicar a migration, subir o backend, subir o frontend. Nessa janela o sistema fica indisponível, o que é aceitável porque só há contas de teste.
4. Conferir com o roteiro manual de verificação. Reconectar o WhatsApp por QR code apenas se a instância de teste não responder.

## Riscos

| Risco | Mitigação |
|---|---|
| A migration deixa diferença entre schema e banco, e o próximo `migrate dev` gera uma migration corretiva indesejada | Conferir com comparação de schema antes de publicar; nomear índices e restrições exatamente como o Prisma espera |
| SQL escrito à mão com nome antigo passa pelo typecheck e só quebra em execução | Varredura final por `barbershop`/`barber` em todo o repositório ao fim da fatia 6, e roteiro manual cobrindo agenda, clientes, caixa, WhatsApp e cobrança |
| Políticas de RLS recriadas com erro liberam ou bloqueiam dados | Recriar todas as políticas na mesma migration e conferir leitura e escrita com um usuário de teste |
| Bucket novo sem as políticas certas quebra o envio de foto | Testar o envio de foto de profissional no roteiro manual |
| Renomear colunas quebra a função de RLS, que guarda o corpo como texto | A função é apagada e recriada na própria migration |

## Pendências registradas fora deste escopo

- **Roteiro de troca de domínio**, escrito nesta fatia e executado quando o domínio for comprado: DNS, redirecionamento permanente do endereço antigo, endereços de retorno do Supabase, webhooks do Stripe e do Asaas, `sync-webhooks` da Evolution, SPF, DKIM, DMARC e novo login por causa dos cookies.
- **Hospedagem paga**: o plano gratuito do Render dorme, o que derruba lembretes agendados e webhooks. É pré-requisito do lançamento.
- **Textos de venda e planos** (Solo, Equipe e Salão) ficam para o sub-projeto H.
