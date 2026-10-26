'use client';

/**
 * Linha do tempo da Agenda no computador (agenda-desktop.html).
 *
 * Dado real: colunas de profissional, horário, cliente, serviço, valor, status e a
 * duração de cada agendamento (service_duration_minutes) vêm de GET /appointments; a
 * faixa de horas começa no horário de funcionamento configurado (GET /business/settings)
 * e as vagas livres saem do cruzamento dos dois. Os blocos são do conjunto que o filtro
 * deixou passar; as colunas, a régua e os buracos são do dia — o filtro de status não
 * desocupa horário. É a duração real de cada atendimento que define a altura do bloco
 * dele — usar uma duração fixa para todos sobrepunha o bloco de um serviço mais curto no
 * do atendimento marcado logo em seguida (achado do usuário).
 * duracaoPadraoMinutos é só fallback técnico para um agendamento sem duração própria (o
 * DTO sempre traz service_duration_minutes). Clicar no bloco abre o painel de detalhes
 * (agendamento-detalhes.html); os botões rápidos do bloco são as ações do status dele
 * (ACOES_POR_STATUS), menos cancelar e voltar para confirmado, que ficam no painel.
 * O almoço de cada profissional (breakStart/breakEnd de GET /business/professionals) é
 * desenhado na coluna dela e conta como horário ocupado nas vagas livres.
 * Fora da tela: "encaixe inteligente"/"encaixe rápido" e faixa de "ação química" do
 * arquivo de referência, que dependem de dados e funções que não existem.
 *
 * A referência desenha os blocos em pixels fixos; aqui a posição é sempre calculada:
 * top = (minutos desde o início da faixa / 60) × alturaHora e
 * height = (duração / 60) × alturaHora — mas alturaHora não é uma constante fixa. Ela se
 * ajusta por dia (calcularAlturaHora), a partir do atendimento real mais curto que a tela
 * vai desenhar naquele dia: no chão (ALTURA_HORA = 80px, o valor do arquivo) quando todos
 * os atendimentos do dia são de 60min ou mais, e só estica o suficiente para o mais curto
 * caber sem cortar texto quando existe um atendimento menor que isso. Uma escala fixa e
 * grande o bastante para qualquer atendimento curto (240px/h) deixava um dia comum (só
 * atendimentos de 60min+) com buracos enormes entre os horários — pior para o usuário do
 * que o problema original (achado do usuário: "ficou muito grande"). E uma altura mínima
 * dissociada do horário (tentada antes) fazia o bloco curto encostar no seguinte. Ajustar
 * a própria régua por dia resolve as duas coisas: nunca corta texto, nunca sobrepõe, e só
 * fica maior que o necessário quando o dia realmente tem um atendimento curto.
 */

import { useEffect, useState } from 'react';
import { cn } from '@/lib/cn';
import { formatCurrency } from '@/lib/formatters';
import { Avatar, Icon, StatusChip, STATUS_STRIPE_CLASS } from '@/components/ui';
import type { Appointment } from '@/types';
import { ACOES_POR_STATUS, ROTULO_ACAO, type AcaoAgendamento } from './acoes';
import { useVocabulario } from '@/hooks/useVocabulario';

/** O que um clique num horário livre já sabe do novo agendamento. */
export interface InicialNovoAgendamento {
  professionalId?: string;
  date?: string;
  time?: string;
}

/** Almoço de cada profissional, por id, em "HH:MM". */
export type IntervalosPorProfissional = Record<string, { inicio: string; fim: string } | undefined>;

/** Horário ocupado que não é atendimento (almoço), em minutos desde a meia-noite. */
export interface Bloqueio {
  inicio: number;
  fim: number;
}

/** "12:00"–"13:00" → { inicio: 720, fim: 780 }; sem intervalo ou com fim antes do início, nada. */
export const bloqueioDoIntervalo = (intervalo?: { inicio: string; fim: string }): Bloqueio | null => {
  if (!intervalo) return null;
  const inicio = paraMinutos(intervalo.inicio);
  const fim = paraMinutos(intervalo.fim);
  return fim > inicio ? { inicio, fim } : null;
};

