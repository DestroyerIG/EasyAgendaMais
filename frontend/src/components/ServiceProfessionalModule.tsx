'use client';

import { useState, useEffect, useCallback } from 'react';
import api from '@/lib/api';
import { useToast } from './Toast';
import { Plus, ArrowLeft, Scissors, Users } from 'lucide-react';
import type { Service, Professional } from '@/types';
import { ProfessionalAgenda } from './ProfessionalAgenda';
import { PageHeader, Button, Card, Skeleton, EmptyState, Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui';
import { ServiceCard } from '@/components/services/ServiceCard';
import { ProfessionalCard } from '@/components/services/ProfessionalCard';
import { ServiceProfessionalModal } from '@/components/services/ServiceProfessionalModal';
import type { ServiceFormData, ProfessionalFormData } from '@/components/services/ServiceProfessionalModal';
import { getApiErrorMessage } from '@/utils/handleApiError';

export const ServiceProfessionalModule = () => {
  const [activeTab, setActiveTab] = useState<'servicos' | 'profissionais'>('servicos');
  const [services, setServices] = useState<Service[]>([]);
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Service | Professional | null>(null);
  const [selectedProfessionalForAgenda, setSelectedProfessionalForAgenda] = useState<Professional | null>(null);
  const { showToast } = useToast();

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [servicesRes, professionalsRes] = await Promise.all([
        api.get('/business/services'),
        api.get('/business/professionals'),
      ]);
      setServices(servicesRes.data);
      setProfessionals(professionalsRes.data);
    } catch {
      showToast('Erro ao carregar dados', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleOpenModal = (item?: Service | Professional) => {
    setEditingItem(item || null);
    setIsModalOpen(true);
  };

  const handleServiceSubmit = async (data: ServiceFormData) => {
    const payload = {
      name: data.name,
      price: parseFloat(data.price),
      duration_minutes: parseInt(data.duration_minutes),
    };
    try {
      if (editingItem) {
        await api.put(`/business/services/${editingItem.id}`, payload);
        showToast('Serviço atualizado', 'success');
      } else {
        await api.post('/business/services', payload);
        showToast('Serviço criado', 'success');
      }
      loadData();
    } catch (error: unknown) {
      showToast(getApiErrorMessage(error, 'Erro ao salvar serviço'), 'error');
      throw error;
    }
  };

  const handleProfessionalSubmit = async (data: ProfessionalFormData) => {
    const payload = { name: data.name, photo: data.photo || null };
    try {
      if (editingItem) {
        await api.put(`/business/professionals/${editingItem.id}`, payload);
        showToast('Profissional atualizado', 'success');
      } else {
        await api.post('/business/professionals', payload);
        showToast('Profissional cadastrado', 'success');
      }
      loadData();
    } catch (error: unknown) {
      showToast(getApiErrorMessage(error, 'Erro ao salvar profissional'), 'error');
      throw error;
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir?')) return;
    try {
      const endpoint = activeTab === 'servicos' ? 'services' : 'professionals';
      await api.delete(`/business/${endpoint}/${id}`);
      showToast('Excluído com sucesso', 'success');
      loadData();
    } catch (error: unknown) {
      showToast(getApiErrorMessage(error, 'Erro ao excluir'), 'error');
    }
  };

  if (selectedProfessionalForAgenda) {
    return (
      <div className="space-y-6">
        <Button
          variant="ghost"
          className="w-fit px-0 hover:bg-transparent"
          onClick={() => setSelectedProfessionalForAgenda(null)}
        >
          <ArrowLeft className="h-5 w-5" aria-hidden="true" /> Voltar para Gestão
        </Button>
        <ProfessionalAgenda professional={selectedProfessionalForAgenda} />
      </div>
    );
  }

  const renderSkeletonGrid = () => (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <Card key={i} className="flex flex-col gap-4">
          <Skeleton className="h-12 w-12 rounded-control" label={i === 0 ? 'Carregando...' : undefined} />
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-4 w-40" />
        </Card>
      ))}
    </div>
  );

  return (
    <div className="space-y-8">
      <PageHeader
        title="Serviços e equipe"
        description="Gerencie o que você oferece e quem atende seus clientes."
        action={
          <Button onClick={() => handleOpenModal()}>
            <Plus className="h-4 w-4" aria-hidden="true" /> {activeTab === 'servicos' ? 'Novo Serviço' : 'Novo Profissional'}
          </Button>
        }
      />

      <Tabs value={activeTab} onValueChange={value => setActiveTab(value as 'servicos' | 'profissionais')}>
        <TabsList>
          <TabsTrigger value="servicos">Serviços</TabsTrigger>
          <TabsTrigger value="profissionais">Equipe</TabsTrigger>
        </TabsList>

        <TabsContent value="servicos">
          {loading ? (
            renderSkeletonGrid()
          ) : services.length === 0 ? (
            <EmptyState
              icon={Scissors}
              title="Nenhum serviço cadastrado."
              description="Assim que forem cadastrados, eles aparecem aqui."
            />
          ) : (
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
              {services.map(s => (
                <ServiceCard key={s.id} service={s} onEdit={() => handleOpenModal(s)} onDelete={() => handleDelete(s.id)} />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="profissionais">
          {loading ? (
            renderSkeletonGrid()
          ) : professionals.length === 0 ? (
            <EmptyState
              icon={Users}
              title="Nenhum profissional na equipe."
              description="Assim que forem cadastrados, eles aparecem aqui."
            />
          ) : (
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
              {professionals.map(b => (
                <ProfessionalCard
                  key={b.id}
                  professional={b}
                  onEdit={() => handleOpenModal(b)}
                  onDelete={() => handleDelete(b.id)}
                  onViewAgenda={() => setSelectedProfessionalForAgenda(b)}
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <ServiceProfessionalModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSubmitService={handleServiceSubmit}
        onSubmitProfessional={handleProfessionalSubmit}
        activeTab={activeTab}
        editingItem={editingItem}
      />
    </div>
  );
};
