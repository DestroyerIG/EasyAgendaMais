'use client';

import { useState } from 'react';
import { Button, StatusChip, type AppointmentStatus } from '@/components/ui';
import { ROTULO_SEGMENTO, ROTULO_STATUS, type CampanhaDto, type StatusCampanha } from '@/lib/whatsappCampanhas';

// O StatusChip é do kit de agenda: aqui só emprestamos as cores; o texto vem de ROTULO_STATUS.
const COR_STATUS: Record<StatusCampanha, AppointmentStatus> = {
  rascunho: 'aguardando',
  agendada: 'confirmado',
  enviando: 'em_atendimento',
  concluida: 'concluido',
  cancelada: 'cancelado',
};

const dataCurta = (iso: string) => iso.split('-').reverse().join('/');

interface CartaoCampanhaProps {
  campanha: CampanhaDto;
  cancelando: boolean;
  onEditar: () => void;
  /** Resolve quando o cancelamento terminou (com sucesso ou não). */
  onCancelar: () => Promise<void>;
  onDetalhes: () => void;
}

export function CartaoCampanha({ campanha, cancelando, onEditar, onCancelar, onDetalhes }: CartaoCampanhaProps) {
  const [confirmando, setConfirmando] = useState(false);
  const { status } = campanha;
  const rascunho = status === 'rascunho';
  const pct = campanha.total > 0 ? Math.min(100, Math.round((campanha.enviadas / campanha.total) * 100)) : 0;

  return (
    <article className="flex flex-col gap-3 rounded-card border border-line bg-surface p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate text-[15px] font-bold text-ink">{campanha.nome}</h3>
          <p className="text-[13px] text-muted">{ROTULO_SEGMENTO[campanha.segmento]}</p>
        </div>
        <StatusChip status={COR_STATUS[status]} rotulo={ROTULO_STATUS[status]} />
      </div>

      {!rascunho ? (
        <div>
          <div className="mb-1 flex items-center justify-between text-[13px] text-muted">
            <span>Enviadas</span>
            <span className="font-semibold text-ink">{`${campanha.enviadas}/${campanha.total}`}</span>
          </div>
          <div
            className="h-2 overflow-hidden rounded-full bg-surface-2"
            role="progressbar"
            aria-label="Progresso do envio"
            aria-valuemin={0}
            aria-valuemax={campanha.total}
            aria-valuenow={campanha.enviadas}
          >
            <div className="h-full rounded-full bg-brand" style={{ width: `${pct}%` }} />
          </div>
        </div>
      ) : null}

      <p className="text-[13px] text-muted">{`Início: ${dataCurta(campanha.data)} às ${campanha.hora}`}</p>

      {confirmando ? (
        <div className="flex flex-col gap-2 rounded-card border border-danger/30 bg-danger/12 p-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[13px] text-ink">As mensagens que ainda não saíram serão canceladas.</p>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => setConfirmando(false)} disabled={cancelando}>Voltar</Button>
            <Button variant="danger" size="sm" loading={cancelando} onClick={() => { void onCancelar().finally(() => setConfirmando(false)); }}>Sim, cancelar</Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {rascunho ? <Button variant="secondary" size="sm" onClick={onEditar}>Continuar editando</Button> : null}
          {status === 'agendada' || status === 'enviando' ? (
            <Button variant="ghost" size="sm" onClick={() => setConfirmando(true)}>Cancelar envio</Button>
          ) : null}
          {!rascunho ? <Button variant="secondary" size="sm" onClick={onDetalhes}>Ver detalhes</Button> : null}
        </div>
      )}
    </article>
  );
}
