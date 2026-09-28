'use client';

/**
 * Linha do tempo da Agenda no computador (agenda-desktop.html).
 *
 * Dado real: colunas de profissional, horário, cliente, serviço, valor e status de
 * cada agendamento vêm de GET /appointments; a faixa de horas começa no horário de
 * funcionamento configurado (GET /business/settings) e as vagas livres saem do
 * cruzamento dos dois.
 * Dado de exemplo: a duração de cada atendimento (conteudoDemo.agenda.duracaoPadraoMinutos),
 * porque o DTO de /appointments ainda não devolve a duração do serviço — é ela que
 * define a altura do bloco.
 * Fora da tela: "encaixe inteligente"/"encaixe rápido", bloco de almoço e faixa de
 * "ação química" do arquivo de referência, que dependem de dados e funções que não existem.
 *
 * A referência desenha os blocos em pixels fixos; aqui a posição é sempre calculada:
 * top = (minutos desde o início da faixa / 60) × 80 e height = (duração / 60) × 80,
 * com a altura de uma hora (80px) vinda do arquivo.
 */

import { useEffect, useState } from 'react';
import { cn } from '@/lib/cn';
import { formatCurrency } from '@/lib/formatters';
import { Avatar, Icon, StatusChip, STATUS_STRIPE_CLASS } from '@/components/ui';
import type { Appointment } from '@/types';

/** Altura de uma hora na grade, em pixels (agenda-desktop.html). */
export const ALTURA_HORA = 80;

/** Faixa mínima desenhada, também do arquivo de referência: 08:00 às 20:00. */
export const HORA_INICIO_PADRAO = 8;
export const HORA_FIM_PADRAO = 20;

/** Buraco menor que isso não vira bloco de "livre" — não dá para encaixar nada. */
export const VAGA_MINIMA_MINUTOS = 30;

/** Ícone do canto do bloco por status (agenda-desktop.html). */
const ICONE_STATUS: Record<string, string> = {
  confirmado: 'verified',
  concluido: 'check_circle',
};

/**
 * Um tom por profissional, na ordem da referência: laranja da marca, azul `tertiary`
 * e verde de sucesso, repetindo o ciclo quando houver mais de três.
 */
const TONS_PROFISSIONAL = [
  { fundo: 'bg-brand-text/15', texto: 'text-brand-text', anel: 'ring-brand/20' },
  { fundo: 'bg-tertiary/15', texto: 'text-tertiary', anel: 'ring-tertiary-container/30' },
  { fundo: 'bg-success/15', texto: 'text-success-text', anel: 'ring-success/20' },
] as const;

export const tomDoProfissional = (indice: number) => TONS_PROFISSIONAL[indice % TONS_PROFISSIONAL.length];

/** "09:30:00" → 570. Sem passar por Date, como o resto do painel já faz. */
export const paraMinutos = (hora: string): number => {
  const [h, m] = (hora || '').split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};

/** 570 → "09:30". */
export const paraHoraTexto = (minutos: number): string => {
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

/** 60 → "60 min": a duração embaixo da hora no cartão do celular (agenda-mobile.html). */
export const formatarMinutos = (minutos: number): string => `${minutos} min`;

/**
 * "8h - 19h": o horário de funcionamento do negócio, do jeito que agenda-mobile.html
 * escreve. Com os minutos quando a abertura ou o fechamento não cai na hora cheia.
 */
export const formatarHorarioFuncionamento = (aberturaMinutos: number, fechamentoMinutos: number): string => {
  const hora = (minutos: number) => {
    const h = Math.floor(minutos / 60);
    const m = minutos % 60;
    return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, '0')}`;
  };
  return `${hora(aberturaMinutos)} - ${hora(fechamentoMinutos)}`;
};

/** 30 → "30m"; 60 → "1h"; 90 → "1h30" (formato do bloco de horário livre). */
export const formatarDuracao = (minutos: number): string => {
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h${String(m).padStart(2, '0')}`;
};

/** "08:30 – 10:00", com o travessão do arquivo de referência. */
export const faixaHorariaTexto = (inicioMinutos: number, duracaoMinutos: number): string =>
  `${paraHoraTexto(inicioMinutos)} – ${paraHoraTexto(inicioMinutos + duracaoMinutos)}`;

