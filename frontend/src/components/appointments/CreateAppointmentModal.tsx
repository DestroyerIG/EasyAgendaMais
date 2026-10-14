'use client';

import { useEffect, useRef, useState } from 'react';
import { Plus, Search, AlertCircle, XCircle, Loader2 } from 'lucide-react';
import { formatCurrency, formatDurationExtenso } from '@/lib/formatters';
import { cn } from '@/lib/cn';
import { Modal, ModalFooter, Field, Select, Input } from '@/components/ui';
import type { Client, Professional, Service } from '@/types';

interface CreateAppointmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  clients: Client[];
  professionals: Professional[];
  services: Service[];
  availableSlots: string[];
  slotsLoading: boolean;
  onLoadSlots: (professionalId: string, date: string, serviceId: string) => void;
  onSubmit: (data: AppointmentFormData) => Promise<void>;
  /**
   * Pré-preenchimento: profissional, data e horário de um clique em horário livre da
   * Agenda; ao remarcar, também a cliente e o serviço do agendamento.
   */
  inicial?: { professionalId?: string; date?: string; time?: string; clientId?: string; serviceId?: string };
  /** Remarcando um agendamento existente: muda o título e o botão (quem salva é o pai, com PUT). */
  editandoId?: string;
}

export interface AppointmentFormData {
  clientId: string;
  professionalId: string;
  serviceId: string;
  date: string;
  time: string;
}

