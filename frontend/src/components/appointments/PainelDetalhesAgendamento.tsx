'use client';

/**
 * Painel de detalhes do agendamento ("Drawer completo" do Stitch,
 * studio-aurora-detalhes-do-agendamento-drawer-completo--7ba488.html), 440px por cima da
 * agenda no computador e folha de baixo no celular.
 *
 * Tudo é dado real. Do `Appointment` que já veio da lista: número (o da comanda, quando
 * existe; senão os últimos 4 caracteres do id), cliente, telefone, origem (`source`),
 * serviço, profissional, data, horário com a duração do serviço, preço, sinal
 * (`deposit_amount`), a comanda (`comanda_*`) e o selo "Confirmou pelo WhatsApp"
 * (`client_confirmed_at`). De GET /appointments/:id/details, pedido a
 * cada troca de agendamento: o ciclo médio, as visitas do ano, a última visita, o selo de
 * cliente recorrente e as observações da ficha técnica. Enquanto essa leitura não chega,
 * os dois blocos que dependem dela mostram esqueleto; se ela falha, somem (com um aviso)
 * e o resto do painel continua com o que a lista trouxe.
 *
 * O selo do ciclo diz "Ciclo regular", não "Ideal para o serviço" do Stitch: o sistema
 * não compara o ciclo com nada do serviço, então só afirma regularidade quando há visitas
 * suficientes para um ciclo significar algo (3 ou mais no ano).
 *
 * Ações: as de ACOES_POR_STATUS, disparadas pela mesma `onAcao` do bloco e do cartão.
 * "Concluir" abre a comanda (é a comanda que conclui); com comanda em rascunho o botão vira
 * "Continuar comanda #N". Numa reserva aguardando o Pix, o botão principal é confirmar o
 * Pix recebido (`onConfirmarPix`), que não é uma AcaoAgendamento. "Iniciar atendimento"
 * aparece acima do botão principal quando a ação existe; "Remarcar" só em `confirmado`,
 * o único status que o backend aceita editar. Status final: sem ações.
 *
 * Fora da tela: as fotos de cliente e profissional (o DTO só traz nomes, então entram as
 * iniciais do Avatar).
 */

