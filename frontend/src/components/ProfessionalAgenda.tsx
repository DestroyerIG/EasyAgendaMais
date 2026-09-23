'use client';

import { useEffect, useState, useCallback } from 'react';
import api from '@/lib/api';
import { useToast } from '@/components/Toast';
import type { Appointment, Professional } from '@/types';
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import { Card, Avatar, IconButton, Button, StatusChip, STATUS_STRIPE_CLASS, EmptyState, Skeleton } from '@/components/ui';
import { cn } from '@/lib/cn';

interface ProfessionalAgendaProps {
    professional: Professional;
}

const formatDate = (dateStr: string) => {
    const date = new Date(dateStr + 'T12:00:00');
    return date.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });
};

const getToday = () => {
    const now = new Date();
    const offset = now.getTimezoneOffset();
    const local = new Date(now.getTime() - offset * 60000);
    return local.toISOString().split('T')[0];
};

const addDays = (dateStr: string, days: number) => {
    const date = new Date(dateStr + 'T12:00:00');
    date.setDate(date.getDate() + days);
    return date.toISOString().split('T')[0];
};

export function ProfessionalAgenda({ professional }: ProfessionalAgendaProps) {
    const [appointments, setAppointments] = useState<Appointment[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedDate, setSelectedDate] = useState(getToday());
    const { showToast } = useToast();

    const loadAppointments = useCallback(async () => {
        try {
            setLoading(true);
            const params = {
                date: selectedDate,
                view: 'day',
                professionalId: professional.id
            };
            const response = await api.get('/appointments', { params });
            setAppointments(response.data);
        } catch {
            showToast('Erro ao carregar agenda', 'error');
        } finally {
            setLoading(false);
        }
    }, [professional.id, selectedDate, showToast]);

    useEffect(() => {
        loadAppointments();
    }, [loadAppointments]);

    return (
        <div>
            <Card className="mb-6 flex items-center gap-4">
                <Avatar name={professional.name} src={professional.photo} size={64} />
                <div>
                    <h2 className="text-lg font-bold text-ink">Agenda: {professional.name}</h2>
                    <p className="capitalize text-muted">{formatDate(selectedDate)}</p>
                </div>
            </Card>

            <div className="mb-8 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <IconButton
                        icon={ChevronLeft}
                        label="Dia anterior"
                        variant="secondary"
                        onClick={() => setSelectedDate(addDays(selectedDate, -1))}
                    />
                    <Button variant="secondary" size="sm" onClick={() => setSelectedDate(getToday())}>
                        Hoje
                    </Button>
                    <IconButton
                        icon={ChevronRight}
                        label="Próximo dia"
                        variant="secondary"
                        onClick={() => setSelectedDate(addDays(selectedDate, 1))}
                    />
                </div>

                <div className="rounded-control border border-line bg-surface-2 px-4 py-2 text-[13px] font-semibold text-brand-text">
                    {appointments.length} Atendimento(s)
                </div>
            </div>

            {loading ? (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    {Array.from({ length: 2 }).map((_, i) => (
                        <Skeleton key={i} className="h-20 w-full" />
                    ))}
                </div>
            ) : appointments.length === 0 ? (
                <EmptyState
                    icon={Calendar}
                    title="Nenhum agendamento para hoje"
                    description="Este profissional está livre no momento."
                />
            ) : (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    {appointments.map(appointment => (
                        <Card key={appointment.id} className="flex items-center gap-3">
                            <div className="min-w-[56px] text-center">
                                <p className="text-lg font-bold leading-tight tabular-nums text-ink">
                                    {appointment.time.substring(0, 5)}
                                </p>
                            </div>
                            <div className={cn('w-1 shrink-0 self-stretch rounded-full', STATUS_STRIPE_CLASS[appointment.status])} />
                            <div className="min-w-0 flex-1">
                                <h4 className="truncate font-semibold text-ink">{appointment.client_name}</h4>
                                <p className="truncate text-[13px] text-muted">{appointment.service_name}</p>
                            </div>
                            <StatusChip status={appointment.status} />
                        </Card>
                    ))}
                </div>
            )}
        </div>
    );
}
