'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { BrandLogo, Icon } from '@/components/ui';
import { ETAPAS } from '@/lib/onboarding';
import { cn } from '@/lib/cn';
import { lerEscolhaTeste } from '@/lib/escolhaTeste';
import { ConviteCartao } from '@/components/assinatura/ConviteCartao';

// Casca do onboarding (Stitch: docs/design/stitch/onboarding/): marca, teste grátis, as 6 etapas e o progresso.

export function CascaOnboarding({ etapa, titulo, descricao, children, rodape }: {
  etapa: number; titulo: string; descricao?: string; children: ReactNode; rodape: ReactNode;
}) {
  const progresso = Math.round((etapa / ETAPAS.length) * 100);
  // Lida depois de montar: o servidor não conhece o localStorage.
  const [comCartao, setComCartao] = useState(false);
  useEffect(() => setComCartao(lerEscolhaTeste() === 'com_cartao'), []);
  return (
    <div className="app-theme flex min-h-screen flex-col">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
          <span className="flex items-center gap-2 text-lg font-extrabold text-ink">
            <BrandLogo size={28} decorativa />
            <span>EasyAgenda<span className="text-brand">+</span></span>
          </span>
          <span className="flex items-center gap-1.5 rounded-full bg-success/12 px-3 py-1 text-[12px] font-semibold text-success-text">
            <Icon name="verified_user" size={16} /> Teste grátis
          </span>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-32 pt-6">
        {/* Quem escolheu "14 dias com cartão" no cadastro cadastra o cartão aqui, antes de configurar. */}
        {comCartao && (
          <div className="mb-6">
            <ConviteCartao />
          </div>
        )}
        <nav aria-label="Etapas da configuração" className="mb-6">
          <p className="mb-2 flex items-center justify-between text-[13px] font-semibold text-muted">
            <span>Etapa {etapa} de {ETAPAS.length}</span>
            <span>{progresso}% concluído</span>
          </p>
          <div className="h-1.5 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progresso} aria-label="Progresso da configuração">
            <div className="h-full rounded-full bg-brand transition-all" style={{ width: `${progresso}%` }} />
          </div>
          <ol className="mt-3 hidden gap-2 sm:flex">
            {ETAPAS.map((nome, i) => {
              const n = i + 1;
              return (
                <li
                  key={nome}
                  aria-current={n === etapa ? 'step' : undefined}
                  className={cn(
                    'flex flex-1 items-center gap-1.5 text-[12px] font-semibold',
                    n === etapa ? 'text-brand-text' : n < etapa ? 'text-ink' : 'text-muted',
                  )}
                >
                  <span className={cn(
                    'flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px]',
                    n < etapa ? 'bg-success text-on-brand' : n === etapa ? 'bg-brand text-on-brand' : 'bg-surface-2 text-muted',
                  )}>
                    {n < etapa ? <Icon name="check" size={14} /> : n}
                  </span>
                  {n}. {nome}
                </li>
              );
            })}
          </ol>
        </nav>

        <h1 className="text-2xl font-extrabold text-ink sm:text-3xl">{titulo}</h1>
        {descricao && <p className="mt-2 text-[15px] text-muted">{descricao}</p>}
        <div className="mt-6 space-y-6">{children}</div>
      </main>

      <footer className="fixed inset-x-0 bottom-0 border-t border-line bg-surface/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">{rodape}</div>
      </footer>
    </div>
  );
}