/** Altura de uma hora na grade quando nenhum atendimento do dia precisa de mais espaço — o valor do arquivo de referência. */
export const ALTURA_HORA = 80;

/**
 * Altura mínima do bloco cheio, em pixels — medida ao vivo (horário+ícone, cliente,
 * serviço, preço+selo, com o padding do arquivo). É o piso que calcularAlturaHora usa para
 * decidir o quanto esticar a régua do dia.
 */
export const ALTURA_MINIMA_BLOCO_PX = 110;

/**
 * Altura de uma hora para o dia sendo desenhado: ALTURA_HORA (compacta) quando todo
 * atendimento do dia já cabe cheio nela, ou o suficiente para o atendimento mais curto do
 * dia não cortar texto, o que for maior. Cancelado conta igual aos outros porque o bloco
 * dele também é desenhado nessa régua (calcularFaixaHoras também não discrimina status).
 */
export function calcularAlturaHora(agendamentos: Appointment[], duracaoPadraoMinutos: number): number {
  if (agendamentos.length === 0) return ALTURA_HORA;
  const duracaoMinima = Math.min(...agendamentos.map((a) => duracaoReal(a, duracaoPadraoMinutos)));
  if (duracaoMinima <= 0) return ALTURA_HORA;
  const necessaria = Math.ceil((ALTURA_MINIMA_BLOCO_PX * 60) / duracaoMinima);
  return Math.max(ALTURA_HORA, necessaria);
}

/** Faixa mínima desenhada, também do arquivo de referência: 08:00 às 20:00. */
export const HORA_INICIO_PADRAO = 8;
export const HORA_FIM_PADRAO = 20;

/** Buraco menor que isso não vira bloco de "livre" — não dá para encaixar nada. */
export const VAGA_MINIMA_MINUTOS = 30;

/** Ícone do canto do bloco por status (agenda-desktop.html). */
const ICONE_STATUS: Record<string, string> = {
  confirmado: 'verified',
  em_atendimento: 'content_cut',
  concluido: 'check_circle',
  faltou: 'person_off',
  aguardando_pagamento: 'hourglass_top',
};

/** Ações que o bloco oferece no hover; cancelar e voltar para confirmado ficam no painel. */
const acoesDoBloco = (status: Appointment['status']): AcaoAgendamento[] =>
  (ACOES_POR_STATUS[status] ?? []).filter((acao) => acao !== 'cancelar' && acao !== 'desfazer_inicio');

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

/**
 * Duração real do atendimento (service_duration_minutes, do GET /appointments) e só na
 * falta dela — agendamento antigo antes deste campo existir — a duração de exemplo.
 * Sem isso todo bloco desenhava com a mesma duração fixa e um serviço mais curto que ela
 * (ex.: 30 min) se sobrepunha ao próximo atendimento marcado logo depois (achado do
 * usuário: cards se sobrepondo com horários próximos).
 */
export const duracaoReal = (agendamento: Appointment, duracaoPadraoMinutos: number): number =>
  agendamento.service_duration_minutes || duracaoPadraoMinutos;

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

/** "08:30 – 10:00", com o travessão do arquivo de referência. Passou da meia-noite, volta para 00h. */
export const faixaHorariaTexto = (inicioMinutos: number, duracaoMinutos: number): string =>
  `${paraHoraTexto(inicioMinutos)} – ${paraHoraTexto((inicioMinutos + duracaoMinutos) % (24 * 60))}`;

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
    horaFim = Math.max(horaFim, Math.ceil((inicio + duracaoReal(agendamento, duracaoPadraoMinutos)) / 60));
  });

  // O dia acaba às 24:00: um atendimento às 23:30 não pode esticar a régua até "25:00".
  horaInicio = Math.max(0, horaInicio);
  horaFim = Math.min(24, Math.max(horaFim, horaInicio + 1));

  const horas: number[] = [];
  for (let hora = horaInicio; hora <= horaFim; hora += 1) horas.push(hora);

  return { horaInicio, horaFim, inicioMinutos: horaInicio * 60, fimMinutos: horaFim * 60, horas };
}