export interface FaixaHoras {
  horaInicio: number;
  horaFim: number;
  inicioMinutos: number;
  fimMinutos: number;
  horas: number[];
}

/** Horário de funcionamento do negócio, em minutos desde a meia-noite. */
export interface HorarioFuncionamento {
  aberturaMinutos: number;
  fechamentoMinutos: number;
}

/**
 * Faixa de horas desenhada: começa no horário de funcionamento configurado do negócio
 * (GET /business/settings) e se estica quando existe agendamento fora dele. Sem o
 * horário configurado, cai na janela 08:00–20:00 do arquivo de referência, que é o
 * padrão de desenho — nunca uma afirmação sobre o negócio.
 */
export function calcularFaixaHoras(
  agendamentos: Appointment[],
  duracaoPadraoMinutos: number,
  horarioFuncionamento?: HorarioFuncionamento | null,
): FaixaHoras {
  let horaInicio = horarioFuncionamento
    ? Math.floor(horarioFuncionamento.aberturaMinutos / 60)
    : HORA_INICIO_PADRAO;
  let horaFim = horarioFuncionamento
    ? Math.ceil(horarioFuncionamento.fechamentoMinutos / 60)
    : HORA_FIM_PADRAO;

  agendamentos.forEach((agendamento) => {
    const inicio = paraMinutos(agendamento.time);
    horaInicio = Math.min(horaInicio, Math.floor(inicio / 60));
    horaFim = Math.max(horaFim, Math.ceil((inicio + duracaoPadraoMinutos) / 60));
  });

  // O dia acaba às 24:00: um atendimento às 23:30 não pode esticar a régua até "25:00".
  horaInicio = Math.max(0, horaInicio);
  horaFim = Math.min(24, Math.max(horaFim, horaInicio + 1));

  const horas: number[] = [];
  for (let hora = horaInicio; hora <= horaFim; hora += 1) horas.push(hora);

  return { horaInicio, horaFim, inicioMinutos: horaInicio * 60, fimMinutos: horaFim * 60, horas };
}

/** Posição do bloco na grade, em pixels, a partir do horário e da duração. */
export function posicaoDoBloco(
  inicioMinutos: number,
  duracaoMinutos: number,
  faixaInicioMinutos: number,
): { top: number; altura: number } {
  return {
    top: ((inicioMinutos - faixaInicioMinutos) / 60) * ALTURA_HORA,
    altura: (duracaoMinutos / 60) * ALTURA_HORA,
  };
}

export interface VagaLivre {
  inicioMinutos: number;
  duracaoMinutos: number;
}

/**
 * Buracos de pelo menos 30 minutos entre os atendimentos de um profissional, dentro
 * da faixa desenhada. Cancelado não ocupa horário, então o intervalo dele conta como livre.
 *
 * `apenasEntreAtendimentos` deixa de fora o buraco antes do primeiro e depois do último
 * atendimento: é o que a lista do celular mostra (agenda-mobile.html tem uma linha de
 * horário livre no meio da lista, nenhuma nas pontas).
 */
export function calcularVagasLivres(
  agendamentos: Appointment[],
  faixa: FaixaHoras,
  duracaoPadraoMinutos: number,
  opcoes?: { apenasEntreAtendimentos?: boolean },
): VagaLivre[] {
  const apenasEntre = opcoes?.apenasEntreAtendimentos ?? false;
  const ocupados = agendamentos
    .filter((agendamento) => agendamento.status !== 'cancelado')
    .map((agendamento) => {
      const inicio = paraMinutos(agendamento.time);
      return { inicio, fim: inicio + duracaoPadraoMinutos };
    })
    .sort((a, b) => a.inicio - b.inicio);

  const vagas: VagaLivre[] = [];
  let cursor = faixa.inicioMinutos;

  ocupados.forEach(({ inicio, fim }, indice) => {
    const naPonta = apenasEntre && indice === 0;
    if (!naPonta && inicio - cursor >= VAGA_MINIMA_MINUTOS) {
      vagas.push({ inicioMinutos: cursor, duracaoMinutos: inicio - cursor });
    }
    cursor = Math.max(cursor, fim);
  });

  if (!apenasEntre && faixa.fimMinutos - cursor >= VAGA_MINIMA_MINUTOS) {
    vagas.push({ inicioMinutos: cursor, duracaoMinutos: faixa.fimMinutos - cursor });
  }

  return vagas;
}

