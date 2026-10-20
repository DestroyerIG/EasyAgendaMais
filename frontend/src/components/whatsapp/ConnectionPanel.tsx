'use client';

/**
 * Aba Conexão (Stitch ff12c8), com dados reais.
 *
 * Estado da conexão, número e QR vêm do `waStatus` que o WhatsAppModule já acompanha.
 * Envios de hoje, saúde, detalhamento e histórico vêm de `buscarResumoConexao`, que o
 * painel busca sozinho (ao montar, quando o estado da conexão muda e a cada "Atualizar
 * status"). Nenhum dado de exemplo: sem dado, o bloco mostra estado vazio.
 */

import { useCallback, useEffect, useState } from 'react';
import Image from 'next/image';
import { Button, Card, Icon, Modal, Skeleton } from '@/components/ui';
import { cn } from '@/lib/cn';
import { buscarResumoConexao, formatarTelefone, type ResumoConexaoDto, type StatusMensagem } from '@/lib/whatsappInbox';

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
  nomeNegocio: string;
  onConnect: () => void;
  onDisconnect: () => void;
  onRefresh: () => void;
  onTestSend: () => void | Promise<void>;
}

type Tom = 'success' | 'warning' | 'danger';

const CHIP_CLASS: Record<Tom, string> = {
  success: 'bg-success/12 text-success-text',
  warning: 'bg-warning/12 text-warning-text',
  danger: 'bg-danger/12 text-danger',
};

const DICAS = (negocio: string): Array<{ titulo: string; descricao: React.ReactNode }> => [
  {
    titulo: 'Somente contatos com consentimento (LGPD)',
    descricao: `Dispare apenas para clientes que já agendaram no ${negocio} ou autorizaram avisos no link da bio.`,
  },
  {
    titulo: 'Personalize com variáveis dinâmicas',
    descricao: (
      <>
        Sempre use as tags <code className="rounded bg-surface px-1 py-0.5 font-mono text-[11px] text-ink">{'{nome_cliente}'}</code> e{' '}
        <code className="rounded bg-surface px-1 py-0.5 font-mono text-[11px] text-ink">{'{horario}'}</code> para evitar classificação de mensagem repetitiva.
      </>
    ),
  },
  {
    titulo: 'Espace os envios',
    descricao: 'Evite mandar muitas mensagens seguidas para clientes diferentes; envios espaçados ajudam a manter o número com boa reputação.',
  },
  {
    titulo: 'Opção clara de descadastro',
    descricao: 'Toda cliente pode responder SAIR para parar as mensagens automáticas.',
  },
  {
    titulo: 'Responda rápido aos chamados humanos',
    descricao: 'Números com alto índice de interação direta ajudam a manter boa reputação.',
  },
];

const STATUS_ENVIO: Record<StatusMensagem, { rotulo: string; tom: Tom; icone: string }> = {
  recebida: { rotulo: 'Recebida', tom: 'success', icone: 'done' },
  enviada: { rotulo: 'Enviada', tom: 'warning', icone: 'check' },
  entregue: { rotulo: 'Entregue', tom: 'success', icone: 'done_all' },
  lida: { rotulo: 'Entregue e lida', tom: 'success', icone: 'done_all' },
  falhou: { rotulo: 'Falhou', tom: 'danger', icone: 'error' },
};

const FUSO = 'America/Sao_Paulo';

