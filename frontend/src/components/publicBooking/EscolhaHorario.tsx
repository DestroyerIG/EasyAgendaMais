'use client';

import { Icon } from '@/components/ui';
import { cn } from '@/lib/cn';
import {
  dataPorExtenso, diaDaSemanaCurto, diaDoMes, formatarDuracao, hojeIso, horaDeTermino, mesEAno,
  proximosDias, separarPorPeriodo,
} from '@/lib/agendamentoPublico';

const DIAS_NA_FAIXA = 14;

function Periodo({
  titulo,
  icone,
  horarios,
  selecionado,
  onEscolher,
}: {
  titulo: string;
  icone: string;
  horarios: string[];
  selecionado: string | null;
  onEscolher: (horario: string) => void;
}) {
  if (horarios.length === 0) return null;
  return (
    <div className="mb-3 rounded-card border border-line bg-surface p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-bg text-muted">
          <Icon name={icone} size={16} />
        </span>
        <span className="text-sm font-bold text-ink">{titulo}</span>
      </div>
      <div className="grid grid-cols-3 gap-2.5">
        {horarios.map((horario) => {
          const ativo = selecionado === horario;
          return (
            <button
              key={horario}
              type="button"
              aria-pressed={ativo}
              onClick={() => onEscolher(horario)}
              className={cn(
                'min-h-[46px] rounded-control text-sm font-bold tabular-nums transition-colors',
                ativo ? 'bg-brand text-on-brand shadow-sm' : 'border border-line/70 bg-bg text-ink hover:bg-surface-2',
              )}
            >
              {horario}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function EscolhaHorario({
  servico,
  profissional,
  data,
  horarios,
  carregando,
  horario,
  onData,
  onHorario,
}: {
  servico: { name: string; price: number; durationMinutes: number };
  profissional: string | undefined;
  data: string;
  horarios: string[];
  carregando: boolean;
  horario: string | null;
  onData: (data: string) => void;
  onHorario: (horario: string) => void;
}) {
  const dias = proximosDias(DIAS_NA_FAIXA);
  const { manha, tarde } = separarPorPeriodo(horarios);
  const preco = servico.price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  return (
    <>
      <div className="flex flex-col gap-3 rounded-card border border-line bg-surface p-4 shadow-sm">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-control bg-brand/10 text-brand-text">
            <Icon name="event_available" size={24} filled />
          </span>
          <div className="flex min-w-0 flex-col">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">Serviço escolhido</span>
            <span className="text-[17px] font-bold leading-tight text-ink">{servico.name}</span>
            <span className="mt-0.5 text-sm tabular-nums text-muted">
              {formatarDuracao(servico.durationMinutes)} · {preco}
            </span>
          </div>
        </div>
        {profissional && (
          <p className="border-t border-line/60 pt-2.5 text-sm text-ink">
            Atendimento com <strong className="font-semibold">{profissional}</strong>
          </p>
        )}
      </div>

      <section className="mt-5">
        <div className="mb-2.5 flex items-center justify-between gap-3">
          <h2 className="text-[18px] font-bold text-ink">Escolha o dia</h2>
          {data && <span className="text-xs font-bold text-brand-text">{mesEAno(data)}</span>}
        </div>
        <div className="-mx-4 flex select-none gap-2.5 overflow-x-auto px-4 pb-2 pt-1 [scrollbar-width:none]">
          {dias.map((dia) => {
            const ativo = data === dia;
            return (
              <button
                key={dia}
                type="button"
                aria-pressed={ativo}
                aria-label={dataPorExtenso(dia)}
                onClick={() => onData(dia)}
                className={cn(
                  'flex h-[74px] w-[68px] shrink-0 flex-col items-center justify-center rounded-card transition-colors',
                  ativo ? 'bg-brand text-on-brand shadow-md' : 'border border-line bg-surface text-ink shadow-sm',
                )}
              >
                <span className={cn('text-xs font-medium', !ativo && 'text-muted')}>{diaDaSemanaCurto(dia)}</span>
                <span className="my-0.5 text-[20px] font-bold tabular-nums">{diaDoMes(dia)}</span>
              </button>
            );
          })}
        </div>
        <label className="mt-2 flex items-center justify-between gap-3 text-[13px] font-semibold text-muted">
          Outra data
          <input
            type="date"
            aria-label="Data do agendamento"
            min={hojeIso()}
            value={data}
            onChange={(e) => onData(e.target.value)}
            className="h-11 rounded-control border border-line bg-surface px-3 text-[15px] text-ink"
          />
        </label>
      </section>

      {data && (
        <section className="mt-5">
          <h2 className="text-[17px] font-bold text-ink">Horários para {dataPorExtenso(data)}</h2>
          {carregando ? (
            <p className="mt-2 text-sm text-muted">Carregando horários...</p>
          ) : horarios.length === 0 ? (
            <p className="mt-2 text-sm text-muted">Nenhum horário livre nesta data. Tente outro dia.</p>
          ) : (
            <>
              <p className="mb-3 text-xs text-muted">Toque no horário de sua preferência</p>
              <Periodo titulo="Manhã" icone="wb_sunny" horarios={manha} selecionado={horario} onEscolher={onHorario} />
              <Periodo titulo="Tarde" icone="light_mode" horarios={tarde} selecionado={horario} onEscolher={onHorario} />
            </>
          )}
          {horario && (
            <div className="flex items-center gap-3 rounded-card border border-line bg-surface p-3.5 shadow-sm">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand/10 text-brand-text">
                <Icon name="schedule" size={18} />
              </span>
              <span className="text-sm leading-snug tabular-nums text-ink">
                Tempo estimado: <strong className="font-semibold">{formatarDuracao(servico.durationMinutes)}</strong> · término previsto às{' '}
                <strong className="font-semibold">{horaDeTermino(horario, servico.durationMinutes)}</strong>
              </span>
            </div>
          )}
        </section>
      )}
    </>
  );
}
