'use client';

import { useState, useEffect, useCallback } from 'react';
import api from '@/lib/api';
import { useToast } from './Toast';
import {
  PageHeader,
  Button,
  IconButton,
  Card,
  EmptyState,
  Skeleton,
  Avatar,
  Input,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableHeaderCell,
  TableCell,
  SidePanel,
} from '@/components/ui';
import { ClientDetailPanel } from '@/components/clients/ClientDetailPanel';
import { ClientFormModal } from '@/components/clients/ClientFormModal';
import type { ClientFormData } from '@/components/clients/ClientFormModal';
import { getApiErrorMessage } from '@/utils/handleApiError';
import { cn } from '@/lib/cn';
import { UserPlus, Search, Edit2, Users } from 'lucide-react';
import type { Client, Appointment } from '@/types';

function formatLastVisit(dateString: string | null) {
  if (!dateString) return 'Nunca';
  return new Date(dateString).toLocaleDateString('pt-BR');
}

export const ClientModule = () => {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [history, setHistory] = useState<Appointment[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const { showToast } = useToast();

  const loadClients = useCallback(async () => {
    try {
      const response = await api.get('/clients');
      setClients(response.data);
    } catch {
      showToast('Erro ao carregar clientes', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadClients();
  }, [loadClients]);

  const loadHistory = async (clientId: string) => {
    setLoadingHistory(true);
    try {
      const response = await api.get(`/clients/${clientId}/history`);
      setHistory(response.data);
    } catch {
      showToast('Erro ao carregar histórico', 'error');
    } finally {
      setLoadingHistory(false);
    }
  };

  const selectClient = (client: Client) => {
    setSelectedClient(client);
    loadHistory(client.id);
  };

  const closeClientDetail = () => {
    setSelectedClient(null);
  };

  const handleOpenModal = (client?: Client) => {
    setEditingClient(client || null);
    setIsModalOpen(true);
  };

  const handleSubmitClient = async (data: ClientFormData) => {
    // Mapeia birthDate → birth_date conforme esperado pelo backend
    const payload = {
      name: data.name,
      phone: data.phone,
      email: data.email || null,
      birth_date: data.birthDate || null,
      address: data.address || null,
      notes: data.notes || null,
    };

    try {
      if (editingClient) {
        await api.put(`/clients/${editingClient.id}`, payload);
        showToast('Cliente atualizado com sucesso', 'success');
      } else {
        await api.post('/clients', payload);
        showToast('Cliente cadastrado com sucesso', 'success');
      }
      await loadClients();
    } catch (error) {
      const fallback = editingClient
        ? 'Erro ao atualizar cliente'
        : 'Erro ao cadastrar cliente';
      showToast(getApiErrorMessage(error, fallback), 'error');
      throw error;
    }
  };

  const filteredClients = clients.filter(c =>
    c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.phone.includes(searchTerm)
  );

  return (
    <div>
      <PageHeader
        title="Clientes"
        action={
          <Button onClick={() => handleOpenModal()}>
            <UserPlus className="h-4 w-4" aria-hidden="true" />
            Novo Cliente
          </Button>
        }
      />

      <div className="relative mb-4 max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden="true" />
        <Input
          type="text"
          placeholder="Buscar por nome ou telefone..."
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          className="pl-10"
        />
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" label={i === 0 ? 'Carregando clientes...' : undefined} />
          ))}
        </div>
      ) : filteredClients.length === 0 ? (
        searchTerm ? (
          <EmptyState
            icon={Users}
            title="Nenhum cliente encontrado"
            description="Nenhum cliente corresponde à busca atual."
          />
        ) : (
          <EmptyState
            icon={Users}
            title="Nenhum cliente cadastrado ainda"
            action={{ label: 'Novo Cliente', icon: UserPlus, onClick: () => handleOpenModal() }}
            actionVariant="secondary"
          />
        )
      ) : (
        <>
          {/* Desktop: tabela */}
          <div className="hidden lg:block">
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeaderCell>Cliente</TableHeaderCell>
                  <TableHeaderCell>Telefone</TableHeaderCell>
                  <TableHeaderCell>Último atendimento</TableHeaderCell>
                  <TableHeaderCell className="text-right">Ações</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredClients.map(client => (
                  <TableRow
                    key={client.id}
                    onClick={() => selectClient(client)}
                    className={cn(
                      'cursor-pointer hover:bg-surface-2',
                      selectedClient?.id === client.id && 'bg-surface-2',
                    )}
                  >
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar name={client.name} />
                        <span className="font-semibold text-ink">{client.name}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted">{client.phone}</TableCell>
                    <TableCell className="tabular-nums text-muted">{formatLastVisit(client.last_visit)}</TableCell>
                    <TableCell className="text-right">
                      <IconButton
                        icon={Edit2}
                        label="Editar cliente"
                        onClick={e => {
                          e.stopPropagation();
                          handleOpenModal(client);
                        }}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Celular: cartões */}
          <div className="space-y-3 lg:hidden">
            {filteredClients.map(client => (
              <Card
                key={client.id}
                onClick={() => selectClient(client)}
                className={cn(
                  'flex cursor-pointer items-center justify-between gap-3',
                  selectedClient?.id === client.id && 'bg-surface-2',
                )}
              >
                <div className="flex min-w-0 items-center gap-3">
                  <Avatar name={client.name} />
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-ink">{client.name}</p>
                    <p className="truncate text-[13px] text-muted">{client.phone}</p>
                    <p className="tabular-nums text-[13px] text-muted">{formatLastVisit(client.last_visit)}</p>
                  </div>
                </div>
                <IconButton
                  icon={Edit2}
                  label="Editar cliente"
                  onClick={e => {
                    e.stopPropagation();
                    handleOpenModal(client);
                  }}
                />
              </Card>
            ))}
          </div>
        </>
      )}

      <SidePanel
        open={!!selectedClient}
        onOpenChange={open => {
          if (!open) closeClientDetail();
        }}
        title={selectedClient?.name ?? ''}
        side="right"
      >
        {selectedClient ? (
          <ClientDetailPanel
            client={selectedClient}
            history={history}
            loadingHistory={loadingHistory}
            onEdit={() => handleOpenModal(selectedClient)}
          />
        ) : null}
      </SidePanel>

      <ClientFormModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSubmit={handleSubmitClient}
        editingClient={editingClient}
      />
    </div>
  );
};