import { useEffect, useState, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { formatCurrency, formatPhone } from '@/lib/formatters';
import { buscarDetalhesAgendamento, reenviarComprovante, type AppointmentDetails } from '@/lib/comanda';
import { useToast } from '@/components/Toast';
import { Avatar, Icon, SidePanel, Skeleton, StatusChip } from '@/components/ui';
import { SeloClube } from '@/components/clube/SeloClube';
import { getApiErrorMessage } from '@/utils/handleApiError';
import { formatarDataAgenda } from './DateNavigationBar';
import { formatarDuracao } from './LinhaDoTempo';
import { SeloConfirmouWhatsapp } from './AppointmentCard';
import { ACOES_POR_STATUS, ROTULO_ACAO, type AcaoAgendamento } from './acoes';
import { linkWhatsapp } from '@/lib/whatsapp';
import type { Appointment } from '@/types';

/** Largura do painel no computador. */
export const LARGURA_PAINEL = 'sm:max-w-[440px]';

/** A partir daqui o painel abre à direita; abaixo disso, como folha de baixo. */
export const MEDIA_COMPUTADOR = '(min-width: 1024px)';

/** Os últimos 4 caracteres do id real, em maiúsculas — quando ainda não há comanda. */
export const numeroDoAgendamento = (id: string): string => (id || '').slice(-4).toUpperCase();

/** "10:00 às 12:30": o fim é o início mais a duração; passou da meia-noite, volta para 00h. */
export const faixaDoAtendimento = (hora: string, duracaoMinutos: number): string => {
  const [h, m] = hora.split(':').map(Number);
  const inicio = h * 60 + m;
  const fim = (inicio + duracaoMinutos) % (24 * 60);
  const fmt = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
  return `${fmt(inicio)} às ${fmt(fim)}`;
};

// Reexportado para quem já importava `linkWhatsapp` daqui.
export { linkWhatsapp };

const ORIGEM: Record<string, { texto: string; icone: string }> = {
  painel: { texto: 'Agendado no painel', icone: 'desktop_windows' },
  publico: { texto: 'Página pública (link da bio)', icone: 'link' },
  whatsapp: { texto: 'WhatsApp', icone: 'chat' },
};

const STATUS_FINAL = new Set(['concluido', 'faltou', 'cancelado']);

/** Vale a largura de computador? Lido só depois da montagem, nunca no servidor. */
function useLarguraDeComputador(): boolean {
  const [computador, setComputador] = useState(false);

  useEffect(() => {
    const consulta = window.matchMedia(MEDIA_COMPUTADOR);
    const aplicar = () => setComputador(consulta.matches);
    aplicar();
    consulta.addEventListener?.('change', aplicar);
    return () => consulta.removeEventListener?.('change', aplicar);
  }, []);

  return computador;
}

type EstadoDetalhes = { fase: 'carregando' } | { fase: 'pronto'; dados: AppointmentDetails } | { fase: 'erro' };

/** GET /appointments/:id/details, refeito a cada troca de agendamento. */
function useDetalhes(id: string): EstadoDetalhes {
  const { showToast } = useToast();
  const [estado, setEstado] = useState<EstadoDetalhes>({ fase: 'carregando' });

  useEffect(() => {
    let cancelado = false;
    setEstado({ fase: 'carregando' });
    buscarDetalhesAgendamento(id)
      .then((dados) => {
        if (!cancelado) setEstado({ fase: 'pronto', dados });
      })
      .catch(() => {
        if (cancelado) return;
        setEstado({ fase: 'erro' });
        showToast('Não foi possível carregar o histórico da cliente', 'error');
      });
    return () => {
      cancelado = true;
    };
  }, [id, showToast]);

  return estado;
}

function Bloco({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('space-y-3 rounded-card border border-line bg-surface p-4 shadow-sm', className)}>{children}</div>;
}

function Indicador({ titulo, valor, unidade, rodape }: { titulo: string; valor: string; unidade: string; rodape?: ReactNode }) {
  return (
    <div className="flex flex-col justify-between rounded-control border border-line bg-bg p-3">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">{titulo}</span>
      {/* Número grande e unidade pequena só para os olhos; o leitor de tela ouve a frase inteira. */}
      <div aria-hidden="true" className="mt-1 flex items-baseline gap-1">
        <span className="text-[22px] font-bold tabular-nums text-ink">{valor}</span>
        <span className="text-[12px] font-medium text-muted">{unidade}</span>
      </div>
      <span className="sr-only">{`${valor} ${unidade}`}</span>
      {rodape}
    </div>
  );
}

function IndicadoresDaCliente({ stats }: { stats: AppointmentDetails['client_stats'] }) {
  if (stats.last_visit_days_ago === null) {
    return (
      <div className="flex items-start gap-2.5 rounded-control border border-line bg-bg p-3">
        <Icon name="waving_hand" size={20} className="mt-0.5 shrink-0 text-brand-text" />
        <div className="flex flex-col">
          <span className="text-[13px] font-bold text-ink">Primeira visita</span>
          <span className="text-[12px] text-muted">Ainda não há atendimentos concluídos desta cliente</span>
        </div>
      </div>
    );
  }

  const cicloRegular = stats.visits_this_year >= 3 && stats.average_cycle_days !== null;
  const ultima = stats.last_visit_professional
    ? `Última há ${stats.last_visit_days_ago} dias com ${stats.last_visit_professional}`
    : `Última há ${stats.last_visit_days_ago} dias`;

  return (
    <div className={cn('grid gap-2.5 pt-1', stats.average_cycle_days !== null ? 'grid-cols-2' : 'grid-cols-1')}>
      {stats.average_cycle_days !== null && (
        <Indicador
          titulo="Ciclo médio"
          valor={String(stats.average_cycle_days)}
          unidade="dias"
          rodape={
            cicloRegular ? (
              <span className="mt-1 flex items-center gap-1 text-[11px] font-semibold text-success-text">
                <Icon name="verified" size={13} />
                Ciclo regular
              </span>
            ) : null
          }
        />
      )}
      <Indicador
        titulo="Total de visitas"
        valor={String(stats.visits_this_year)}
        unidade={`em ${new Date().getFullYear()}`}
        rodape={<span className="mt-1 truncate text-[11px] font-medium text-muted">{ultima}</span>}
      />
    </div>
  );
}

function ReenviarComprovante({ comandaId }: { comandaId: string }) {
  const { showToast } = useToast();
  const [enviando, setEnviando] = useState(false);

  const reenviar = async () => {
    try {
      setEnviando(true);
      const { sent } = await reenviarComprovante(comandaId);
      if (sent) showToast('Comprovante reenviado pelo WhatsApp', 'success');
      else showToast('Comprovante não enviado: o WhatsApp do negócio não está conectado', 'info');
    } catch (error: unknown) {
      showToast(getApiErrorMessage(error, 'Erro ao reenviar o comprovante'), 'error');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <button
      type="button"
      onClick={reenviar}
      disabled={enviando}
      className="flex h-9 items-center justify-center gap-1.5 rounded-control border border-line/60 bg-surface-2 px-3 text-[13px] font-bold text-ink transition-colors hover:bg-line focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-50"
    >
      <Icon name="receipt_long" size={17} />
      <span>Reenviar comprovante</span>
    </button>
  );
}

const STATUS_COM_SINAL_PAGO: string[] = ['confirmado', 'em_atendimento', 'concluido', 'faltou'];

export interface ConteudoDetalhesProps {
  agendamento: Appointment;
}

/** O miolo do painel, sem a moldura. */
export function ConteudoDetalhesAgendamento({ agendamento }: ConteudoDetalhesProps) {
  const estado = useDetalhes(agendamento.id);
  const cliente = agendamento.client_name || 'Cliente';
  const whatsapp = linkWhatsapp(agendamento.client_phone);
  const origem = agendamento.source ? ORIGEM[agendamento.source] : undefined;
  const duracao = agendamento.service_duration_minutes || 0;
  const horario = duracao > 0
    ? `${faixaDoAtendimento(agendamento.time, duracao)} (${formatarDuracao(duracao)})`
    : agendamento.time.slice(0, 5);
  const preco = Math.max(0, Number(agendamento.service_price || 0));
  // Sinal só conta como pago em status que passaram pelo pagamento (reserva expirada fica cancelada sem pagar).
  const sinal = STATUS_COM_SINAL_PAGO.includes(agendamento.status) ? Math.max(0, Number(agendamento.deposit_amount || 0)) : 0;
  const restante = Math.max(0, preco - sinal);
  const comandaFechada = agendamento.comanda_status === 'fechada' && agendamento.comanda_id;
  // Comanda fechada: o valor real pago (cobrado no balcão + sinal aplicado), não o preço de catálogo.
  const pago = comandaFechada
    ? Number(agendamento.comanda_total_charged ?? 0) + Number(agendamento.comanda_deposit_applied ?? 0)
    : null;
  const semRestante = agendamento.status === 'faltou' || agendamento.status === 'cancelado';
  const recorrente = estado.fase === 'pronto' && estado.dados.client_stats.is_recurring;

  return (
    <div className="space-y-4">
      {/* Cliente */}
      <Bloco className="space-y-3.5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            {/* Decorativo: o nome vem escrito ao lado. */}
            <span aria-hidden="true" className="flex shrink-0">
              <Avatar name={cliente} size={48} className="border border-line bg-surface-2 text-[15px] font-bold" />
            </span>
            <div className="flex min-w-0 flex-col">
              <span className="truncate text-[16px] font-bold leading-tight text-ink">{cliente}</span>
              {agendamento.client_phone && (
                <span className="mt-0.5 text-[13px] font-medium text-muted">{formatPhone(agendamento.client_phone)}</span>
              )}
              {agendamento.client_id && <SeloClube clientId={agendamento.client_id} className="mt-1.5 flex flex-wrap gap-1.5" />}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {recorrente && (
              <span className="flex items-center gap-1 rounded-full border border-line bg-surface-2 px-2.5 py-1 text-[11px] font-bold text-ink">
                <Icon name="repeat" size={14} className="text-brand-text" />
                Cliente recorrente
              </span>
            )}
            {whatsapp && (
              <a
                href={whatsapp}
                target="_blank"
                rel="noopener noreferrer"
                title="Conversar no WhatsApp"
                aria-label={`Abrir conversa de ${cliente} no WhatsApp`}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-control bg-whatsapp text-surface shadow-sm transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
              >
                <Icon name="chat" size={18} />
              </a>
            )}
          </div>
        </div>

        {estado.fase === 'carregando' && (
          <div className="grid grid-cols-2 gap-2.5 pt-1">
            <Skeleton className="h-[88px]" label="Carregando histórico da cliente" />
            <Skeleton className="h-[88px]" />
          </div>
        )}
        {estado.fase === 'pronto' && <IndicadoresDaCliente stats={estado.dados.client_stats} />}
      </Bloco>

      {/* Serviço e horário */}
      <Bloco>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-2.5">
          <span className="text-[12px] font-bold uppercase tracking-wide text-muted">Serviço e horário</span>
          <div className="flex flex-wrap items-center gap-2">
            {agendamento.client_confirmed_at && agendamento.status !== 'cancelado' && <SeloConfirmouWhatsapp />}
            {origem && (
              <span className="flex items-center gap-1 rounded-full border border-line bg-surface-2 px-2.5 py-0.5 text-[11px] font-bold text-brand-text">
                <Icon name={origem.icone} size={13} />
                Origem: {origem.texto}
              </span>
            )}
          </div>
        </div>
        <div className="space-y-2.5">
          <div className="flex items-center justify-between gap-3">
            <span className="text-[13px] text-muted">Serviço:</span>
            <span className="text-right text-[14px] font-bold text-ink">{agendamento.service_name}</span>
          </div>
          {agendamento.professional_name && (
            <div className="flex items-center justify-between gap-3">
              <span className="text-[13px] text-muted">Profissional:</span>
              <span className="flex items-center gap-1.5 text-[14px] font-bold text-ink">
                <span aria-hidden="true" className="flex shrink-0">
                  <Avatar name={agendamento.professional_name} size={20} className="bg-brand/20 text-[10px] font-bold text-brand-text" />
                </span>
                <span>{agendamento.professional_name}</span>
              </span>
            </div>
          )}
          <div className="flex items-start justify-between gap-3">
            <span className="shrink-0 text-[13px] text-muted">Data e horário:</span>
            <span className="max-w-[270px] text-right text-[13px] font-bold tabular-nums text-ink">
              {`${formatarDataAgenda(agendamento.date.split('T')[0])} · ${horario}`}
            </span>
          </div>
        </div>
      </Bloco>

      {/* Pagamento */}
      <Bloco>
        <div className="flex items-center justify-between gap-3">
          <span className="text-[12px] font-bold uppercase tracking-wide text-muted">Pagamento</span>
          <div className="text-right">
            <span className="mr-1 text-[11px] text-muted">Valor total:</span>
            <span className="text-[16px] font-bold tabular-nums text-ink">{formatCurrency(preco)}</span>
          </div>
        </div>

        {sinal > 0 && (
          <div className="flex items-center justify-between gap-2 rounded-control border border-success/30 bg-success/10 p-2.5">
            <div className="flex min-w-0 items-center gap-2">
              <Icon name="check_circle" size={18} className="shrink-0 text-success-text" />
              <span className="text-[13px] font-bold tabular-nums text-success-text">Sinal pago {formatCurrency(sinal)} via Pix</span>
            </div>
            <span className="shrink-0 rounded-full bg-success px-2 py-0.5 text-[10px] font-bold uppercase text-surface">Confirmado</span>
          </div>
        )}

        {pago !== null ? (
          <div className="flex items-center justify-between gap-3 pt-1">
            <span className="text-[13px] font-bold text-ink">Pago:</span>
            <span className="shrink-0 text-[20px] font-extrabold tabular-nums text-success-text">{formatCurrency(Math.round(pago * 100) / 100)}</span>
          </div>
        ) : semRestante ? null : (
          <div className="flex items-center justify-between gap-3 pt-1">
            <div className="flex flex-col">
              <span className="text-[13px] font-bold text-ink">Restante no balcão:</span>
              <span className="text-[11px] text-muted">Cartão, dinheiro ou Pix na saída</span>
            </div>
            <span className="shrink-0 text-[20px] font-extrabold tabular-nums text-brand-text">{formatCurrency(restante)}</span>
          </div>
        )}

        {comandaFechada && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
            <span className="flex items-center gap-1.5 text-[13px] font-bold text-ink">
              <Icon name="receipt_long" size={18} className="text-success-text" />
              Comanda #{agendamento.comanda_number} fechada
            </span>
            <ReenviarComprovante comandaId={agendamento.comanda_id as string} />
          </div>
        )}
      </Bloco>

      {/* Observações da ficha técnica */}
      {estado.fase === 'carregando' && <Skeleton className="h-16 rounded-card" />}
      {estado.fase === 'pronto' && estado.dados.client_notes?.trim() && (
        <div className="flex items-start gap-2.5 rounded-card border border-warning/30 bg-warning/10 p-3.5">
          <Icon name="warning" size={20} className="mt-0.5 shrink-0 text-warning" />
          <div className="flex flex-col">
            <span className="text-[12px] font-bold uppercase tracking-wider text-warning-text">Observações da ficha técnica</span>
            <p className="mt-0.5 whitespace-pre-line text-[13px] font-semibold text-ink">{estado.dados.client_notes}</p>
          </div>
        </div>
      )}
    </div>
  );
}

export interface AcoesDetalhesProps {
  agendamento: Appointment;
  actionLoading: string | null;
  onAcao: (a: Appointment, acao: AcaoAgendamento) => void;
  onRemarcar: (a: Appointment) => void;
  onConfirmarPix?: (a: Appointment) => void;
}

const SECUNDARIO =
  'flex h-10 items-center justify-center gap-1.5 rounded-control border border-line/60 bg-surface-2 text-[13px] font-bold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-50';

const COLUNAS: Record<number, string> = { 1: 'grid-cols-1', 2: 'grid-cols-2', 3: 'grid-cols-3' };

/** Rodapé de ações: só o que ACOES_POR_STATUS permite para o status atual. */
export function AcoesDetalhesAgendamento({ agendamento, actionLoading, onAcao, onRemarcar, onConfirmarPix }: AcoesDetalhesProps) {
  if (STATUS_FINAL.has(agendamento.status)) return null;

  const acoes = ACOES_POR_STATUS[agendamento.status] ?? [];
  const carregando = actionLoading === agendamento.id;
  const aguardandoPix = agendamento.status === 'aguardando_pagamento' && onConfirmarPix;
  const rascunho = agendamento.comanda_status === 'rascunho' && agendamento.comanda_number != null;
  const textoPrincipal = rascunho ? `Continuar comanda #${agendamento.comanda_number}` : 'Concluir atendimento e receber';

  // O backend só edita (PUT /appointments/:id) agendamentos confirmados.
  const secundarios: Array<{ chave: string; texto: string; icone: string; cor: string; onClick: () => void }> = [];
  if (agendamento.status === 'confirmado') {
    secundarios.push({ chave: 'remarcar', texto: 'Remarcar', icone: 'edit_calendar', cor: 'text-ink hover:bg-line', onClick: () => onRemarcar(agendamento) });
  }
  if (acoes.includes('faltou')) {
    secundarios.push({ chave: 'faltou', texto: ROTULO_ACAO.faltou.texto, icone: ROTULO_ACAO.faltou.icone, cor: 'text-danger hover:bg-danger/10', onClick: () => onAcao(agendamento, 'faltou') });
  }
  if (acoes.includes('cancelar')) {
    secundarios.push({ chave: 'cancelar', texto: ROTULO_ACAO.cancelar.texto, icone: ROTULO_ACAO.cancelar.icone, cor: 'text-muted hover:bg-line hover:text-ink', onClick: () => onAcao(agendamento, 'cancelar') });
  }

  const principal = 'flex w-full items-center justify-center gap-2 rounded-control bg-brand px-4 py-3.5 text-[15px] font-bold text-on-brand shadow-sm transition-all hover:brightness-105 active:scale-[0.99] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-50';

  return (
    <div className="space-y-3">
      {acoes.includes('iniciar') && (
        <button
          type="button"
          disabled={carregando}
          onClick={() => onAcao(agendamento, 'iniciar')}
          className={cn(SECUNDARIO, 'w-full text-brand-text hover:bg-line')}
        >
          <Icon name={ROTULO_ACAO.iniciar.icone} size={18} />
          <span>{ROTULO_ACAO.iniciar.texto}</span>
        </button>
      )}
      {acoes.includes('concluir') && (
        <button type="button" disabled={carregando} onClick={() => onAcao(agendamento, 'concluir')} className={principal}>
          <Icon name={rascunho ? 'receipt_long' : 'task_alt'} size={20} />
          <span>{textoPrincipal}</span>
        </button>
      )}
      {aguardandoPix && (
        <button type="button" disabled={carregando} onClick={() => onConfirmarPix(agendamento)} className={principal}>
          <Icon name="verified" size={20} />
          <span>Confirmar Pix recebido</span>
        </button>
      )}

      {secundarios.length > 0 && (
        <div className={cn('grid gap-2', COLUNAS[secundarios.length] ?? 'grid-cols-1')}>
          {secundarios.map((b) => (
            <button key={b.chave} type="button" disabled={carregando} onClick={b.onClick} className={cn(SECUNDARIO, b.cor)}>
              <Icon name={b.icone} size={17} />
              <span>{b.texto}</span>
            </button>
          ))}
        </div>
      )}

      {acoes.includes('desfazer_inicio') && (
        <div className="flex justify-center">
          <button
            type="button"
            disabled={carregando}
            onClick={() => onAcao(agendamento, 'desfazer_inicio')}
            className="flex items-center gap-1 rounded-control px-2 py-1 text-[12px] font-semibold text-muted underline-offset-2 transition-colors hover:text-ink hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Icon name={ROTULO_ACAO.desfazer_inicio.icone} size={14} />
            <span>{ROTULO_ACAO.desfazer_inicio.texto}</span>
          </button>
        </div>
      )}
    </div>
  );
}

export interface PainelDetalhesAgendamentoProps {
  /** O agendamento a mostrar; `null` mantém o painel fechado. */
  agendamento: Appointment | null;
  actionLoading: string | null;
  onFechar: () => void;
  onAcao: (a: Appointment, acao: AcaoAgendamento) => void;
  onRemarcar: (a: Appointment) => void;
  /** Reserva pública aguardando o Pix: confirmar o pagamento (aguardando_pagamento → confirmado). */
  onConfirmarPix?: (a: Appointment) => void;
}

export function PainelDetalhesAgendamento({
  agendamento,
  actionLoading,
  onFechar,
  onAcao,
  onRemarcar,
  onConfirmarPix,
}: PainelDetalhesAgendamentoProps) {
  const computador = useLarguraDeComputador();
  const temRodape = agendamento !== null && !STATUS_FINAL.has(agendamento.status);

  return (
    <SidePanel
      open={agendamento !== null}
      onOpenChange={(aberto) => {
        if (!aberto) onFechar();
      }}
      title="Detalhes da sessão"
      side={computador ? 'right' : 'bottom'}
      widthClass={computador ? LARGURA_PAINEL : undefined}
      titleAbove={
        agendamento ? (
          <span className="text-[12px] font-bold uppercase tracking-tight text-muted">
            Agendamento #{agendamento.comanda_number ?? numeroDoAgendamento(agendamento.id)}
          </span>
        ) : null
      }
      headerEnd={
        // No cabeçalho fixo: continua visível enquanto o conteúdo rola.
        agendamento ? (
          <StatusChip
            status={agendamento.status}
            comPonto
            pontoAnimado={agendamento.status === 'em_atendimento'}
            className="text-[12px]"
          />
        ) : null
      }
      footer={
        temRodape && agendamento ? (
          <AcoesDetalhesAgendamento
            agendamento={agendamento}
            actionLoading={actionLoading}
            onAcao={onAcao}
            onRemarcar={onRemarcar}
            onConfirmarPix={onConfirmarPix}
          />
        ) : null
      }
    >
      {agendamento ? <ConteudoDetalhesAgendamento key={agendamento.id} agendamento={agendamento} /> : null}
    </SidePanel>
  );
}
