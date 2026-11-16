'use client';

import { useEffect, useState } from 'react';

/**
 * Consentimento de cookies (LGPD).
 *
 * A escolha fica no localStorage do visitante. Necessários (sessão, tema) não dependem dela;
 * só "marketing" (pixel da Meta) é controlado aqui. Sem escolha válida, vale como recusado.
 */

export const CONSENT_KEY = 'cookie_consent';
export const CONSENT_VERSION = 1;
export const CONSENT_MAX_AGE_MS = 365 * 24 * 60 * 60 * 1000;
export const CONSENT_EVENT = 'easyagenda:consent';
export const ABRIR_PREFERENCIAS_EVENT = 'easyagenda:cookies-abrir';

export type Consentimento = { versao: number; marketing: boolean; em: number };

/** Devolve a escolha vigente, ou null se não há, está corrompida, é de outra versão ou expirou. */
export function lerConsentimento(agora: number = Date.now()): Consentimento | null {
  try {
    const bruto = localStorage.getItem(CONSENT_KEY);
    if (!bruto) return null;
    const dado = JSON.parse(bruto) as Partial<Consentimento> | null;
    if (!dado || dado.versao !== CONSENT_VERSION) return null;
    if (typeof dado.marketing !== 'boolean' || typeof dado.em !== 'number') return null;
    if (dado.em > agora || agora - dado.em > CONSENT_MAX_AGE_MS) return null;
    return { versao: dado.versao, marketing: dado.marketing, em: dado.em };
  } catch {
    return null;
  }
}

export function salvarConsentimento(marketing: boolean, agora: number = Date.now()): Consentimento {
  const consentimento: Consentimento = { versao: CONSENT_VERSION, marketing, em: agora };
  try {
    localStorage.setItem(CONSENT_KEY, JSON.stringify(consentimento));
  } catch {
    // Sem armazenamento (modo privado): a escolha vale só nesta página, o banner volta depois.
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(CONSENT_EVENT, { detail: consentimento }));
  }
  return consentimento;
}

export function marketingConsentido(): boolean {
  return lerConsentimento()?.marketing === true;
}

/** Reabre o pop-up já na tela de preferências ("Gerenciar cookies"). */
export function abrirPreferenciasCookies(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(ABRIR_PREFERENCIAS_EVENT));
}

/**
 * Escolha atual, reativa. É null no servidor e no primeiro render (evita divergência de
 * hidratação) e quando ainda não há escolha válida.
 */
export function useConsentimento(): Consentimento | null {
  const [consentimento, setConsentimento] = useState<Consentimento | null>(null);

  useEffect(() => {
    const atualizar = () => setConsentimento(lerConsentimento());
    atualizar();
    window.addEventListener(CONSENT_EVENT, atualizar);
    return () => window.removeEventListener(CONSENT_EVENT, atualizar);
  }, []);

  return consentimento;
}
