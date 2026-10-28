'use client';

/**
 * Tela Clientes (Stitch "Ajustada", 805f33): cabeçalho, alternador Lista/Fases, "Nova
 * cliente" e o modal de cadastro/edição. A lista é o CRM real (ListaClientes, dados de
 * GET /clients/insights); a linha abre a ficha em /clientes/<id>. A visão por fases
 * é o kanban do CRM (FasesClientes).
 */

import { useCallback, useState } from 'react';
import api from '@/lib/api';
import { useToast } from './Toast';
import { Icon } from '@/components/ui';
import { ClientFormModal } from '@/components/clients/ClientFormModal';
import type { ClientFormData } from '@/components/clients/ClientFormModal';
import { ListaClientes } from '@/components/clientes/ListaClientes';
import { FasesClientes } from '@/components/clientes/FasesClientes';
import { useAuth } from '@/contexts/AuthContext';
import { getApiErrorMessage } from '@/utils/handleApiError';
import { cn } from '@/lib/cn';
import type { ClienteInsight } from '@/lib/crm';
import type { Client } from '@/types';
import { useVocabulario } from '@/hooks/useVocabulario';
import { useBloqueadoNaCarencia } from '@/hooks/useBloqueadoNaCarencia';

type Visao = 'lista' | 'fases';

export const ClientModule = () => {
  const { user } = useAuth();
  const { cli } = useVocabulario();
  const { showToast } = useToast();
  const { bloqueado, dica } = useBloqueadoNaCarencia();
  const [visao, setVisao] = useState<Visao>('lista');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [versao, setVersao] = useState(0);
  const [totalGeral, setTotalGeral] = useState<number | null>(null);

  const novaCliente = () => {
    if (bloqueado) return;
    setEditingClient(null);
    setIsModalOpen(true);
  };

  // O DTO do CRM não traz endereço nem observações: edita a partir do cadastro completo
  // (GET /clients) para não apagar esses campos ao salvar.
  const editar = useCallback(
    async (cliente: ClienteInsight) => {
      try {
        const { data } = await api.get<Client[]>('/clients');
        const completo = Array.isArray(data) ? data.find((c) => c.id === cliente.id) : undefined;
        if (!completo) {
          showToast('Cliente não encontrada', 'error');
          return;
        }
        setEditingClient(completo);
        setIsModalOpen(true);
      } catch {
        showToast('Erro ao carregar cliente', 'error');
      }
    },
    [showToast],
  );

  const handleSubmitClient = async (data: ClientFormData) => {
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
        showToast('Cliente atualizada com sucesso', 'success');
      } else {
        await api.post('/clients', payload);
        showToast('Cliente cadastrada com sucesso', 'success');
      }
      setVersao((v) => v + 1);
    } catch (error) {
      const fallback = editingClient ? 'Erro ao atualizar cliente' : 'Erro ao cadastrar cliente';
      showToast(getApiErrorMessage(error, fallback), 'error');
      throw error;
    }
  };

  const botaoVisao = (valor: Visao, icone: string, rotulo: string) => (
    <button
      type="button"
      role="tab"
      aria-selected={visao === valor}
      onClick={() => setVisao(valor)}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[14px] font-semibold transition-all',
        visao === valor ? 'bg-surface text-ink shadow-sm' : 'text-muted hover:text-ink',
      )}
    >
      <Icon name={icone} size={18} />
      {rotulo}
    </button>
  );

  return (
    <div className="flex w-full flex-col">
      <div className="mb-6 flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-[26px] font-bold tracking-tight text-ink">Clientes</h1>
            {user?.businessName && (
              <span className="inline-flex items-center rounded-full bg-surface-2 px-2 py-0.5 text-[12px] font-semibold text-muted">
                {user.businessName}
              </span>
            )}
          </div>
          {totalGeral !== null && (
            <p className="mt-1 text-[14px] text-muted">
              {totalGeral} {totalGeral === 1 ? `cliente ${cli.g('cadastrada', 'cadastrado')}` : `clientes ${cli.g('cadastradas', 'cadastrados')}`}
            </p>
          )}
        </div>
        <div className="flex items-center gap-3 self-start md:self-auto">
          <div className="inline-flex rounded-xl bg-surface-2 p-1" role="tablist" aria-label="Visão">
            {botaoVisao('lista', 'format_list_bulleted', 'Lista')}
            {botaoVisao('fases', 'view_kanban', 'Fases')}
          </div>
          <button
            type="button"
            onClick={novaCliente}
            disabled={bloqueado}
            title={dica}
            className="disabled:cursor-not-allowed disabled:opacity-50 inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2.5 text-[14px] font-semibold text-on-brand shadow-sm transition-all hover:brightness-95 active:scale-[0.98]"
          >
            <Icon name="person_add" size={20} />
            <span>Nova cliente</span>
          </button>
        </div>
      </div>

      {visao === 'lista' ? (
        <ListaClientes
          nomeNegocio={user?.businessName}
          onNovaCliente={novaCliente}
          onEditar={editar}
          versao={versao}
          onTotalGeral={setTotalGeral}
        />
      ) : (
        <FasesClientes nomeNegocio={user?.businessName} versao={versao} />
      )}

      <ClientFormModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSubmit={handleSubmitClient}
        editingClient={editingClient}
      />
    </div>
  );
};
