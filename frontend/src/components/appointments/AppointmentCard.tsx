'use client';

/**
 * Cartão de agendamento da Agenda no celular (agenda-mobile.html).
 *
 * Dado real: horário, cliente, valor, serviço, profissional e status vêm de
 * GET /appointments; as duas ações do gesto saem de ACOES_DO_GESTO e chamam o mesmo
 * `onAcao` da linha do tempo e do painel. Um toque parado no corpo do cartão abre o
 * painel de detalhes (agendamento-detalhes.html) — arrastar não abre.
 * Dado real: a duração embaixo do horário é a do serviço (service_duration_minutes,
 * GET /appointments), sem duração de exemplo.
 * Fora da tela: o "encaixe rápido" e a ação de cobrar sinal por Pix do arquivo de
 * referência, que dependem de funções que não existem.
 *
 * `CorpoCartaoAgendamento` é compartilhado com a agenda de um profissional só
 * (ProfessionalAgenda.tsx), que não tem arquivo de referência. Na base (aed10f1) essa
 * tela mostrava só hora, faixa de status, cliente, serviço e selo de status — sem
 * duração, preço ou nome do profissional. `mostrarDuracaoEPreco` e
 * `mostrarNomeProfissional` (default `true`, ligados só na Agenda) existem para
 * ProfessionalAgenda.tsx poder desligar os três e voltar exatamente a esse estado, sem
 * mudar as telas que estão dentro do escopo desta migração (correção I9).
 *
 * A ação vermelha do arquivo de referência ("Marcar Falta") agora existe de verdade: o
 * status `faltou` é aceito por PUT /appointments/:id/status.
 *
 * Selo "Confirmou pelo WhatsApp" (2C-2b): aparece quando `client_confirmed_at` existe,
 * junto do botão de WhatsApp (desligado na agenda de um profissional só, como ele).
 */

