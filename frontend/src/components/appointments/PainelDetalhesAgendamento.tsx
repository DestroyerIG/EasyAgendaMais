'use client';

/**
 * Painel de detalhes do agendamento (agendamento-detalhes.html), 440px por cima da
 * agenda no computador e folha de baixo no celular.
 *
 * Dado real: número do agendamento (últimos 4 caracteres do id), cliente, telefone,
 * data, horário de início, profissional, serviço, valor, status, duração
 * (service_duration_minutes), o momento em que foi agendado (created_at) e o lembrete de
 * WhatsApp (reminder_sent) vêm de GET /appointments; o horário de fim é o início mais a
 * duração; as ações de concluir e cancelar chamam o mesmo handler de status que a Agenda
 * já usava.
 * Dado de exemplo (conteudoDemo.agenda): duracaoPadraoMinutos só entra quando o
 * agendamento não traz duração própria, e, em conteudoDemo.agenda.detalhes, o sinal por
 * Pix com o comprovante e a origem do agendamento. O selo "Cliente Recorrente" foi removido (era um booleano fixo em
 * conteudoDemo, sempre `true` para qualquer agendamento — contradizia a lista e a
 * ficha ao abrir o painel de uma cliente nova; achado N1 da re-revisão da rodada de
 * correção final, que sucede a correção I1 original).
 * Sobre o sinal: o sistema não recebe sinal por Pix, então o valor de exemplo é limitado
 * ao preço real do serviço e o "valor a pagar no estúdio" é a diferença — as duas linhas
 * sempre somam o total verdadeiro do atendimento, nunca mais do que ele. Sem preço de
 * serviço (ou com ele zerado), o sinal cai para 0 e as duas linhas somem: não existe
 * sinal pago a mostrar, então a tela não afirma um.
 * "Observações da Cliente" do arquivo de referência foi removida: era um texto fixo em
 * conteudoDemo, idêntico para qualquer cliente, contradizendo a nota real (`client.notes`)
 * que a Ficha da Cliente já mostra — e este painel só recebe `Appointment`, sem o
 * `client.notes` real, sem uma chamada nova por abertura (o mesmo motivo que já tirou o
 * selo "Cliente Recorrente" e a contagem de atendimentos da lista, achados da varredura
 * de telas por Stitch).
 * Fora da tela: as fotos de cliente e profissional do arquivo de referência (o DTO só
 * traz nomes, então entram as iniciais do Avatar) e a especialidade entre parênteses do
 * "Profissional responsável", que é de um segmento só.
 */

import { useEffect, useState } from 'react';
import { cn } from '@/lib/cn';
import { conteudoDemo } from '@/lib/conteudoDemo';
import { formatCurrency, formatPhone } from '@/lib/formatters';
import { useToast } from '@/components/Toast';
import { AVISO_RECURSO_A_CAMINHO, Avatar, Icon, SidePanel, StatusChip } from '@/components/ui';
import { formatarDataAgenda } from './DateNavigationBar';
import { formatarDuracao } from './LinhaDoTempo';
import { ACOES_POR_STATUS } from './acoes';
import { linkWhatsapp } from '@/lib/whatsapp';
import type { Appointment } from '@/types';

/** Largura do painel no computador (agendamento-detalhes.html). */
export const LARGURA_PAINEL = 'sm:max-w-[440px]';

/** A partir daqui o painel abre à direita; abaixo disso, como folha de baixo. */
export const MEDIA_COMPUTADOR = '(min-width: 1024px)';

/**
 * "Agendamento #4892" do arquivo de referência: os últimos 4 caracteres do id real, em
 * maiúsculas. É um número que existe e identifica o registro — nada de contador de
 * exemplo.
 */
export const numeroDoAgendamento = (id: string): string => (id || '').slice(-4).toUpperCase();

/** "10:00 às 12:30": o fim é o início mais a duração; passou da meia-noite, volta para 00h. */
export const faixaDoAtendimento = (hora: string, duracaoMinutos: number): string => {
  const [h, m] = hora.split(':').map(Number);
  const inicio = h * 60 + m;
  const fim = (inicio + duracaoMinutos) % (24 * 60);
  const fmt = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
  return `${fmt(inicio)} às ${fmt(fim)}`;
};

