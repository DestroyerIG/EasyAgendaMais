'use client';

import { useConsentimento } from '@/lib/cookieConsent';
import { GerenciarCookiesButton } from './GerenciarCookiesButton';

/** Cartão da página /cookies: mostra a escolha vigente e deixa mudá-la. */
export function EscolhaAtualCookies() {
  const consentimento = useConsentimento();
  const ativo = consentimento?.marketing === true;

  return (
    <div className="mt-4 rounded-2xl border border-line bg-surface p-5">
      <p className="text-sm font-bold text-ink">
        Sua escolha atual: {ativo ? 'Marketing ativado' : 'Marketing desativado'}
      </p>
      <p className="mt-1 text-sm text-muted">
        {consentimento
          ? 'Você pode mudar a qualquer momento.'
          : 'Você ainda não escolheu. Enquanto isso, nenhum cookie de marketing é usado.'}
      </p>
      <GerenciarCookiesButton className="mt-4 min-h-11 rounded-xl border border-brand bg-brand px-5 py-2.5 text-sm font-bold text-on-brand hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand" />
    </div>
  );
}
