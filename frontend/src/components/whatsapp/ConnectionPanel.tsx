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
 * Dado de exemplo (`conteudoDemo.whatsapp`): a taxa de entrega, denúncias/spam, o
 * detalhamento por tipo de disparo (contagem pura, sem moldura de limite) e o histórico
 * recente de mensagens — nada disso existe no sistema hoje. Não existe limite de
 * disparos: esse conceito é da Cloud API oficial da Meta, e o sistema conecta por QR
 * code (Evolution API), não por ela — por isso não há barra de consumo diário nem botão
 * de "solicitar aumento de limite" nesta tela (Tarefa 10 / correção I5).
 *
 * "Boas Práticas & Dicas Anti-bloqueio" (achado da varredura de telas: card do arquivo
 * de referência inteiro sem equivalente aqui) foi recriado com conteúdo genérico e real
 * para este sistema — ver DICAS_ANTI_BLOQUEIO abaixo — sem nenhuma menção a Meta/WABA/
 * conformidade, que não se aplicam à conexão por QR code.
 */

import Image from 'next/image';
import { Button, Card, Icon, Skeleton } from '@/components/ui';
import { cn } from '@/lib/cn';
import { conteudoDemo } from '@/lib/conteudoDemo';

/**
 * Boas práticas anti-bloqueio (whatsapp-conexao.html:188-247), reescritas para o que o
 * sistema realmente faz — o arquivo de referência é da Cloud API oficial da Meta e cita
 * coisas que não existem aqui: pausa automática de 45-90s entre "lotes de campanhas
 * promocionais" (não existe pacing de lote no envio, só retry de rede em
 * evolutionApiService.ts) e inclusão automática de "PARAR" nas mensagens promocionais
 * (o sistema só envia confirmação/lembrete de agendamento, nunca campanha). As dicas 1 e
 * 2 do arquivo já eram verdadeiras (troquei {nome}/{horarios} pelas tags reais que
 * MessageConfigPanel.tsx documenta); 3 e 4 foram reescritas como orientação ao dono do
 * negócio em vez de afirmar um comportamento automático que o sistema não tem.
 */
const DICAS_ANTI_BLOQUEIO: { titulo: string; descricao: string }[] = [
  {
    titulo: 'Só contatos com consentimento (LGPD)',
    descricao: 'Envie mensagens só para clientes que já agendaram com você ou autorizaram contato pelo link da bio.',
  },
  {
    titulo: 'Personalize com as tags reais',
    descricao:
      'Use {nome_cliente}, {servico} e {horario} em Ajustes → WhatsApp para cada mensagem saída com o dado real do cliente.',
  },
  {
    titulo: 'Evite reenvios em massa repetidos',
    descricao: 'Espalhar os lembretes ao longo do dia, em vez de reenviar tudo de uma vez, reduz o risco de o número ser sinalizado.',
  },
  {
    titulo: 'Responda rápido quando o cliente responder',
    descricao: 'Manter a conversa humana e ativa reduz reclamações e mantém a confiança no número.',
  },
];

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
        <Card className="lg:col-span-4">
          <div className="mb-4 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Icon name="health_metrics" size={22} className="text-whatsapp" />
              <h3 className="text-[15px] font-bold text-ink">Saúde de Envios de Hoje</h3>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
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
        </Card>

        <Card className="lg:col-span-4">
          <div className="mb-4 flex items-center gap-2">
            <Icon name="shield" size={22} className="text-brand-text" />
            <h3 className="text-[15px] font-bold text-ink">Boas Práticas & Dicas Anti-bloqueio</h3>
          </div>
          <div className="flex flex-col gap-2">
            {DICAS_ANTI_BLOQUEIO.map((dica, indice) => (
              <div key={dica.titulo} className="flex gap-2.5 rounded-lg bg-surface-2 p-2.5">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface text-[11px] font-bold text-brand-text">
                  {indice + 1}
                </span>
                <div className="flex min-w-0 flex-col">
                  <span className="text-[13px] font-bold text-ink">{dica.titulo}</span>
                  <span className="text-[12px] text-muted">{dica.descricao}</span>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card className="lg:col-span-4">
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
