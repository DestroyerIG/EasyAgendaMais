# Política de cookies e pop-up de consentimento (design curto)

## Intenção
Cumprir a LGPD no site público: informar quais cookies são usados e só carregar o pixel da Meta (cookie de marketing) depois do aceite do visitante.

## Objetivos
- Página `/cookies` com categorias, tabela de cookies, escolha atual e botão "Gerenciar cookies".
- Pop-up de consentimento nas rotas públicas do pixel (`/`, `/cadastro`, `/cadastro/completar`, `/nail-designers`, `/termos`, `/privacidade`, `/cookies`).
- Pixel da Meta **bloqueado até o aceite** de Marketing (decisão do usuário).

## Não objetivos
- Não mexer no painel/dashboard nem em cookies de sessão (necessários, sem consentimento).
- Não adicionar biblioteca de banner de cookies.
- (Atualizado após aprovação) `/termos` e `/privacidade` também passam para o tema claro, a pedido do usuário.

## Anti-objetivos
- Pixel disparando antes do aceite, ou botões de "Recusar" menos visíveis que "Aceitar".

## Abordagens
1. Banner feito à mão, consentimento em `localStorage` (escolhida): sem dependência, combina com o design system.
2. Biblioteca pronta de banner: mais rápido, mas nova dependência e visual divergente. Descartada.

## Design
- `lib/cookieConsent.ts`: ler/gravar `{ versao, marketing, em }` em `localStorage` (`cookie_consent`); expira em 12 meses ou se a versão da política mudar; evento para reagir a mudanças.
- `components/cookies/CookieBanner.tsx`: cartão fixo embaixo, 3 botões de peso igual (Recusar não essenciais / Personalizar / Aceitar todos); personalizar mostra Necessários (travado) e Marketing (desligado por padrão). Montado em `layout.tsx`, só nas rotas públicas. Mobile: botões empilhados. Acessível (foco, teclado, `role="dialog"`).
- Tema: banner e `/cookies` **sempre claros** (tokens do tema claro travados), como a landing, mesmo com o sistema do visitante no escuro.
- `MetaPixel.tsx`: só carrega com consentimento de Marketing; revogar vale na próxima visita (e interrompe os eventos na hora). `trackMetaEvent` continua no-op sem pixel.
- `/cookies/page.tsx`: layout claro da landing; tabela com `access_token`, tema, `cookie_consent` e cookies do pixel (`_fbp`, `fr`; nomes e durações a confirmar na implementação).
- Ajustes: seção 9 da `/privacidade` aponta para `/cookies`; links "Cookies" e "Gerenciar cookies" no `PublicFooter`; rota no `sitemap`; `/cookies` entra na lista de rotas do pixel.
- Testes (vitest): `cookieConsent`, `CookieBanner` (aceitar/recusar/personalizar), `MetaPixel` só com consentimento; estender a cobertura de tema do CI se necessário.

## Fica para quem implementa
Texto final das seções, nomes/durações reais dos cookies da Meta, e revisão jurídica da EasyConnect (os textos legais não substituem advogado).
