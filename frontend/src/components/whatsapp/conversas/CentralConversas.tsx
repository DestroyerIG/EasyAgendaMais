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
import { FilaConversas } from './FilaConversas';
import { ConversaAberta } from './ConversaAberta';
import { ContextoCliente } from './ContextoCliente';

interface CentralConversasProps {
  conectado: boolean;
}

const INTERVALO_MS = 15000;
const SEM_PERMISSAO = 'Esta conversa está com outra pessoa';

export function CentralConversas({ conectado }: CentralConversasProps) {
  const { user } = useAuth();
  const { showToast } = useToast();

  const [filtro, setFiltro] = useState<FiltroConversa>('todas');
  const [dados, setDados] = useState<ListaConversasDto | null>(null);
  const [erro, setErro] = useState(false);
  const [carregandoMais, setCarregandoMais] = useState(false);
  const [selecionada, setSelecionada] = useState<ConversaResumoDto | null>(null);
  const [contexto, setContexto] = useState<ContextoClienteDto | null>(null);
  const [numero, setNumero] = useState<string | null>(null);

  const filtroRef = useRef(filtro);
  filtroRef.current = filtro;
  const selecionadaIdRef = useRef<string | null>(null);
  selecionadaIdRef.current = selecionada?.id ?? null;

  const carregar = useCallback(async (f: FiltroConversa) => {
    try {
      const lista = await listarConversas(f);
      if (filtroRef.current !== f) return;
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
    setSelecionada(c);
    setContexto(null);
    buscarConversa(c.id)
      .then((d) => { if (selecionadaIdRef.current === c.id) setContexto(d.contexto); })
      .catch(() => { /* a coluna de contexto é opcional */ });
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

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-12">
        <div className={`${selecionada ? 'hidden lg:block' : ''} lg:col-span-4`}>
          <FilaConversas
            filtro={filtro}
            onFiltro={setFiltro}
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

        <div className={`${selecionada ? '' : 'hidden lg:block'} lg:col-span-5`}>
          {selecionada ? (
            <ConversaAberta
              conversa={selecionada}
              conectado={conectado}
              podeResponder={podeResponder}
              motivoBloqueio={SEM_PERMISSAO}
              onAssumir={assumir}
              onDevolver={devolver}
              onEnviado={() => void carregar(filtroRef.current)}
              onVoltar={() => setSelecionada(null)}
            />
          ) : (
            <div className="flex min-h-72 flex-col items-center justify-center gap-2 rounded-xl bg-surface p-6 text-center shadow-sm">
              <Icon name="forum" size={32} className="text-muted" />
              <p className="text-[14px] text-muted">Escolha uma conversa para ver as mensagens.</p>
            </div>
          )}
        </div>

        <div className="hidden lg:col-span-3 lg:block">
          {selecionada ? <ContextoCliente contexto={contexto} conversa={selecionada} /> : null}
        </div>
      </div>
    </div>
  );
}
