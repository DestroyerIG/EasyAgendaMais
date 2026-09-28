'use client';

import { AVISO_RECURSO_A_CAMINHO, Card, Icon, Button } from '@/components/ui';
import { useToast } from '@/components/Toast';
import { cn } from '@/lib/cn';
import type { HojePendencia } from '@/lib/conteudoDemo';

// Estilo de cada linha (hoje-desktop.html), preso ao `tom` da própria pendência — não à
// posição dela na lista, que muda de tamanho quando a vaga real de tarde existe ou não
// (DashboardPage antepõe essa pendência real às de exemplo só quando há vaga de verdade).
const ESTILO_POR_TOM: Record<
  HojePendencia['tom'],
  { tonIcone: string; variant: 'secondary' | 'whatsapp'; className?: string; icone?: string }
> = {
  brand: { tonIcone: 'text-brand', variant: 'secondary' },
  whatsapp: { tonIcone: 'text-whatsapp', variant: 'whatsapp', icone: 'send' },
  warning: { tonIcone: 'text-warning', variant: 'secondary', className: 'text-warning-text hover:border-warning/50' },
  danger: { tonIcone: 'text-danger', variant: 'secondary', className: 'text-danger hover:border-danger/40' },
};

export interface PainelPendenciasProps {
  pendencias: readonly HojePendencia[];
  className?: string;
}

export function PainelPendencias({ pendencias, className }: PainelPendenciasProps) {
  const { showToast } = useToast();
  const handleAcao = () => showToast(AVISO_RECURSO_A_CAMINHO, 'info');

  return (
    <Card className={cn('flex flex-col gap-4', className)}>
      <div className="flex items-center justify-between gap-3 border-b border-line pb-3">
        <div className="flex items-center gap-2">
          <h2 className="text-[16px] font-bold text-ink">Precisa de você</h2>
          <span className="rounded-full bg-brand/15 px-2 py-0.5 text-[11px] font-bold text-ink">
            {pendencias.length} pendências
          </span>
        </div>
        <span className="text-[12px] font-medium text-muted">
          {/* hoje-mobile.html diz "Ações rápidas"; hoje-desktop.html diz "Ações de um
              clique" — cada arquivo com a própria palavra, como no resto da tela. */}
          <span className="lg:hidden">Ações rápidas</span>
          <span className="hidden lg:inline">Ações de um clique</span>
        </span>
      </div>
      <div className="flex flex-col gap-3">
        {pendencias.map((pendencia) => {
          const estilo = ESTILO_POR_TOM[pendencia.tom];
          return (
            <div
              key={pendencia.titulo}
              className="flex flex-col gap-3 rounded-xl border border-line/50 bg-surface-2/60 p-3.5 transition-colors hover:bg-surface-2 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex min-w-0 items-center gap-3">
                <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-surface-2 ${estilo.tonIcone}`}>
                  <Icon name={pendencia.icone} size={20} />
                </div>
                <div className="flex min-w-0 flex-col">
                  <span className="truncate text-[13px] font-bold text-ink">{pendencia.titulo}</span>
                  <span className="text-[12px] text-muted">{pendencia.descricao}</span>
                </div>
              </div>
              <Button
                variant={estilo.variant}
                size="sm"
                className={`shrink-0 ${estilo.className ?? ''}`}
                onClick={handleAcao}
              >
                {estilo.icone ? <Icon name={estilo.icone} size={15} /> : null}
                {pendencia.rotuloBotao}
              </Button>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
