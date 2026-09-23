'use client';

import { useEffect, useState, useCallback } from 'react';
import api from '@/lib/api';
import { useToast } from '@/components/Toast';
import { getToday } from '@/lib/dateUtils';
import { formatDate } from '@/lib/dateUtils';
import { PageHeader, MetricCard, EmptyState, Button, Skeleton } from '@/components/ui';
import { DateNavigationBar } from '@/components/appointments/DateNavigationBar';
import { AppointmentCard } from '@/components/appointments/AppointmentCard';
import { CreateAppointmentModal } from '@/components/appointments/CreateAppointmentModal';
import type { AppointmentFormData } from '@/components/appointments/CreateAppointmentModal';
import { useNewAppointmentParam } from '@/hooks/useNewAppointmentParam';
import type { Appointment, Client, Professional, Service } from '@/types';
import { getApiErrorMessage } from '@/utils/handleApiError';
import { Calendar, Plus } from 'lucide-react';

type ViewMode = 'day' | 'week';
type StatusFilter = 'todos' | 'confirmado' | 'concluido' | 'cancelado';

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

  return (
    <div>
      <PageHeader
        title="Agenda"
        action={
          <Button onClick={openModal}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            Novo Agendamento
          </Button>
        }
      />

      {/* Stats Cards */}
      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        <MetricCard label="Total" value={stats.total} />
        <MetricCard label="Confirmados" value={stats.confirmados} />
        <MetricCard label="Concluídos" value={stats.concluidos} />
        <MetricCard label="Cancelados" value={stats.cancelados} />
      </div>

      {selectedDate && (
        <DateNavigationBar
          selectedDate={selectedDate}
          viewMode={viewMode}
          statusFilter={statusFilter}
          onDateChange={setSelectedDate}
          onViewModeChange={setViewMode}
          onStatusFilterChange={setStatusFilter}
        />
      )}

      {/* Appointments List */}
      {loading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full" label={i === 0 ? 'Carregando agendamentos...' : undefined} />
          ))}
        </div>
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
        <div className="space-y-6">
          {Object.entries(groupedByDate)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([date, dayAppointments]) => (
              <div key={date}>
                {viewMode === 'week' && (
                  <h3 className="mb-3 flex items-center gap-2 text-[13px] font-semibold capitalize text-muted">
                    <Calendar size={14} />
                    {formatDate(date)}
                  </h3>
                )}
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {dayAppointments
                    .sort((a, b) => a.time.localeCompare(b.time))
                    .map(appointment => (
                      <AppointmentCard
                        key={appointment.id}
                        appointment={appointment}
                        actionLoading={actionLoading}
                        onStatusChange={handleStatusChange}
                      />
                    ))}
                </div>
              </div>
            ))}
        </div>
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
