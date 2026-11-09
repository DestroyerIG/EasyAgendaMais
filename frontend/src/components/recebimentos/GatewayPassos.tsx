'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ExternalLink } from 'lucide-react';
import { Banner, Button, Card, Modal, Skeleton, Switch } from '@/components/ui';
import { useToast } from '@/components/Toast';
import { recebimentosApi, type EstadoRecebimentos } from '@/lib/recebimentos';
import { getApiErrorMessage } from '@/utils/handleApiError';
import { GATEWAYS, URL_TAXAS_MERCADO_PAGO } from './catalogo';
import { GatewayLogo } from './GatewayLogo';

// Tela de passos para conectar um gateway de recebimento (hoje, só o Mercado Pago).

const AVISO_CONTESTACAO = 'No cartão, o cliente pode contestar a compra no banco, e o valor pode voltar para ele.';
const ERRO_CONECTAR = 'Não foi possível conectar o Mercado Pago. Tente de novo.';

const quando = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

const linkExterno = 'inline-flex items-center gap-1 font-semibold text-brand-text underline underline-offset-2';

export function GatewayPassos({ gatewayId }: { gatewayId: string }) {
  const { showToast } = useToast();
  const gateway = GATEWAYS.find((g) => g.id === gatewayId);
  const [estado, setEstado] = useState<EstadoRecebimentos | null>(null);
  const [indo, setIndo] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [desconectando, setDesconectando] = useState(false);
  const [pedindoCartao, setPedindoCartao] = useState(false);
  const [aceite, setAceite] = useState(false);
  const [erroFormas, setErroFormas] = useState<string | null>(null);

  // Na volta do Mercado Pago (?recebimento=confirmar&t=...), confirma a conexão com a sessão de quem
  // está logado; ?recebimento=erro avisa. Depois limpa a URL.
  useEffect(() => {
    if (!gateway || gateway.situacao !== 'disponivel') return;
    const params = new URLSearchParams(window.location.search);
    const resultado = params.get('recebimento');
    const t = params.get('t');
    if (resultado) {
      try {
        const url = new URL(window.location.href);
        url.searchParams.delete('recebimento');
        url.searchParams.delete('t');
        window.history.replaceState(null, '', url.toString());
      } catch { /* URL de teste sem href completo */ }
    }
    (async () => {
      if (resultado === 'confirmar' && t) {
        try {
          const novo = await recebimentosApi.confirmar(t);
          setEstado(novo.conexao ? novo : await recebimentosApi.conexoes());
          showToast('Mercado Pago conectado.', 'success');
          return;
        } catch (e) {
          showToast(getApiErrorMessage(e, ERRO_CONECTAR), 'error');
        }
      } else if (resultado) {
        showToast(ERRO_CONECTAR, 'error');
      }
      try {
        setEstado(await recebimentosApi.conexoes());
      } catch {
        setEstado({ configurado: false, disponiveis: [], conexao: null });
      }
    })();
  }, [gateway, showToast]);

  const voltar = (
    <Link href="/dashboard/configuracoes" className="inline-flex min-h-11 items-center gap-1 text-[14px] font-semibold text-brand-text">
      <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Voltar para Ajustes
    </Link>
  );

  if (!gateway) {
    return <div className="space-y-3">{voltar}<Banner tone="warning" variant="inline">Gateway não encontrado.</Banner></div>;
  }
  if (gateway.situacao !== 'disponivel') {
    return <div className="space-y-3">{voltar}<Banner tone="info" variant="inline">{gateway.nome} estará disponível em breve.</Banner></div>;
  }
  if (estado === null) return <Skeleton className="h-48 w-full" label="Carregando recebimentos..." />;
  if (!estado.configurado) {
    return (
      <div className="space-y-3">
        {voltar}
        <Banner tone="warning" variant="inline">A integração com o Mercado Pago não está disponível no momento.</Banner>
      </div>
    );
  }

  const c = estado.conexao;
  if (c && c.gateway !== 'mercadopago') {
    return (
      <div className="space-y-3">
        {voltar}
        <Banner tone="warning" variant="inline" className="flex-col items-start">
          Você já recebe pela InfinitePay. Desconecte por lá antes de conectar o Mercado Pago.
          <Link href="/dashboard/configuracoes/recebimentos/infinitepay" className={linkExterno}>Ir para a InfinitePay</Link>
        </Banner>
      </div>
    );
  }

  const conectar = async () => {
    setIndo(true);
    try {
      const { url } = await recebimentosApi.conectar();
      window.location.assign(url);
    } catch (e) {
      setIndo(false);
      showToast(getApiErrorMessage(e, 'Não foi possível abrir o Mercado Pago.'), 'error');
    }
  };

  const salvarFormas = async (aceitaPix: boolean, aceitaCartao: boolean, aceiteCartao?: boolean) => {
    setSalvando(true);
    setErroFormas(null);
    try {
      await recebimentosApi.definirFormas({ aceitaPix, aceitaCartao, ...(aceiteCartao ? { aceiteCartao } : {}) });
      setEstado(await recebimentosApi.conexoes());
      setPedindoCartao(false);
      setAceite(false);
    } catch (e) {
      showToast(getApiErrorMessage(e, 'Não foi possível salvar.'), 'error');
    } finally {
      setSalvando(false);
    }
  };

  const mudarPix = (ligado: boolean) => {
    if (!c) return;
    if (!ligado && !c.aceitaCartao) {
      setErroFormas('Deixe ao menos uma forma de receber ligada.');
      return;
    }
    void salvarFormas(ligado, c.aceitaCartao);
  };

  const mudarCartao = (ligado: boolean) => {
    if (!c) return;
    if (!ligado) {
      if (!c.aceitaPix) {
        setErroFormas('Deixe ao menos uma forma de receber ligada.');
        return;
      }
      void salvarFormas(c.aceitaPix, false);
      return;
    }
    setErroFormas(null);
    // Quem já deu o aceite não precisa dar de novo.
    if (c.aceiteCartaoEm) void salvarFormas(c.aceitaPix, true);
    else setPedindoCartao(true);
  };

  const desconectar = async () => {
    setDesconectando(true);
    try {
      await recebimentosApi.desconectar('mercadopago');
      setEstado(await recebimentosApi.conexoes());
      showToast('Mercado Pago desconectado.', 'success');
      setConfirmando(false);
    } catch (e) {
      showToast(getApiErrorMessage(e, 'Não foi possível desconectar.'), 'error');
    } finally {
      setDesconectando(false);
    }
  };

  return (
    <div className="space-y-4">
      {voltar}
      <Card className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <GatewayLogo nome={gateway.nome} logo={gateway.logo} />
          <h1 className="text-lg font-bold text-ink">Receber o sinal pelo {gateway.nome}</h1>
        </div>

        {!c ? (
          <>
            <ol className="space-y-4">
              {gateway.passos.map((p, i) => (
                <li key={p.titulo} className="flex gap-3">
                  <span aria-hidden="true" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand text-[13px] font-bold text-on-brand">
                    {i + 1}
                  </span>
                  <div className="min-w-0">
                    <h2 className="text-[15px] font-semibold text-ink">{p.titulo}</h2>
                    <p className="mt-0.5 text-[14px] text-muted">{p.texto}</p>
                    {p.links ? (
                      <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[14px]">
                        {p.links.map((l) => (
                          <a key={l.rotulo} href={l.url} target="_blank" rel="noopener noreferrer" className={linkExterno}>
                            {l.rotulo} <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                          </a>
                        ))}
                      </p>
                    ) : null}
                  </div>
                </li>
              ))}
            </ol>

            <Banner tone="info" variant="inline" className="flex-col items-start">
              <ul className="list-disc space-y-1 pl-4">
                {gateway.avisos.map((a) => <li key={a}>{a}</li>)}
              </ul>
              <a href={URL_TAXAS_MERCADO_PAGO} target="_blank" rel="noopener noreferrer" className={linkExterno}>
                Ver a tabela de taxas do Mercado Pago <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              </a>
            </Banner>

            <Button onClick={conectar} loading={indo}>Conectar com o Mercado Pago</Button>
          </>
        ) : (
          <div className="space-y-4">
            <div className="rounded-control bg-surface-2 px-3 py-2 text-[14px]">
              <p className="font-semibold text-ink break-words">{c.contaNome || 'Conta conectada'}</p>
              <p className="text-muted">
                {c.ultimaConfirmacaoEm
                  ? `Última confirmação automática: ${quando(c.ultimaConfirmacaoEm)}`
                  : 'Nenhum sinal confirmado automaticamente ainda.'}
              </p>
            </div>

            {c.situacao === 'precisa_reconectar' ? (
              <Banner tone="warning" variant="inline">
                A autorização do Mercado Pago venceu ou foi retirada. Os novos sinais não estão sendo confirmados sozinhos.{' '}
                <Button size="sm" variant="secondary" onClick={conectar} loading={indo}>Reconectar</Button>
              </Banner>
            ) : (
              <p className="text-[14px] text-muted">Os novos sinais serão confirmados sozinhos.</p>
            )}

            <div className="space-y-2">
              <h2 className="text-[15px] font-semibold text-ink">O que o cliente pode usar</h2>
              <Switch label="Pix" checked={c.aceitaPix} onCheckedChange={mudarPix} disabled={salvando} />
              <Switch
                label="Cartão"
                description="Só à vista. As taxas saem do valor do sinal e o dinheiro pode demorar mais para ficar disponível."
                checked={c.aceitaCartao}
                onCheckedChange={mudarCartao}
                disabled={salvando}
              />
              {erroFormas ? <Banner tone="danger" variant="inline">{erroFormas}</Banner> : null}
              {pedindoCartao ? (
                <div className="space-y-3 rounded-control border border-warning/30 bg-warning/12 p-3">
                  <p className="text-[14px] text-ink">{AVISO_CONTESTACAO}</p>
                  <label className="flex min-h-11 items-start gap-2 text-[14px] text-ink">
                    <input
                      type="checkbox"
                      checked={aceite}
                      onChange={(e) => setAceite(e.target.checked)}
                      className="mt-1 h-4 w-4 shrink-0"
                    />
                    <span>Entendi que o cliente pode contestar a compra no cartão e o valor pode voltar para ele.</span>
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" disabled={!aceite} loading={salvando} onClick={() => salvarFormas(c.aceitaPix, true, true)}>
                      Ligar cartão
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => { setPedindoCartao(false); setAceite(false); }}>Cancelar</Button>
                  </div>
                </div>
              ) : null}
            </div>

            <Button variant="ghost" onClick={() => setConfirmando(true)}>Desconectar</Button>
          </div>
        )}
      </Card>

      <Modal
        isOpen={confirmando}
        onClose={() => setConfirmando(false)}
        title="Desconectar o Mercado Pago?"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmando(false)} disabled={desconectando}>Cancelar</Button>
            <Button variant="danger" onClick={desconectar} loading={desconectando}>Sim, desconectar</Button>
          </>
        }
      >
        <div className="space-y-2 text-[15px] text-ink">
          <p>
            {c && c.reservasPendentes > 0
              ? `Você tem ${c.reservasPendentes} ${c.reservasPendentes === 1 ? 'reserva pendente' : 'reservas pendentes'}. Elas ficam na aba Aguardando Pix, para você confirmar manualmente.`
              : 'Você não tem reservas pendentes.'}
          </p>
          <p className="text-muted">Os novos agendamentos voltam a usar a chave Pix de &quot;Minha página&quot;, com confirmação manual.</p>
        </div>
      </Modal>
    </div>
  );
}
