import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ResumoConexaoDto } from '@/lib/whatsappInbox';

const buscarResumoConexao = vi.fn();
vi.mock('@/lib/whatsappInbox', async () => {
  const real = await vi.importActual<typeof import('@/lib/whatsappInbox')>('@/lib/whatsappInbox');
  return { ...real, buscarResumoConexao: (...a: unknown[]) => buscarResumoConexao(...a) };
});

import { ConnectionPanel } from '../ConnectionPanel';

const baseStatus = { qrCode: null, connectedNumber: '5583981204000', connectedName: null, error: null };

const agoraIso = (deslocamentoMs = 0) => new Date(Date.now() - deslocamentoMs).toISOString();

const resumo = (sobrescrever: Partial<ResumoConexaoDto> = {}): ResumoConexaoDto => ({
  conectado: true,
  numero: '5583981204000',
  conectadoDesde: agoraIso(12 * 24 * 3600_000),
  diasConectado: 12,
  semInterrupcoes: true,
  enviosHoje: { total: 68, falhas: 0, limite: 250, percentual: 27.2, disponiveis: 182, grupos: { automaticas: 42, pix: 16, manuais: 10 } },
  saude: 'Boa',
  historico: [
    { id: 'm1', criadaEm: agoraIso(60_000), cliente: 'Juliana Mendes', telefone: '+55 83 99611-****', tipo: 'Lembrete de atendimento (2h antes)', status: 'lida' },
    { id: 'm2', criadaEm: agoraIso(120_000), cliente: null, telefone: '+55 83 98842-****', tipo: 'Resposta do robô', status: 'falhou' },
  ],
  ...sobrescrever,
});

const noop = () => {};
const renderPainel = (props: Partial<React.ComponentProps<typeof ConnectionPanel>> = {}) =>
  render(
    <ConnectionPanel
      waStatus={{ ...baseStatus, status: 'connected' }}
      statusLoading={false}
      actionLoading={false}
      lastSyncedAt={null}
      nomeNegocio="Studio Aurora"
      onConnect={noop}
      onDisconnect={noop}
      onRefresh={noop}
      onTestSend={noop}
      {...props}
    />,
  );