import {
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { formatCurrency } from '@/lib/formatters';
import { cn } from '@/lib/cn';
import { linkWhatsapp } from '@/lib/whatsapp';
import { Icon, StatusChip, STATUS_STRIPE_CLASS } from '@/components/ui';
import { SeloProntaParaCobrar } from '@/components/comanda/SeloProntaParaCobrar';
import { formatarDuracao, formatarMinutos, paraMinutos, paraHoraTexto } from './LinhaDoTempo';
import type { Appointment } from '@/types';
import { ROTULO_ACAO, type AcaoAgendamento } from './acoes';

interface AcaoDoGesto {
  acao: AcaoAgendamento;
  /** Texto curto que cabe na abertura do gesto. */
  texto: string;
  classe: string;
}

/**
 * As duas ações do gesto por status. Confirmado: iniciar (esquerda) e cliente faltou
 * (direita). Em atendimento: concluir, que abre a comanda (esquerda), e voltar para
 * confirmado (direita). Cancelar fica no painel de detalhes.
 */
export const ACOES_DO_GESTO: Partial<Record<Appointment['status'], { esquerda: AcaoDoGesto; direita: AcaoDoGesto }>> = {
  confirmado: {
    esquerda: { acao: 'iniciar', texto: 'Iniciar', classe: 'bg-brand text-on-brand' },
    direita: { acao: 'faltou', texto: 'Faltou', classe: 'bg-danger text-surface' },
  },
  em_atendimento: {
    esquerda: { acao: 'concluir', texto: 'Concluir', classe: 'bg-success text-surface' },
    direita: { acao: 'desfazer_inicio', texto: 'Voltar', classe: 'bg-surface-2 text-ink' },
  },
};

/** Arrasto máximo e ponto de virada do gesto, em pixels (agenda-mobile.html). */
export const LIMITE_ARRASTE = 120;
export const VIRADA_ARRASTE = 60;
export const ABERTURA_ARRASTE = 80;

/**
 * Até quantos pixels o ponteiro pode andar e o toque ainda valer como clique. O gesto de
 * arrastar já existia no cartão: sem esse limite, todo arrasto também abriria o painel
 * de detalhes.
 */
export const LIMITE_CLIQUE = 6;

/** O ponteiro praticamente não andou entre o toque e o solte? */
export const ehClique = (dx: number, dy: number): boolean =>
  Math.abs(dx) <= LIMITE_CLIQUE && Math.abs(dy) <= LIMITE_CLIQUE;

/** Onde o cartão para quando o dedo sai: aberto num dos lados ou de volta ao lugar. */
export function encaixarArraste(deslocamento: number): number {
  if (deslocamento > VIRADA_ARRASTE) return ABERTURA_ARRASTE;
  if (deslocamento < -VIRADA_ARRASTE) return -ABERTURA_ARRASTE;
  return 0;
}

interface CorpoCartaoProps {
  appointment: Appointment;
  duracaoMinutos: number;
  /**
   * "60 min" embaixo do horário, como agenda-mobile.html escreve. Sem ela fica o "1h"
   * de antes, porque a agenda de um profissional só não tem arquivo de referência e a
   * especificação manda deixar tela sem referência exatamente como está.
   */
  duracaoEmMinutos?: boolean;
  /** Bolinha na cor do status antes do rótulo, também só de agenda-mobile.html. */
  comPontoDeStatus?: boolean;
  /**
   * Duração (embaixo do horário) e preço (ao lado do nome do cliente) do arquivo de
   * referência. Default `true` para a Agenda, que está dentro do escopo desta migração;
   * `false` restaura o comportamento da base (aed10f1) na agenda de um profissional só,
   * que não tem arquivo de referência (correção I9 da revisão final).
   */
  mostrarDuracaoEPreco?: boolean;
  /** Nome do profissional ao lado do serviço, também só do arquivo de referência. */
  mostrarNomeProfissional?: boolean;
  /**
   * Botão de notificar o cliente via WhatsApp ao lado do selo de status
   * (agenda-mobile.html, achado da varredura de telas). Mesma função `linkWhatsapp` já
   * usada em outras telas — só aparece quando o telefone é válido. Default `true` para
   * a Agenda; `false` na agenda de um profissional só (correção I9).
   */
  mostrarWhatsapp?: boolean;
}

/** A cliente respondeu "1" à confirmação automática (client_confirmed_at). */
export function SeloConfirmouWhatsapp({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex min-w-0 items-center gap-1 rounded-full bg-whatsapp/12 px-2 py-0.5 text-[11px] font-bold text-whatsapp',
        className,
      )}
    >
      <Icon name="verified" size={14} className="shrink-0" />
      <span className="truncate">Confirmou pelo WhatsApp</span>
    </span>
  );
}

