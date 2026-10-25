'use client';

import { useState } from 'react';
import { Button, Icon } from '@/components/ui';
import { CascaOnboarding } from './CascaOnboarding';
import { SEGMENTOS_ONBOARDING, type ModoEquipe } from '@/lib/onboarding';
import type { Segmento } from '@/lib/technicalSheetTemplates';
import { cn } from '@/lib/cn';

export function EtapaNegocio({ segmentoInicial, modoInicial, salvando, onSalvar }: {
  segmentoInicial: Segmento | null;
  modoInicial: ModoEquipe | null;
  salvando: boolean;
  onSalvar: (segmento: Segmento, modo: ModoEquipe) => void;
}) {
  const [segmento, setSegmento] = useState<Segmento | null>(segmentoInicial);
  const [modo, setModo] = useState<ModoEquipe | null>(modoInicial);

  return (
    <CascaOnboarding
      etapa={1}
      titulo="Qual é o foco principal do seu negócio?"
      descricao="Vamos personalizar os termos, os modelos de serviço e a ficha das clientes com base no seu segmento."
      rodape={(
        <>
          <span className="text-[13px] text-muted">Você pode mudar isso depois em Ajustes.</span>
          <Button disabled={!segmento || !modo} loading={salvando} onClick={() => segmento && modo && onSalvar(segmento, modo)}>
            Continuar <Icon name="arrow_forward" size={18} />
          </Button>
        </>
      )}
    >
      <div role="radiogroup" aria-label="Segmento" className="grid gap-3 sm:grid-cols-2">
        {SEGMENTOS_ONBOARDING.map((s) => {
          const ativo = segmento === s.id;
          return (
            <button
              key={s.id}
              type="button"
              role="radio"
              aria-checked={ativo}
              onClick={() => setSegmento(s.id)}
              className={cn(
                'flex items-start gap-3 rounded-card border bg-surface p-4 text-left transition-colors',
                ativo ? 'border-brand ring-1 ring-brand' : 'border-line hover:border-brand/50',
              )}
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-control bg-brand/12 text-brand-text">
                <Icon name={s.icone} size={22} />
              </span>
              <span>
                <span className="block font-bold text-ink">{s.titulo}</span>
                <span className="mt-0.5 block text-[13px] text-muted">{s.descricao}</span>
              </span>
            </button>
          );
        })}
      </div>

      <section>
        <h2 className="text-lg font-bold text-ink">Você atende sozinha(o) ou com equipe?</h2>
        <p className="mt-1 text-[14px] text-muted">Quem atende sozinha já sai com o próprio cadastro na agenda.</p>
        <div role="radiogroup" aria-label="Equipe" className="mt-3 grid gap-3 sm:grid-cols-2">
          {([
            { id: 'sozinha', titulo: 'Atendo sozinha(o)', descricao: 'Agenda individual, com você como profissional.', icone: 'person' },
            { id: 'equipe', titulo: 'Tenho equipe', descricao: 'Você cadastra as profissionais depois, em Serviços.', icone: 'groups' },
          ] as const).map((m) => {
            const ativo = modo === m.id;
            return (
              <button
                key={m.id}
                type="button"
                role="radio"
                aria-checked={ativo}
                onClick={() => setModo(m.id)}
                className={cn(
                  'flex items-start gap-3 rounded-card border bg-surface p-4 text-left transition-colors',
                  ativo ? 'border-brand ring-1 ring-brand' : 'border-line hover:border-brand/50',
                )}
              >
                <Icon name={m.icone} size={22} className="mt-0.5 text-brand-text" />
                <span>
                  <span className="block font-bold text-ink">{m.titulo}</span>
                  <span className="mt-0.5 block text-[13px] text-muted">{m.descricao}</span>
                </span>
              </button>
            );
          })}
        </div>
      </section>
    </CascaOnboarding>
  );
}
