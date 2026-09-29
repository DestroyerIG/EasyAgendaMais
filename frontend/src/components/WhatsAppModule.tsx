'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import api from '@/lib/api';
import { useToast } from './Toast';
import { useAuth } from '@/contexts/AuthContext';
import { PageHeader, Button, Card, Icon, Tabs, TabsList, TabsTrigger, TabsContent, buttonVariants } from '@/components/ui';
import { cn } from '@/lib/cn';
import { ConnectionPanel } from '@/components/whatsapp/ConnectionPanel';
import { MessageConfigPanel, BotConfig } from '@/components/whatsapp/MessageConfigPanel';
import { MenuOptionsPanel, MenuOption } from '@/components/whatsapp/MenuOptionsPanel';
import { ChatSimulator } from '@/components/whatsapp/ChatSimulator';

interface WhatsAppStatus {
  status:
    | 'provider_unavailable'
    | 'instance_not_found'
    | 'disconnected'
    | 'pairing'
    | 'connected'
    | 'error'
    | 'unavailable';
  qrCode: string | null;
  connectedNumber: string | null;
  connectedName: string | null;
  error: string | null;
  provider?: string;
}

const SUPPORTED_STATUS = [
  'provider_unavailable',
  'instance_not_found',
  'disconnected',
  'pairing',
  'connected',
  'error',
] as const;

const asObjectPayload = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
};

const normalizeStatusValue = (value: unknown): WhatsAppStatus['status'] => {
  const normalized = String(value || '').trim().toLowerCase();

  if (normalized === 'unavailable' || normalized === 'provider_unavailable') {
    return 'provider_unavailable';
  }

  // Backend returns 'qr_code' or 'connecting' — both map to the pairing UI
  if (normalized === 'qr_code' || normalized === 'connecting') {
    return 'pairing';
  }

  // Backend returns 'not_found' — map to instance_not_found UI
  if (normalized === 'not_found') {
    return 'instance_not_found';
  }

  if (SUPPORTED_STATUS.includes(normalized as (typeof SUPPORTED_STATUS)[number])) {
    return normalized as WhatsAppStatus['status'];
  }

  return 'disconnected';
};

const normalizeStatusPayload = (value: unknown): WhatsAppStatus => {
  const payload = asObjectPayload(value);

  return {
    status: normalizeStatusValue(payload.status),
    qrCode: typeof payload.qrCode === 'string' && payload.qrCode.trim() ? payload.qrCode : null,
    connectedNumber:
      typeof payload.connectedNumber === 'string' && payload.connectedNumber.trim()
        ? payload.connectedNumber
        : null,
    connectedName:
      typeof payload.connectedName === 'string' && payload.connectedName.trim()
        ? payload.connectedName
        : null,
    error: typeof payload.error === 'string' && payload.error.trim() ? payload.error : null,
    provider: typeof payload.provider === 'string' && payload.provider.trim() ? payload.provider : undefined,
  };
};

const DEFAULT_WA_STATUS: WhatsAppStatus = {
  status: 'disconnected',
  qrCode: null,
  connectedNumber: null,
  connectedName: null,
  error: null,
};

type ConnectionTone = 'success' | 'warning' | 'danger';

const TONE_ICON_WRAP_CLASS: Record<ConnectionTone, string> = {
  success: 'bg-success/12 text-success',
  warning: 'bg-warning/12 text-warning',
  danger: 'bg-danger/12 text-danger',
};

const TONE_TEXT_CLASS: Record<ConnectionTone, string> = {
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
};

const TONE_STRIPE_CLASS: Record<ConnectionTone, string> = {
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
};