/** Miolo do cartão, compartilhado com a agenda de um profissional só. */
export function CorpoCartaoAgendamento({
  appointment,
  duracaoMinutos,
  duracaoEmMinutos = false,
  comPontoDeStatus = false,
  mostrarDuracaoEPreco = true,
  mostrarNomeProfissional = true,
  mostrarWhatsapp = true,
}: CorpoCartaoProps) {
  const inicioMinutos = paraMinutos(appointment.time);
  const cancelado = appointment.status === 'cancelado';
  const whatsapp =
    mostrarWhatsapp && appointment.status === 'confirmado' ? linkWhatsapp(appointment.client_phone) : null;

  return (
    <>
      <div className="flex min-w-[56px] flex-col items-center justify-center text-center">
        <span className="text-[24px] font-bold leading-none tracking-tight tabular-nums text-ink">
          {paraHoraTexto(inicioMinutos)}
        </span>
        {mostrarDuracaoEPreco && (
          <span className="mt-1 text-[11px] font-semibold tabular-nums text-muted">
            {duracaoEmMinutos ? formatarMinutos(duracaoMinutos) : formatarDuracao(duracaoMinutos)}
          </span>
        )}
      </div>
      <div className={cn('w-1 shrink-0 self-stretch rounded-full', STATUS_STRIPE_CLASS[appointment.status])} />
      <div className="flex min-w-0 flex-1 flex-col justify-center">
        <div className="flex items-center justify-between gap-2">
          <h3 className={cn('truncate text-[17px] font-semibold text-ink', cancelado && 'line-through')}>
            {appointment.client_name}
          </h3>
          {mostrarDuracaoEPreco && (
            <span className="shrink-0 text-[17px] font-bold tabular-nums text-ink">
              {formatCurrency(Number(appointment.service_price || 0), { cents: false })}
            </span>
          )}
        </div>
        <div className="mt-0.5 flex items-center gap-1.5">
          <span className="truncate text-[14px] text-ink">{appointment.service_name}</span>
          {mostrarNomeProfissional && appointment.professional_name && (
            <>
              <span className="text-muted">·</span>
              <span className="truncate text-[13px] font-semibold text-muted">{appointment.professional_name}</span>
            </>
          )}
        </div>
        <div className="mt-2 flex items-center gap-1.5">
          <StatusChip status={appointment.status} comPonto={comPontoDeStatus} className="px-2 text-[11px]" />
          {mostrarWhatsapp && appointment.client_confirmed_at && !cancelado && <SeloConfirmouWhatsapp />}
          {appointment.comanda_status === 'rascunho' && appointment.comanda_enviada_recepcao_em && <SeloProntaParaCobrar />}
          {whatsapp && (
            // O corpo do cartão inteiro escuta pointerdown/up para o gesto de arrastar
            // e para abrir o painel de detalhes num toque parado (AppointmentCard.tsx) —
            // sem parar a propagação aqui, tocar neste link também abriria o painel.
            <a
              href={whatsapp}
              target="_blank"
              rel="noopener noreferrer"
              onPointerDown={(evento) => evento.stopPropagation()}
              onPointerUp={(evento) => evento.stopPropagation()}
              aria-label={`Notificar ${appointment.client_name || 'cliente'} via WhatsApp`}
              className="ml-auto flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-whatsapp/10 text-whatsapp"
            >
              <Icon name="chat" size={16} />
            </a>
          )}
        </div>
      </div>
    </>
  );
}

interface AppointmentCardProps {
  appointment: Appointment;
  actionLoading: string | null;
  duracaoMinutos: number;
  onAcao: (agendamento: Appointment, acao: AcaoAgendamento) => void;
  /**
   * Abre o painel de detalhes (agendamento-detalhes.html). Só dispara quando o ponteiro
   * praticamente não andou: o corpo do cartão também é a área do gesto de arrastar.
   */
  onAbrirDetalhes?: (appointment: Appointment) => void;
}