describe('ConnectionPanel', () => {
  beforeEach(() => {
    buscarResumoConexao.mockReset();
    buscarResumoConexao.mockResolvedValue(resumo());
  });

  it('conectado com resumo mostra cabeçalho, status, cartões, limite, detalhamento e histórico reais', async () => {
    renderPainel({ lastSyncedAt: new Date(Date.now() - 2 * 60_000) });
    expect(await screen.findByText('68')).toBeInTheDocument();

    expect(screen.getByRole('heading', { name: 'Conexão do WhatsApp' })).toBeInTheDocument();
    expect(screen.getByText('Acompanhe a conexão do WhatsApp do Studio Aurora e os limites de envio recomendados.')).toBeInTheDocument();
    expect(screen.getByText('Sincronizado há 2 min')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Atualizar status/ })).toBeInTheDocument();

    const chip = screen.getByText('Conectado');
    expect(chip.className).toMatch(/success/);
    expect(screen.getByText(/Conectado por QR code • \+55 \(83\) 98120-4000 • conectado há 12 dias/)).toBeInTheDocument();
    for (const nome of ['Testar envio', 'Reconectar (novo QR code)', 'Desconectar']) {
      expect(screen.getByRole('button', { name: new RegExp(nome.replace(/[()]/g, '\\$&')) })).toBeInTheDocument();
    }

    expect(screen.getByText('Linha principal ativa')).toBeInTheDocument();
    expect(screen.getByText('WhatsApp Web / QR Code')).toBeInTheDocument();
    expect(screen.getByText('Sessão sincronizada')).toBeInTheDocument();
    expect(screen.getByText('12 dias corridos')).toBeInTheDocument();
    expect(screen.getByText('Sem interrupções')).toBeInTheDocument();
    expect(screen.getByText('Estável')).toBeInTheDocument();
    expect(screen.getByText('Pronto para envios')).toBeInTheDocument();

    expect(screen.getByText('Boa')).toBeInTheDocument();
    expect(screen.getByText('de 250 recomendados')).toBeInTheDocument();
    expect(screen.getByText('27% utilizado')).toBeInTheDocument();
    expect(screen.getByText('182 envios disponíveis hoje')).toBeInTheDocument();
    expect(screen.getByText('O limite recomendado protege seu número contra bloqueio do WhatsApp.')).toBeInTheDocument();
    const grupos: Array<[string, string]> = [
      ['Lembretes e confirmações automáticas', '42'],
      ['Notificações de sinal Pix e recibos', '16'],
      ['Mensagens manuais / Chat', '10'],
    ];
    for (const [rotulo, valor] of grupos) {
      const linha = screen.getByText(rotulo).parentElement!.parentElement!;
      expect(within(linha).getByText(valor)).toBeInTheDocument();
    }

    expect(screen.getAllByText('Juliana Mendes').length).toBeGreaterThan(0);
    expect(screen.getAllByText('+55 83 99611-****').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Entregue e lida').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Sem cadastro').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Falhou').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/^Hoje, \d{2}:\d{2}:\d{2}$/).length).toBeGreaterThan(0);
  });

  it('não traz Latência, PARAR, pedido de aumento de limite nem texto do conteudoDemo antigo', async () => {
    renderPainel();
    await screen.findByText('68');
    for (const proibido of [/Latência/, /PARAR/, /Solicitar aumento/, /Hoje, 11:42/, /Nenhuma denúncia registrada/, /^Taxa de entrega$/i, /Denúncias/]) {
      expect(screen.queryByText(proibido)).not.toBeInTheDocument();
    }
    expect(screen.getByText(/responder “?SAIR”?/)).toBeInTheDocument();
    expect(screen.getByText(/Dispare apenas para clientes que já agendaram no Studio Aurora/)).toBeInTheDocument();
    expect(screen.getByText('{nome}')).toBeInTheDocument();
    expect(screen.getByText('{horarios}')).toBeInTheDocument();
  });

  it('sem diasConectado mostra só "Conectado por QR code • telefone" e "Conectado" / "—" no cartão', async () => {
    buscarResumoConexao.mockResolvedValue(resumo({ diasConectado: null, conectadoDesde: null, semInterrupcoes: false }));
    renderPainel();
    await screen.findByText('68');
    expect(screen.getByText('Conectado por QR code • +55 (83) 98120-4000')).toBeInTheDocument();
    expect(screen.getAllByText('Conectado').length).toBeGreaterThan(1);
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('reconectado recentemente mostra "Reconectado há X h"', async () => {
    buscarResumoConexao.mockResolvedValue(resumo({ diasConectado: 1, semInterrupcoes: false, conectadoDesde: agoraIso(5 * 3600_000 + 1000) }));
    renderPainel();
    expect(await screen.findByText('Reconectado há 5 h')).toBeInTheDocument();
  });

  it('desconectado mostra "Desconectado", o convite ao QR e "Conectar WhatsApp"', async () => {
    const onConnect = vi.fn();
    buscarResumoConexao.mockResolvedValue(resumo({ conectado: false, diasConectado: null, conectadoDesde: null, numero: null }));
    renderPainel({ waStatus: { ...baseStatus, connectedNumber: null, status: 'disconnected' }, onConnect });
    await screen.findByText('68');
    expect(screen.getAllByText('Desconectado').length).toBeGreaterThan(0);
    expect(screen.getByText('Envios pausados')).toBeInTheDocument();
    expect(screen.getByText('Escaneie o QR code para conectar o WhatsApp do negócio.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Conectar WhatsApp' }));
    expect(onConnect).toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Desconectar' })).not.toBeInTheDocument();
  });

  it('histórico vazio mostra "Nenhum envio ainda hoje."', async () => {
    buscarResumoConexao.mockResolvedValue(resumo({ historico: [] }));
    renderPainel();
    expect(await screen.findByText('Nenhum envio ainda hoje.')).toBeInTheDocument();
  });

  it('erro no resumo mostra a mensagem e "Tentar de novo" busca de novo; o cartão de status segue funcionando', async () => {
    buscarResumoConexao.mockRejectedValueOnce(new Error('falhou'));
    renderPainel();
    expect(await screen.findByText('Não foi possível carregar os dados de envio.')).toBeInTheDocument();
    expect(screen.getByText('Conectado')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Desconectar' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(await screen.findByText('68')).toBeInTheDocument();
    expect(buscarResumoConexao).toHaveBeenCalledTimes(2);
  });

  it('Atualizar status chama onRefresh e busca o resumo de novo', async () => {
    const onRefresh = vi.fn();
    renderPainel({ onRefresh });
    await screen.findByText('68');
    await userEvent.click(screen.getByRole('button', { name: /Atualizar status/ }));
    expect(onRefresh).toHaveBeenCalled();
    await waitFor(() => expect(buscarResumoConexao).toHaveBeenCalledTimes(2));
  });

  it('Testar envio e Desconectar chamam os handlers', async () => {
    const onTestSend = vi.fn();
    const onDisconnect = vi.fn();
    renderPainel({ onTestSend, onDisconnect });
    await screen.findByText('68');
    await userEvent.click(screen.getByRole('button', { name: /Testar envio/ }));
    expect(onTestSend).toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: /Desconectar/ }));
    expect(onDisconnect).toHaveBeenCalled();
  });

  it('Reconectar abre o modal do QR com o QR que o módulo já busca', async () => {
    const onConnect = vi.fn();
    const { rerender } = renderPainel({ onConnect });
    await screen.findByText('68');
    await userEvent.click(screen.getByRole('button', { name: /Reconectar \(novo QR code\)/ }));
    expect(onConnect).toHaveBeenCalled();
    rerender(
      <ConnectionPanel
        waStatus={{ ...baseStatus, status: 'pairing', qrCode: 'data:image/png;base64,abc' }}
        statusLoading={false}
        actionLoading={false}
        lastSyncedAt={null}
        nomeNegocio="Studio Aurora"
        onConnect={onConnect}
        onDisconnect={noop}
        onRefresh={noop}
        onTestSend={noop}
      />,
    );
    const dialogo = await screen.findByRole('dialog');
    expect(within(dialogo).getByText('Conectar WhatsApp')).toBeInTheDocument();
    expect(within(dialogo).getByText('Escaneie o QR code no app do WhatsApp')).toBeInTheDocument();
    expect(within(dialogo).getByText('Abra o WhatsApp > Aparelhos conectados > Conectar um aparelho e aponte para a tela.')).toBeInTheDocument();
    expect(within(dialogo).getByAltText('QR code do WhatsApp')).toBeInTheDocument();
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Concluído' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('sincronização recente mostra "Sincronizado agora"', async () => {
    renderPainel({ lastSyncedAt: new Date(Date.now() - 5_000) });
    expect(await screen.findByText('Sincronizado agora')).toBeInTheDocument();
  });
});
