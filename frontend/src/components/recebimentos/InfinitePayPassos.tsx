'use client';

import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { ArrowLeft, ExternalLink } from 'lucide-react';
import { Banner, Button, Card, Input, Modal, Skeleton } from '@/components/ui';
import { useToast } from '@/components/Toast';
import { recebimentosApi, type EstadoRecebimentos } from '@/lib/recebimentos';
import { getApiErrorMessage } from '@/utils/handleApiError';
import { GATEWAYS, URL_TAXAS_INFINITEPAY } from './catalogo';
import { GatewayLogo } from './GatewayLogo';

// Tela de passos para conectar a InfinitePay: o profissional cola a InfiniteTag e uma chave de API.

const quando = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

const linkExterno = 'inline-flex items-center gap-1 font-semibold text-brand-text underline underline-offset-2';
const rotulo = 'block text-[14px] font-semibold text-ink';

export function InfinitePayPassos() {
  const { showToast } = useToast();
  const gateway = GATEWAYS.find((g) => g.id === 'infinitepay')!;
  const [estado, setEstado] = useState<EstadoRecebimentos | null>(null);
  const [handle, setHandle] = useState('');
  const [chave, setChave] = useState('');
  const [aceite, setAceite] = useState(false);
  const [conectando, setConectando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  const [desconectando, setDesconectando] = useState(false);

  useEffect(() => {
    let ativo = true;
    recebimentosApi.conexoes()
      .then((e) => { if (ativo) setEstado(e); })
      .catch(() => { if (ativo) setEstado({ configurado: false, disponiveis: [], conexao: null }); });
    return () => { ativo = false; };
  }, []);

  const voltar = (
    <Link href="/dashboard/configuracoes" className="inline-flex min-h-11 items-center gap-1 text-[14px] font-semibold text-brand-text">
      <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Voltar para Ajustes
    </Link>
  );

  if (estado === null) return <Skeleton className="h-48 w-full" label="Carregando recebimentos..." />;
  const c = estado.conexao;
  if (c && c.gateway !== 'infinitepay') {
    return (
      <div className="space-y-3">
        {voltar}
        <Banner tone="warning" variant="inline" className="flex-col items-start">
          Você já recebe pelo Mercado Pago. Desconecte por lá antes de conectar a InfinitePay.
          <Link href="/dashboard/configuracoes/recebimentos/mercadopago" className={linkExterno}>Ir para o Mercado Pago</Link>
        </Banner>
      </div>
    );
  }
  if (!estado.configurado || (!c && !estado.disponiveis.includes('infinitepay'))) {
    return (
      <div className="space-y-3">
        {voltar}
        <Banner tone="warning" variant="inline">A integração com a InfinitePay não está disponível no momento.</Banner>
      </div>
    );
  }

  const conectar = async (e: FormEvent) => {
    e.preventDefault();
    setConectando(true);
    setErro(null);
    try {
      const novo = await recebimentosApi.conectarChave({ handle: handle.trim(), chave: chave.trim(), aceite: true });
      setEstado(novo);
      setChave('');
      setHandle('');
      setAceite(false);
      showToast('InfinitePay conectada.', 'success');
    } catch (err) {
      setErro(getApiErrorMessage(err, 'Não foi possível conectar a InfinitePay. Tente de novo.'));
    } finally {
      setConectando(false);
    }
  };

  const desconectar = async () => {
    setDesconectando(true);
    try {
      await recebimentosApi.desconectar('infinitepay');
      setEstado(await recebimentosApi.conexoes());
      showToast('InfinitePay desconectada.', 'success');
      setConfirmando(false);
    } catch (err) {
      showToast(getApiErrorMessage(err, 'Não foi possível desconectar.'), 'error');
    } finally {
      setDesconectando(false);
    }
  };

  const formulario = (
    <form onSubmit={conectar} className="space-y-3">
      <div className="space-y-1">
        <label htmlFor="infinitepay-handle" className={rotulo}>InfiniteTag</label>
        <Input
          id="infinitepay-handle"
          value={handle}
          onChange={(e) => setHandle(e.target.value)}
          placeholder="$sua-infinitetag"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
        />
      </div>
      <div className="space-y-1">
        <label htmlFor="infinitepay-chave" className={rotulo}>Chave de API</label>
        <Input
          id="infinitepay-chave"
          type="password"
          value={chave}
          onChange={(e) => setChave(e.target.value)}
          autoComplete="off"
          spellCheck={false}
        />
      </div>
      <label className="flex min-h-11 items-start gap-2 text-[14px] text-ink">
        <input type="checkbox" checked={aceite} onChange={(e) => setAceite(e.target.checked)} className="mt-1 h-4 w-4 shrink-0" />
        <span>Li os avisos acima e entendo as taxas, o parcelamento e que o cliente pode contestar a compra no cartão.</span>
      </label>
      {erro ? <Banner tone="danger" variant="inline">{erro}</Banner> : null}
      <Button type="submit" disabled={!aceite || !handle.trim() || !chave.trim()} loading={conectando}>Conectar</Button>
    </form>
  );

  return (
    <div className="space-y-4">
      {voltar}
      <Card className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <GatewayLogo nome={gateway.nome} logo={gateway.logo} />
          <h1 className="text-lg font-bold text-ink">Receber o sinal pela {gateway.nome}</h1>
        </div>

        {!c || c.situacao === 'precisa_reconectar' ? (
          <>
            {c ? (
              <>
                <div className="rounded-control bg-surface-2 px-3 py-2 text-[14px]">
                  <p className="font-semibold text-ink break-words">{c.contaNome || 'Conta conectada'}</p>
                </div>
                <Banner tone="warning" variant="inline">
                  A InfinitePay recusou a chave ou ela foi desativada. Os novos sinais não estão sendo confirmados sozinhos. Cole uma chave nova para reconectar.
                </Banner>
              </>
            ) : (
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
            )}

            <Banner tone="info" variant="inline" className="flex-col items-start">
              <ul className="list-disc space-y-1 pl-4">
                {gateway.avisos.map((a) => <li key={a}>{a}</li>)}
              </ul>
              <a href={URL_TAXAS_INFINITEPAY} target="_blank" rel="noopener noreferrer" className={linkExterno}>
                Ver a tabela de taxas da InfinitePay <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              </a>
            </Banner>

            {formulario}
            {c ? <Button variant="ghost" onClick={() => setConfirmando(true)}>Desconectar</Button> : null}
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
            <p className="text-[14px] text-muted">Os novos sinais serão confirmados sozinhos.</p>
            <Button variant="ghost" onClick={() => setConfirmando(true)}>Desconectar</Button>
          </div>
        )}
      </Card>

      <Modal
        isOpen={confirmando}
        onClose={() => setConfirmando(false)}
        title="Desconectar a InfinitePay?"
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
          <p className="text-muted">Os novos agendamentos voltam a usar a chave Pix do sinal, de Ajustes › Recebimentos, com confirmação manual.</p>
        </div>
      </Modal>
    </div>
  );
}
