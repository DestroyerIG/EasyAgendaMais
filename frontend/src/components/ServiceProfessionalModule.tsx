'use client';

import { useState, useEffect, useCallback } from 'react';
import api from '@/lib/api';
import { useToast } from './Toast';
import { Plus, ArrowLeft, Scissors, Users } from 'lucide-react';
import type { Service, Professional } from '@/types';
import { ProfessionalAgenda } from './ProfessionalAgenda';
import { PageHeader, Button, Card, Skeleton, EmptyState, Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui';
import { ProdutosTab } from '@/components/services/ProdutosTab';
import { ServiceCard } from '@/components/services/ServiceCard';
import { ProfessionalCard } from '@/components/services/ProfessionalCard';
import { ServiceProfessionalModal } from '@/components/services/ServiceProfessionalModal';
import type { ServiceFormData, ProfessionalFormData } from '@/components/services/ServiceProfessionalModal';
import { getApiErrorCode, getApiErrorMessage } from '@/utils/handleApiError';
import { useRouter } from 'next/navigation';
import { useVocabulario } from '@/hooks/useVocabulario';
import { equipeApi } from '@/lib/equipe';

export const ServiceProfessionalModule = () => {
  const [activeTab, setActiveTab] = useState<'servicos' | 'profissionais' | 'produtos'>('servicos');
  const [services, setServices] = useState<Service[]>([]);
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Service | Professional | null>(null);
  const [selectedProfessionalForAgenda, setSelectedProfessionalForAgenda] = useState<Professional | null>(null);
  const router = useRouter();
  const { showToast } = useToast();
  const { prof, cli } = useVocabulario();

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
      ...(data.deposit_percentage !== '' && { depositPercentage: parseFloat(data.deposit_percentage) }),
      description: data.description,
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
    const payload = {
      name: data.name,
      photo: data.photo || null,
      breakStart: data.breakStart,
      breakEnd: data.breakEnd,
      commissionServicePct: data.commissionServicePct,
      commissionProductPct: data.commissionProductPct,
      especialidade: data.especialidade,
      cnpj: data.cnpj,
    };
    try {
      if (editingItem) {
        await api.put(`/business/professionals/${editingItem.id}`, payload);
        showToast(`${prof.S} ${prof.g('atualizada', 'atualizado')}`, 'success');
      } else {
        const { data: criada } = await api.post<{ id?: string }>('/business/professionals', payload);
        showToast(`${prof.S} ${prof.g('cadastrada', 'cadastrado')}`, 'success');
        if (data.emailConvite && criada?.id) {
          // O cadastro já está salvo: se o convite falhar, avisa e a dona reenvia pela edição.
          try {
            const r = await equipeApi.convidar(criada.id, data.emailConvite);
            if (r.emailEnviado) {
              showToast(`Convite enviado para ${r.email}`, 'success');
            } else {
              // O e-mail não saiu: copia o link na hora, porque ele não aparece de novo ao reabrir a edição.
              const copiado = await navigator.clipboard.writeText(r.link).then(() => true, () => false);
              showToast(
                copiado
                  ? `O e-mail não saiu, mas o link do convite foi copiado. Mande para ${prof.ele}.`
                  : `O e-mail não saiu. Abra ${prof.oS} e use "Reenviar convite" para pegar o link.`,
                'info',
              );
            }
          } catch (e) {
            showToast(getApiErrorMessage(e, 'Cadastro salvo, mas o convite não saiu. Reenvie pela edição.'), 'error');
          }
        }
      }
      loadData();
    } catch (error: unknown) {
      showToast(getApiErrorMessage(error, `Erro ao salvar ${prof.oS}`), 'error');
      // Limite de profissionais do plano: a comparação abre explicando o upgrade (2D).
      if (!editingItem && getApiErrorCode(error) === 'PLAN_LIMIT') {
        router.push('/planos/comparar?recurso=profissionais');
      }
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
        description={`Gerencie o que você oferece e quem atende ${cli.g('suas', 'seus')} ${cli.p}.`}
        action={
          activeTab === 'produtos' ? undefined : (
            <Button onClick={() => handleOpenModal()}>
              <Plus className="h-4 w-4" aria-hidden="true" /> {activeTab === 'servicos' ? 'Novo Serviço' : `${prof.g('Nova', 'Novo')} ${prof.s}`}
            </Button>
          )
        }
      />

      <Tabs value={activeTab} onValueChange={value => setActiveTab(value as 'servicos' | 'profissionais' | 'produtos')}>
        <TabsList>
          <TabsTrigger value="servicos">Serviços</TabsTrigger>
          <TabsTrigger value="profissionais">Equipe</TabsTrigger>
          <TabsTrigger value="produtos">Produtos</TabsTrigger>
        </TabsList>

        <TabsContent value="servicos">
          {loading ? (
            renderSkeletonGrid()
          ) : services.length === 0 ? (
            <EmptyState
              icon={Scissors}
              title="Nenhum serviço cadastrado"
              action={{ label: 'Novo Serviço', icon: Plus, onClick: () => handleOpenModal() }}
              actionVariant="secondary"
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
              title={`${prof.g('Nenhuma', 'Nenhum')} ${prof.s} na equipe`}
              action={{ label: `${prof.g('Nova', 'Novo')} ${prof.s}`, icon: Plus, onClick: () => handleOpenModal() }}
              actionVariant="secondary"
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

        <TabsContent value="produtos">
          <ProdutosTab />
        </TabsContent>
      </Tabs>

      <ServiceProfessionalModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSubmitService={handleServiceSubmit}
        onSubmitProfessional={handleProfessionalSubmit}
        activeTab={activeTab === 'produtos' ? 'servicos' : activeTab}
        editingItem={editingItem}
      />
    </div>
  );
};
