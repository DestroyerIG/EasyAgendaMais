'use client';

import { Phone, Edit2, TrendingUp, Calendar, Mail, Clock, MapPin, FileText } from 'lucide-react';
import { formatCurrency } from '@/lib/formatters';
import { Button, Table, TableHead, TableBody, TableRow, TableHeaderCell, TableCell } from '@/components/ui';
import type { Client, Appointment } from '@/types';

function formatDate(dateString: string | null) {
  if (!dateString) return 'Nunca';
  return new Date(dateString).toLocaleDateString('pt-BR');
}

interface ClientDetailPanelProps {
  client: Client;
  history: Appointment[];
  loadingHistory: boolean;
  onEdit: () => void;
}

export function ClientDetailPanel({ client, history, loadingHistory, onEdit }: ClientDetailPanelProps) {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <p className="flex items-center gap-2 text-[15px] text-muted">
          <Phone className="h-[14px] w-[14px] text-brand-text" aria-hidden="true" /> {client.phone}
        </p>
        <Button variant="secondary" size="sm" onClick={onEdit}>
          <Edit2 className="h-4 w-4" aria-hidden="true" />
          Editar
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-card border border-line bg-surface-2 p-4">
          <TrendingUp className="mb-2 h-5 w-5 text-success" aria-hidden="true" />
          <p className="text-[13px] font-semibold text-muted">Gasto Total</p>
          <p className="text-lg font-bold text-ink">{formatCurrency(client.total_spent)}</p>
        </div>
        <div className="rounded-card border border-line bg-surface-2 p-4">
          <Calendar className="mb-2 h-5 w-5 text-brand-text" aria-hidden="true" />
          <p className="text-[13px] font-semibold text-muted">Última Visita</p>
          <p className="text-lg font-bold text-ink">{formatDate(client.last_visit)}</p>
        </div>
        <div className="rounded-card border border-line bg-surface-2 p-4">
          <Mail className="mb-2 h-5 w-5 text-brand-text" aria-hidden="true" />
          <p className="text-[13px] font-semibold text-muted">E-mail</p>
          <p className="truncate text-[15px] font-medium text-ink" title={client.email || 'Não informado'}>
            {client.email || 'Não informado'}
          </p>
        </div>
        <div className="rounded-card border border-line bg-surface-2 p-4">
          <Clock className="mb-2 h-5 w-5 text-brand-text" aria-hidden="true" />
          <p className="text-[13px] font-semibold text-muted">Cliente desde</p>
          <p className="text-lg font-bold text-ink">{formatDate(client.created_at)}</p>
        </div>
      </div>

      {/* Info Section */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 border-b border-line pb-2">
          <FileText className="h-5 w-5 text-brand-text" aria-hidden="true" />
          <h4 className="text-[13px] font-semibold text-ink">Informações de Cadastro</h4>
        </div>
        <div className="grid grid-cols-1 gap-4 text-[15px] sm:grid-cols-2">
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <MapPin className="mt-1 h-[18px] w-[18px] text-muted" aria-hidden="true" />
              <div>
                <p className="text-[13px] font-semibold text-muted">Endereço</p>
                <p className="text-ink">{client.address || 'Não cadastrado'}</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Calendar className="mt-1 h-[18px] w-[18px] text-muted" aria-hidden="true" />
              <div>
                <p className="text-[13px] font-semibold text-muted">Nascimento</p>
                <p className="text-ink">
                  {client.birth_date ? new Date(client.birth_date).toLocaleDateString('pt-BR') : 'Não informado'}
                </p>
              </div>
            </div>
          </div>
          <div className="rounded-card border border-line bg-surface-2 p-4">
            <p className="mb-2 text-[13px] font-semibold text-muted">Notas / Observações</p>
            <p className="italic text-ink">{client.notes || 'Nenhuma observação adicionada.'}</p>
          </div>
        </div>
      </div>

      {/* History */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 border-b border-line pb-2">
          <Clock className="h-5 w-5 text-brand-text" aria-hidden="true" />
          <h4 className="text-[13px] font-semibold text-ink">Histórico de Atendimento</h4>
        </div>
        {loadingHistory ? (
          <p className="p-6 text-center text-[15px] text-muted">Buscando histórico...</p>
        ) : history.length === 0 ? (
          <p className="p-6 text-center text-[15px] text-muted">Nenhum atendimento anterior encontrado.</p>
        ) : (
          <Table minWidth={480}>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Data</TableHeaderCell>
                <TableHeaderCell>Profissional</TableHeaderCell>
                <TableHeaderCell>Serviço</TableHeaderCell>
                <TableHeaderCell className="text-right">Valor</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {history.map(item => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium">{formatDate(item.date)}</TableCell>
                  <TableCell>
                    <span className="inline-flex items-center rounded-full border border-line bg-brand/12 px-3 py-1 text-[13px] font-bold text-brand-text">
                      {item.professional_name || 'Não informado'}
                    </span>
                  </TableCell>
                  <TableCell className="text-muted">{item.service_name || 'Não informado'}</TableCell>
                  <TableCell className="text-right font-bold">{formatCurrency(item.service_price ?? 0)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
