'use client';

/**
 * Tela Agenda (agenda-desktop.html, agenda-mobile.html).
 *
 * Dado real: todos os agendamentos do período, com cliente, serviço, profissional,
 * valor e status, vindos de GET /appointments; as contagens, o faturamento, a ocupação
 * e as vagas livres são calculados desses mesmos agendamentos; os filtros de dia,
 * semana e status e a criação de agendamento seguem exatamente como eram.
 * Dado de exemplo: só a duração de cada atendimento
 * (conteudoDemo.agenda.duracaoPadraoMinutos), porque o DTO de /appointments não
 * devolve a duração do serviço.
 * Fora da tela: "encaixe inteligente"/"encaixe rápido", bloco de almoço, faixa de
 * "ação química", cobrança de sinal por Pix e aviso de chegada prevista, todos do
 * arquivo de referência e todos sem função que os sustente.
 */

import { useEffect, useState, useCallback } from 'react';
import api from '@/lib/api';
import { useToast } from '@/components/Toast';
import { getToday } from '@/lib/dateUtils';
import { formatDate } from '@/lib/dateUtils';
import { formatCurrency } from '@/lib/formatters';
import { cn } from '@/lib/cn';
import { conteudoDemo } from '@/lib/conteudoDemo';
import { Avatar, EmptyState, Icon, Skeleton, STATUS_LABEL, STATUS_STRIPE_CLASS } from '@/components/ui';
import { DateNavigationBar } from '@/components/appointments/DateNavigationBar';
import { AppointmentCard } from '@/components/appointments/AppointmentCard';
import {
  LinhaDoTempo,
  agruparPorProfissional,
  calcularFaixaHoras,
  calcularVagasLivres,
  tomDoProfissional,
} from '@/components/appointments/LinhaDoTempo';
import { CreateAppointmentModal } from '@/components/appointments/CreateAppointmentModal';
import type { AppointmentFormData } from '@/components/appointments/CreateAppointmentModal';
import { useNewAppointmentParam } from '@/hooks/useNewAppointmentParam';
import type { Appointment, Client, Professional, Service } from '@/types';
import { getApiErrorMessage } from '@/utils/handleApiError';
import { Calendar, Plus } from 'lucide-react';

type ViewMode = 'day' | 'week';
type StatusFilter = 'todos' | 'confirmado' | 'concluido' | 'cancelado';

/** Legenda de status do arquivo de referência, reduzida aos status que existem. */
const STATUS_DA_LEGENDA: readonly ('confirmado' | 'concluido' | 'cancelado')[] = [
  'confirmado',
  'concluido',
  'cancelado',
];

const primeiroNome = (nome: string) => nome.trim().split(/\s+/)[0] || nome;