export function CreateAppointmentModal({
  isOpen, onClose, clients, professionals, services,
  availableSlots, slotsLoading, onLoadSlots, onSubmit, inicial, editandoId
}: CreateAppointmentModalProps) {
  const today = new Date().toISOString().split('T')[0];
  const [formData, setFormData] = useState<AppointmentFormData>({
    clientId: '', professionalId: '', serviceId: '', date: today, time: '',
  });
  const [clientSearch, setClientSearch] = useState('');
  const [submitting, setSubmitting] = useState(false);
  // Horário a manter enquanto os horários disponíveis são recarregados: o do clique no
  // horário livre, ao abrir, ou o já escolhido, quando profissional, data ou serviço
  // mudam. Ele volta a ser a seleção se aparecer na lista nova; se não aparecer, some.
  const [horarioPendente, setHorarioPendente] = useState<string | null>(null);
  // A lista de horários que estava na tela quando o recarregamento foi pedido: o pendente
  // só é conferido contra uma lista nova, nunca contra essa, que é da busca anterior.
  const slotsDoPedido = useRef<string[] | null>(null);

  // Cada abertura começa do zero, já com o que o horário livre sabia (profissional, data).
  useEffect(() => {
    if (!isOpen) return;
    const professionalId = inicial?.professionalId ?? '';
    const date = inicial?.date ?? today;
    const serviceId = inicial?.serviceId ?? '';
    setFormData({ clientId: inicial?.clientId ?? '', serviceId, professionalId, date, time: '' });
    setClientSearch('');
    const pedirHorarios = Boolean(professionalId && date);
    setHorarioPendente(pedirHorarios ? inicial?.time ?? null : null);
    slotsDoPedido.current = availableSlots;
    if (pedirHorarios) onLoadSlots(professionalId, date, serviceId);
    // Só a abertura importa: `inicial` e `onLoadSlots` mudam de identidade a cada render do pai.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  useEffect(() => {
    if (!horarioPendente || slotsLoading || availableSlots === slotsDoPedido.current) return;
    if (availableSlots.includes(horarioPendente)) {
      setFormData(prev => ({ ...prev, time: horarioPendente }));
    }
    setHorarioPendente(null);
  }, [availableSlots, horarioPendente, slotsLoading]);

  const handleChange = (field: keyof AppointmentFormData, value: string) => {
    // Escolher o horário na mão vence qualquer horário pendente.
    if (field === 'time') setHorarioPendente(null);
    const newData = { ...formData, [field]: value };
    setFormData(newData);

    if (field === 'professionalId' || field === 'date' || field === 'serviceId') {
      const bId = field === 'professionalId' ? value : newData.professionalId;
      const d = field === 'date' ? value : newData.date;
      const sId = field === 'serviceId' ? value : newData.serviceId;
      if (bId && d) {
        // Guarda o horário escolhido (ou o que ainda estava pendente) para reaplicar se
        // ele continuar disponível na lista recarregada.
        setHorarioPendente(formData.time || horarioPendente);
        slotsDoPedido.current = availableSlots;
        onLoadSlots(bId, d, sId);
        setFormData(prev => ({ ...prev, [field]: value, time: '' }));
        return;
      }
    }
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      await onSubmit(formData);
      onClose();
    } catch {
      // Quem salva (o pai) já avisou o erro; o modal fica aberto para corrigir ou tentar de novo.
    } finally {
      setSubmitting(false);
    }
  };

  const filteredClients = clients.filter(c =>
    c.name.toLowerCase().includes(clientSearch.toLowerCase()) ||
    c.phone.includes(clientSearch)
  );

  const isValid = formData.clientId && formData.professionalId && formData.serviceId && formData.time;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={editandoId ? 'Remarcar agendamento' : 'Novo agendamento'}
      icon={editandoId ? 'edit_calendar' : Plus}
      footer={
        <ModalFooter
          onCancel={onClose}
          onSubmit={handleSubmit}
          submitLabel={editandoId ? 'Salvar' : 'Agendar'}
          submitIcon={editandoId ? undefined : Plus}
          submitting={submitting}
          disabled={!isValid}
        />
      }
    >
      <div className="flex flex-col gap-5">
        {/* Cliente */}
        <Field id="client-search" label="Cliente">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden="true" />
            <Input
              id="client-search"
              type="text"
              value={clientSearch}
              onChange={e => setClientSearch(e.target.value)}
              placeholder="Buscar cliente..."
              className="pl-9"
            />
          </div>
          <div className="mt-2 max-h-32 space-y-1 overflow-y-auto">
            {filteredClients.length === 0 ? (
              <p className="p-2 text-[13px] text-muted">Nenhum cliente encontrado</p>
            ) : (
              filteredClients.map(client => (
                <button
                  key={client.id}
                  type="button"
                  onClick={() => handleChange('clientId', client.id)}
                  className={cn(
                    'w-full rounded-control px-3 py-2 text-left text-[15px] transition-colors',
                    formData.clientId === client.id
                      ? 'border border-brand bg-brand/10 text-ink'
                      : 'border border-transparent text-ink hover:bg-surface-2'
                  )}
                >
                  <span className="font-semibold">{client.name}</span>
                  <span className="ml-2 text-[13px] text-muted">{client.phone}</span>
                </button>
              ))
            )}
          </div>
        </Field>

        {/* Profissional */}
        <Field
          id="professionalId"
          label="Profissional"
          hint={professionals.length === 0 ? 'Nenhum profissional cadastrado' : undefined}
        >
          <Select
            id="professionalId"
            value={formData.professionalId}
            onChange={e => handleChange('professionalId', e.target.value)}
          >
            <option value="">Selecione um profissional</option>
            {professionals.map(professional => (
              <option key={professional.id} value={professional.id}>
                {professional.name}
              </option>
            ))}
          </Select>
        </Field>

        {/* Serviço */}
        <Field
          id="serviceId"
          label="Serviço"
          hint={services.length === 0 ? 'Nenhum serviço cadastrado' : undefined}
        >
          <Select
            id="serviceId"
            value={formData.serviceId}
            onChange={e => handleChange('serviceId', e.target.value)}
          >
            <option value="">Selecione um serviço</option>
            {services.map(service => (
              <option key={service.id} value={service.id}>
                {service.name} ({formatDurationExtenso(service.duration_minutes)}) — {formatCurrency(Number(service.price))}
              </option>
            ))}
          </Select>
        </Field>

        {/* Data */}
        <Field id="date" label="Data">
          <Input
            id="date"
            type="date"
            value={formData.date}
            onChange={e => handleChange('date', e.target.value)}
          />
        </Field>

        {/* Horários Disponíveis */}
        <Field id="time-slots" label="Horário">
          {!formData.professionalId ? (
            <div className="flex items-center gap-2 rounded-control border border-line bg-warning/12 p-3">
              <AlertCircle className="h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
              <p className="text-[13px] text-warning">Selecione um profissional para ver horários</p>
            </div>
          ) : slotsLoading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-6 w-6 animate-spin text-brand-text" aria-hidden="true" />
            </div>
          ) : availableSlots.length === 0 ? (
            <div className="flex items-center gap-2 rounded-control border border-line bg-danger/12 p-3">
              <XCircle className="h-4 w-4 shrink-0 text-danger" aria-hidden="true" />
              <p className="text-[13px] text-danger">Nenhum horário disponível nesta data</p>
            </div>
          ) : (
            <div className="grid grid-cols-4 gap-2">
              {availableSlots.map(slot => (
                <button
                  key={slot}
                  type="button"
                  onClick={() => handleChange('time', slot)}
                  className={cn(
                    'rounded-control px-3 py-2.5 text-[15px] font-semibold transition-colors',
                    formData.time === slot
                      ? 'bg-brand text-on-brand'
                      : 'border border-line bg-surface text-ink hover:border-brand/40'
                  )}
                >
                  {slot}
                </button>
              ))}
            </div>
          )}
        </Field>
      </div>
    </Modal>
  );
}
