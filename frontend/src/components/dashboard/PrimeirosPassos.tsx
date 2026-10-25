'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, Icon, IconButton } from '@/components/ui';
import { X } from 'lucide-react';
import { onboardingApi, type PrimeiroPasso } from '@/lib/onboarding';

// "Termine de configurar" (fase 6): o que a dona pulou no onboarding. Some quando fica pronto ou é dispensado.

const ICONE: Record<PrimeiroPasso['id'], string> = { pagina: 'storefront', whatsapp: 'chat', pix: 'payments' };

export function PrimeirosPassos({ ativo }: { ativo: boolean }) {
  const [passos, setPassos] = useState<PrimeiroPasso[]>([]);

  useEffect(() => {
    if (!ativo) return;
    let vivo = true;
    onboardingApi.primeirosPassos().then((p) => { if (vivo) setPassos(p); }).catch(() => undefined);
    return () => { vivo = false; };
  }, [ativo]);

  if (!ativo || passos.length === 0) return null;

  const dispensar = () => {
    setPassos([]);
    void onboardingApi.dispensarPrimeirosPassos().catch(() => undefined);
  };

  return (
    <Card className="space-y-3 border-brand/40">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-ink">Termine de configurar</h2>
          <p className="text-[14px] text-muted">Falta pouco para sua agenda rodar sozinha.</p>
        </div>
        <IconButton icon={X} label="Dispensar" onClick={dispensar} />
      </div>
      <ul className="grid gap-2 sm:grid-cols-3">
        {passos.map((p) => (
          <li key={p.id}>
            <Link href={p.href} className="flex items-center gap-3 rounded-control border border-line bg-surface-2 p-3 text-[14px] font-semibold text-ink hover:border-brand">
              <Icon name={ICONE[p.id]} size={20} className="text-brand-text" />
              <span className="flex-1">{p.titulo}</span>
              <Icon name="chevron_right" size={18} className="text-muted" />
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}
