/**
 * Pixel da Meta (anúncios do Facebook e Instagram).
 *
 * Só liga quando NEXT_PUBLIC_META_PIXEL_ID está definido: sem ele nada é carregado e
 * os eventos viram no-op (desenvolvimento, testes e deploys sem pixel).
 *
 * Privacidade: o pixel só roda nas páginas públicas de divulgação e cadastro, nunca no
 * painel, só depois que o visitante aceita os cookies de Marketing (ver cookieConsent), e
 * nenhum dado pessoal (nome, e-mail, CPF/CNPJ, telefone) é enviado nos eventos.
 */

import { marketingConsentido } from '@/lib/cookieConsent';

export const META_PIXEL_ID = (process.env.NEXT_PUBLIC_META_PIXEL_ID ?? '').trim();

/** Rotas públicas em que o pixel pode rodar (e só elas). */
const ROTAS_COM_PIXEL = [
  '/',
  '/cadastro',
  '/cadastro/completar',
  '/nail-designers',
  '/termos',
  '/privacidade',
  '/cookies',
];

type Fbq = (...args: unknown[]) => void;

declare global {
  interface Window {
    fbq?: Fbq;
  }
}

export function pixelAtivo(): boolean {
  return /^\d{8,20}$/.test(META_PIXEL_ID);
}

export function rotaPermitePixel(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  return ROTAS_COM_PIXEL.includes(pathname.replace(/\/+$/, '') || '/');
}

/** Dispara um evento padrão da Meta. Não faz nada se o pixel estiver desligado ou sem consentimento. */
export function trackMetaEvent(evento: string, parametros?: Record<string, unknown>): void {
  if (!pixelAtivo() || typeof window === 'undefined' || typeof window.fbq !== 'function') return;
  if (!marketingConsentido()) return;
  try {
    if (parametros) window.fbq('track', evento, parametros);
    else window.fbq('track', evento);
  } catch {
    // Anúncio nunca pode quebrar o cadastro.
  }
}

/** Apaga o cookie _fbp (host atual e domínio pai), que o pixel grava no site por 90 dias. */
function apagarCookieFbp(): void {
  if (typeof document === 'undefined') return;
  const expirar = '; Max-Age=0; path=/';
  document.cookie = `_fbp=${expirar}`;
  const partes = window.location.hostname.split('.');
  if (partes.length > 1) document.cookie = `_fbp=${expirar}; domain=.${partes.slice(-2).join('.')}`;
}

/**
 * Informa ao pixel já carregado se ele pode medir. Sem isto, revogar só esconde o script:
 * o fbevents.js continuaria ativo até recarregar a página. Ao revogar, apaga também o _fbp.
 */
export function atualizarConsentimentoPixel(concedido: boolean): void {
  if (typeof window === 'undefined' || typeof window.fbq !== 'function') return;
  try {
    window.fbq('consent', concedido ? 'grant' : 'revoke');
  } catch {
    // Anúncio nunca pode quebrar o site.
  }
  if (!concedido) apagarCookieFbp();
}

/** Cadastro concluído (e-mail ou Google). Sem dados pessoais. */
export function trackCadastroConcluido(metodo: 'email' | 'google'): void {
  trackMetaEvent('CompleteRegistration', { status: true, content_name: `cadastro_${metodo}` });
}