export interface ColunaProfissional {
  id: string;
  nome: string;
  agendamentos: Appointment[];
}

/** Chave da coluna/chip de um agendamento — a mesma na grade e na peneira dos chips. */
export const chaveProfissional = (agendamento: Appointment): string =>
  agendamento.professional_id || agendamento.professional_name || 'sem-profissional';

/** Uma coluna por profissional que tem agendamento no período, em ordem alfabética. */
export function agruparPorProfissional(agendamentos: Appointment[]): ColunaProfissional[] {
  const colunas = new Map<string, ColunaProfissional>();

  agendamentos.forEach((agendamento) => {
    const nome = agendamento.professional_name || 'Sem profissional';
    const id = chaveProfissional(agendamento);
    const coluna = colunas.get(id) || { id, nome, agendamentos: [] };
    coluna.agendamentos.push(agendamento);
    colunas.set(id, coluna);
  });

  return Array.from(colunas.values())
    .map((coluna) => ({
      ...coluna,
      agendamentos: [...coluna.agendamentos].sort((a, b) => a.time.localeCompare(b.time)),
    }))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

/** "GMT-3" do relógio do aparelho — o rótulo da coluna de horas no arquivo de referência. */
export const fusoTexto = (minutosDeOffset: number): string => {
  const horas = -minutosDeOffset / 60;
  const sinal = horas < 0 ? '-' : '+';
  const inteiro = Math.floor(Math.abs(horas));
  const resto = Math.round((Math.abs(horas) - inteiro) * 60);
  return `GMT${sinal}${inteiro}${resto ? `:${String(resto).padStart(2, '0')}` : ''}`;
};

interface BlocoAgendamentoProps {
  agendamento: Appointment;
  duracaoMinutos: number;
  faixaInicioMinutos: number;
  actionLoading: string | null;
  onStatusChange: (id: string, status: 'concluido' | 'cancelado') => void;
}

function BlocoAgendamento({
  agendamento,
  duracaoMinutos,
  faixaInicioMinutos,
  actionLoading,
  onStatusChange,
}: BlocoAgendamentoProps) {
  const inicioMinutos = paraMinutos(agendamento.time);
  const { top, altura } = posicaoDoBloco(inicioMinutos, duracaoMinutos, faixaInicioMinutos);
  const cancelado = agendamento.status === 'cancelado';
  const podeAgir = agendamento.status === 'confirmado';
  const carregando = actionLoading === agendamento.id;
  const cliente = agendamento.client_name || 'Cliente';

  return (
    <div
      className={cn(
        'group absolute left-1 right-1 flex overflow-hidden rounded-control border shadow-sm transition-shadow',
        cancelado ? 'border-line/50 bg-surface-2/40 opacity-60' : 'border-line bg-surface hover:shadow-md',
      )}
      style={{ top, height: altura }}
    >
      <div className={cn('w-1 shrink-0', STATUS_STRIPE_CLASS[agendamento.status])} />
      <div className="relative flex w-full min-w-0 flex-col justify-between p-2.5">
        <div className="min-w-0">
          <div className="flex items-center justify-between gap-1">
            <span className={cn('text-[11px] font-semibold tabular-nums text-muted', cancelado && 'line-through')}>
              {faixaHorariaTexto(inicioMinutos, duracaoMinutos)}
            </span>
            {cancelado ? (
              <span className="text-[11px] font-semibold text-muted line-through">Cancelado</span>
            ) : (
              <Icon
                name={ICONE_STATUS[agendamento.status]}
                size={16}
                className={agendamento.status === 'concluido' ? 'text-success' : 'text-status-confirmed'}
              />
            )}
          </div>
          <h4
            className={cn(
              'mt-0.5 truncate text-[17px] font-semibold',
              cancelado ? 'text-muted line-through' : 'text-ink',
            )}
          >
            {cliente}
          </h4>
          <p className={cn('truncate text-[14px] text-muted', cancelado && 'line-through')}>
            {agendamento.service_name}
          </p>
        </div>

        <div className="flex items-center justify-between gap-1">
          <span
            className={cn(
              'text-[13px] font-bold tabular-nums',
              cancelado ? 'text-muted line-through' : 'text-ink',
            )}
          >
            {formatCurrency(Number(agendamento.service_price || 0), { cents: false })}
          </span>
          {!cancelado && <StatusChip status={agendamento.status} className="text-[11px]" />}
        </div>

        {/* As mesmas ações do cartão do celular: aparecem no ponteiro e ao receber foco
            pelo teclado, e ficam sem alvo de clique enquanto invisíveis. */}
        {podeAgir && (
          <div className="pointer-events-none absolute right-1.5 top-1.5 flex gap-1 opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100">
            <button
              type="button"
              aria-label={`Concluir atendimento de ${cliente}`}
              disabled={carregando}
              onClick={() => onStatusChange(agendamento.id, 'concluido')}
              className="inline-flex h-6 w-6 items-center justify-center rounded border border-line bg-surface text-success transition-colors hover:bg-success/12 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:opacity-50"
            >
              <Icon name="check_circle" size={16} />
            </button>
            <button
              type="button"
              aria-label={`Cancelar agendamento de ${cliente}`}
              disabled={carregando}
              onClick={() => onStatusChange(agendamento.id, 'cancelado')}
              className="inline-flex h-6 w-6 items-center justify-center rounded border border-line bg-surface text-danger transition-colors hover:bg-danger/12 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:opacity-50"
            >
              <Icon name="cancel" size={16} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

interface BlocoVagaLivreProps {
  vaga: VagaLivre;
  faixaInicioMinutos: number;
  onNovoAgendamento: () => void;
}

function BlocoVagaLivre({ vaga, faixaInicioMinutos, onNovoAgendamento }: BlocoVagaLivreProps) {
  const { top, altura } = posicaoDoBloco(vaga.inicioMinutos, vaga.duracaoMinutos, faixaInicioMinutos);
  const compacto = vaga.duracaoMinutos < 60;
  const duracao = formatarDuracao(vaga.duracaoMinutos);

  // O clique abre o formulário vazio, então o rótulo começa pelo que acontece de fato e
  // deixa o horário como contexto, em vez de prometer um horário já preenchido.
  return (
    <button
      type="button"
      onClick={onNovoAgendamento}
      aria-label={`Novo agendamento: ${paraHoraTexto(vaga.inicioMinutos)}, ${duracao} livre`}
      className="group/vaga absolute left-1.5 right-1.5 flex flex-col items-center justify-center gap-0.5 rounded-control border border-dashed border-line text-muted transition-colors hover:bg-surface-2 hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
      style={{ top: top + 2, height: Math.max(altura - 4, 28) }}
    >
      {compacto ? (
        <span className="flex items-center gap-1 text-[11px] font-bold group-hover/vaga:text-brand-text">
          <Icon name="add" size={16} /> Livre {duracao}
        </span>
      ) : (
        <>
          <Icon name="event_available" size={20} className="group-hover/vaga:text-brand-text" />
          <span className="text-[13px] font-bold group-hover/vaga:text-brand-text">{duracao} livre</span>
          <span className="text-[11px] text-muted">Clique para agendar</span>
        </>
      )}
    </button>
  );
}

export interface LinhaDoTempoProps {
  agendamentos: Appointment[];
  duracaoPadraoMinutos: number;
  /** Horário de funcionamento configurado; sem ele a régua cai na janela do arquivo. */
  horarioFuncionamento?: HorarioFuncionamento | null;
  actionLoading: string | null;
  /** Só o dia de hoje mostra a linha "Agora". */
  mostrarAgora?: boolean;
  onStatusChange: (id: string, status: 'concluido' | 'cancelado') => void;
  onNovoAgendamento: () => void;
  className?: string;
}

export function LinhaDoTempo({
  agendamentos,
  duracaoPadraoMinutos,
  horarioFuncionamento,
  actionLoading,
  mostrarAgora = false,
  onStatusChange,
  onNovoAgendamento,
  className,
}: LinhaDoTempoProps) {
  // O relógio do aparelho só é lido depois da montagem: no servidor ele daria outra
  // hora e outro fuso, e a marca "Agora" apareceria em duas posições diferentes.
  const [relogio, setRelogio] = useState<{ minutos: number; fuso: string } | null>(null);

  useEffect(() => {
    const agora = new Date();
    setRelogio({
      minutos: agora.getHours() * 60 + agora.getMinutes(),
      fuso: fusoTexto(agora.getTimezoneOffset()),
    });
  }, []);

  const colunas = agruparPorProfissional(agendamentos);
  if (colunas.length === 0) return null;

  const faixa = calcularFaixaHoras(agendamentos, duracaoPadraoMinutos, horarioFuncionamento);
  const alturaTotal = (faixa.horaFim - faixa.horaInicio) * ALTURA_HORA;
  const gridTemplateColumns = `68px repeat(${colunas.length}, minmax(0, 1fr))`;
  const agoraVisivel =
    mostrarAgora && relogio !== null && relogio.minutos >= faixa.inicioMinutos && relogio.minutos <= faixa.fimMinutos;

  return (
    <div className={cn('flex flex-col overflow-hidden rounded-card border border-line bg-surface', className)}>
      <div className="sticky top-0 z-20 grid border-b border-line bg-surface-2/60" style={{ gridTemplateColumns }}>
        <div className="flex items-center justify-center p-3 text-center text-[11px] font-bold text-muted">
          {relogio?.fuso}
        </div>
        {colunas.map((coluna, indice) => {
          const tom = tomDoProfissional(indice);
          const total = coluna.agendamentos.length;
          return (
            <div key={coluna.id} className="flex items-center justify-between gap-2 border-l border-line px-4 py-3">
              <div className="flex min-w-0 items-center gap-2.5">
                {/* Decorativo: o nome vem escrito ao lado. */}
                <span aria-hidden="true" className="flex shrink-0">
                  <Avatar
                    name={coluna.nome}
                    size={36}
                    className={cn('text-[13px] font-bold ring-2', tom.fundo, tom.texto, tom.anel)}
                  />
                </span>
                <span className="truncate text-[17px] font-semibold leading-tight text-ink">{coluna.nome}</span>
              </div>
              <span className="shrink-0 rounded-full bg-surface px-2 py-0.5 text-[11px] font-bold tabular-nums text-muted">
                {total} atendimento{total === 1 ? '' : 's'}
              </span>
            </div>
          );
        })}
      </div>

      <div className="relative grid select-none" style={{ gridTemplateColumns, height: alturaTotal }}>
        {/* Grade de fundo: uma linha cheia por hora e uma pontilhada na meia hora. */}
        <div className="pointer-events-none absolute inset-0 flex flex-col" aria-hidden="true">
          {faixa.horas.slice(0, -1).map((hora) => (
            <div key={hora} className="relative h-[80px] border-b border-line/50">
              <div className="absolute top-[40px] w-full border-b border-dashed border-line/30" />
            </div>
          ))}
        </div>

        {agoraVisivel && relogio && (
          <div
            className="pointer-events-none absolute left-0 right-0 z-30 flex items-center"
            style={{ top: ((relogio.minutos - faixa.inicioMinutos) / 60) * ALTURA_HORA }}
          >
            <span className="rounded-r bg-brand px-2 py-0.5 text-[11px] font-bold tabular-nums text-on-brand">
              {paraHoraTexto(relogio.minutos)} Agora
            </span>
            <div className="h-0.5 flex-1 bg-brand" />
          </div>
        )}

        {/* Régua de horas */}
        <div className="relative border-r border-line/70 pr-2 text-right text-[13px] font-semibold tabular-nums text-muted">
          {faixa.horas.map((hora, indice) => (
            <div key={hora} className="absolute right-2" style={{ top: Math.max(indice * ALTURA_HORA - 8, 0) }}>
              {paraHoraTexto(hora * 60)}
            </div>
          ))}
        </div>

        {colunas.map((coluna, indice) => (
          <div
            key={coluna.id}
            className={cn('relative p-1', indice < colunas.length - 1 && 'border-r border-line/70')}
          >
            {calcularVagasLivres(coluna.agendamentos, faixa, duracaoPadraoMinutos).map((vaga) => (
              <BlocoVagaLivre
                key={`vaga-${vaga.inicioMinutos}`}
                vaga={vaga}
                faixaInicioMinutos={faixa.inicioMinutos}
                onNovoAgendamento={onNovoAgendamento}
              />
            ))}
            {coluna.agendamentos.map((agendamento) => (
              <BlocoAgendamento
                key={agendamento.id}
                agendamento={agendamento}
                duracaoMinutos={duracaoPadraoMinutos}
                faixaInicioMinutos={faixa.inicioMinutos}
                actionLoading={actionLoading}
                onStatusChange={onStatusChange}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
