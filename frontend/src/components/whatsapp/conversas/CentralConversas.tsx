'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/ui';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/Toast';
import { getApiErrorMessage } from '@/utils/handleApiError';
import {
  assumirConversa,
  buscarConversa,
  buscarResumoConexao,
  devolverConversa,
  formatarTelefone,
  listarConversas,
  marcarLidas,
  type ContextoClienteDto,
  type ConversaResumoDto,
  type FiltroConversa,
  type ListaConversasDto,
} from '@/lib/whatsappInbox';
import { FilaConversas, FiltrosConversa } from './FilaConversas';
import { ConversaAberta } from './ConversaAberta';
import { CadastroRapidoCliente, ContextoCliente } from './ContextoCliente';

interface CentralConversasProps {
  conectado: boolean;
}

const INTERVALO_MS = 15000;
const MEDIA_COMPUTADOR = '(min-width: 1024px)';

/** Largura de computador (lg)? Lido só depois da montagem; no celular a conversa aberta ocupa a tela. */
function useLarguraDeComputador(): boolean {
  const [computador, setComputador] = useState(false);
  useEffect(() => {
    const consulta = window.matchMedia(MEDIA_COMPUTADOR);
    const aplicar = () => setComputador(consulta.matches);
    aplicar();
    consulta.addEventListener?.('change', aplicar);
    return () => consulta.removeEventListener?.('change', aplicar);
  }, []);
  return computador;
}
const SEM_PERMISSAO = 'Esta conversa está com outra pessoa';

