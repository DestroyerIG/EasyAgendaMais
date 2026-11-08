'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { BrandLogo, Button } from '@/components/ui';

/** Depois desse tempo sem o painel abrir, oferece recarregar (servidor hibernado, rede lenta). */
export const TEMPO_LIMITE_CARREGANDO_MS = 15000;

/**
 * Cobre a tela entre o login dar certo e o painel abrir de fato. O `router.replace` só dispara
 * a navegação; sem isto o formulário ficava parado na tela parecendo travado.
 * Some sozinha quando a página de login é desmontada.
 */
export function TelaCarregandoPainel({ mensagem = 'Abrindo seu painel…' }: { mensagem?: string }) {
  const [demorando, setDemorando] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setDemorando(true), TEMPO_LIMITE_CARREGANDO_MS);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <div
      role="status"
      aria-live="polite"
      className="app-theme fixed inset-0 z-50 flex flex-col items-center justify-center gap-5 bg-bg px-4 text-center"
    >
      <BrandLogo size={56} priority />
      <Loader2 className="h-8 w-8 animate-spin text-brand" aria-hidden="true" />
      <p className="text-[16px] font-semibold text-ink">{mensagem}</p>
      {demorando && (
        <div className="flex flex-col items-center gap-3">
          <p className="max-w-sm text-[14px] text-muted">Está demorando mais que o normal.</p>
          <Button variant="secondary" onClick={() => window.location.reload()}>
            Tentar novamente
          </Button>
        </div>
      )}
    </div>
  );
}