/**
 * Sinal e saldo do atendimento. O preço na tela é sempre o real; o sinal de exemplo
 * nunca passa dele, e o saldo é a diferença — assim as duas linhas fecham com o total
 * verdadeiro mesmo quando o serviço custa menos que o sinal do exemplo.
 */
export function repartirValor(precoServico: number, sinalDeExemplo: number): { sinal: number; aPagar: number } {
  const preco = Math.max(0, Number(precoServico) || 0);
  const sinal = Math.min(Math.max(0, sinalDeExemplo), preco);
  return { sinal, aPagar: preco - sinal };
}

/** "Agendado em 14/09 às 21:14", a partir do created_at do registro. */
export function agendadoEmTexto(criadoEm: string): string | null {
  const data = new Date(criadoEm);
  if (Number.isNaN(data.getTime())) return null;
  const dia = String(data.getDate()).padStart(2, '0');
  const mes = String(data.getMonth() + 1).padStart(2, '0');
  const hora = String(data.getHours()).padStart(2, '0');
  const minuto = String(data.getMinutes()).padStart(2, '0');
  return `Agendado em ${dia}/${mes} às ${hora}:${minuto}`;
}

// Reexportado para quem já importava `linkWhatsapp` daqui (M3 da revisão final).
export { linkWhatsapp };

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

function Linha({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('flex items-center gap-3 rounded-control bg-surface p-3', className)}>{children}</div>;
}

export interface ConteudoDetalhesProps {
  agendamento: Appointment;
  duracaoMinutos: number;
}

