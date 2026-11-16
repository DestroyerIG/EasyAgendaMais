'use client';

import type { ReactNode } from 'react';
import { abrirPreferenciasCookies } from '@/lib/cookieConsent';

/** Reabre o pop-up de cookies já na tela de preferências. */
export function GerenciarCookiesButton({
  className,
  children = 'Gerenciar cookies',
}: {
  className?: string;
  children?: ReactNode;
}) {
  return (
    <button type="button" onClick={abrirPreferenciasCookies} className={className}>
      {children}
    </button>
  );
}