export function CentralConversas({ conectado }: CentralConversasProps) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const computador = useLarguraDeComputador();

  const [filtro, setFiltro] = useState<FiltroConversa>('todas');
  const [dados, setDados] = useState<ListaConversasDto | null>(null);
  const [erro, setErro] = useState(false);
  const [carregandoMais, setCarregandoMais] = useState(false);
  const [selecionada, setSelecionada] = useState<ConversaResumoDto | null>(null);
  const [contexto, setContexto] = useState<ContextoClienteDto | null>(null);
  const [numero, setNumero] = useState<string | null>(null);
  const [cadastrando, setCadastrando] = useState(false);
  const [contextoAberto, setContextoAberto] = useState(false);

  const filtroRef = useRef(filtro);
  filtroRef.current = filtro;
  const selecionadaIdRef = useRef<string | null>(null);
  selecionadaIdRef.current = selecionada?.id ?? null;

  const carregar = useCallback(async (f: FiltroConversa) => {
    try {
      let lista = await listarConversas(f);
      if (filtroRef.current !== f) return;
      // Mensagem nova na conversa aberta e visível: já conta como lida.
      const abertaId = selecionadaIdRef.current;
      if (abertaId && document.visibilityState === 'visible' && lista.itens.some((c) => c.id === abertaId && c.naoLidas > 0)) {
        marcarLidas([abertaId]).catch(() => { /* silencioso */ });
        lista = { ...lista, itens: lista.itens.map((c) => (c.id === abertaId ? { ...c, naoLidas: 0 } : c)) };
      }
      setDados(lista);
      setErro(false);
      // A conversa aberta acompanha o que a fila trouxe (nome, responsável, última mensagem).
      setSelecionada((atual) => (atual ? lista.itens.find((c) => c.id === atual.id) ?? atual : atual));
    } catch {
      if (filtroRef.current === f) setErro(true);
    }
  }, []);

  // Ao montar e ao trocar o filtro.
  useEffect(() => {
    setDados(null);
    setErro(false);
    void carregar(filtro);
  }, [filtro, carregar]);

  // A cada 15 s, só com a aba visível; volta a atualizar ao retomar.
  useEffect(() => {
    const atualizarSeVisivel = () => {
      if (document.visibilityState === 'visible') void carregar(filtroRef.current);
    };
    const timer = setInterval(atualizarSeVisivel, INTERVALO_MS);
    document.addEventListener('visibilitychange', atualizarSeVisivel);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', atualizarSeVisivel);
    };
  }, [carregar]);

  useEffect(() => {
    if (!conectado) { setNumero(null); return; }
    let ativo = true;
    buscarResumoConexao().then((r) => { if (ativo) setNumero(r.numero); }).catch(() => { if (ativo) setNumero(null); });
    return () => { ativo = false; };
  }, [conectado]);

  const selecionar = (c: ConversaResumoDto) => {
    if (c.naoLidas > 0) {
      marcarLidas([c.id]).catch(() => { /* silencioso: não bloqueia a conversa */ });
      c = { ...c, naoLidas: 0 };
      setDados((atual) => (atual ? { ...atual, itens: atual.itens.map((i) => (i.id === c.id ? c : i)) } : atual));
    }
    setSelecionada(c);
    setContexto(null);
    setContextoAberto(false);
    void carregarContexto(c.id);
  };

  // O detalhe da conversa vincula a cliente recém-cadastrada pelo telefone; recarregar traz o vínculo.
  const carregarContexto = async (id: string) => {
    try {
      const d = await buscarConversa(id);
      if (selecionadaIdRef.current !== id) return;
      setContexto(d.contexto);
      setSelecionada((atual) => (atual && atual.id === id ? { ...atual, clientId: d.conversa.clientId, nome: d.conversa.nome, sinalPendente: d.conversa.sinalPendente } : atual));
    } catch {
      /* a coluna de contexto é opcional */
    }
  };

  const atualizarContexto = () => {
    if (!selecionada) return;
    void carregarContexto(selecionada.id);
    void carregar(filtroRef.current);
  };

  const carregarMais = async () => {
    const cursor = dados?.proximoCursor;
    if (!cursor) return;
    setCarregandoMais(true);
    try {
      const mais = await listarConversas(filtro, cursor);
      setDados((atual) => (atual
        ? { ...mais, itens: [...atual.itens, ...mais.itens.filter((n) => !atual.itens.some((c) => c.id === n.id))] }
        : mais));
    } catch (e) {
      showToast(getApiErrorMessage(e, 'Não foi possível carregar mais conversas.'), 'error');
    } finally {
      setCarregandoMais(false);
    }
  };

  const aoMarcarLidas = async () => {
    try {
      await marcarLidas();
      await carregar(filtro);
    } catch (e) {
      showToast(getApiErrorMessage(e, 'Não foi possível marcar as conversas como lidas.'), 'error');
    }
  };

  const aplicar = (c: ConversaResumoDto) => {
    setSelecionada(c);
    setDados((atual) => (atual ? { ...atual, itens: atual.itens.map((i) => (i.id === c.id ? c : i)) } : atual));
    void carregar(filtroRef.current);
  };

  const assumir = async () => {
    if (!selecionada) return;
    try {
      aplicar(await assumirConversa(selecionada.id));
    } catch (e) {
      showToast(getApiErrorMessage(e, 'Não foi possível assumir a conversa.'), 'error');
    }
  };

  const devolver = async () => {
    if (!selecionada) return;
    try {
      aplicar(await devolverConversa(selecionada.id));
    } catch (e) {
      showToast(getApiErrorMessage(e, 'Não foi possível devolver a conversa ao Bot.'), 'error');
    }
  };

  // Regra do backend replicada só para a tela: funcionária mexe na conversa dela ou na que está livre.
  // Sem o id do usuário (sessão antiga) não bloqueamos; o servidor continua sendo a fonte da verdade.
  const podeResponder = (() => {
    if (!selecionada || user?.role !== 'employee' || !user.id) return true;
    if (selecionada.responsavel) return selecionada.responsavel.id === user.id;
    return selecionada.status === 'aguardando' || selecionada.atendimento === 'bot';
  })();

  return (
    <div className="flex flex-col gap-4">
      {/* No celular, com conversa aberta, o cabeçalho da aba some: a conversa ocupa a tela. */}
      {selecionada && !computador ? null : (
        <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-end">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-muted">
              <span className="h-2.5 w-2.5 rounded-full bg-whatsapp" aria-hidden="true" />
              <span>Inbox operacional</span>
              {conectado && numero ? (
                <span className="normal-case tracking-normal text-ink">{`Instância: ${formatarTelefone(numero)}`}</span>
              ) : null}
            </div>
            <div className="flex items-baseline gap-2">
              <h2 className="text-[22px] font-bold tracking-tight text-ink">Conversas do WhatsApp</h2>
              {dados ? (
                <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[12px] font-bold text-muted">{`${dados.contadores.todas} abertas`}</span>
              ) : null}
            </div>
          </div>
          <div className="flex min-w-0 items-center gap-2">
            <FiltrosConversa filtro={filtro} onFiltro={setFiltro} contadores={dados?.contadores} />
            <button
              type="button"
              aria-label="Atualizar conversas"
              title="Atualizar conversas"
              onClick={() => void carregar(filtroRef.current)}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface text-muted shadow-sm hover:bg-surface-2 hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand"
            >
              <Icon name="sync" size={20} />
            </button>
          </div>
        </div>
      )}

      {/* Desktop: cartão da fila + cartão único (conversa e contexto), na altura da área visível. */}
      <div className="flex flex-col gap-4 lg:h-[calc(100vh-15rem)] lg:min-h-[32rem] lg:flex-row">
        <div className={`${selecionada ? 'hidden lg:block' : ''} min-h-0 lg:w-[300px] lg:shrink-0 2xl:w-[320px]`}>
          <FilaConversas
            filtro={filtro}
            dados={dados}
            erro={erro}
            selecionadaId={selecionada?.id ?? null}
            onSelecionar={selecionar}
            onMarcarLidas={() => void aoMarcarLidas()}
            onCarregarMais={() => void carregarMais()}
            carregandoMais={carregandoMais}
            onTentarNovamente={() => { setErro(false); void carregar(filtro); }}
          />
        </div>

        <div
          className={`${selecionada ? 'flex h-[calc(100dvh-14rem)] min-h-[24rem]' : 'hidden'} min-w-0 overflow-hidden rounded-xl bg-surface shadow-sm lg:flex lg:h-auto lg:min-h-0 lg:flex-1`}
        >
          {selecionada ? (
            <>
              <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                <ConversaAberta
                  conversa={selecionada}
                  conectado={conectado}
                  podeResponder={podeResponder}
                  motivoBloqueio={SEM_PERMISSAO}
                  onAssumir={assumir}
                  onDevolver={devolver}
                  onEnviado={() => void carregar(filtroRef.current)}
                  onVoltar={() => setSelecionada(null)}
                  onCadastrarCliente={() => setCadastrando(true)}
                  contextoMobile={(
                    <div className="flex max-h-[50%] shrink-0 flex-col gap-2 overflow-y-auto border-b border-line p-3 xl:hidden">
                      <button
                        type="button"
                        onClick={() => setContextoAberto((v) => !v)}
                        aria-expanded={contextoAberto}
                        className="flex items-center justify-between rounded-control bg-surface-m3-low px-3 py-2 text-[13px] font-bold text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand"
                      >
                        {contextoAberto ? 'Ocultar contexto' : 'Ver contexto da cliente'}
                        <Icon name={contextoAberto ? 'expand_less' : 'expand_more'} size={18} />
                      </button>
                      {contextoAberto ? (
                        <div className="overflow-hidden rounded-xl">
                          <ContextoCliente
                            contexto={contexto}
                            conversa={selecionada}
                            onAtualizar={atualizarContexto}
                            onCadastrarCliente={() => setCadastrando(true)}
                          />
                        </div>
                      ) : null}
                    </div>
                  )}
                />
              </div>
              <div className="hidden min-h-0 w-[240px] shrink-0 overflow-y-auto border-l border-line bg-surface-m3-low xl:block">
                <ContextoCliente
                  contexto={contexto}
                  conversa={selecionada}
                  onAtualizar={atualizarContexto}
                  onCadastrarCliente={() => setCadastrando(true)}
                />
              </div>
            </>
          ) : (
            <div className="flex min-h-72 flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
              <Icon name="forum" size={32} className="text-muted" />
              <p className="text-[14px] text-muted">Escolha uma conversa para ver as mensagens.</p>
            </div>
          )}
        </div>
      </div>

      {selecionada ? (
        <CadastroRapidoCliente
          aberto={cadastrando}
          telefone={selecionada.telefone}
          onFechar={() => setCadastrando(false)}
          onCadastrada={atualizarContexto}
        />
      ) : null}
    </div>
  );
}