export function AppointmentCard({
  appointment,
  actionLoading,
  duracaoMinutos,
  onAcao,
  onAbrirDetalhes,
}: AppointmentCardProps) {
  const isLoading = actionLoading === appointment.id;
  // Só confirmado e em atendimento têm as duas ações do gesto; nos outros não há o que
  // revelar (cancelar fica no painel de detalhes).
  const gesto = ACOES_DO_GESTO[appointment.status];
  const podeAgir = gesto !== undefined;
  const cliente = appointment.client_name || 'Cliente';

  const [deslocamento, setDeslocamento] = useState(0);
  const [arrastando, setArrastando] = useState(false);
  const origemRef = useRef<number | null>(null);
  // Onde o toque começou, guardado mesmo no cartão sem ações (concluído, cancelado), que
  // não arrasta mas continua abrindo o painel.
  const toqueRef = useRef<{ x: number; y: number } | null>(null);
  // Se o cartão já estava aberto (arrastado) quando o toque começou: nesse caso um toque
  // parado fecha o cartão em vez de abrir o painel.
  const abertoNoToqueRef = useRef(false);

  const abrirDetalhes = () => onAbrirDetalhes?.(appointment);

  const iniciarArraste = (evento: ReactPointerEvent<HTMLDivElement>) => {
    toqueRef.current = { x: evento.clientX, y: evento.clientY };
    abertoNoToqueRef.current = deslocamento !== 0;
    if (!podeAgir) return;
    origemRef.current = evento.clientX - deslocamento;
    setArrastando(true);
    evento.currentTarget.setPointerCapture?.(evento.pointerId);
  };

  const moverArraste = (evento: ReactPointerEvent<HTMLDivElement>) => {
    if (origemRef.current === null) return;
    const x = evento.clientX - origemRef.current;
    setDeslocamento(Math.max(-LIMITE_ARRASTE, Math.min(LIMITE_ARRASTE, x)));
  };

  const soltarArraste = (evento: ReactPointerEvent<HTMLDivElement>) => {
    const toque = toqueRef.current;
    toqueRef.current = null;
    if (origemRef.current !== null) {
      origemRef.current = null;
      setArrastando(false);
      setDeslocamento((atual) => encaixarArraste(atual));
    }
    // Clique parado no corpo do cartão abre os detalhes; arrasto, não. Num cartão já
    // arrastado, o toque parado só fecha o cartão.
    if (toque && evento.type === 'pointerup' && ehClique(evento.clientX - toque.x, evento.clientY - toque.y)) {
      if (abertoNoToqueRef.current) setDeslocamento(0);
      else if (onAbrirDetalhes) abrirDetalhes();
    }
  };

  const agir = (acao: AcaoAgendamento) => {
    setDeslocamento(0);
    onAcao(appointment, acao);
  };

  return (
    <div className="relative overflow-hidden rounded-card border border-line bg-surface">
      {gesto && (
        // Camada de ações do gesto. Os dois botões são de verdade e recebem foco pelo
        // teclado; ao receber foco, o cartão desliza para o lado de quem está em foco,
        // que é a alternativa acessível ao arrasto. O texto visível é curto porque a
        // abertura do gesto é de 80px; o nome completo fica no aria-label.
        <div className="absolute inset-0 flex items-stretch justify-between">
          <button
            type="button"
            disabled={isLoading}
            onFocus={() => setDeslocamento(ABERTURA_ARRASTE)}
            onBlur={() => setDeslocamento(0)}
            onClick={() => agir(gesto.esquerda.acao)}
            aria-label={`${ROTULO_ACAO[gesto.esquerda.acao].texto} de ${cliente}`}
            className={cn(
              'flex items-center gap-2 px-5 text-[13px] font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand disabled:opacity-50',
              gesto.esquerda.classe,
            )}
          >
            <Icon name={ROTULO_ACAO[gesto.esquerda.acao].icone} size={22} />
            {gesto.esquerda.texto}
          </button>
          <button
            type="button"
            disabled={isLoading}
            onFocus={() => setDeslocamento(-ABERTURA_ARRASTE)}
            onBlur={() => setDeslocamento(0)}
            onClick={() => agir(gesto.direita.acao)}
            aria-label={`${ROTULO_ACAO[gesto.direita.acao].texto} de ${cliente}`}
            className={cn(
              'flex items-center gap-2 px-5 text-[13px] font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand disabled:opacity-50',
              gesto.direita.classe,
            )}
          >
            {gesto.direita.texto}
            <Icon name={ROTULO_ACAO[gesto.direita.acao].icone} size={22} />
          </button>
        </div>
      )}

      <div
        onPointerDown={iniciarArraste}
        onPointerMove={moverArraste}
        onPointerUp={soltarArraste}
        onPointerCancel={soltarArraste}
        {...(onAbrirDetalhes
          ? {
              role: 'button',
              tabIndex: 0,
              'aria-label': `Ver detalhes do agendamento de ${cliente}`,
              onKeyDown: (evento: ReactKeyboardEvent<HTMLDivElement>) => {
                if (evento.key === 'Enter' || evento.key === ' ') {
                  evento.preventDefault();
                  abrirDetalhes();
                }
              },
            }
          : {})}
        className={cn(
          'relative flex touch-pan-y items-stretch gap-3 bg-surface p-3.5',
          onAbrirDetalhes &&
            'cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand',
          !arrastando && 'transition-transform duration-200',
        )}
        style={{ transform: `translateX(${deslocamento}px)` }}
      >
        <CorpoCartaoAgendamento
          appointment={appointment}
          duracaoMinutos={duracaoMinutos}
          duracaoEmMinutos
          comPontoDeStatus
        />
      </div>
    </div>
  );
}
