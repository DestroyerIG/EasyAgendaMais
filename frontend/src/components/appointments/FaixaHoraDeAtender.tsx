'use client';

/**
 * Faixa no topo da Agenda: os agendamentos confirmados de hoje cujo horário já chegou e que
 * ainda não começaram, cada um com o botão Iniciar à vista (sem arrastar o cartão). Sai da
 * tela sozinha assim que o atendimento é iniciado, cancelado ou marcado como falta.
 */
import { useEffect, useState } from 'react';
import { cn } from '@/lib/cn';
import { Button, Icon } from '@/components/ui';
import type { Appointment } from '@/types';
import type { AcaoAgendamento } from './acoes';
import { agendamentosNaHora, rotuloDaHora } from './horaDeAtender';

const hojeLocal = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

interface Props {
  agendamentos: Appointment[];
  actionLoading: string | null;
  onAcao: (agendamento: Appointment, acao: AcaoAgendamento) => void;
  onAbrirDetalhes?: (agendamento: Appointment) => void;
}

export function FaixaHoraDeAtender({ agendamentos, actionLoading, onAcao, onAbrirDetalhes }: Props) {
  // O relógio anda sozinho: o selo passa de "Na hora" para "Atrasado" sem recarregar a tela.
  const [agora, setAgora] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setAgora(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  const itens = agendamentosNaHora(agendamentos, hojeLocal(agora), agora.getHours() * 60 + agora.getMinutes());
  if (itens.length === 0) return null;

  return (
    <section aria-label="Hora de atender" className="flex flex-col gap-2 rounded-card border border-brand/40 bg-brand/12 p-3">
      <h2 className="flex items-center gap-2 text-[13px] font-bold text-brand-text">
        <Icon name="notifications_active" size={18} />
        {itens.length === 1 ? 'Chegou a hora de atender' : `Chegou a hora de ${itens.length} atendimentos`}
      </h2>
      <ul className="flex flex-col gap-2">
        {itens.map((item) => {
          const a = item.agendamento;
          return (
            <li key={a.id} className="flex items-center gap-3 rounded-control bg-surface p-2.5">
              <button
                type="button"
                onClick={() => onAbrirDetalhes?.(a)}
                className="flex min-w-0 flex-1 flex-col text-left"
                aria-label={`Ver detalhes do agendamento de ${a.client_name || 'cliente'}`}
              >
                <span className="truncate text-[15px] font-semibold text-ink">
                  {a.time.slice(0, 5)} · {a.client_name || 'Cliente'}
                </span>
                <span className="truncate text-[13px] text-muted">
                  {a.service_name}
                  {a.professional_name ? ` · ${a.professional_name}` : ''}
                </span>
                <span className={cn('mt-1 text-[12px] font-bold', item.atrasado ? 'text-danger' : 'text-brand-text')}>
                  {rotuloDaHora(item)}
                </span>
              </button>
              <Button
                size="sm"
                onClick={() => onAcao(a, 'iniciar')}
                loading={actionLoading === a.id}
                aria-label={`Iniciar atendimento de ${a.client_name || 'cliente'}`}
              >
                <Icon name="play_circle" size={18} /> Iniciar
              </Button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
