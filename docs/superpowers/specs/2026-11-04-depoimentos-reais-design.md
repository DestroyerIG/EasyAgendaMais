# Depoimentos reais dos donos de negócio: design

Data: 04/11/2026. Mockups aprovados: `.superpowers/brainstorm/5455-1793812924/content/` (`popup.html`, `admin-landing.html`).

## Por quê

A landing tem uma seção de depoimentos com três personagens fictícios marcados como "Depoimento ilustrativo". O dono quer depoimentos de verdade e não quer o aviso. Não dá para publicar depoimento inventado sem aviso: o CDC (art. 37) e o CONAR tratam isso como propaganda enganosa. A saída é coletar depoimentos reais dentro do sistema, com autorização de quem escreveu, e publicar só os que o dono do EasyAgenda+ aprovar.

## Objetivos

1. Pedir nota e depoimento aos donos de negócio na hora certa: depois de terem usado o sistema de verdade.
2. Separar elogio público de crítica: nota baixa vira feedback interno e nunca vai para o site.
3. Dar ao SuperAdmin uma fila de aprovação; só o que ele publica aparece na landing.
4. A landing mostra os depoimentos publicados e esconde a seção enquanto não houver o mínimo.

## Fora do escopo

- Avaliação da cliente final sobre o negócio. Isso já existe no módulo `avaliacoes` (`whatsapp_ratings`) e não muda.
- Depoimento em vídeo ou com foto da pessoa.
- Pedir depoimento por e-mail ou WhatsApp. Por enquanto é só dentro do painel.
- Página só de depoimentos ou nota média exibida no site.

## O que faria isso dar errado (anti-objetivos)

- Publicar texto sem autorização registrada de quem escreveu.
- Nota baixa aparecer no site.
- O pop-up atrapalhar o trabalho: aparecer cedo demais, de novo para quem já respondeu, ou toda hora para quem pediu "agora não".
- Depoimento fictício voltar a aparecer como real.

## Decidido com o dono

**Primeiro, já nesta entrega:** a seção de depoimentos da landing (`frontend/src/app/page.tsx`, seção "8. Depoimentos") deixa de mostrar os personagens fictícios. Ela fica escondida até existirem 3 depoimentos publicados. Os textos fictícios saem do código.

**Negócio que sai:** se o negócio cancela a assinatura, fica inadimplente a ponto de ser bloqueado ou é desativado (`active = false`), o depoimento sai do site automaticamente. A rota pública só mostra depoimentos de negócios ativos com assinatura em dia. O registro da autorização (texto, nome exibido, cidade, nome do negócio e data) é guardado mesmo se o negócio for excluído: a tabela não apaga em cascata junto com o negócio, e guarda uma cópia desses dados.

**Quando o pop-up aparece:**
- só para quem é dono (`tenant_admin`), não para profissionais da equipe;
- só para assinatura paga e em dia: não aparece em teste grátis, com pagamento atrasado ou bloqueado. O item do menu continua disponível para todos;
- só depois de 14 dias desde o cadastro do negócio **e** pelo menos 10 atendimentos concluídos (status `concluido`) pelo sistema;
- uma vez por sessão, no painel (dashboard), sem interromper um fluxo em andamento (não abre por cima de outro modal);
- "Agora não" adia 30 dias; "Não perguntar mais" encerra de vez; quem já enviou não vê mais.
- Além do pop-up, um item fixo "Avaliar o EasyAgenda+" no menu da conta abre o mesmo formulário a qualquer momento, mesmo antes dos 14 dias.

**Passo 1:** "Como está sendo o EasyAgenda+ pra você?", com 1 a 5 estrelas, e os links "Agora não" e "Não perguntar mais".

**Passo 2, nota 4 ou 5:** "Que bom! Conta pra outros profissionais?"
- caixa de texto do depoimento;
- "Nome exibido", já preenchido com o primeiro nome do dono e a inicial do sobrenome (ex.: "Diego M."), editável;
- "Cidade", campo livre a preencher (o cadastro só tem `address` como texto livre);
- caixa de autorização: "Autorizo exibir este depoimento, com meu nome, o nome do meu negócio e a cidade, no site do EasyAgenda+.";
- botão "Enviar". Sem a autorização marcada, o envio vale só como avaliação interna (aviso abaixo do botão).

