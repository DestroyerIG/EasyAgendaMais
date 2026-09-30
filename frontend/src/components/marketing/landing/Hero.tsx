'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowRight, BadgeCheck, CheckCircle2, ShieldCheck, Zap } from 'lucide-react';
import { HeroPhoneMockup } from './HeroPhoneMockup';
import { segments, segmentOrder, type SegmentKey } from './heroSegments';

// Segmentos com página dedicada própria — os demais seguem direto pro cadastro geral.
const segmentLandingHref: Partial<Record<SegmentKey, string>> = {
  unhas: '/nail-designers',
};

export function Hero() {
  const [active, setActive] = useState<SegmentKey>('unhas');
  const dedicatedHref = segmentLandingHref[active];

  return (
    <div className="mx-auto grid max-w-7xl grid-cols-1 gap-10 px-4 sm:px-6 lg:grid-cols-12 lg:items-center lg:gap-8 lg:px-8">
      <div className="flex flex-col gap-6 lg:col-span-7">
        <div className="-mx-4 flex items-center gap-1 overflow-x-auto rounded-2xl px-4 sm:mx-0 sm:w-fit sm:flex-wrap sm:overflow-visible sm:border sm:border-line sm:bg-bg sm:p-1.5 sm:px-1.5">
          {segmentOrder.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setActive(key)}
              className={[
                'shrink-0 rounded-xl px-4 py-2 text-[13px] transition-all',
                active === key
                  ? 'border border-line bg-surface font-bold text-ink shadow-sm'
                  : 'font-semibold text-muted hover:text-ink',
              ].join(' ')}
            >
              {segments[key].label}
            </button>
          ))}
        </div>

        {dedicatedHref && (
          <Link
            href={dedicatedHref}
            className="inline-flex w-fit items-center gap-1.5 text-sm font-semibold text-brand-text hover:underline"
          >
            Atende {segments[active].label.toLowerCase()}? Veja a página feita pra você
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        )}

        <h1 className="text-3xl font-extrabold leading-tight tracking-tight text-ink sm:text-4xl lg:text-[44px]">
          Sua agenda cheia.
          <br />
          Seus clientes voltando.
        </h1>
        <p className="max-w-xl text-base text-muted sm:text-lg">
          Agendamento pelo WhatsApp, sinal via Pix e lembrete na hora da manutenção, enquanto você atende.
        </p>

        <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
          <Link
            href="/cadastro"
            className="inline-flex min-h-[48px] items-center justify-center rounded-2xl bg-brand px-8 py-4 text-sm font-bold text-on-brand shadow-md transition-opacity hover:opacity-90"
          >
            Testar 14 dias grátis
          </Link>
          <div className="flex items-center gap-2 text-muted">
            <ShieldCheck className="h-[18px] w-[18px]" aria-hidden="true" />
            <span className="text-xs">Sem cartão de crédito · Cancele quando quiser</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-6 gap-y-3 pt-2">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-whatsapp" aria-hidden="true" />
            <span className="text-sm font-semibold">Conecta no seu WhatsApp</span>
          </div>
          <div className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-brand" aria-hidden="true" />
            <span className="text-sm font-semibold">Sinal no Pix imediato</span>
          </div>
          <div className="flex items-center gap-2">
            <BadgeCheck className="h-5 w-5 text-status-confirmed" aria-hidden="true" />
            <span className="text-sm font-semibold">Dados protegidos LGPD</span>
          </div>
        </div>
      </div>

      <div className="lg:col-span-5">
        <HeroPhoneMockup data={segments[active]} />
      </div>
    </div>
  );
}
