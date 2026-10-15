'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Icon, Skeleton } from '@/components/ui';
import { SecaoRecolhivel } from '@/components/clientes/SecaoRecolhivel';
import { cn } from '@/lib/cn';
import { formatCurrency, formatDataHoraNegocio } from '@/lib/formatters';
import { buscarTimeline, type FiltroTimeline, type TimelineEvento } from '@/lib/crm';

const ABAS: Array<{ valor: FiltroTimeline; rotulo: string }> = [
  { valor: 'todos', rotulo: 'Todos' },
  { valor: 'agendamentos', rotulo: 'Agendamentos' },
  { valor: 'financeiro', rotulo: 'Financeiro' },
];

export const ICONE_EVENTO: Record<TimelineEvento['tipo'], string> = {
  agendado: 'event',
  concluido: 'check_circle',
  faltou: 'person_off',
  cancelado: 'cancel',
  lembrete: 'chat',
  avaliacao: 'star',
  sinal_pix: 'qr_code_2',
  cadastro: 'person_add',
};

const COR_EVENTO: Record<TimelineEvento['tipo'], string> = {
  agendado: 'bg-tertiary text-surface',
  concluido: 'bg-success text-surface',
  faltou: 'bg-danger text-surface',
  cancelado: 'bg-surface-2 text-muted',
  lembrete: 'bg-whatsapp text-surface',
  avaliacao: 'bg-warning text-surface',
  sinal_pix: 'bg-brand text-on-brand',
  cadastro: 'bg-surface-2 text-ink',
};

function Estrelas({ nota }: { nota: number }) {
  return (
    <span role="img" aria-label={`${nota} de 5 estrelas`} className="mt-1 inline-flex items-center gap-0.5 text-warning">
      {Array.from({ length: 5 }).map((_, i) => (
        <Icon key={i} name="star" size={16} filled={i < nota} className={i < nota ? undefined : 'text-line'} />
      ))}
    </span>
  );
}

export interface LinhaDoTempoClienteProps {
  clienteId: string;
  className?: string;
}

/** Linha do tempo de relacionamento (GET /clients/:id/timeline), filtrável por abas. */
export function LinhaDoTempoCliente({ clienteId, className }: LinhaDoTempoClienteProps) {
  const [filtro, setFiltro] = useState<FiltroTimeline>('todos');
  const [eventos, setEventos] = useState<TimelineEvento[] | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(false);
  // Troca rápida de aba: só a resposta do último pedido vale.
  const ultimoPedido = useRef(0);

  const carregar = useCallback(async () => {
    const pedido = ++ultimoPedido.current;
    setCarregando(true);
    try {
      const r = await buscarTimeline(clienteId, filtro);
      if (pedido !== ultimoPedido.current) return;
      setEventos(r);
      setErro(false);
    } catch {
      if (pedido !== ultimoPedido.current) return;
      setErro(true);
    } finally {
      if (pedido === ultimoPedido.current) setCarregando(false);
    }
  }, [clienteId, filtro]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const abas = (
    <div role="tablist" aria-label="Filtrar linha do tempo" className="flex items-center gap-1 overflow-x-auto rounded-xl bg-surface-2 p-1">
      {ABAS.map((a) => (
        <button
          key={a.valor}
          type="button"
          role="tab"
          aria-selected={filtro === a.valor}
          onClick={() => setFiltro(a.valor)}
          className={cn(
            'min-h-9 whitespace-nowrap rounded-lg px-3 text-[12px] font-semibold transition-colors',
            filtro === a.valor ? 'bg-surface text-ink shadow-sm' : 'text-muted hover:text-ink',
          )}
        >
          {a.rotulo}
        </button>
      ))}
    </div>
  );

  const conteudo = () => {
    if (carregando && eventos === null) {
      return (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" label={i === 0 ? 'Carregando linha do tempo...' : undefined} />
          ))}
        </div>
      );
    }
    if (erro && eventos === null) {
      return (
        <div className="flex flex-col items-center gap-2 py-6 text-center">
          <p className="text-[13px] text-muted">Não foi possível carregar a linha do tempo</p>
          <Button variant="secondary" size="sm" onClick={() => carregar()}>
            Tentar de novo
          </Button>
        </div>
      );
    }
    if (!eventos || eventos.length === 0) {
      return <p className="py-6 text-center text-[13px] text-muted">Nenhum registro neste filtro</p>;
    }
    return (
      <ol
        className={cn(
          "relative space-y-5 pl-8 before:absolute before:bottom-2 before:left-[11px] before:top-2 before:w-[2px] before:bg-line before:content-['']",
          carregando && 'opacity-60',
        )}
      >
        {eventos.map((e, i) => (
          <li key={`${e.tipo}-${e.data}-${i}`} className="relative">
            <span
              className={cn(
                'absolute -left-8 top-1 flex h-6 w-6 items-center justify-center rounded-full ring-4 ring-surface',
                COR_EVENTO[e.tipo],
              )}
            >
              <Icon name={ICONE_EVENTO[e.tipo]} size={14} />
            </span>
            <div className="rounded-xl bg-surface-2/60 p-3.5">
              <div className="flex items-start justify-between gap-2">
                <span className="text-[12px] font-semibold tabular-nums text-muted">{formatDataHoraNegocio(e.data)}</span>
                {e.valor !== null && (
                  <span className="text-[13px] font-bold tabular-nums text-ink">{formatCurrency(e.valor)}</span>
                )}
              </div>
              <h3 className="mt-1 text-[14px] font-bold text-ink">{e.titulo}</h3>
              {e.descricao && <p className="mt-0.5 text-[13px] text-muted">{e.descricao}</p>}
              {e.tipo === 'avaliacao' && typeof e.nota === 'number' && <Estrelas nota={e.nota} />}
            </div>
          </li>
        ))}
      </ol>
    );
  };

  return (
    <SecaoRecolhivel
      titulo="Linha do tempo de relacionamento"
      subtitulo="Histórico de atendimentos, pagamentos e conversas"
      icone="history"
      acao={abas}
      className={className}
    >
      {conteudo()}
    </SecaoRecolhivel>
  );
}