**Passo 2, nota 1 a 3:** "Obrigado pela sinceridade. O que podemos melhorar?", com caixa de texto e o botão "Enviar para a equipe". Embaixo: "Vai direto para os responsáveis pelo sistema. Não aparece no site." (O dono pediu para não citar "SuperAdmin" aqui.)

**SuperAdmin → Depoimentos** (item novo no menu do admin):
- abas: Pendentes, Publicados (mostra "X de 3 para a seção aparecer" enquanto faltar), Recusados e Avaliações internas;
- cada item: nome do negócio, nome exibido, cidade, plano, nota, texto e data da autorização;
- ações em Pendentes: Publicar, Corrigir texto (para erro de digitação) e Recusar;
- Avaliações internas: notas 1 a 3 e envios sem autorização. Só leitura e nunca publicáveis.

**Landing:** o card fica igual ao de hoje (estrelas, texto entre aspas, avatar, nome), sem o aviso "ilustrativo". Embaixo do nome: "Nome do negócio · Cidade".

## Decisões minhas (o dono pode mudar)

- **Avatar:** a logo do negócio (`businesses.logo_url`) se houver; senão, a inicial do nome exibido.
- **Quantidade na landing:** até 6 depoimentos publicados, os mais recentes primeiro. A seção só aparece com 3 ou mais.
- **Tamanho do texto:** depoimento de 20 a 400 caracteres; feedback de nota baixa até 1000.
- **Um depoimento por negócio:** enviar de novo pelo menu substitui o anterior. Qualquer envio novo tira do ar o depoimento publicado na hora, porque o que vale é a opinião e a autorização atuais. Se o novo for nota 4 ou 5 com autorização, vai para Pendentes; senão, vai para Avaliações internas.
- **O dono vê a situação:** o item "Avaliar o EasyAgenda+" mostra o estado atual (em análise, publicado ou não publicado), sem motivo de recusa. Depois de uma recusa ele pode enviar de novo.
- **Nome pré-preenchido:** vem de `businesses.owner_name`, porque `users` não tem campo de nome.
- **Retirar o depoimento (LGPD):** o dono pode retirar a autorização pelo mesmo item do menu ("Retirar meu depoimento do site"). O depoimento sai da landing na hora e vai para Avaliações internas.
- **Correção pelo admin:** só ajuste de digitação. A versão original fica guardada junto, para conferência.
- **Título da seção** quando aparecer: volta a "Quem usa todos os dias recomenda", porque agora é verdade.
- **Cache da landing:** a página pública lê os depoimentos publicados no servidor. Publicar ou retirar reflete em até alguns minutos (revalidação), sem precisar de deploy.
- **Nome do módulo:** `depoimentos`, para não confundir com o `avaliacoes` que já existe (cliente avalia o negócio).

## Restrições

- Migração no banco de produção só com autorização explícita do dono (o `backend/.env` aponta para produção). Usar o pooler de sessão para migrar.
- Código vai por PR para a `main`; o dono junta no GitHub.
- Seguir os tokens de tema do frontend: o teste `themeCompliance` proíbe cor fixa.
- Os textos de interface ficam em português do Brasil, no tom do resto do sistema.
- A rota pública de depoimentos publicados não pode expor nada além do que vai no card: nada de e-mail, plano, ID do negócio ou texto original.

## Fica com quem for construir

- Formato da tabela e da API, desde que guarde: negócio, nota, texto, nome exibido, cidade, se autorizou e quando, status (pendente, publicado, recusado, interno, retirado), texto original quando corrigido, e quem publicou e quando.
- Onde guardar o "agora não" e o "não perguntar mais": no banco, para valer em qualquer aparelho.
- Como contar os atendimentos concluídos de forma barata.
- Visual final dos componentes, dentro do que os mockups mostram.
- Ordem de entrega. Sugestão: primeiro esconder a seção fictícia (PR pequeno, sem migração), depois o resto.