export function AppointmentModule() {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  // Inicia vazio: getToday() depende da hora local e divergiria entre SSR (UTC)
  // e cliente (BR), causando hydration mismatch (React #418). Definido no mount.
  const [selectedDate, setSelectedDate] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('day');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('todos');
  const [showModal, setShowModal] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const { showToast } = useToast();
  const newAppointment = useNewAppointmentParam();

  // Modal data
  const [clients, setClients] = useState<Client[]>([]);
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [availableSlots, setAvailableSlots] = useState<string[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);

  const loadAppointments = useCallback(async () => {
    if (!selectedDate) return;
    try {
      setLoading(true);
      const params: Record<string, string> = { date: selectedDate, view: viewMode };
      const response = await api.get('/appointments', { params });
      setAppointments(response.data);
    } catch {
      showToast('Erro ao carregar agendamentos', 'error');
    } finally {
      setLoading(false);
    }
  }, [selectedDate, showToast, viewMode]);

  useEffect(() => {
    setSelectedDate(getToday());
  }, []);

  useEffect(() => {
    loadAppointments();
  }, [loadAppointments]);

  const openModal = async () => {
    setShowModal(true);
    setAvailableSlots([]);
    try {
      const [clientsRes, professionalsRes, servicesRes] = await Promise.all([
        api.get('/clients'),
        api.get('/business/professionals'),
        api.get('/business/services'),
      ]);
      setClients(clientsRes.data);
      setProfessionals(professionalsRes.data);
      setServices(servicesRes.data);
    } catch {
      showToast('Erro ao carregar dados do formulário', 'error');
    }
  };

  useEffect(() => {
    if (newAppointment.open) openModal();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newAppointment.open]);

  const loadAvailableSlots = async (professionalId: string, date: string, serviceId: string) => {
    if (!professionalId || !date) return;
    try {
      setSlotsLoading(true);
      const params: Record<string, string> = { professionalId, date };
      if (serviceId) params.serviceId = serviceId;
      const response = await api.get('/appointments/available-slots', { params });
      setAvailableSlots(response.data);
    } catch {
      showToast('Erro ao carregar horários', 'error');
    } finally {
      setSlotsLoading(false);
    }
  };

  const handleSubmit = async (formData: AppointmentFormData) => {
    await api.post('/appointments', formData);
    showToast('Agendamento criado com sucesso!', 'success');
    loadAppointments();
  };

  // ✅ CORRIGIDO: usa URL dinâmica /appointments/${id}/status
  const handleStatusChange = async (id: string, status: 'concluido' | 'cancelado') => {
    try {
      setActionLoading(id);
      await api.put(`/appointments/${id}/status`, { status });
      showToast(
        status === 'concluido' ? 'Atendimento concluído!' : 'Agendamento cancelado',
        status === 'concluido' ? 'success' : 'info'
      );
      loadAppointments();
    } catch (error: unknown) {
      const message = getApiErrorMessage(error, 'Erro ao atualizar status');
      showToast(message, 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const closeModal = () => {
    setShowModal(false);
    newAppointment.clear();
  };

  const filteredAppointments = appointments.filter(
    a => statusFilter === 'todos' || a.status === statusFilter
  );

  const groupedByDate = filteredAppointments.reduce<Record<string, Appointment[]>>((acc, appointment) => {
    const date = appointment.date.split('T')[0];
    if (!acc[date]) acc[date] = [];
    acc[date].push(appointment);
    return acc;
  }, {});

  const stats = {
    total: appointments.length,
    confirmados: appointments.filter(a => a.status === 'confirmado').length,
    concluidos: appointments.filter(a => a.status === 'concluido').length,
    cancelados: appointments.filter(a => a.status === 'cancelado').length,
  };

  // ── Números do sub-cabeçalho, todos derivados dos agendamentos carregados ──────
  const duracaoMinutos = conteudoDemo.agenda.duracaoPadraoMinutos;
  const ehDia = viewMode === 'day';
  const naoCancelados = appointments.filter(a => a.status !== 'cancelado');
  const faturamento = appointments
    .filter(a => a.status === 'concluido')
    .reduce((soma, a) => soma + Number(a.service_price || 0), 0);
  const totalPrevisto = naoCancelados.reduce((soma, a) => soma + Number(a.service_price || 0), 0);
  const colunas = agruparPorProfissional(appointments);
  const faixa = calcularFaixaHoras(appointments, duracaoMinutos);
  const vagasLivres = colunas.flatMap(coluna =>
    calcularVagasLivres(coluna.agendamentos, faixa, duracaoMinutos)
  );
  const minutosDisponiveis = Math.max(colunas.length, 1) * (faixa.fimMinutos - faixa.inicioMinutos);
  const ocupacao = Math.round((naoCancelados.length * duracaoMinutos * 100) / minutosDisponiveis);
  const grupos = Object.entries(groupedByDate)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, dayAppointments]) => [
      date,
      [...dayAppointments].sort((a, b) => a.time.localeCompare(b.time)),
    ] as const);
  const temConfirmado = filteredAppointments.some(a => a.status === 'confirmado');

  return (
    <div className="flex flex-col gap-4 lg:gap-5">
      <h1 className="sr-only">Agenda</h1>

      {selectedDate && (
        <DateNavigationBar
          selectedDate={selectedDate}
          viewMode={viewMode}
          statusFilter={statusFilter}
          onDateChange={setSelectedDate}
          onViewModeChange={setViewMode}
          onStatusFilterChange={setStatusFilter}
          onNovoAgendamento={openModal}
        />
      )}

      {/* Pílulas de profissional (agenda-mobile.html): contagem real por profissional.
          Sem foto porque o DTO de /appointments só traz o nome, então o Avatar cai nas
          iniciais. Não filtram nada: filtrar por profissional seria função nova. */}
      {colunas.length > 0 && (
        <ul className="-mx-4 flex items-center gap-1 overflow-x-auto px-4 lg:hidden">
          <li className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-full bg-brand pl-2 pr-3.5 text-[13px] font-bold text-on-brand">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-on-brand/15">
              <Icon name="group" size={18} />
            </span>
            <span className="tabular-nums">Todas ({stats.total})</span>
          </li>
          {colunas.map((coluna, indice) => {
            const tom = tomDoProfissional(indice);
            return (
              <li
                key={coluna.id}
                className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-full bg-surface-2 pl-1.5 pr-3 text-[13px] text-ink"
              >
                <Avatar
                  name={coluna.nome}
                  size={32}
                  className={cn('text-[11px] font-bold', tom.fundo, tom.texto)}
                />
                <span className="tabular-nums">
                  {primeiroNome(coluna.nome)} ({coluna.agendamentos.length})
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {/* Sub-cabeçalho operacional: KPIs do dia + legenda (agenda-desktop.html) e a
          linha de ocupação do celular (agenda-mobile.html). */}
      <div className="flex flex-col gap-3 rounded-card border border-line bg-surface px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="hidden items-center gap-3 text-[14px] lg:flex">
          <div className="flex items-center gap-1.5 font-bold text-ink">
            <span className="h-2 w-2 rounded-full bg-brand" />
            <span className="tabular-nums">
              {stats.total} agendamento{stats.total === 1 ? '' : 's'}
            </span>
          </div>
          <span className="text-muted">·</span>
          <div className="flex items-center gap-1">
            <span className="text-muted">Faturamento:</span>
            <span className="font-bold tabular-nums text-success-text">
              {formatCurrency(faturamento, { cents: false })}
            </span>
          </div>
          {ehDia && (
            <>
              <span className="text-muted">·</span>
              <div className="flex items-center gap-1 text-muted">
                <span className="font-bold tabular-nums text-tertiary">{vagasLivres.length}</span> horários livres
              </div>
            </>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 lg:hidden">
          <div className="flex items-center gap-2">
            {ehDia ? (
              <>
                <span className="h-2 w-2 rounded-full bg-success" />
                <span className="text-[13px] font-semibold tabular-nums text-ink">{ocupacao}% de ocupação</span>
                <span className="text-[14px] text-muted">·</span>
                <span className="text-[14px] tabular-nums text-muted">
                  {vagasLivres.length} vagas livres
                </span>
              </>
            ) : (
              <>
                <span className="h-2 w-2 rounded-full bg-brand" />
                <span className="text-[13px] font-semibold tabular-nums text-ink">
                  {stats.total} agendamento{stats.total === 1 ? '' : 's'} na semana
                </span>
              </>
            )}
          </div>
          <span className="shrink-0 text-[11px] font-bold tabular-nums text-brand-text">
            {faixa.horaInicio}h às {faixa.horaFim}h
          </span>
        </div>

        <div className="hidden flex-wrap items-center gap-3 text-[11px] font-semibold text-muted lg:flex">
          {STATUS_DA_LEGENDA.map(status => (
            <div key={status} className="flex items-center gap-1.5">
              <span
                className={cn(
                  'h-2.5 w-2.5 rounded-sm',
                  STATUS_STRIPE_CLASS[status],
                  status === 'cancelado' && 'opacity-70',
                )}
              />
              <span className={status === 'cancelado' ? 'line-through' : undefined}>{STATUS_LABEL[status]}</span>
            </div>
          ))}
        </div>
      </div>

      {loading ? (
        <>
          <div className="flex flex-col gap-3 lg:hidden">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-24 w-full" label={i === 0 ? 'Carregando agendamentos...' : undefined} />
            ))}
          </div>
          <Skeleton className="hidden h-[480px] w-full lg:block" />
        </>
      ) : filteredAppointments.length === 0 ? (
        <EmptyState
          icon={Calendar}
          title="Nenhum agendamento"
          description={
            statusFilter !== 'todos'
              ? `Nenhum agendamento com este status neste período.`
              : 'Não há agendamentos para este período. Crie um novo agendamento para começar!'
          }
          action={{ label: 'Criar Agendamento', icon: Plus, onClick: openModal }}
          actionVariant="secondary"
        />
      ) : (
        <>
          {/* Celular: lista de cartões com gesto (agenda-mobile.html) */}
          <div className="flex flex-col gap-3 lg:hidden">
            {temConfirmado && (
              <div className="flex items-center justify-center gap-1.5 self-center rounded-full bg-surface-2 px-3 py-1.5 text-[11px] font-semibold text-muted">
                <Icon name="swipe" size={16} className="text-brand" />
                <span>Deslize o cartão para concluir ou cancelar</span>
              </div>
            )}
            {grupos.map(([date, dayAppointments]) => (
              <div key={date} className="flex flex-col gap-2">
                {!ehDia && (
                  <h3 className="flex items-center gap-2 text-[13px] font-semibold capitalize text-muted">
                    <Icon name="calendar_today" size={14} />
                    {formatDate(date)}
                  </h3>
                )}
                {dayAppointments.map(appointment => (
                  <AppointmentCard
                    key={appointment.id}
                    appointment={appointment}
                    actionLoading={actionLoading}
                    duracaoMinutos={duracaoMinutos}
                    onStatusChange={handleStatusChange}
                  />
                ))}
              </div>
            ))}
            {ehDia && (
              <div className="mt-1 flex items-center justify-between gap-3 rounded-card bg-surface-2 p-4">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand/20 text-brand-text">
                    <Icon name="insights" size={22} />
                  </span>
                  <div className="flex min-w-0 flex-col">
                    <span className="text-[17px] font-semibold leading-tight text-ink">Total previsto hoje</span>
                    <span className="text-[14px] tabular-nums text-muted">
                      {stats.confirmados} confirmados · {stats.concluidos} concluídos
                    </span>
                  </div>
                </div>
                <span className="shrink-0 text-[24px] font-bold tabular-nums text-ink">
                  {formatCurrency(totalPrevisto, { cents: false })}
                </span>
              </div>
            )}
          </div>

          {/* Computador: linha do tempo por dia (agenda-desktop.html) */}
          <div className="hidden flex-col gap-5 lg:flex">
            {grupos.map(([date, dayAppointments]) => (
              <div key={date} className="flex flex-col gap-2">
                {!ehDia && (
                  <h3 className="flex items-center gap-2 text-[13px] font-semibold capitalize text-muted">
                    <Icon name="calendar_today" size={14} />
                    {formatDate(date)}
                  </h3>
                )}
                <LinhaDoTempo
                  agendamentos={dayAppointments}
                  duracaoPadraoMinutos={duracaoMinutos}
                  actionLoading={actionLoading}
                  mostrarAgora={date === getToday()}
                  onStatusChange={handleStatusChange}
                  onNovoAgendamento={openModal}
                />
              </div>
            ))}
          </div>
        </>
      )}

      <CreateAppointmentModal
        isOpen={showModal}
        onClose={closeModal}
        clients={clients}
        professionals={professionals}
        services={services}
        availableSlots={availableSlots}
        slotsLoading={slotsLoading}
        onLoadSlots={loadAvailableSlots}
        onSubmit={handleSubmit}
      />
    </div>
  );
}
