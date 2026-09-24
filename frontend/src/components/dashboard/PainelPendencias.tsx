'use client';

import { Card, Icon, Button } from '@/components/ui';
import { useToast } from '@/components/Toast';
import { cn } from '@/lib/cn';
import type { HojePendencia } from '@/lib/conteudoDemo';

// Estilo de cada linha (hoje-desktop.html): a ordem das 4 pendências é fixa em
// conteudoDemo.hoje.pendencias, então o tom e o botão são amarrados à posição.
const LINHA_ESTILO: readonly {
  tonIcone: string;
  variant: 'secondary' | 'whatsapp';
  className?: string;
  icone?: string;
}[] = [
  { tonIcone: 'text-brand', variant: 'secondary' },
  { tonIcone: 'text-whatsapp', variant: 'whatsapp', icone: 'send' },
  { tonIcone: 'text-warning', variant: 'secondary', className: 'text-warning-text hover:border-warning/50' },
  { tonIcone: 'text-danger', variant: 'secondary', className: 'text-danger hover:border-danger/40' },
];

// Aviso padrão para ações ainda sem efeito real — mesma linguagem das telas "em
// breve" do produto (EmBreve.tsx), só que como toast em vez de página inteira,
// já que o botão continua clicável dentro da tela Hoje.
const AVISO_RECURSO_A_CAMINHO = 'Esta ação ainda não está disponível — chega em breve.';

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
        <span className="text-[12px] font-medium text-muted">Ações de um clique</span>
      </div>
      <div className="flex flex-col gap-3">
        {pendencias.map((pendencia, index) => {
          const estilo = LINHA_ESTILO[index % LINHA_ESTILO.length];
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
