'use client';

import Image from 'next/image';
import type { LucideIcon } from 'lucide-react';
import {
  CheckCircle,
  QrCode,
  WifiOff,
  Smartphone,
  RefreshCw,
  AlertTriangle,
} from 'lucide-react';
import { Button, Card, Skeleton } from '@/components/ui';
import { cn } from '@/lib/cn';

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

interface StateBlockProps {
  icon: LucideIcon;
  tone: ConnectionTone;
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void; loading?: boolean };
}

function StateBlock({ icon: Icon, tone, title, description, action }: StateBlockProps) {
  return (
    <div className="flex flex-col items-center gap-4 py-6 text-center">
      <div className={cn('flex h-20 w-20 items-center justify-center rounded-full border-2', ICON_WRAP_CLASS[tone])}>
        <Icon className="h-10 w-10" aria-hidden="true" />
      </div>
      <div className="max-w-sm space-y-2">
        <h4 className="text-xl font-bold text-ink">{title}</h4>
        {description ? <p className="text-[15px] text-muted">{description}</p> : null}
      </div>
      {action ? (
        <Button variant="whatsapp" onClick={action.onClick} loading={action.loading}>
          {!action.loading && <RefreshCw className="h-[18px] w-[18px]" aria-hidden="true" />}
          {action.label}
        </Button>
      ) : null}
    </div>
  );
}

export const ConnectionPanel = ({ waStatus, statusLoading, actionLoading, onConnect }: ConnectionPanelProps) => {
  const chip = getChip(waStatus.status);

  return (
    <Card className="space-y-6 overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="mb-2 text-xl font-bold text-ink">Conexão WhatsApp</h3>
          <p className="text-[15px] text-muted">Conecte sua instância via Evolution API e acompanhe o estado real da sessão.</p>
        </div>
        {!statusLoading && (
          <span className={cn('inline-flex items-center rounded-full px-3 py-1 text-[13px] font-semibold', CHIP_CLASS[chip.tone])}>
            {chip.label}
          </span>
        )}
      </div>

      {statusLoading && (
        <div className="flex flex-col items-center gap-4 py-10">
          <Skeleton className="h-12 w-12 rounded-full" />
          <p className="text-[15px] text-muted">Verificando status do WhatsApp...</p>
        </div>
      )}

      {!statusLoading && waStatus.status === 'pairing' && waStatus.qrCode && (
        <div className="flex flex-col items-center space-y-6">
          <Card className="border-line bg-surface p-6">
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
              <Smartphone className="h-[18px] w-[18px]" aria-hidden="true" />
              <p className="text-[13px] font-bold uppercase tracking-wider">Escaneie o QR Code</p>
            </div>
            <ol className="list-inside list-decimal space-y-1 text-left text-[13px] text-muted">
              <li>Abra o <strong className="text-ink">WhatsApp</strong> no celular</li>
              <li>Toque em <strong className="text-ink">Aparelhos conectados</strong></li>
              <li>Toque em <strong className="text-ink">Conectar um aparelho</strong></li>
              <li>Aponte a câmera para o QR Code acima</li>
            </ol>
            <Button variant="whatsapp" onClick={onConnect} loading={actionLoading} className="mx-auto mt-4">
              {!actionLoading && <RefreshCw className="h-[18px] w-[18px]" aria-hidden="true" />}
              Atualizar QR Code
            </Button>
          </div>
        </div>
      )}

      {!statusLoading && waStatus.status === 'pairing' && !waStatus.qrCode && (
        <StateBlock
          icon={QrCode}
          tone="warning"
          title="Aguardando QR Code"
          description="A Evolution API ainda nao retornou um QR para pareamento."
          action={{ label: 'Gerar QR Code', onClick: onConnect, loading: actionLoading }}
        />
      )}

      {!statusLoading && waStatus.status === 'connected' && (
        <div className="flex flex-col items-center gap-4 py-6 text-center">
          <div className={cn('flex h-20 w-20 items-center justify-center rounded-full border-2 animate-pulse', ICON_WRAP_CLASS.success)}>
            <CheckCircle className="h-10 w-10" aria-hidden="true" />
          </div>
          <div className="max-w-sm space-y-2">
            <h4 className="text-2xl font-bold text-ink">WhatsApp Conectado!</h4>
            <p className="text-[15px] text-muted">Sessao ativa na Evolution API e bot pronto para receber mensagens.</p>
            {waStatus.connectedNumber && (
              <div className="mt-4 inline-flex items-center gap-2 rounded-control border border-success/20 bg-success/12 px-4 py-2">
                <Smartphone className="h-4 w-4 text-success" aria-hidden="true" />
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
          icon={WifiOff}
          tone="danger"
          title="Evolution API Indisponivel"
          description={waStatus.error || 'Nao foi possivel acessar o servico externo agora.'}
        />
      )}

      {!statusLoading && waStatus.status === 'instance_not_found' && (
        <StateBlock
          icon={AlertTriangle}
          tone="danger"
          title="Instancia Inexistente"
          description={waStatus.error || 'A instancia configurada nao existe na Evolution. Inicialize para criar/recriar.'}
          action={{ label: 'Criar/Recriar Instancia', onClick: onConnect, loading: actionLoading }}
        />
      )}

      {!statusLoading && waStatus.status === 'error' && (
        <StateBlock
          icon={AlertTriangle}
          tone="danger"
          title="Erro no Provedor"
          description={waStatus.error || 'Ocorreu um erro inesperado na integracao.'}
          action={{ label: 'Tentar Novamente', onClick: onConnect, loading: actionLoading }}
        />
      )}

      {!statusLoading && waStatus.status === 'disconnected' && (
        <StateBlock
          icon={WifiOff}
          tone="danger"
          title="WhatsApp Desconectado"
          description="Clique no botão abaixo para iniciar a conexão."
          action={{ label: 'Conectar WhatsApp', onClick: onConnect, loading: actionLoading }}
        />
      )}
    </Card>
  );
};
