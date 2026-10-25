'use client';

import { useCallback, useEffect, useState } from 'react';
import api from '@/lib/api';
import { Button, Icon } from '@/components/ui';
import { CascaOnboarding } from './CascaOnboarding';
import { useToast } from '@/components/Toast';
import { useVocabulario } from '@/hooks/useVocabulario';

// Etapa 5: o QR da conexão (as mesmas rotas de WhatsApp › Conexão) e o link da página para divulgar.

type Estado = 'carregando' | 'desconectado' | 'sem_instancia' | 'pareando' | 'conectado' | 'indisponivel';

const lerEstado = (status: unknown): Estado => {
  const s = String(status ?? '').toLowerCase();
  if (s === 'connected') return 'conectado';
  if (s === 'qr_code' || s === 'connecting' || s === 'pairing') return 'pareando';
  if (s === 'not_found' || s === 'instance_not_found') return 'sem_instancia';
  if (s === 'unavailable' || s === 'provider_unavailable' || s === 'error') return 'indisponivel';
  return 'desconectado';
};

const lerQr = (dados: unknown): string | null => {
  const qr = (dados as { qrCode?: unknown } | null)?.qrCode;
  return typeof qr === 'string' && qr.trim() ? qr : null;
};

export function EtapaWhatsapp({ jaConectado, slug, concluindo, onVoltar, onConcluir }: {
  jaConectado: boolean; slug: string | null; concluindo: boolean; onVoltar: () => void; onConcluir: () => void;
}) {
  const { showToast } = useToast();
  const { cli } = useVocabulario();
  const [estado, setEstado] = useState<Estado>(jaConectado ? 'conectado' : 'carregando');
  const [qr, setQr] = useState<string | null>(null);
  const [gerando, setGerando] = useState(false);

  const consultar = useCallback(async () => {
    try {
      const r = await api.get('/whatsapp/status');
      let novo = lerEstado((r.data as { status?: unknown })?.status);
      let codigo = lerQr(r.data);
      if (novo === 'pareando' && !codigo) {
        const q = await api.get('/whatsapp/qrcode').catch(() => null);
        codigo = lerQr(q?.data);
        if (q && (q.data as { status?: unknown })?.status !== undefined) novo = lerEstado((q.data as { status?: unknown }).status);
      }
      setEstado(novo);
      setQr(codigo);
    } catch {
      setEstado('indisponivel');
    }
  }, []);

  useEffect(() => {
    void consultar();
  }, [consultar]);

  // Enquanto o QR está na tela, confere a cada 5 s se ela já leu.
  useEffect(() => {
    if (estado !== 'pareando') return;
    const t = setInterval(() => void consultar(), 5000);
    return () => clearInterval(t);
  }, [estado, consultar]);

  const gerarQr = async () => {
    setGerando(true);
    try {
      await api.post(estado === 'sem_instancia' ? '/whatsapp/initialize' : '/whatsapp/connect');
      await consultar();
    } catch {
      showToast('Não foi possível gerar o QR code agora. Tente de novo ou conecte depois em WhatsApp.', 'error');
    } finally {
      setGerando(false);
    }
  };

  const link = slug && typeof window !== 'undefined' ? `${window.location.origin}/agendar/${slug}` : null;
  const copiar = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      showToast('Link copiado', 'success');
    } catch {
      showToast('Não foi possível copiar. Selecione o link e copie.', 'error');
    }
  };

  return (
    <CascaOnboarding
      etapa={5}
      titulo="Conecte seu WhatsApp e receba seu link"
      descricao={`O assistente envia as confirmações, cobra o sinal via Pix e lembra ${cli.osP} na véspera, sem você mover um dedo.`}
      rodape={(
        <>
          <Button variant="ghost" onClick={onVoltar}><Icon name="arrow_back" size={18} /> Voltar</Button>
          <Button loading={concluindo} onClick={onConcluir}>
            {estado === 'conectado' ? 'Ir para o painel' : 'Pular conexão e ir para o painel'} <Icon name="arrow_forward" size={18} />
          </Button>
        </>
      )}
    >
      <section className="rounded-card border border-line bg-surface p-5">
        {estado === 'conectado' ? (
          <p className="flex items-center gap-2 font-bold text-success-text">
            <Icon name="check_circle" size={22} filled /> WhatsApp conectado
          </p>
        ) : estado === 'pareando' && qr ? (
          <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qr} alt="QR code para conectar o WhatsApp" className="qr-surface h-56 w-56 rounded-control bg-surface p-2" />
            <ol className="space-y-2 text-[14px] text-ink">
              <li>1. Abra o WhatsApp no celular do seu negócio.</li>
              <li>2. Vá em <strong>Configurações › Aparelhos conectados</strong>.</li>
              <li>3. Toque em <strong>Conectar um aparelho</strong> e aponte a câmera para o QR code.</li>
              <li className="text-muted">Aguardando a leitura do QR code…</li>
            </ol>
          </div>
        ) : estado === 'indisponivel' ? (
          <p className="text-[15px] text-muted">A conexão do WhatsApp está fora do ar agora. Você pode conectar depois, em WhatsApp › Conexão.</p>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-bold text-ink">Conecte pelo QR code</h2>
              <p className="text-[14px] text-muted">Do mesmo jeito que no WhatsApp Web.</p>
            </div>
            <Button loading={gerando || estado === 'carregando'} onClick={() => void gerarQr()}>
              <Icon name="qr_code_2" size={18} /> Gerar QR code
            </Button>
          </div>
        )}
      </section>

      {link ? (
        <section className="rounded-card border border-line bg-surface p-5">
          <h2 className="font-bold text-ink">Sua página está no ar</h2>
          <p className="text-[14px] text-muted">Divulgue o link no Instagram, no status e para {cli.osP} de sempre.</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <code className="flex-1 truncate rounded-control bg-surface-2 px-3 py-2 text-[14px] text-ink">{link}</code>
            <Button variant="secondary" onClick={() => void copiar()}><Icon name="content_copy" size={18} /> Copiar link</Button>
          </div>
        </section>
      ) : (
        <p className="text-[14px] text-muted">Você pulou a página de agendamento. Ela fica em Minha página, quando quiser publicar.</p>
      )}
    </CascaOnboarding>
  );
}
