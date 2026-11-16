/**
 * Pixel da Meta (anúncios do Facebook e Instagram).
 *
 * Só liga quando NEXT_PUBLIC_META_PIXEL_ID está definido: sem ele nada é carregado e
 * os eventos viram no-op (desenvolvimento, testes e deploys sem pixel).
 *
 * Privacidade: o pixel só roda nas páginas públicas de divulgação e cadastro, nunca no
 * painel, e nenhum dado pessoal (nome, e-mail, CPF/CNPJ, telefone) é enviado nos eventos.
 */

export const META_PIXEL_ID = (process.env.NEXT_PUBLIC_META_PIXEL_ID ?? '').trim();

/** Rotas públicas em que o pixel pode rodar (e só elas). */
const ROTAS_COM_PIXEL = [
  '/',
  '/cadastro',
  '/cadastro/completar',
  '/nail-designers',
  '/termos',
  '/privacidade',
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

/** Dispara um evento padrão da Meta. Não faz nada se o pixel estiver desligado. */
export function trackMetaEvent(evento: string, parametros?: Record<string, unknown>): void {
  if (!pixelAtivo() || typeof window === 'undefined' || typeof window.fbq !== 'function') return;
  try {
    if (parametros) window.fbq('track', evento, parametros);
    else window.fbq('track', evento);
  } catch {
    // Anúncio nunca pode quebrar o cadastro.
  }
}

/** Cadastro concluído (e-mail ou Google). Sem dados pessoais. */
export function trackCadastroConcluido(metodo: 'email' | 'google'): void {
  trackMetaEvent('CompleteRegistration', { status: true, content_name: `cadastro_${metodo}` });
}
