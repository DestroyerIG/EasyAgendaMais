'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { formatCurrency } from '@/lib/formatters';
import { cn } from '@/lib/cn';
import { linkWhatsapp } from '@/lib/whatsapp';
import { Card, Icon, Skeleton, StatusChip, STATUS_STRIPE_CLASS } from '@/components/ui';
import type { AgendamentoHoje } from '@/lib/hoje';

export interface ProximasDuasHorasProps {
  /**
   * Próximos atendimentos de hoje (GET /dashboard/today → `proximas`): o servidor já
   * recorta a janela de 2 horas (e mantém quem está em atendimento), então aqui só
   * entra o filtro por profissional. `null` enquanto a busca ainda não respondeu.
   */
  agendamentos: AgendamentoHoje[] | null;
  className?: string;
}

export function ProximasDuasHoras({ agendamentos, className }: ProximasDuasHorasProps) {
  const [profissionalAtivo, setProfissionalAtivo] = useState<string | null>(null);

  const proximos = useMemo(() => agendamentos ?? [], [agendamentos]);

  const profissionais = useMemo(
    () =>
      Array.from(
        new Set(proximos.map((a) => a.professional_name).filter((nome): nome is string => Boolean(nome))),
      ),
    [proximos],
  );

  const visiveis = profissionalAtivo
    ? proximos.filter((a) => a.professional_name === profissionalAtivo)
    : proximos;

  return (
    <Card className={cn('flex flex-col gap-4', className)}>
      <div className="flex flex-col gap-3 border-b border-line pb-3.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-[16px] font-bold text-ink">Próximas 2 horas</h2>
            <span className="h-2 w-2 rounded-full bg-brand animate-pulse" />
          </div>
          <span className="hidden text-[12px] font-semibold tabular-nums text-muted lg:inline">
            {agendamentos === null ? '' : `${proximos.length} atendimento${proximos.length === 1 ? '' : 's'}`}
          </span>
          {/* hoje-mobile.html põe "Ver agenda" nesse canto; hoje-desktop.html põe a
              contagem — a navegação real já existe no rodapé (mesmo link), aqui é
              só a cópia/posição de cada referência. */}
          <Link href="/agendamentos" className="text-[12px] font-bold text-brand-text lg:hidden">
            Ver agenda
          </Link>
        </div>

        {profissionais.length > 0 && (
          <div className="hidden items-center gap-1.5 overflow-x-auto pb-1 lg:flex">
            <button
              type="button"
              onClick={() => setProfissionalAtivo(null)}
              className={cn(
                'whitespace-nowrap rounded-full px-3 py-1 text-[12px] font-bold transition-colors',
                profissionalAtivo === null ? 'border border-line/80 bg-surface-2 text-ink' : 'text-muted hover:bg-surface-2/60 hover:text-ink',
              )}
            >
              Todos
            </button>
            {profissionais.map((nome) => (
              <button
                key={nome}
                type="button"
                onClick={() => setProfissionalAtivo(nome)}
                className={cn(
                  'whitespace-nowrap rounded-full px-3 py-1 text-[12px] font-bold transition-colors',
                  profissionalAtivo === nome ? 'border border-line/80 bg-surface-2 text-ink' : 'text-muted hover:bg-surface-2/60 hover:text-ink',
                )}
              >
                {nome}
              </button>
            ))}
          </div>
        )}
      </div>

      {agendamentos === null ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-14 w-full" label={index === 0 ? 'Carregando próximos atendimentos…' : undefined} />
          ))}
        </div>
      ) : visiveis.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-8 text-center">
          <Icon name="event_available" size={28} className="text-muted" />
          <p className="text-[13px] font-semibold text-ink">Nenhum atendimento nas próximas 2 horas</p>
          <p className="text-[12px] text-muted">Você está em dia — volte para conferir mais tarde.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {visiveis.map((agendamento) => {
            const whatsapp = agendamento.status === 'confirmado' ? linkWhatsapp(agendamento.client_phone ?? undefined) : null;
            return (
              <div
                key={agendamento.id}
                className="flex flex-col gap-1.5 rounded-xl border border-line/60 bg-surface-2/40 p-3 transition-colors hover:border-ink/20"
              >
                <div className="flex items-center gap-3">
                  <div className="flex shrink-0 items-center gap-2">
                    <span className={cn('h-9 w-1 rounded-full', STATUS_STRIPE_CLASS[agendamento.status])} />
                    <span className="text-[13px] font-bold tabular-nums text-ink">
                      {agendamento.time?.substring(0, 5)}
                    </span>
                  </div>
                  <p className="min-w-0 flex-1 truncate text-[14px] font-bold text-ink">{agendamento.client_name}</p>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className="text-[14px] font-bold tabular-nums text-ink">
                      {formatCurrency(Number(agendamento.service_price || 0), { cents: false })}
                    </span>
                    <StatusChip status={agendamento.status} />
                  </div>
                </div>
                <div className="flex items-center justify-between gap-2 pl-[calc(0.25rem+9px)] text-[12px] text-muted">
                  <span className="truncate">
                    {[agendamento.service_name, agendamento.professional_name].filter(Boolean).join(' · ')}
                  </span>
                  {/* O sistema nunca cobra sinal antecipado — "Pagar no local" é real para
                      qualquer agendamento (hoje-desktop.html tem "Sinal pago R$X" por
                      atendimento, que exigiria um valor que o DTO não tem; e "Reenviar
                      WhatsApp", ligado ao status "aguardando confirmação" que não existe
                      no sistema real — só confirmado/concluído/cancelado). Para os
                      confirmados, um link real de WhatsApp substitui o texto: é a mesma
                      ação real que a ficha do cliente já oferece, não um botão decorativo. */}
                  {whatsapp ? (
                    <a
                      href={whatsapp}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex shrink-0 items-center gap-1 font-bold text-whatsapp hover:underline"
                    >
                      <Icon name="chat" size={13} />
                      Abrir WhatsApp
                    </a>
                  ) : (
                    <span className="shrink-0 font-medium">Pagar no local</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Link
        href="/agendamentos"
        className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-line bg-surface-2 px-3 py-2.5 text-[13px] font-bold text-ink transition-colors hover:bg-line/40"
      >
        <span className="lg:hidden">Ver agenda</span>
        <span className="hidden lg:inline">Ver grade completa da agenda</span>
        <Icon name="arrow_forward" size={16} />
      </Link>
    </Card>
  );
}
