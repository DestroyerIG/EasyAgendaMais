'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import api from '@/lib/api';
import { useToast } from './Toast';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter, useSearchParams } from 'next/navigation';
import { PageHeader, Card, Icon, Skeleton, buttonVariants } from '@/components/ui';
import { cn } from '@/lib/cn';
import { ConnectionPanel } from '@/components/whatsapp/ConnectionPanel';
import { MessageConfigPanel, BotConfig } from '@/components/whatsapp/MessageConfigPanel';
import { MenuOptionsPanel, MenuOption } from '@/components/whatsapp/MenuOptionsPanel';
import { ChatSimulator } from '@/components/whatsapp/ChatSimulator';
import { RoboAtendimento } from '@/components/whatsapp/RoboAtendimento';
import { Automacoes } from '@/components/whatsapp/automacoes/Automacoes';
import { CentralConversas } from '@/components/whatsapp/conversas/CentralConversas';
import { HoraDeVoltar } from '@/components/whatsapp/retorno/HoraDeVoltar';

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

type Aba = 'hora-de-voltar' | 'automacoes' | 'conversas' | 'conexao';

const ABAS: { id: Aba; label: string }[] = [
  { id: 'hora-de-voltar', label: 'Hora de voltar' },
  { id: 'automacoes', label: 'Automações' },
  { id: 'conversas', label: 'Conversas' },
  { id: 'conexao', label: 'Conexão' },
];

const abaDaUrl = (valor: string | null): Aba | null =>
  ABAS.some((a) => a.id === valor) ? (valor as Aba) : null;

export const WhatsAppModule = () => {
  const searchParams = useSearchParams();
  const router = useRouter();
  // Sem ?aba= válido, a aba inicial depende do status (decidido quando o primeiro status chega).
  const [activeTab, setActiveTab] = useState<Aba | null>(() => abaDaUrl(searchParams.get('aba')));
  const [waStatus, setWaStatus] = useState<WhatsAppStatus>(DEFAULT_WA_STATUS);
  const [botConfig, setBotConfig] = useState<BotConfig>({
    welcome_header: '', ask_name_message: '', attendant_message: '',
    confirmation_message: '', reminder_message: '', invalid_option_message: '', session_expired_message: '',
    end_session_message: '', name_validation_message: '', no_slots_message: '',
    cancel_no_appointments_message: '', cancel_list_message: '', cancel_success_message: '',
    reschedule_no_appointments_message: '', reschedule_list_message: '',
    no_previous_appointments_message: '', rating_question_message: '', rating_confirmation_message: '',
    promotions_message: '', instagram_message: '', politica_message: '',
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
      setBotConfig((atual) => ({ ...atual, ...asObjectPayload(response.data) }));
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
      // A aba Conexão (a inicial de quem está desconectado) monta o menu: resposta fora do formato não pode derrubá-la.
      setMenuOptions(Array.isArray(response.data) ? response.data : []);
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

  // Voltar/avançar e links internos (?aba=conexao) mudam a URL: a aba acompanha.
  const abaParam = searchParams.get('aba');
  useEffect(() => {
    const daUrl = abaDaUrl(abaParam);
    if (daUrl) setActiveTab(daUrl);
  }, [abaParam]);

  useEffect(() => {
    if (activeTab !== null || statusLoading) return;
    setActiveTab(waStatus.status === 'connected' ? 'conversas' : 'conexao');
  }, [activeTab, statusLoading, waStatus.status]);

  // Os painéis do robô (Menu, Mensagens, Simulador) moram na aba Conexão.
  useEffect(() => {
    if (activeTab === 'conexao') {
      fetchConfig();
      fetchMenuOptions();
    }
  }, [activeTab, fetchConfig, fetchMenuOptions]);

  const trocarAba = (aba: Aba) => {
    setActiveTab(aba);
    const params = new URLSearchParams(searchParams.toString());
    params.set('aba', aba);
    router.replace(`?${params.toString()}`, { scroll: false });
  };

  const handleDisconnect = async () => {
    if (!confirm('Deseja realmente desconectar a sessão do WhatsApp?')) return;
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

  // Teste de envio: manda uma mensagem curta para o próprio número conectado.
  const handleTestSend = async () => {
    if (!waStatus.connectedNumber) {
      showToast('Não foi possível identificar o número conectado para o teste.', 'error');
      return;
    }
    try {
      await api.post('/whatsapp/test-send', {
        phone: waStatus.connectedNumber,
        message: 'Teste de envio do EasyAgenda+: o WhatsApp está conectado e pronto para enviar mensagens.',
      });
      showToast('Mensagem de teste enviada para o número conectado', 'success');
    } catch {
      showToast('Erro ao enviar a mensagem de teste', 'error');
    }
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
              Seu plano atual não inclui integração com WhatsApp. Escolha um plano para automatizar
              seus agendamentos e lembretes via WhatsApp.
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
    <div className="flex flex-col gap-6 pb-10">
      <div role="tablist" aria-label="Seções do WhatsApp" className="flex gap-6 overflow-x-auto overflow-y-hidden border-b border-line">
        {ABAS.map((t) => {
          const ativa = t.id === activeTab;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              id={`aba-whatsapp-${t.id}`}
              aria-selected={ativa}
              aria-controls="painel-whatsapp"
              onClick={() => trocarAba(t.id)}
              className={cn(
                '-mb-px shrink-0 border-b-2 px-1 pb-3 pt-1 text-[14px] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand',
                ativa ? 'border-brand font-bold text-brand-text' : 'border-transparent font-medium text-muted hover:text-ink',
              )}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      <div id="painel-whatsapp" role="tabpanel" aria-labelledby={activeTab ? `aba-whatsapp-${activeTab}` : undefined}>
          {activeTab === null && <Skeleton className="h-40 w-full" label="Verificando conexão..." />}
          {activeTab === 'hora-de-voltar' && <HoraDeVoltar conectado={waStatus.status === 'connected'} />}
          {activeTab === 'automacoes' && (
            <Automacoes
              conectado={waStatus.status === 'connected'}
              onAbrirConexao={() => trocarAba('conexao')}
              nomeNegocio={user?.businessName || 'Seu negócio'}
            />
          )}
          {activeTab === 'conversas' && <CentralConversas conectado={waStatus.status === 'connected'} />}
          {activeTab === 'conexao' && (
            <div className="flex flex-col gap-8">
              <ConnectionPanel
                waStatus={waStatus}
                statusLoading={statusLoading}
                actionLoading={actionLoading}
                lastSyncedAt={lastSyncedAt}
                nomeNegocio={user?.businessName || 'seu negócio'}
                onConnect={handleConnect}
                onDisconnect={handleDisconnect}
                onRefresh={() => { void fetchStatus(); }}
                onTestSend={handleTestSend}
              />
              <RoboAtendimento
                menu={
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
                }
                mensagens={
                  <MessageConfigPanel
                    botConfig={botConfig}
                    onChange={setBotConfig}
                    configLoading={configLoading}
                    actionLoading={actionLoading}
                    onSave={handleSaveConfig}
                    onReset={handleResetConfig}
                  />
                }
                simulador={<ChatSimulator onSendMessage={handleSimulatorMessage} />}
              />
            </div>
          )}
      </div>
    </div>
  );
};
