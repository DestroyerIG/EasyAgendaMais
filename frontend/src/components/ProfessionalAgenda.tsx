'use client';

import { useEffect, useState, useCallback } from 'react';
import api from '@/lib/api';
import { useToast } from '@/components/Toast';
import type { Appointment, Professional } from '@/types';
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import { Card, Avatar, IconButton, Button, EmptyState, Skeleton } from '@/components/ui';
import { CorpoCartaoAgendamento } from '@/components/appointments/AppointmentCard';
import { conteudoDemo } from '@/lib/conteudoDemo';

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

                <div className="rounded-full border border-line bg-surface-2 px-4 py-2 text-[13px] font-semibold tabular-nums text-brand-text">
                    {appointments.length} atendimento{appointments.length === 1 ? '' : 's'}
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
                        <Card key={appointment.id} className="flex items-stretch gap-3 p-3.5 sm:p-3.5">
                            {/* Tela sem referência no Stitch (ruling da Tarefa 5): fica como
                                estava em aed10f1 — só hora, faixa de status, cliente, serviço
                                e selo de status, sem duração/preço/profissional (correção I9). */}
                            <CorpoCartaoAgendamento
                                appointment={appointment}
                                duracaoMinutos={conteudoDemo.agenda.duracaoPadraoMinutos}
                                mostrarDuracaoEPreco={false}
                                mostrarNomeProfissional={false}
                                mostrarWhatsapp={false}
                            />
                        </Card>
                    ))}
                </div>
            )}
        </div>
    );
}