export const WhatsAppModule = () => {
  const [activeTab, setActiveTab] = useState<'simulador' | 'config' | 'mensagens' | 'menu'>('config');
  const [waStatus, setWaStatus] = useState<WhatsAppStatus>(DEFAULT_WA_STATUS);
  const [botConfig, setBotConfig] = useState<BotConfig>({
    welcome_header: '', ask_name_message: '', attendant_message: '',
    confirmation_message: '', reminder_message: '', invalid_option_message: '', session_expired_message: '',
    end_session_message: '', name_validation_message: '', no_slots_message: '',
    cancel_no_appointments_message: '', cancel_list_message: '', cancel_success_message: '',
    reschedule_no_appointments_message: '', reschedule_list_message: '',
    no_previous_appointments_message: '', rating_question_message: '', rating_confirmation_message: '',
    promotions_message: '', instagram_message: '',
  });
  const [menuOptions, setMenuOptions] = useState<MenuOption[]>([]);
  const [menuLoading, setMenuLoading] = useState(false);
  const [configLoading, setConfigLoading] = useState(false);
  const [statusLoading, setStatusLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [featureBlocked, setFeatureBlocked] = useState(false);
  // Hora do último status recebido com sucesso — só o front sabe disso, não é fabricado.
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const { showToast } = useToast();
  const { user } = useAuth();
  const abortControllerRef = useRef<AbortController | null>(null);
  const waStatusRef = useRef<WhatsAppStatus>(DEFAULT_WA_STATUS);

  const fetchStatus = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await api.get('/whatsapp/status', { signal });
      const mergedStatus: WhatsAppStatus = {
        ...DEFAULT_WA_STATUS,
        ...normalizeStatusPayload(response.data),
      };

      if (mergedStatus.status === 'pairing' && !mergedStatus.qrCode) {
        try {
          const qrResponse = await api.get('/whatsapp/qrcode', { signal });
          const qrNormalized = normalizeStatusPayload(qrResponse.data);
          const qrPayload = asObjectPayload(qrResponse.data);

          mergedStatus.qrCode = qrNormalized.qrCode;
          if (qrPayload.status !== undefined) {
            mergedStatus.status = qrNormalized.status;
          }
        } catch {
          // manter fallback do status principal
        }
      }

      waStatusRef.current = mergedStatus;
      setWaStatus(mergedStatus);
      setLastSyncedAt(new Date());
    } catch (err: unknown) {
      // Ignorar erros de requisições canceladas (AbortController)
      if (err && typeof err === 'object' && 'name' in err && (err as { name: string }).name === 'CanceledError') return;
      if (err && typeof err === 'object' && 'name' in err && (err as { name: string }).name === 'AbortError') return;

      const axiosErr = err as { response?: { status?: number; data?: { code?: string; error?: { code?: string } } } };
      const errCode = axiosErr.response?.data?.code ?? axiosErr.response?.data?.error?.code;
      if (axiosErr.response?.status === 403 && errCode === 'FEATURE_BLOCKED') {
        setFeatureBlocked(true);
        return;
      }
      // waStatusRef também precisa atualizar aqui: getIntervalMs() (o polling adaptativo,
      // mais abaixo) lê o ref, não o state — sem isto, depois de um erro o próximo
      // intervalo continuava usando o último status bem-sucedido (achado da varredura de
      // telas: cadência de retry atrasada depois de uma falha de rede).
      const statusDeErro = {
        ...DEFAULT_WA_STATUS,
        status: 'provider_unavailable' as const,
        error: 'Nao foi possivel consultar a Evolution API no momento.',
      };
      waStatusRef.current = statusDeErro;
      setWaStatus(statusDeErro);
    } finally {
      setStatusLoading(false);
    }
  }, []);

  const fetchConfig = useCallback(async () => {
    setConfigLoading(true);
    try {
      const response = await api.get('/whatsapp/config');
      setBotConfig(response.data);
    } catch {
      showToast('Erro ao carregar configurações de mensagens', 'error');
    } finally {
      setConfigLoading(false);
    }
  }, [showToast]);

  const fetchMenuOptions = useCallback(async () => {
    setMenuLoading(true);
    try {
      const response = await api.get('/whatsapp/config/menu');
      setMenuOptions(response.data);
    } catch {
      showToast('Erro ao carregar opções do menu', 'error');
    } finally {
      setMenuLoading(false);
    }
  }, [showToast]);

  // Polling adaptativo: pausa quando connected, mais frequente quando pairing
  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout>;
    let active = true;

    const getIntervalMs = (): number => {
      const status = waStatusRef.current.status;
      if (status === 'connected') return 60_000;        // conectado: checar minutamente (detecta desconexão inesperada)
      if (status === 'pairing') return 5_000;           // QR expira a cada 60s, checar frequente
      if (status === 'provider_unavailable') return 30_000;
      if (status === 'instance_not_found') return 15_000;
      return 8_000;                                     // outros estados (era 3s fixo)
    };

    const poll = async () => {
      if (!active) return;

      // Cancelar request anterior
      abortControllerRef.current?.abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;

      await fetchStatus(controller.signal);

      if (!active) return;
      timeoutId = setTimeout(poll, getIntervalMs());
    };

    poll();

    return () => {
      active = false;
      clearTimeout(timeoutId);
      abortControllerRef.current?.abort();
    };
  }, [fetchStatus]);

  useEffect(() => {
    if (activeTab === 'mensagens') fetchConfig();
    if (activeTab === 'menu') fetchMenuOptions();
  }, [activeTab, fetchConfig, fetchMenuOptions]);

  const handleDisconnect = async () => {
    setActionLoading(true);
    try { await api.post('/whatsapp/disconnect'); showToast('WhatsApp desconectado', 'success'); fetchStatus(); }
    catch { showToast('Erro ao desconectar', 'error'); }
    finally { setActionLoading(false); }
  };

  const handleConnect = async () => {
    setActionLoading(true);
    try {
      const initializeMode = waStatus.status === 'instance_not_found';
      const endpoint = initializeMode ? '/whatsapp/initialize' : '/whatsapp/connect';
      await api.post(endpoint);
      showToast(
        initializeMode
          ? 'Inicializacao da instancia solicitada. Aguardando status...'
          : 'Conexao iniciada. Aguardando status...',
        'success'
      );
      fetchStatus();
    }
    catch { showToast('Erro ao reconectar', 'error'); }
    finally { setActionLoading(false); }
  };

  const handleSaveConfig = async () => {
    setActionLoading(true);
    try { await api.put('/whatsapp/config', botConfig); showToast('Configurações salvas com sucesso!', 'success'); }
    catch { showToast('Erro ao salvar configurações', 'error'); }
    finally { setActionLoading(false); }
  };

  const handleResetConfig = async () => {
    if (!confirm('Tem certeza que deseja resetar todas as mensagens para o padrão?')) return;
    setActionLoading(true);
    try { const r = await api.post('/whatsapp/config/reset'); setBotConfig(r.data); showToast('Mensagens resetadas para o padrão', 'success'); }
    catch { showToast('Erro ao resetar configurações', 'error'); }
    finally { setActionLoading(false); }
  };

  // Menu CRUD handlers
  const handleMenuToggle = async (id: string, active: boolean) => {
    setActionLoading(true);
    try { const r = await api.put(`/whatsapp/config/menu/${id}`, { active }); setMenuOptions(prev => prev.map(o => o.id === id ? r.data : o)); }
    catch { showToast('Erro ao atualizar opção', 'error'); }
    finally { setActionLoading(false); }
  };

  const handleMenuUpdate = async (id: string, data: Partial<MenuOption>) => {
    setActionLoading(true);
    try { const r = await api.put(`/whatsapp/config/menu/${id}`, data); setMenuOptions(prev => prev.map(o => o.id === id ? r.data : o)); showToast('Opção atualizada', 'success'); }
    catch { showToast('Erro ao atualizar opção', 'error'); }
    finally { setActionLoading(false); }
  };

  const handleMenuDelete = async (id: string) => {
    setActionLoading(true);
    try { await api.delete(`/whatsapp/config/menu/${id}`); await fetchMenuOptions(); showToast('Opção excluída', 'success'); }
    catch { showToast('Erro ao excluir opção', 'error'); }
    finally { setActionLoading(false); }
  };

  const handleMenuCreate = async (data: { label: string; emoji: string; response_message: string }) => {
    setActionLoading(true);
    try { await api.post('/whatsapp/config/menu', data); await fetchMenuOptions(); showToast('Opção criada!', 'success'); }
    catch { showToast('Erro ao criar opção', 'error'); }
    finally { setActionLoading(false); }
  };

  const handleMenuReorder = async (ids: string[]) => {
    setActionLoading(true);
    try { const r = await api.put('/whatsapp/config/menu-reorder', { order: ids }); setMenuOptions(r.data); }
    catch { showToast('Erro ao reordenar menu', 'error'); }
    finally { setActionLoading(false); }
  };

  const handleMenuReset = async () => {
    if (!confirm('Resetar menu para as opções padrão? Opções personalizadas serão excluídas.')) return;
    setActionLoading(true);
    try { const r = await api.post('/whatsapp/config/menu/reset'); setMenuOptions(r.data); showToast('Menu resetado', 'success'); }
    catch { showToast('Erro ao resetar menu', 'error'); }
    finally { setActionLoading(false); }
  };

  const handleSimulatorMessage = async (text: string): Promise<string | null> => {
    const businessId =
      typeof user?.businessId === 'string' && user.businessId.trim()
        ? user.businessId.trim()
        : null;

    if (!businessId) {
      showToast(
        'Não foi possível identificar o negócio autenticado para o simulador. Faça login novamente.',
        'error'
      );
      return null;
    }

    try {
      const response = await api.post('/whatsapp/simulator/message', {
        text,
        phone: '5511999999999',
        pushName: 'Simulador',
        businessId,
      });

      return response.data?.lastBotResponse || null;
    } catch (error) {
      const apiError = error as {
        response?: {
          data?: {
            error?: { message?: string } | string;
            message?: string;
          };
        };
      };

      const rawError = apiError.response?.data?.error;
      const backendMessage =
        typeof rawError === 'object'
          ? rawError?.message
          : typeof rawError === 'string'
            ? rawError
            : apiError.response?.data?.message;

      showToast(backendMessage || 'Erro ao enviar mensagem para o bot', 'error');
      return null;
    }
  };

  const getStatusConfig = () => {
    switch (waStatus.status) {
      case 'connected': return { tone: 'success' as const, icon: 'check_circle', label: 'Conectado', sublabel: waStatus.connectedName || waStatus.connectedNumber || '', pulse: true };
      case 'pairing': return { tone: 'warning' as const, icon: 'qr_code_scanner', label: 'Aguardando pareamento', sublabel: 'Escaneie o QR Code no WhatsApp', pulse: false };
      case 'instance_not_found': return { tone: 'danger' as const, icon: 'warning', label: 'Instancia inexistente', sublabel: waStatus.error || 'A instancia configurada nao existe na Evolution', pulse: false };
      case 'provider_unavailable':
      case 'unavailable': return { tone: 'danger' as const, icon: 'wifi_off', label: 'API indisponivel', sublabel: waStatus.error || 'Evolution API fora do ar', pulse: false };
      case 'error': return { tone: 'danger' as const, icon: 'warning', label: 'Erro', sublabel: waStatus.error || 'Falha inesperada no provider', pulse: false };
      default: return { tone: 'danger' as const, icon: 'wifi_off', label: 'Desconectado', sublabel: waStatus.error || 'Clique em conectar para iniciar', pulse: false };
    }
  };

  const statusConfig = getStatusConfig();
  const connectButtonLabel = waStatus.status === 'instance_not_found'
    ? 'Criar/Recriar'
    : waStatus.status === 'provider_unavailable' || waStatus.status === 'unavailable'
      ? 'Tentar Novamente'
      : 'Conectar';

  const tabs = [
    { id: 'config' as const, label: 'Conexão', icon: 'smartphone' },
    { id: 'menu' as const, label: 'Menu', icon: 'list' },
    { id: 'mensagens' as const, label: 'Mensagens', icon: 'tune' },
    { id: 'simulador' as const, label: 'Simulador', icon: 'smart_toy' },
  ];

  if (featureBlocked) {
    return (
      <div className="space-y-8 pb-10">
        <PageHeader
          title="WhatsApp"
          description="Automatize seus agendamentos e lembretes via WhatsApp."
        />
        <Card className="flex flex-col items-center gap-6 py-16 text-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-warning/12">
            <Icon name="lock" size={36} className="text-warning" />
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl font-bold text-ink">Recurso não disponível no seu plano</h2>
            <p className="max-w-md text-muted">
              Seu plano atual não inclui integração com WhatsApp. Faça upgrade para o plano{' '}
              <span className="font-semibold text-ink">Profissional</span> ou{' '}
              <span className="font-semibold text-ink">Premium</span> para automatizar seus agendamentos e lembretes via WhatsApp.
            </p>
          </div>
          <a href="/planos" className={cn(buttonVariants({ variant: 'primary' }), 'gap-2')}>
            <Icon name="arrow_circle_up" size={18} />
            Ver planos disponíveis
          </a>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-10">
      <PageHeader
        title="WhatsApp"
        description="Automatize seus agendamentos e lembretes via WhatsApp."
      />

      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as typeof activeTab)}>
        <TabsList>
          {tabs.map(t => (
            <TabsTrigger key={t.id} value={t.id} className="gap-2">
              <Icon name={t.icon} size={16} />
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <div className="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-4">
          {/* Sidebar */}
          <div className="space-y-6">
            <Card className="relative overflow-hidden">
              <div className={cn('absolute right-0 top-0 h-full w-1 opacity-40', TONE_STRIPE_CLASS[statusConfig.tone])} />
              <h3 className="mb-4 flex items-center gap-2 text-lg font-bold text-ink">
                <Icon name="bolt" size={14} className="text-brand-text" /> Status da Conexão
              </h3>
              <div className="flex items-center gap-3">
                <div className={cn('flex h-10 w-10 items-center justify-center rounded-full', TONE_ICON_WRAP_CLASS[statusConfig.tone], statusConfig.pulse && 'animate-pulse')}>
                  {statusLoading ? <Icon name="progress_activity" size={20} className="animate-spin" /> : <Icon name={statusConfig.icon} size={20} />}
                </div>
                <div>
                  <p className={cn('text-[13px] font-bold', TONE_TEXT_CLASS[statusConfig.tone])}>
                    {statusLoading ? 'Verificando...' : statusConfig.label}
                  </p>
                  <p className="text-[13px] text-muted">
                    {statusLoading ? '' : (statusConfig.sublabel?.length > 30 ? statusConfig.sublabel.substring(0, 30) + '...' : statusConfig.sublabel)}
                  </p>
                </div>
              </div>
              <div className="mt-4 flex gap-2">
                {waStatus.status === 'connected' && (
                  <Button variant="danger" size="sm" onClick={handleDisconnect} loading={actionLoading}>
                    {!actionLoading && <Icon name="logout" size={14} />}
                    Desconectar
                  </Button>
                )}
                {(
                  waStatus.status === 'disconnected' ||
                  waStatus.status === 'error' ||
                  waStatus.status === 'pairing' ||
                  waStatus.status === 'instance_not_found' ||
                  waStatus.status === 'provider_unavailable' ||
                  waStatus.status === 'unavailable'
                ) && (
                  <Button variant="whatsapp" size="sm" onClick={handleConnect} loading={actionLoading}>
                    {!actionLoading && <Icon name="refresh" size={14} />}
                    {connectButtonLabel}
                  </Button>
                )}
              </div>
            </Card>

            <Card>
              <h3 className="mb-4 text-lg font-bold text-ink">Recursos Ativos</h3>
              <ul className="space-y-4">
                {[
                  { icon: 'verified_user', text: 'Agendamento Automático (24/7)' },
                  { icon: 'schedule', text: 'Lembretes Automáticos (2h antes)' },
                  { icon: 'person', text: 'Captura de novos clientes' },
                  { icon: 'wifi', text: 'Conexao via Evolution API externa' },
                ].map(recurso => (
                  <li key={recurso.text} className="flex items-start gap-3">
                    <Icon name={recurso.icon} size={16} className="mt-1 text-brand-text" />
                    <p className="text-[13px] leading-relaxed text-muted">{recurso.text}</p>
                  </li>
                ))}
              </ul>
            </Card>
          </div>

          {/* Main content */}
          <div className="lg:col-span-3">
            <TabsContent value="config" className="mt-0">
              <ConnectionPanel
                waStatus={waStatus}
                statusLoading={statusLoading}
                actionLoading={actionLoading}
                lastSyncedAt={lastSyncedAt}
                onConnect={handleConnect}
              />
            </TabsContent>
            <TabsContent value="menu" className="mt-0">
              <MenuOptionsPanel
                options={menuOptions}
                loading={menuLoading}
                actionLoading={actionLoading}
                onToggle={handleMenuToggle}
                onUpdate={handleMenuUpdate}
                onDelete={handleMenuDelete}
                onCreate={handleMenuCreate}
                onReorder={handleMenuReorder}
                onReset={handleMenuReset}
              />
            </TabsContent>
            <TabsContent value="mensagens" className="mt-0">
              <MessageConfigPanel
                botConfig={botConfig}
                onChange={setBotConfig}
                configLoading={configLoading}
                actionLoading={actionLoading}
                onSave={handleSaveConfig}
                onReset={handleResetConfig}
              />
            </TabsContent>
            <TabsContent value="simulador" className="mt-0">
              <ChatSimulator onSendMessage={handleSimulatorMessage} />
            </TabsContent>
          </div>
        </div>
      </Tabs>
    </div>
  );
};
