'use client';

/**
 * Painel de Conexão (whatsapp-conexao.html).
 *
 * Dado real: estado da conexão, número conectado e `lastSyncedAt` (hora do último
 * status recebido com sucesso, controlada pelo próprio polling do WhatsAppModule).
 * O sistema conecta por QR code — não há API Oficial da Meta, WABA, certificação ou
 * webhook configurável aqui, e por isso nenhum desses blocos do arquivo de referência
 * entra nesta tela.
 *
 * Dado de exemplo (`conteudoDemo.whatsapp`): consumo diário de envios, taxa de entrega,
 * denúncias/spam, detalhamento por tipo de disparo e o histórico recente de mensagens —
 * nada disso existe no sistema hoje. "Solicitar aumento de limite" não tem função real
 * e mostra o aviso padrão em vez de fingir que funcionou.
 */

import Image from 'next/image';
import { Button, Card, Icon, Skeleton, AVISO_RECURSO_A_CAMINHO } from '@/components/ui';
import { useToast } from '@/components/Toast';
import { cn } from '@/lib/cn';
import { conteudoDemo } from '@/lib/conteudoDemo';

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

interface ConnectionPanelProps {
  waStatus: WhatsAppStatus;
  statusLoading: boolean;
  actionLoading: boolean;
  lastSyncedAt: Date | null;
  onConnect: () => void;
}

type ConnectionTone = 'success' | 'warning' | 'danger';

const CHIP_CLASS: Record<ConnectionTone, string> = {
  success: 'bg-success/12 text-success',
  warning: 'bg-warning/12 text-warning',
  danger: 'bg-danger/12 text-danger',
};

const ICON_WRAP_CLASS: Record<ConnectionTone, string> = {
  success: 'border-success/30 bg-success/12 text-success',
  warning: 'border-warning/30 bg-warning/12 text-warning',
  danger: 'border-danger/30 bg-danger/12 text-danger',
};

function getChip(status: WhatsAppStatus['status']): { tone: ConnectionTone; label: string } {
  switch (status) {
    case 'connected':
      return { tone: 'success', label: 'Conectado' };
    case 'pairing':
      return { tone: 'warning', label: 'Conectando' };
    default:
      return { tone: 'danger', label: 'Desconectado' };
  }
}

/** "há 42s" / "há 3 min" a partir do último status recebido com sucesso. */
function descreverSincronizacao(lastSyncedAt: Date | null): string | null {
  if (!lastSyncedAt) return null;
  const segundos = Math.max(0, Math.floor((Date.now() - lastSyncedAt.getTime()) / 1000));
  if (segundos < 60) return `Sincronizado há ${segundos}s`;
  const minutos = Math.floor(segundos / 60);
  return `Sincronizado há ${minutos} min`;
}

interface StateBlockProps {
  icon: string;
  tone: ConnectionTone;
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void; loading?: boolean };
}

function StateBlock({ icon, tone, title, description, action }: StateBlockProps) {
  return (
    <div className="flex flex-col items-center gap-4 py-6 text-center">
      <div className={cn('flex h-20 w-20 items-center justify-center rounded-full border-2', ICON_WRAP_CLASS[tone])}>
        <Icon name={icon} size={40} />
      </div>
      <div className="max-w-sm space-y-2">
        <h4 className="text-lg font-bold text-ink">{title}</h4>
        {description ? <p className="text-[15px] text-muted">{description}</p> : null}
      </div>
      {action ? (
        <Button variant="whatsapp" onClick={action.onClick} loading={action.loading}>
          {!action.loading && <Icon name="refresh" size={18} />}
          {action.label}
        </Button>
      ) : null}
    </div>
  );
}