/** O miolo do painel, sem a moldura — é o que os testes leem. */
export function ConteudoDetalhesAgendamento({ agendamento, duracaoMinutos }: ConteudoDetalhesProps) {
  const detalhes = conteudoDemo.agenda.detalhes;
  const cliente = agendamento.client_name || 'Cliente';
  const whatsapp = linkWhatsapp(agendamento.client_phone);
  const { sinal, aPagar } = repartirValor(Number(agendamento.service_price || 0), detalhes.sinalPago);
  const agendadoEm = agendadoEmTexto(agendamento.created_at);

  return (
    <div className="flex flex-col gap-5">
      {/* Cliente */}
      <div className="flex flex-col gap-4 rounded-card bg-surface-2 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            {/* Decorativo: o nome vem escrito ao lado. */}
            <span aria-hidden="true" className="flex shrink-0">
              <Avatar name={cliente} size={56} className="rounded-card bg-surface text-[17px] font-bold" />
            </span>
            <div className="flex min-w-0 flex-col">
              <h3 className="truncate text-[20px] font-bold leading-tight text-ink">{cliente}</h3>
              {agendamento.client_phone && (
                <div className="mt-0.5 flex items-center gap-2">
                  <span className="text-[14px] font-medium text-muted">{formatPhone(agendamento.client_phone)}</span>
                  {whatsapp && (
                    <a
                      href={whatsapp}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="Abrir no WhatsApp"
                      aria-label={`Abrir conversa de ${cliente} no WhatsApp`}
                      className="inline-flex h-7 w-7 items-center justify-center rounded-control bg-whatsapp text-surface transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                    >
                      <Icon name="chat" size={16} />
                    </a>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Serviço e horário */}
      <div className="flex flex-col gap-4 rounded-card bg-surface-2 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-[13px] font-bold uppercase tracking-wide text-muted">Serviço &amp; Horário</span>
          <span className="flex items-center gap-1 rounded-full bg-surface px-2.5 py-1 text-[11px] font-bold text-brand-text shadow-sm">
            <Icon name="link" size={14} />
            {detalhes.origem}
          </span>
        </div>

        <div className="flex flex-col gap-2.5">
          <Linha>
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-control bg-surface-2 text-brand-text">
              <Icon name="schedule" size={22} />
            </span>
            <div className="flex min-w-0 flex-col">
              <span className="text-[13px] font-bold text-ink">{formatarDataAgenda(agendamento.date.split('T')[0])}</span>
              <span className="text-[14px] tabular-nums text-muted">
                {faixaDoAtendimento(agendamento.time, duracaoMinutos)} (Duração estimada:{' '}
                {formatarDuracao(duracaoMinutos)})
              </span>
            </div>
          </Linha>

          {agendamento.professional_name && (
            <Linha className="justify-between">
              <div className="flex min-w-0 items-center gap-3">
                <span aria-hidden="true" className="flex shrink-0">
                  <Avatar name={agendamento.professional_name} size={40} className="bg-surface-2" />
                </span>
                <div className="flex min-w-0 flex-col">
                  <span className="truncate text-[13px] font-bold text-ink">{agendamento.professional_name}</span>
                  <span className="text-[14px] text-muted">Profissional responsável</span>
                </div>
              </div>
              <Icon name="badge" size={20} className="shrink-0 text-muted" />
            </Linha>
          )}
        </div>

        {/* Valores: o preço é o real; o sinal de exemplo nunca passa dele */}
        <div className="flex flex-col gap-3 rounded-control bg-surface p-4">
          <div className="flex items-start justify-between gap-3">
            <span className="text-[17px] font-bold text-ink">{agendamento.service_name}</span>
            <span className="shrink-0 text-[17px] font-bold tabular-nums text-ink">
              {formatCurrency(Number(agendamento.service_price || 0))}
            </span>
          </div>

          {sinal > 0 && (
            <>
              <div className="flex items-center justify-between gap-2 rounded-control bg-success/12 p-2.5 text-success-text">
                <div className="flex min-w-0 items-center gap-2">
                  <Icon name="payments" size={18} className="shrink-0" />
                  <div className="flex min-w-0 flex-col">
                    <span className="text-[13px] font-bold tabular-nums">
                      Sinal pago {formatCurrency(sinal)} via Pix
                    </span>
                    <span className="truncate text-[11px] opacity-90">
                      Comp. {detalhes.comprovantePix} · Confirmado
                    </span>
                  </div>
                </div>
                <Icon name="check_circle" size={20} className="shrink-0" />
              </div>

              <div className="flex items-center justify-between gap-3 pt-1">
                <div className="flex flex-col">
                  <span className="text-[11px] text-muted">Valor a pagar no estúdio</span>
                  <span className="text-[11px] text-muted">Cartão, Dinheiro ou Pix final</span>
                </div>
                <span className="shrink-0 text-[24px] font-black tabular-nums text-brand-text">
                  {formatCurrency(aPagar)}
                </span>
              </div>
            </>
          )}
        </div>

        {/* Rodapé de metadados: os dois vêm do registro */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-[11px] text-muted">
          {agendadoEm && <span className="tabular-nums">{agendadoEm}</span>}
          <span className="flex items-center gap-1">
            <span
              className={cn(
                'h-1.5 w-1.5 rounded-full',
                agendamento.reminder_sent ? 'bg-success' : 'bg-muted',
              )}
            />
            <span>Lembrete WhatsApp {agendamento.reminder_sent ? 'enviado' : 'não enviado'}</span>
          </span>
        </div>
      </div>
    </div>
  );
}

export interface AcoesDetalhesProps {
  agendamento: Appointment;
  actionLoading: string | null;
  onStatusChange: (id: string, status: 'confirmado' | 'concluido' | 'cancelado') => void;
}

/**
 * Rodapé de ações. Concluir, Confirmar e Cancelar chamam o mesmo `handleStatusChange` da
 * Agenda, com o mesmo `actionLoading`, e só ficam ativos nas transições que a API aceita
 * (VALID_STATUS_TRANSITIONS no backend): `confirmado` → concluir/cancelar, e
 * `aguardando_pagamento` (reserva pública com sinal via Pix) → confirmar/cancelar.
 *
 * Remarcar e Cliente faltou mostram o aviso de recurso a caminho — não existem no
 * sistema. Confirmar também mostra o aviso quando o agendamento já nasceu confirmado
 * (criado pelo painel): não há transição de volta para "confirmado" nesse caso, então o
 * botão chamando o handler daria erro em todo clique — parecer funcionar e falhar é pior
 * do que dizer que ainda não dá.
 */
export function AcoesDetalhesAgendamento({ agendamento, actionLoading, onStatusChange }: AcoesDetalhesProps) {
  const { showToast } = useToast();
  const aguardandoPagamento = agendamento.status === 'aguardando_pagamento';
  // Concluir aqui abre a comanda (a Agenda traduz 'concluido' para a ação 'concluir').
  // A Tarefa 13 troca este rodapé pelas ações de ACOES_POR_STATUS.
  const podeConcluir = ACOES_POR_STATUS[agendamento.status]?.includes('concluir') ?? false;
  const podeCancelar = ACOES_POR_STATUS[agendamento.status]?.includes('cancelar') ?? false;
  const carregando = actionLoading === agendamento.id;
  const bloqueado = !podeConcluir || carregando;
  const confirmarBloqueado = !aguardandoPagamento || carregando;
  const cancelarBloqueado = !podeCancelar || carregando;
  const aCaminho = () => showToast(AVISO_RECURSO_A_CAMINHO, 'info');
  const confirmarPagamento = () => onStatusChange(agendamento.id, 'confirmado');

  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        disabled={bloqueado}
        onClick={() => onStatusChange(agendamento.id, 'concluido')}
        className="flex h-12 w-full items-center justify-center gap-2 rounded-control bg-brand text-[17px] font-bold text-on-brand shadow-sm transition-transform active:scale-[0.99] hover:brightness-105 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Icon name="task_alt" size={22} />
        <span>Concluir atendimento &amp; Receber</span>
      </button>

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          disabled={confirmarBloqueado}
          onClick={aguardandoPagamento ? confirmarPagamento : aCaminho}
          className="flex h-10 items-center justify-center gap-1.5 rounded-control bg-status-confirmed/12 text-[13px] font-bold text-status-confirmed transition-colors hover:bg-status-confirmed/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Icon name="verified" size={18} />
          <span>{aguardandoPagamento ? 'Confirmar recebimento do Pix' : 'Confirmar'}</span>
        </button>
        <button
          type="button"
          onClick={aCaminho}
          className="flex h-10 items-center justify-center gap-1.5 rounded-control bg-surface-2 text-[13px] font-bold text-ink transition-colors hover:bg-line/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          <Icon name="edit_calendar" size={18} />
          <span>Remarcar</span>
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={aCaminho}
          className="flex h-9 items-center justify-center gap-1 rounded-control bg-danger/12 text-[13px] font-semibold text-danger transition-colors hover:bg-danger/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          <Icon name="person_off" size={16} />
          <span>Cliente faltou</span>
        </button>
        <button
          type="button"
          disabled={cancelarBloqueado}
          onClick={() => onStatusChange(agendamento.id, 'cancelado')}
          className="flex h-9 items-center justify-center gap-1 rounded-control text-[13px] font-semibold text-muted transition-colors hover:text-danger focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Icon name="cancel" size={16} />
          <span>Cancelar</span>
        </button>
      </div>
    </div>
  );
}

export interface PainelDetalhesAgendamentoProps {
  /** O agendamento a mostrar; `null` mantém o painel fechado. */
  agendamento: Appointment | null;
  duracaoMinutos: number;
  actionLoading: string | null;
  onFechar: () => void;
  onStatusChange: (id: string, status: 'confirmado' | 'concluido' | 'cancelado') => void;
}

export function PainelDetalhesAgendamento({
  agendamento,
  duracaoMinutos,
  actionLoading,
  onFechar,
  onStatusChange,
}: PainelDetalhesAgendamentoProps) {
  const computador = useLarguraDeComputador();

  return (
    <SidePanel
      open={agendamento !== null}
      onOpenChange={(aberto) => {
        if (!aberto) onFechar();
      }}
      title="Detalhes da Sessão"
      side={computador ? 'right' : 'bottom'}
      widthClass={computador ? LARGURA_PAINEL : undefined}
      titleAbove={
        agendamento ? (
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">
            Agendamento #{numeroDoAgendamento(agendamento.id)}
          </span>
        ) : null
      }
      headerEnd={
        // No cabeçalho fixo (agendamento-detalhes.html:399-414), não rola com o
        // conteúdo — antes ficava dentro do corpo e desaparecia ao rolar o painel.
        agendamento ? <StatusChip status={agendamento.status} comPonto pontoAnimado className="text-[11px]" /> : null
      }
      footer={
        agendamento ? (
          <AcoesDetalhesAgendamento
            agendamento={agendamento}
            actionLoading={actionLoading}
            onStatusChange={onStatusChange}
          />
        ) : null
      }
    >
      {agendamento ? (
        <ConteudoDetalhesAgendamento agendamento={agendamento} duracaoMinutos={duracaoMinutos} />
      ) : null}
    </SidePanel>
  );
}