const partes = (d: Date) => {
  const p = new Intl.DateTimeFormat('en-GB', {
    timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(d);
  const pega = (t: string) => p.find((x) => x.type === t)?.value ?? '';
  return { ano: pega('year'), mes: pega('month'), dia: pega('day'), hora: `${pega('hour')}:${pega('minute')}:${pega('second')}` };
};

/** "Hoje, 11:42:08", "Ontem, 18:03:10" ou "14/10, 09:15:00" (fuso de São Paulo). */
export function horarioDoEnvio(iso: string, agora: Date = new Date()): string {
  const alvo = partes(new Date(iso));
  const hoje = partes(agora);
  const chave = (p: { ano: string; mes: string; dia: string }) => `${p.ano}-${p.mes}-${p.dia}`;
  if (chave(alvo) === chave(hoje)) return `Hoje, ${alvo.hora}`;
  const ontem = partes(new Date(Date.UTC(Number(hoje.ano), Number(hoje.mes) - 1, Number(hoje.dia) - 1, 12)));
  if (chave(alvo) === chave(ontem)) return `Ontem, ${alvo.hora}`;
  return `${alvo.dia}/${alvo.mes}, ${alvo.hora}`;
}

function descreverSincronizacao(lastSyncedAt: Date | null): string | null {
  if (!lastSyncedAt) return null;
  const minutos = Math.floor(Math.max(0, Date.now() - lastSyncedAt.getTime()) / 60_000);
  return minutos < 1 ? 'Sincronizado agora' : `Sincronizado há ${minutos} min`;
}

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

const ROTULO = 'text-[11px] font-semibold uppercase tracking-wider text-muted';

function CartaoInfo({ rotulo, valor, detalhe, tomDetalhe = 'muted', valorTom }: {
  rotulo: string; valor: string; detalhe: string; tomDetalhe?: 'muted' | 'success'; valorTom?: 'success';
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className={ROTULO}>{rotulo}</span>
      <span className={cn('text-[17px] font-bold tracking-tight', valorTom === 'success' ? 'text-success-text' : 'text-ink')}>
        {valor}
      </span>
      <span className={cn('text-sm', tomDetalhe === 'success' ? 'font-semibold text-success-text' : 'text-muted')}>{detalhe}</span>
    </div>
  );
}

function BadgeStatus({ status }: { status: StatusMensagem }) {
  const info = STATUS_ENVIO[status];
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold', CHIP_CLASS[info.tom])}>
      <Icon name={info.icone} size={14} />
      {info.rotulo}
    </span>
  );
}

function Inicial({ nome }: { nome: string | null }) {
  return (
    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface-2 text-[11px] font-bold text-ink" aria-hidden="true">
      {nome ? nome.trim().charAt(0).toUpperCase() : '?'}
    </div>
  );
}

export const ConnectionPanel = ({
  waStatus, statusLoading, actionLoading, lastSyncedAt, nomeNegocio, onConnect, onDisconnect, onRefresh, onTestSend,
}: ConnectionPanelProps) => {
  const [resumo, setResumo] = useState<ResumoConexaoDto | null>(null);
  const [resumoErro, setResumoErro] = useState(false);
  const [testando, setTestando] = useState(false);
  const [qrFechado, setQrFechado] = useState(false);

  const carregarResumo = useCallback(async () => {
    setResumoErro(false);
    try {
      setResumo(await buscarResumoConexao());
    } catch {
      setResumo(null);
      setResumoErro(true);
    }
  }, []);

  // Busca ao montar e quando a conexão muda de estado (conectou, caiu, voltou).
  useEffect(() => {
    void carregarResumo();
  }, [carregarResumo, waStatus.status]);

  // Fora do pareamento o modal do QR fecha sozinho e volta a poder abrir no próximo.
  useEffect(() => {
    if (waStatus.status !== 'pairing') setQrFechado(false);
  }, [waStatus.status]);

  const conectado = waStatus.status === 'connected';
  const pareando = waStatus.status === 'pairing';
  const modalAberto = pareando && !qrFechado;
  const numeroBruto = resumo?.numero ?? waStatus.connectedNumber;
  const telefone = numeroBruto ? formatarTelefone(numeroBruto) : null;
  const sincronizacao = descreverSincronizacao(lastSyncedAt);
  const chip: { tom: Tom; rotulo: string } = conectado
    ? { tom: 'success', rotulo: 'Conectado' }
    : pareando ? { tom: 'warning', rotulo: 'Conectando' } : { tom: 'danger', rotulo: 'Desconectado' };

  const dias = resumo?.diasConectado ?? null;
  const linhaConexao = [
    'Conectado por QR code',
    telefone,
    dias !== null ? (dias === 0 ? 'conectado hoje' : `conectado há ${plural(dias, 'dia', 'dias')}`) : null,
  ].filter(Boolean).join(' • ');

  const tempoConectado = (() => {
    if (!conectado || !resumo || dias === null || !resumo.conectadoDesde) return { valor: conectado ? 'Conectado' : '—', detalhe: '—' };
    const valor = dias === 0 ? 'Menos de 1 dia' : `${dias} ${dias === 1 ? 'dia corrido' : 'dias corridos'}`;
    if (resumo.semInterrupcoes) return { valor, detalhe: 'Sem interrupções' };
    const horas = Math.max(1, Math.floor((Date.now() - new Date(resumo.conectadoDesde).getTime()) / 3_600_000));
    return { valor, detalhe: `Reconectado há ${horas} h` };
  })();

  const testar = async () => {
    setTestando(true);
    try { await onTestSend(); } finally { setTestando(false); }
  };

  const conectar = () => {
    setQrFechado(false);
    onConnect();
  };

  const envios = resumo?.enviosHoje;
  const percentual = envios ? Math.min(100, Math.max(0, envios.percentual)) : 0;
  const grupos = envios ? [
    { icone: 'notifications_active', cor: 'text-whatsapp', rotulo: 'Lembretes e confirmações automáticas', total: envios.grupos.automaticas },
    { icone: 'payments', cor: 'text-brand-text', rotulo: 'Notificações de sinal Pix e recibos', total: envios.grupos.pix },
    { icone: 'support_agent', cor: 'text-brand-text', rotulo: 'Mensagens manuais / Chat', total: envios.grupos.manuais },
  ] : [];

  return (
    <div className="flex flex-col gap-6">
      {/* 1. Cabeçalho */}
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div className="flex flex-col gap-1">
          <p className="text-[11px] font-bold uppercase tracking-wider text-muted">
            WHATSAPP / <span className="text-success-text">CONEXÃO</span>
          </p>
          <h2 className="text-[28px] font-bold leading-9 tracking-tight text-ink">Conexão do WhatsApp</h2>
          <p className="max-w-2xl text-[15px] text-muted">
            Acompanhe a conexão do WhatsApp do {nomeNegocio} e os limites de envio recomendados.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 self-start md:self-auto">
          {sincronizacao && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-4 py-1.5 text-[13px] font-semibold text-ink">
              <span className="h-2 w-2 animate-pulse rounded-full bg-whatsapp" />
              {sincronizacao}
            </span>
          )}
          <Button
            variant="secondary"
            onClick={() => { onRefresh(); void carregarResumo(); }}
          >
            <Icon name="sync" size={18} />
            Atualizar status
          </Button>
        </div>
      </div>

      {/* 2 e 3. Cartão de status e quatro cartões */}
      <Card className="flex flex-col gap-6">
        {statusLoading ? (
          <div className="flex flex-col items-center gap-4 py-6">
            <Skeleton className="h-12 w-12 rounded-full" />
            <p className="text-[15px] text-muted">Verificando status do WhatsApp...</p>
          </div>
        ) : (
          <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-center">
            <div className="flex min-w-0 items-start gap-4">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-surface-2">
                <Icon name="chat" size={32} className="text-whatsapp" />
              </div>
              <div className="flex min-w-0 flex-col gap-0.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate text-xl font-bold tracking-tight text-ink">{nomeNegocio}</span>
                  <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold', CHIP_CLASS[chip.tom])}>
                    <span className="h-1.5 w-1.5 rounded-full bg-current" />
                    {chip.rotulo}
                  </span>
                </div>
                <span className="text-[15px] text-muted">
                  {conectado
                    ? linhaConexao
                    : waStatus.error ?? 'Escaneie o QR code para conectar o WhatsApp do negócio.'}
                </span>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {conectado ? (
                <>
                  <Button variant="whatsapp" onClick={() => void testar()} loading={testando}>
                    {!testando && <Icon name="send" size={18} />}
                    Testar envio
                  </Button>
                  <Button variant="secondary" onClick={conectar} disabled={actionLoading}>
                    <Icon name="qr_code_scanner" size={18} />
                    Reconectar (novo QR code)
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={onDisconnect}
                    disabled={actionLoading}
                    className="bg-surface-m3-low text-muted hover:bg-surface-2 hover:text-ink"
                  >
                    <Icon name="link_off" size={18} />
                    Desconectar
                  </Button>
                </>
              ) : (
                <Button variant="whatsapp" onClick={conectar} loading={actionLoading}>
                  {!actionLoading && <Icon name="qr_code_scanner" size={18} />}
                  Conectar WhatsApp
                </Button>
              )}
            </div>
          </div>
        )}

        {!statusLoading && !resumoErro && (
          <div className="grid grid-cols-1 gap-4 rounded-card bg-surface-m3-low p-4 sm:grid-cols-2 lg:grid-cols-4">
            <CartaoInfo
              rotulo="Número conectado"
              valor={telefone ?? '—'}
              detalhe={conectado ? 'Linha principal ativa' : '—'}
              tomDetalhe={conectado ? 'success' : 'muted'}
            />
            <CartaoInfo
              rotulo="Tipo de integração"
              valor="WhatsApp Web / QR Code"
              detalhe={conectado ? 'Sessão sincronizada' : '—'}
              tomDetalhe={conectado ? 'success' : 'muted'}
            />
            <CartaoInfo rotulo="Tempo conectado" valor={tempoConectado.valor} detalhe={tempoConectado.detalhe} />
            <CartaoInfo
              rotulo="Status da conexão"
              valor={conectado ? 'Estável' : 'Desconectado'}
              detalhe={conectado ? 'Pronto para envios' : 'Envios pausados'}
              tomDetalhe={conectado ? 'success' : 'muted'}
              valorTom={conectado ? 'success' : undefined}
            />
          </div>
        )}
      </Card>

      {resumoErro && (
        <Card className="flex flex-col items-center gap-3 py-8 text-center">
          <Icon name="cloud_off" size={32} className="text-muted" />
          <p className="text-[15px] text-ink">Não foi possível carregar os dados de envio.</p>
          <Button variant="secondary" onClick={() => void carregarResumo()}>
            <Icon name="refresh" size={18} />
            Tentar de novo
          </Button>
        </Card>
      )}

      {/* 4 e 5. Saúde e limite, boas práticas */}
      <section className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {!resumoErro && (
          <Card className="flex flex-col gap-4 lg:col-span-6">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Icon name="health_metrics" size={22} className="text-whatsapp" />
                <h3 className="text-[17px] font-bold tracking-tight text-ink">Saúde e limite de envios</h3>
              </div>
              {resumo && (
                <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-bold', CHIP_CLASS[resumo.saude === 'Atenção' ? 'warning' : 'success'])}>
                  {resumo.saude}
                </span>
              )}
            </div>

            {!resumo || !envios ? (
              <Skeleton className="h-40 w-full" label="Carregando envios de hoje..." />
            ) : (
              <>
                <div className="flex flex-col gap-2 rounded-card bg-surface-m3-low p-4">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-[13px] font-semibold text-ink">Envios de hoje</span>
                    <div className="flex items-baseline gap-1">
                      <span className="text-2xl font-bold tabular-nums text-ink">{envios.total}</span>
                      <span className="text-[15px] text-muted">de {envios.limite} recomendados</span>
                    </div>
                  </div>
                  <div className="h-3 w-full overflow-hidden rounded-full bg-surface-2">
                    <div className="h-full rounded-full bg-whatsapp transition-all duration-700" style={{ width: `${percentual}%` }} />
                  </div>
                  <div className="flex items-center justify-between gap-2 text-[11px] text-muted">
                    <span>{Math.round(envios.percentual)}% utilizado</span>
                    <span className="font-semibold text-success-text">
                      {envios.disponiveis === 1 ? '1 envio disponível hoje' : `${envios.disponiveis} envios disponíveis hoje`}
                    </span>
                  </div>
                </div>

                <div className="flex flex-col gap-1">
                  <span className={ROTULO}>Detalhamento dos envios de hoje</span>
                  <div className="mt-1 flex flex-col gap-1">
                    {grupos.map((g) => (
                      <div key={g.rotulo} className="flex items-center justify-between rounded-lg bg-surface-m3-low p-2">
                        <div className="flex items-center gap-2">
                          <Icon name={g.icone} size={18} className={g.cor} />
                          <span className="text-sm font-medium text-ink">{g.rotulo}</span>
                        </div>
                        <span className="text-[13px] font-bold tabular-nums text-ink">{g.total}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

            <p className="flex items-center gap-1.5 text-[13px] text-muted">
              <Icon name="info" size={16} />
              O limite recomendado protege seu número contra bloqueio do WhatsApp.
            </p>
          </Card>
        )}

        <Card className={cn('flex flex-col gap-4', resumoErro ? 'lg:col-span-12' : 'lg:col-span-6')}>
          <div className="flex items-center gap-2">
            <Icon name="shield" size={22} className="text-brand-text" />
            <h3 className="text-[17px] font-bold tracking-tight text-ink">Boas práticas de envio</h3>
          </div>
          <p className="text-sm text-muted">
            Siga estas recomendações para manter a boa reputação do seu número.
          </p>
          <div className="flex flex-col gap-2">
            {DICAS(nomeNegocio).map((dica, i) => (
              <div key={dica.titulo} className="flex gap-3 rounded-lg bg-surface-m3-low p-3 transition-colors hover:bg-surface-2">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface text-[11px] font-bold text-brand-text">
                  {i + 1}
                </span>
                <div className="flex min-w-0 flex-col">
                  <span className="text-[13px] font-bold text-ink">{dica.titulo}</span>
                  <span className="text-sm text-muted">{dica.descricao}</span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </section>

      {/* 6. Histórico recente */}
      {!resumoErro && (
        <Card className="flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <Icon name="history_toggle_off" size={22} className="text-ink" />
            <div className="flex flex-col">
              <h3 className="text-[17px] font-bold tracking-tight text-ink">Histórico recente de disparos</h3>
              <span className="text-sm text-muted">Últimos disparos processados pelo WhatsApp</span>
            </div>
          </div>

          {!resumo ? (
            <Skeleton className="h-32 w-full" label="Carregando histórico..." />
          ) : resumo.historico.length === 0 ? (
            <p className="py-6 text-center text-[15px] text-muted">Nenhum envio ainda hoje.</p>
          ) : (
            <>
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="bg-surface-2/50 text-[11px] uppercase tracking-wider text-muted">
                      <th className="rounded-l-lg px-4 py-2">Horário</th>
                      <th className="px-4 py-2">Destinatário</th>
                      <th className="px-4 py-2">Tipo de disparo</th>
                      <th className="rounded-r-lg px-4 py-2 text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {resumo.historico.map((h) => (
                      <tr key={h.id} className="transition-colors hover:bg-surface-2/60">
                        <td className="px-4 py-3 font-mono text-[11px] tabular-nums text-muted">{horarioDoEnvio(h.criadaEm)}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <Inicial nome={h.cliente} />
                            <div className="flex flex-col">
                              <span className="font-semibold text-ink">{h.cliente ?? 'Sem cadastro'}</span>
                              <span className="font-mono text-[11px] text-muted">{h.telefone}</span>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-muted">{h.tipo}</td>
                        <td className="px-4 py-3 text-right"><BadgeStatus status={h.status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <ul className="flex flex-col gap-2 md:hidden">
                {resumo.historico.map((h) => (
                  <li key={h.id} className="flex flex-col gap-2 rounded-lg bg-surface-2/50 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <Inicial nome={h.cliente} />
                        <div className="flex min-w-0 flex-col">
                          <span className="truncate text-sm font-semibold text-ink">{h.cliente ?? 'Sem cadastro'}</span>
                          <span className="font-mono text-[11px] text-muted">{h.telefone}</span>
                        </div>
                      </div>
                      <BadgeStatus status={h.status} />
                    </div>
                    <span className="text-sm text-muted">{h.tipo}</span>
                    <span className="font-mono text-[11px] tabular-nums text-muted">{horarioDoEnvio(h.criadaEm)}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>
      )}

      {/* 7. Modal do QR code */}
      <Modal
        isOpen={modalAberto}
        onClose={() => setQrFechado(true)}
        title="Conectar WhatsApp"
        icon="qr_code_scanner"
        footer={
          <>
            <Button variant="secondary" onClick={() => setQrFechado(true)}>Fechar</Button>
            <Button variant="whatsapp" onClick={() => setQrFechado(true)}>Concluído</Button>
          </>
        }
      >
        <div className="flex flex-col items-center gap-2 rounded-card bg-surface-2/50 p-4 text-center">
          <div className="flex h-48 w-48 items-center justify-center rounded-lg bg-surface p-2 shadow-sm qr-surface">
            {waStatus.qrCode ? (
              <Image
                src={waStatus.qrCode}
                alt="QR code do WhatsApp"
                width={176}
                height={176}
                unoptimized
                className="h-full w-full"
                style={{ imageRendering: 'pixelated' }}
              />
            ) : (
              <Skeleton className="h-full w-full" label="Gerando o QR code..." />
            )}
          </div>
          <span className="text-[13px] font-bold text-ink">Escaneie o QR code no app do WhatsApp</span>
          <span className="text-sm text-muted">Abra o WhatsApp &gt; Aparelhos conectados &gt; Conectar um aparelho e aponte para a tela.</span>
        </div>
      </Modal>
    </div>
  );
};