export const ConnectionPanel = ({ waStatus, statusLoading, actionLoading, lastSyncedAt, onConnect }: ConnectionPanelProps) => {
  const chip = getChip(waStatus.status);
  const sincronizacao = descreverSincronizacao(lastSyncedAt);
  const { showToast } = useToast();
  const aCaminho = () => showToast(AVISO_RECURSO_A_CAMINHO, 'info');
  const whatsapp = conteudoDemo.whatsapp;
  const totalDisparosBreakdown = whatsapp.breakdownEnvios.reduce((total, item) => total + item.quantidade, 0);

  return (
    <div className="space-y-6">
      <Card className="space-y-6 overflow-hidden">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="mb-2 text-lg font-bold text-ink">Conexão WhatsApp</h3>
            <p className="text-[15px] text-muted">Conecte sua instância por QR code e acompanhe o estado real da sessão.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {sincronizacao && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-3 py-1 text-[13px] font-semibold text-ink">
                <span className="h-2 w-2 animate-pulse rounded-full bg-whatsapp" />
                {sincronizacao}
              </span>
            )}
            {!statusLoading && (
              <span className={cn('inline-flex items-center rounded-full px-3 py-1 text-[13px] font-semibold', CHIP_CLASS[chip.tone])}>
                {chip.label}
              </span>
            )}
          </div>
        </div>

        {statusLoading && (
          <div className="flex flex-col items-center gap-4 py-10">
            <Skeleton className="h-12 w-12 rounded-full" />
            <p className="text-[15px] text-muted">Verificando status do WhatsApp...</p>
          </div>
        )}

        {!statusLoading && waStatus.status === 'pairing' && waStatus.qrCode && (
          <div className="flex flex-col items-center space-y-6">
            <Card className="qr-surface border-line p-6">
              <Image
                src={waStatus.qrCode}
                alt="QR Code WhatsApp"
                width={280}
                height={280}
                unoptimized
                className="h-[280px] w-[280px]"
                style={{ imageRendering: 'pixelated' }}
              />
            </Card>
            <div className="max-w-sm space-y-2 text-center">
              <div className="flex items-center justify-center gap-2 text-warning">
                <Icon name="smartphone" size={18} />
                <p className="text-[13px] font-bold">Escaneie o QR Code</p>
              </div>
              <ol className="list-inside list-decimal space-y-1 text-left text-[13px] text-muted">
                <li>Abra o <strong className="text-ink">WhatsApp</strong> no celular</li>
                <li>Toque em <strong className="text-ink">Aparelhos conectados</strong></li>
                <li>Toque em <strong className="text-ink">Conectar um aparelho</strong></li>
                <li>Aponte a câmera para o QR Code acima</li>
              </ol>
              <Button variant="whatsapp" onClick={onConnect} loading={actionLoading} className="mx-auto mt-4">
                {!actionLoading && <Icon name="refresh" size={18} />}
                Atualizar QR Code
              </Button>
            </div>
          </div>
        )}

        {!statusLoading && waStatus.status === 'pairing' && !waStatus.qrCode && (
          <StateBlock
            icon="qr_code_scanner"
            tone="warning"
            title="Aguardando QR Code"
            description="A Evolution API ainda nao retornou um QR para pareamento."
            action={{ label: 'Gerar QR Code', onClick: onConnect, loading: actionLoading }}
          />
        )}

        {!statusLoading && waStatus.status === 'connected' && (
          <div className="flex flex-col items-center gap-4 py-6 text-center">
            <div className={cn('flex h-20 w-20 items-center justify-center rounded-full border-2 animate-pulse', ICON_WRAP_CLASS.success)}>
              <Icon name="check_circle" size={40} />
            </div>
            <div className="max-w-sm space-y-2">
              <h4 className="text-lg font-bold text-ink">WhatsApp Conectado!</h4>
              <p className="text-[15px] text-muted">Sessao ativa e bot pronto para receber mensagens.</p>
              {waStatus.connectedNumber && (
                <div className="mt-4 inline-flex items-center gap-2 rounded-control border border-success/20 bg-success/12 px-4 py-2">
                  <Icon name="smartphone" size={16} className="text-success" />
                  <span className="font-mono text-[15px] font-bold text-success">+{waStatus.connectedNumber}</span>
                  {waStatus.connectedName && (
                    <span className="ml-1 text-[13px] text-muted">({waStatus.connectedName})</span>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {!statusLoading && (waStatus.status === 'provider_unavailable' || waStatus.status === 'unavailable') && (
          <StateBlock
            icon="wifi_off"
            tone="danger"
            title="Evolution API Indisponivel"
            description={waStatus.error || 'Nao foi possivel acessar o servico externo agora.'}
          />
        )}

        {!statusLoading && waStatus.status === 'instance_not_found' && (
          <StateBlock
            icon="warning"
            tone="danger"
            title="Instancia Inexistente"
            description={waStatus.error || 'A instancia configurada nao existe na Evolution. Inicialize para criar/recriar.'}
            action={{ label: 'Criar/Recriar Instancia', onClick: onConnect, loading: actionLoading }}
          />
        )}

        {!statusLoading && waStatus.status === 'error' && (
          <StateBlock
            icon="warning"
            tone="danger"
            title="Erro no Provedor"
            description={waStatus.error || 'Ocorreu um erro inesperado na integracao.'}
            action={{ label: 'Tentar Novamente', onClick: onConnect, loading: actionLoading }}
          />
        )}

        {!statusLoading && waStatus.status === 'disconnected' && (
          <StateBlock
            icon="wifi_off"
            tone="danger"
            title="WhatsApp Desconectado"
            description="Clique no botão abaixo para iniciar a conexão."
            action={{ label: 'Conectar WhatsApp', onClick: onConnect, loading: actionLoading }}
          />
        )}
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <Card className="lg:col-span-6">
          <div className="mb-4 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Icon name="health_metrics" size={22} className="text-whatsapp" />
              <h3 className="text-[15px] font-bold text-ink">Saúde e Limite de Envios de Hoje</h3>
            </div>
          </div>

          <div className="flex flex-col gap-2 rounded-xl bg-surface-2 p-4">
            <div className="flex items-baseline justify-between">
              <span className="text-[13px] font-semibold text-ink">Consumo diário</span>
              <div className="flex items-baseline gap-1">
                <span className="text-[22px] font-bold tabular-nums text-ink">{whatsapp.consumoDiario.enviadas}</span>
                <span className="text-[13px] text-muted">/ {whatsapp.consumoDiario.limiteDiario} disparos</span>
              </div>
            </div>
            <div className="relative h-3 w-full overflow-hidden rounded-full bg-surface">
              <div
                className="h-full rounded-full bg-whatsapp transition-all duration-700"
                style={{ width: `${whatsapp.consumoDiario.percentualUtilizado}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-[12px] font-semibold text-muted">
              <span>{whatsapp.consumoDiario.percentualUtilizado}% utilizado</span>
              <span className="text-whatsapp">{whatsapp.consumoDiario.disponivelHoje} mensagens disponíveis hoje</span>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-surface-2 p-3.5">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">Taxa de Entrega</span>
              <p className="mt-1 text-[20px] font-bold tabular-nums text-ink">
                {whatsapp.saude.taxaEntregaPercentual.toFixed(1).replace('.', ',')}%
              </p>
              <span className="text-[11px] font-medium text-whatsapp">{whatsapp.saude.variacaoTaxaEntrega}</span>
            </div>
            <div className="rounded-xl bg-surface-2 p-3.5">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">Denúncias / Spam</span>
              <p className="mt-1 text-[20px] font-bold tabular-nums text-ink">{whatsapp.saude.denunciasSpam}</p>
              <span className="text-[11px] font-medium text-whatsapp">Nenhuma denúncia registrada</span>
            </div>
          </div>

          <div className="mt-4">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">Disparos de hoje por tipo</span>
            <div className="mt-2 flex flex-col gap-1.5">
              {whatsapp.breakdownEnvios.map(item => (
                <div key={item.rotulo} className="flex items-center justify-between rounded-lg bg-surface-2 px-3 py-2">
                  <span className="text-[13px] font-medium text-ink">{item.rotulo}</span>
                  <span className="text-[13px] font-bold tabular-nums text-ink">{item.quantidade}</span>
                </div>
              ))}
            </div>
            <p className="mt-2 text-right text-[11px] text-muted">{totalDisparosBreakdown} disparos no total</p>
          </div>

          {whatsapp.solicitacaoAumentoLimite.disponivel && (
            <button
              type="button"
              onClick={aCaminho}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-control border border-line bg-surface-2 px-3 py-2.5 text-[13px] font-bold text-ink transition-colors hover:bg-line/60"
            >
              <Icon name="trending_up" size={16} />
              Solicitar aumento para {whatsapp.solicitacaoAumentoLimite.limiteSugerido} disparos/dia
            </button>
          )}
        </Card>

        <Card className="lg:col-span-6">
          <div className="mb-4 flex items-center gap-2">
            <Icon name="history_toggle_off" size={22} className="text-ink" />
            <h3 className="text-[15px] font-bold text-ink">Histórico Recente de Mensagens</h3>
          </div>
          <div className="flex flex-col gap-2">
            {whatsapp.historicoRecente.map(item => (
              <div key={`${item.horario}-${item.destinatario}`} className="flex items-center justify-between gap-3 rounded-lg bg-surface-2 px-3.5 py-3">
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-bold text-ink">{item.destinatario}</p>
                  <p className="truncate text-[11px] text-muted">
                    {item.tipo} • {item.horario}
                  </p>
                </div>
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-surface px-2 py-0.5 text-[11px] font-bold text-whatsapp">
                  <Icon name="done_all" size={14} />
                  {item.status}
                </span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
};