/** Posição do bloco na grade, em pixels, a partir do horário, da duração e da altura de uma hora nesse dia (calcularAlturaHora). */
export function posicaoDoBloco(
  inicioMinutos: number,
  duracaoMinutos: number,
  faixaInicioMinutos: number,
  alturaHora: number = ALTURA_HORA,
): { top: number; altura: number } {
  return {
    top: ((inicioMinutos - faixaInicioMinutos) / 60) * alturaHora,
    altura: (duracaoMinutos / 60) * alturaHora,
  };
}

export interface VagaLivre {
  inicioMinutos: number;
  duracaoMinutos: number;
}

/**
 * Buracos de pelo menos 30 minutos entre os atendimentos de um profissional, dentro
 * da faixa desenhada. Cancelado não ocupa horário, então o intervalo dele conta como livre;
 * os `bloqueios` (almoço) ocupam como um atendimento.
 *
 * `apenasEntreAtendimentos` deixa de fora o buraco antes do primeiro e depois do último
 * atendimento: é o que a lista do celular mostra (agenda-mobile.html tem uma linha de
 * horário livre no meio da lista, nenhuma nas pontas). As pontas são as dos atendimentos,
 * não as do almoço: um almoço antes do primeiro atendimento não abre vaga na ponta.
 */
export function calcularVagasLivres(
  agendamentos: Appointment[],
  faixa: FaixaHoras,
  duracaoPadraoMinutos: number,
  opcoes?: { apenasEntreAtendimentos?: boolean },
  bloqueios: Bloqueio[] = [],
): VagaLivre[] {
  const apenasEntre = opcoes?.apenasEntreAtendimentos ?? false;
  const atendimentos = agendamentos
    .filter((agendamento) => agendamento.status !== 'cancelado')
    .map((agendamento) => {
      const inicio = paraMinutos(agendamento.time);
      return { inicio, fim: inicio + duracaoReal(agendamento, duracaoPadraoMinutos) };
    });
  const primeiroInicio = Math.min(...atendimentos.map((a) => a.inicio));
  const ultimoFim = Math.max(...atendimentos.map((a) => a.fim));
  const ocupados = [...atendimentos, ...bloqueios].sort((a, b) => a.inicio - b.inicio);

  const vagas: VagaLivre[] = [];
  let cursor = faixa.inicioMinutos;

  ocupados.forEach(({ inicio, fim }) => {
    // Na lista do celular só vale buraco que tem atendimento dos dois lados.
    const naPonta = apenasEntre && (cursor < primeiroInicio || inicio > ultimoFim);
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
export function agruparPorProfissional(agendamentos: Appointment[], semProfissional = 'Sem profissional'): ColunaProfissional[] {
  const colunas = new Map<string, ColunaProfissional>();

  agendamentos.forEach((agendamento) => {
    const nome = agendamento.professional_name || semProfissional;
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
  alturaHora: number;
  actionLoading: string | null;
  onAcao: (agendamento: Appointment, acao: AcaoAgendamento) => void;
  /** Abre o painel de detalhes (agendamento-detalhes.html). Sem ela o bloco só informa. */
  onAbrirDetalhes?: (agendamento: Appointment) => void;
}

function BlocoAgendamento({
  agendamento,
  duracaoMinutos,
  faixaInicioMinutos,
  alturaHora,
  actionLoading,
  onAcao,
  onAbrirDetalhes,
}: BlocoAgendamentoProps) {
  const inicioMinutos = paraMinutos(agendamento.time);
  const { top, altura } = posicaoDoBloco(inicioMinutos, duracaoMinutos, faixaInicioMinutos, alturaHora);
  const cancelado = agendamento.status === 'cancelado';
  const acoes = acoesDoBloco(agendamento.status);
  const carregando = actionLoading === agendamento.id;
  const cliente = agendamento.client_name || 'Cliente';

  return (
    <div
      className={cn(
        'group absolute left-1 right-1 flex overflow-hidden rounded-control border transition-shadow',
        cancelado ? 'border-line/50 bg-surface-2/40 opacity-60' : 'border-line bg-surface hover:shadow-md',
      )}
      style={{ top, height: altura }}
    >
      <div className={cn('w-1 shrink-0', STATUS_STRIPE_CLASS[agendamento.status])} />
      <div className="relative flex w-full min-w-0 flex-col justify-between p-2.5">
        {/* Alvo de clique do bloco inteiro: cobre o texto (que não é interativo) e fica
            por baixo das ações rápidas, que são absolutas com z-10. Sem ele o bloco
            precisaria virar um botão com botões dentro. */}
        {onAbrirDetalhes && (
          <button
            type="button"
            aria-label={`Ver detalhes do agendamento de ${cliente}`}
            onClick={() => onAbrirDetalhes(agendamento)}
            className="absolute inset-0 cursor-pointer rounded-control focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand"
          />
        )}
        <div className="pointer-events-none min-w-0">
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
          <p
            className={cn(
              'truncate text-muted',
              cancelado ? 'text-[11px] font-semibold line-through' : 'text-[14px]',
            )}
          >
            {agendamento.service_name}
          </p>
        </div>

        <div className="pointer-events-none flex items-center justify-between gap-1">
          <span
            className={cn(
              'tabular-nums',
              cancelado ? 'text-[11px] font-semibold text-muted line-through' : 'text-[13px] font-bold text-ink',
            )}
          >
            {formatCurrency(Number(agendamento.service_price || 0), { cents: false })}
          </span>
          {!cancelado && <StatusChip status={agendamento.status} className="px-2 text-[11px]" />}
        </div>

        {/* Ações do status (ACOES_POR_STATUS, menos cancelar e voltar, que ficam no
            painel): aparecem no ponteiro e ao receber foco pelo teclado, e ficam sem alvo
            de clique enquanto invisíveis. */}
        {acoes.length > 0 && (
          <div className="pointer-events-none absolute right-1.5 top-1.5 z-10 flex gap-1 opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100">
            {acoes.map((acao) => (
              <button
                key={acao}
                type="button"
                aria-label={`${ROTULO_ACAO[acao].texto} de ${cliente}`}
                title={ROTULO_ACAO[acao].texto}
                disabled={carregando}
                onClick={() => onAcao(agendamento, acao)}
                className={cn(
                  'inline-flex h-6 w-6 items-center justify-center rounded border border-line bg-surface transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:opacity-50',
                  acao === 'iniciar' && 'text-brand-text hover:bg-brand/12',
                  acao === 'concluir' && 'text-success hover:bg-success/12',
                  acao === 'faltou' && 'text-danger hover:bg-danger/12',
                )}
              >
                <Icon name={ROTULO_ACAO[acao].icone} size={16} />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

interface BlocoVagaLivreProps {
  vaga: VagaLivre;
  faixaInicioMinutos: number;
  alturaHora: number;
  /** Profissional da coluna e data do dia, que vão preenchidas no formulário. */
  professionalId?: string;
  data?: string;
  onNovoAgendamento: (inicial?: InicialNovoAgendamento) => void;
}

function BlocoVagaLivre({
  vaga,
  faixaInicioMinutos,
  alturaHora,
  professionalId,
  data,
  onNovoAgendamento,
}: BlocoVagaLivreProps) {
  const { top, altura } = posicaoDoBloco(vaga.inicioMinutos, vaga.duracaoMinutos, faixaInicioMinutos, alturaHora);
  const compacto = vaga.duracaoMinutos < 60;
  const duracao = formatarDuracao(vaga.duracaoMinutos);

  // O clique abre o formulário com a profissional da coluna, a data do dia e o horário
  // da vaga (selecionado quando ele está entre os horários disponíveis). O rótulo começa
  // pelo que acontece de fato e deixa o horário como contexto.
  return (
    <button
      type="button"
      onClick={() => onNovoAgendamento({ professionalId, date: data, time: paraHoraTexto(vaga.inicioMinutos) })}
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
  /** O que a grade desenha em bloco: o conjunto filtrado, como a lista do celular. */
  agendamentos: Appointment[];
  /**
   * O dia de onde sai a geometria da grade — colunas, régua de horas e buracos —, com o
   * filtro de profissional aplicado e o de status não. Buraco e horário de funcionamento
   * são fatos sobre o dia: tirados do conjunto filtrado, um filtro de status desenharia
   * "livre" em cima de um atendimento que existe e está só escondido, e encolheria a
   * régua. Sem a prop, vale o próprio `agendamentos`, como era.
   */
  agendamentosDoDia?: Appointment[];
  /**
   * Ids das profissionais do período, em ordem alfabética do conjunto inteiro. O tom de
   * cada uma sai da posição dela aqui, e não do índice da coluna, senão a mesma pessoa
   * pintaria de uma cor no chip e de outra na coluna quando um filtro tira alguém do
   * meio. Sem a prop, vale o índice local da coluna, como era.
   */
  ordemProfissionais?: string[];
  duracaoPadraoMinutos: number;
  /** Horário de funcionamento configurado; sem ele a régua cai na janela do arquivo. */
  horarioFuncionamento?: HorarioFuncionamento | null;
  actionLoading: string | null;
  /** Só o dia de hoje mostra a linha "Agora". */
  mostrarAgora?: boolean;
  onAcao: (agendamento: Appointment, acao: AcaoAgendamento) => void;
  onNovoAgendamento: (inicial?: InicialNovoAgendamento) => void;
  /** Almoço de cada profissional, por id: desenhado na coluna e ocupado nas vagas. */
  intervalos?: IntervalosPorProfissional;
  /** Clique no bloco abre o painel de detalhes (agendamento-detalhes.html). */
  onAbrirDetalhes?: (agendamento: Appointment) => void;
  className?: string;
}

export function LinhaDoTempo({
  agendamentos,
  agendamentosDoDia,
  ordemProfissionais,
  duracaoPadraoMinutos,
  horarioFuncionamento,
  actionLoading,
  mostrarAgora = false,
  onAcao,
  onNovoAgendamento,
  intervalos,
  onAbrirDetalhes,
  className,
}: LinhaDoTempoProps) {
  // O relógio do aparelho só é lido depois da montagem: no servidor ele daria outra
  // hora e outro fuso, e a marca "Agora" apareceria em duas posições diferentes.
  const { prof } = useVocabulario();
  const [relogio, setRelogio] = useState<{ minutos: number; fuso: string } | null>(null);

  useEffect(() => {
    const agora = new Date();
    setRelogio({
      minutos: agora.getHours() * 60 + agora.getMinutes(),
      fuso: fusoTexto(agora.getTimezoneOffset()),
    });
  }, []);

  // A grade é do dia; os blocos são do conjunto filtrado. Uma coluna existe porque a
  // pessoa tem dia, não porque sobrou atendimento dela depois do filtro: a agenda dela
  // continua com os mesmos buracos, e apagar a coluna esconderia esses buracos.
  const doDia = agendamentosDoDia ?? agendamentos;
  const colunas = agruparPorProfissional(doDia, `Sem ${prof.s}`);
  if (colunas.length === 0) return null;

  /** Os blocos de cada coluna: só os atendimentos que passaram pelo filtro. */
  const listadosPorColuna = new Map(
    agruparPorProfissional(agendamentos).map((coluna) => [coluna.id, coluna.agendamentos]),
  );

  /** O tom é da pessoa, não da posição da coluna nesta lista já peneirada. */
  const tomDaColuna = (id: string, indiceLocal: number) => {
    const posicao = ordemProfissionais?.indexOf(id) ?? -1;
    return tomDoProfissional(posicao >= 0 ? posicao : indiceLocal);
  };

  const faixa = calcularFaixaHoras(doDia, duracaoPadraoMinutos, horarioFuncionamento);
  // Só os blocos que a tela desenha (agendamentos, não doDia) precisam de espaço — a régua
  // se ajusta ao atendimento real mais curto entre eles, não ao dia inteiro sem filtro.
  const alturaHora = calcularAlturaHora(agendamentos, duracaoPadraoMinutos);
  const alturaTotal = (faixa.horaFim - faixa.horaInicio) * alturaHora;
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
          const tom = tomDaColuna(coluna.id, indice);
          // A pílula conta o que a coluna desenha, como "N agendamentos" do cabeçalho:
          // com um filtro ligado ela pode ler "0 atendimentos" sobre o dia da pessoa.
          const total = listadosPorColuna.get(coluna.id)?.length ?? 0;
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
            <div key={hora} className="relative border-b border-line/50" style={{ height: alturaHora }}>
              <div className="absolute w-full border-b border-dashed border-line/30" style={{ top: alturaHora / 2 }} />
            </div>
          ))}
        </div>

        {agoraVisivel && relogio && (
          <div
            className="pointer-events-none absolute left-0 right-0 z-30 flex items-center"
            style={{ top: ((relogio.minutos - faixa.inicioMinutos) / 60) * alturaHora }}
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
            <div key={hora} className="absolute right-2" style={{ top: Math.max(indice * alturaHora - 8, 0) }}>
              {paraHoraTexto(hora * 60)}
            </div>
          ))}
        </div>

        {colunas.map((coluna, indice) => {
          const almoco = bloqueioDoIntervalo(intervalos?.[coluna.id]);
          const posicaoAlmoco = almoco
            ? posicaoDoBloco(almoco.inicio, almoco.fim - almoco.inicio, faixa.inicioMinutos, alturaHora)
            : null;
          return (
          <div
            key={coluna.id}
            className={cn('relative p-1', indice < colunas.length - 1 && 'border-r border-line/70')}
          >
            {posicaoAlmoco && (
              // Almoço da profissional (agenda-desktop.html: bloco listrado com "Almoço").
              // O listrado do arquivo é cor fixa; aqui fica o tracejado com tokens.
              <div
                className="absolute left-1 right-1 flex items-center justify-center overflow-hidden rounded-control border border-dashed border-line bg-surface-2"
                style={{ top: posicaoAlmoco.top, height: posicaoAlmoco.altura }}
              >
                <span className="flex items-center gap-1.5 rounded-md border border-line bg-surface px-3 py-1 text-[12px] font-semibold text-muted">
                  <Icon name="restaurant" size={16} />
                  Almoço
                </span>
              </div>
            )}
            {calcularVagasLivres(
              coluna.agendamentos,
              faixa,
              duracaoPadraoMinutos,
              undefined,
              almoco ? [almoco] : [],
            ).map((vaga) => (
              <BlocoVagaLivre
                key={`vaga-${vaga.inicioMinutos}`}
                vaga={vaga}
                faixaInicioMinutos={faixa.inicioMinutos}
                alturaHora={alturaHora}
                professionalId={coluna.agendamentos[0]?.professional_id || undefined}
                data={coluna.agendamentos[0]?.date.substring(0, 10)}
                onNovoAgendamento={onNovoAgendamento}
              />
            ))}
            {(listadosPorColuna.get(coluna.id) ?? []).map((agendamento) => (
              <BlocoAgendamento
                key={agendamento.id}
                agendamento={agendamento}
                duracaoMinutos={duracaoReal(agendamento, duracaoPadraoMinutos)}
                faixaInicioMinutos={faixa.inicioMinutos}
                alturaHora={alturaHora}
                actionLoading={actionLoading}
                onAcao={onAcao}
                onAbrirDetalhes={onAbrirDetalhes}
              />
            ))}
          </div>
          );
        })}
      </div>
    </div>
  );
}
