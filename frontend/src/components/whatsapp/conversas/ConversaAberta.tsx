'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import Link from 'next/link';
import { Button, Icon } from '@/components/ui';
import { getInitials } from '@/components/ui/Avatar';
import { cn } from '@/lib/cn';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/Toast';
import { getApiErrorMessage } from '@/utils/handleApiError';
import {
  enviarMensagem,
  formatarTelefone,
  listarMensagens,
  type ConversaResumoDto,
  type MensagemDto,
  type Origem,
  type StatusMensagem,
} from '@/lib/whatsappInbox';
import { RespostasRapidas } from './RespostasRapidas';

interface ConversaAbertaProps {
  conversa: ConversaResumoDto;
  conectado: boolean;
  podeResponder: boolean;
  motivoBloqueio: string;
  onAssumir: () => Promise<void> | void;
  onDevolver: () => Promise<void> | void;
  onEnviado: () => void;
  onVoltar?: () => void;
  onCadastrarCliente?: () => void;
}

const FUSO = 'America/Sao_Paulo';
const AUTOMATICAS: Origem[] = ['bot', 'lembrete', 'confirmacao', 'pix_recibo', 'lista_espera'];
const ROTULO_AUTOMATICO: Partial<Record<Origem, string>> = {
  bot: 'Bot EasyAgenda+',
  lembrete: 'Lembrete automático',
  confirmacao: 'Confirmação automática',
  pix_recibo: 'Sinal Pix e recibo',
  lista_espera: 'Lista de espera',
  manual_celular: 'Você pelo celular',
  sistema: 'Sistema',
};
const SITUACAO: Partial<Record<StatusMensagem, { icone: string; rotulo: string; classe: string }>> = {
  enviada: { icone: 'done', rotulo: 'Enviada', classe: 'text-muted' },
  entregue: { icone: 'done_all', rotulo: 'Entregue', classe: 'text-muted' },
  lida: { icone: 'done_all', rotulo: 'Lida', classe: 'text-whatsapp' },
  falhou: { icone: 'error', rotulo: 'Não enviada', classe: 'text-danger' },
};

const chaveDia = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
const diaPorExtenso = (d: Date) => new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, day: 'numeric', month: 'long' }).format(d);
const horaDaMensagem = (d: Date) => new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d);

function rotuloDoDia(iso: string, agora: Date): string {
  const data = new Date(iso);
  const chave = chaveDia(data);
  if (chave === chaveDia(agora)) return `Hoje • ${diaPorExtenso(data)}`;
  const [a, m, d] = chaveDia(agora).split('-').map(Number);
  if (chave === chaveDia(new Date(Date.UTC(a!, m! - 1, d! - 1, 12)))) return 'Ontem';
  return diaPorExtenso(data);
}

function rotuloDeOrigem(m: MensagemDto, negocio: string): string {
  if (m.origem === 'manual_painel') return `${m.autor ?? 'Equipe'} (${negocio})`;
  return ROTULO_AUTOMATICO[m.origem] ?? '';
}

function Balao({ m, negocio }: { m: MensagemDto; negocio: string }) {
  const saida = m.direcao === 'out';
  const situacao = saida ? SITUACAO[m.status] : undefined;
  const automatica = AUTOMATICAS.includes(m.origem);
  return (
    <div className={cn('flex flex-col gap-1', saida ? 'items-end' : 'items-start')}>
      {saida ? <span className="text-[11px] font-bold text-muted">{rotuloDeOrigem(m, negocio)}</span> : null}
      <div
        className={cn(
          'max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-[14px] text-ink shadow-sm',
          saida ? 'rounded-br-sm bg-brand/15' : 'rounded-bl-sm bg-surface',
        )}
      >
        {m.texto ? <p>{m.texto}</p> : null}
        {m.tipoMidia ? (
          <p className="mt-1 flex items-center gap-1 text-[12px] text-muted">
            <Icon name="attach_file" size={14} />
            Abra no celular para ver
          </p>
        ) : null}
        <p className="mt-1 flex items-center justify-end gap-1 text-[11px] text-muted">
          <span>{horaDaMensagem(new Date(m.criadaEm))}</span>
          {saida && automatica ? <span>• Automático</span> : null}
          {situacao ? (
            <span role="img" aria-label={situacao.rotulo} title={situacao.rotulo} className={cn('inline-flex', situacao.classe)}>
              <Icon name={situacao.icone} size={16} />
            </span>
          ) : null}
        </p>
      </div>
    </div>
  );
}

export function ConversaAberta({
  conversa, conectado, podeResponder, motivoBloqueio, onAssumir, onDevolver, onEnviado, onVoltar, onCadastrarCliente,
}: ConversaAbertaProps) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const negocio = user?.businessName ?? '';

  const [mensagens, setMensagens] = useState<MensagemDto[]>([]);
  const [temMais, setTemMais] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(false);
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [carregandoAntigas, setCarregandoAntigas] = useState(false);

  const corpoRef = useRef<HTMLDivElement>(null);
  const rolarRef = useRef(true);

  const conversaId = conversa.id;
  const ultimaEm = conversa.ultimaMensagemEm;

  // Recarrega a página mais recente, preservando mensagens antigas já carregadas.
  const recarregar = useCallback(async (id: string, trocou: boolean) => {
    try {
      const pagina = await listarMensagens(id);
      setMensagens((atual) => {
        if (trocou || atual.length === 0 || pagina.itens.length === 0) return pagina.itens;
        const primeira = pagina.itens[0]!.criadaEm;
        return [...atual.filter((m) => m.criadaEm < primeira && !pagina.itens.some((n) => n.id === m.id)), ...pagina.itens];
      });
      if (trocou) setTemMais(pagina.temMais);
      setErro(false);
    } catch {
      if (trocou) setErro(true);
    } finally {
      setCarregando(false);
    }
  }, []);

  const idAnterior = useRef<string | null>(null);
  useEffect(() => {
    const trocou = idAnterior.current !== conversaId;
    idAnterior.current = conversaId;
    if (trocou) {
      setMensagens([]);
      setCarregando(true);
      setTexto('');
      rolarRef.current = true;
    }
    void recarregar(conversaId, trocou);
  }, [conversaId, ultimaEm, recarregar]);

  useLayoutEffect(() => {
    const corpo = corpoRef.current;
    if (corpo && rolarRef.current && mensagens.length > 0) {
      corpo.scrollTop = corpo.scrollHeight;
      rolarRef.current = false;
    }
  }, [mensagens]);

  const carregarAnteriores = async () => {
    const primeira = mensagens[0];
    if (!primeira) return;
    setCarregandoAntigas(true);
    try {
      const pagina = await listarMensagens(conversaId, primeira.criadaEm);
      setMensagens((atual) => [...pagina.itens.filter((n) => !atual.some((m) => m.id === n.id)), ...atual]);
      setTemMais(pagina.temMais);
    } catch (e) {
      showToast(getApiErrorMessage(e, 'Não foi possível carregar as mensagens anteriores.'), 'error');
    } finally {
      setCarregandoAntigas(false);
    }
  };

  const bloqueado = !conectado || !podeResponder;

  const enviar = async () => {
    const conteudo = texto.trim();
    if (!conteudo || enviando || bloqueado) return;
    setEnviando(true);
    try {
      await enviarMensagem(conversaId, conteudo);
      setTexto('');
      rolarRef.current = true;
      await recarregar(conversaId, false);
      onEnviado();
    } catch (e) {
      showToast(getApiErrorMessage(e, 'Não foi possível enviar a mensagem.'), 'error');
    } finally {
      setEnviando(false);
    }
  };

  const aoTeclar = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void enviar();
    }
  };

  const executar = async (acao: () => Promise<void> | void) => {
    setOcupado(true);
    try { await acao(); } finally { setOcupado(false); }
  };

  const telefone = formatarTelefone(conversa.telefone);
  const humano = conversa.atendimento === 'humano';
  const situacaoLinha = humano && conversa.responsavel
    ? `Em atendimento humano (${conversa.responsavel.nome})`
    : conversa.status === 'aguardando'
      ? 'Aguardando você'
      : humano ? 'Em atendimento humano' : 'Com o robô';
  const podeAssumir = podeResponder && (conversa.atendimento === 'bot' || conversa.status === 'aguardando');
  const podeDevolver = podeResponder && humano;

  const grupos: Array<{ chave: string; rotulo: string; itens: MensagemDto[] }> = [];
  const agora = new Date();
  for (const m of mensagens) {
    const chave = chaveDia(new Date(m.criadaEm));
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && ultimo.chave === chave) ultimo.itens.push(m);
    else grupos.push({ chave, rotulo: rotuloDoDia(m.criadaEm, agora), itens: [m] });
  }

  return (
    <section aria-label="Conversa aberta" className="flex min-h-0 flex-col overflow-hidden rounded-xl bg-surface shadow-sm">
      <header className="flex flex-col gap-3 border-b border-line p-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          {onVoltar ? (
            <button
              type="button"
              onClick={onVoltar}
              aria-label="Voltar para conversas"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-muted hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand lg:hidden"
            >
              <Icon name="arrow_back" />
            </button>
          ) : null}
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-surface-2 text-[15px] font-bold text-brand-text">
            {conversa.nome ? getInitials(conversa.nome) : <Icon name="person" size={22} className="text-muted" />}
          </span>
          <div className="flex min-w-0 flex-col">
            <h2 className="truncate text-[16px] font-bold text-ink">{conversa.nome ?? telefone}</h2>
            <p className="truncate font-mono text-[12px] text-muted">{telefone}</p>
            <p className="flex items-center gap-1 text-[12px] font-bold text-brand-text">
              <Icon name={humano ? 'support_agent' : 'smart_toy'} size={14} />
              {situacaoLinha}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {podeAssumir ? (
            <Button size="sm" loading={ocupado} onClick={() => void executar(onAssumir)}>Assumir</Button>
          ) : null}
          {podeDevolver ? (
            <Button size="sm" variant="secondary" loading={ocupado} onClick={() => void executar(onDevolver)}>Devolver ao Bot</Button>
          ) : null}
          {conversa.clientId ? (
            <Link
              href={`/clientes/${conversa.clientId}`}
              className="inline-flex h-11 items-center gap-1 rounded-control border border-line bg-surface-2 px-3 text-[13px] font-bold text-ink hover:bg-line/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand lg:h-9"
            >
              <Icon name="person_search" size={16} />
              Ver ficha CRM
            </Link>
          ) : (
            <Button size="sm" variant="secondary" onClick={onCadastrarCliente}>Cadastrar cliente</Button>
          )}
        </div>
      </header>

      <div ref={corpoRef} className="flex min-h-72 flex-1 flex-col gap-3 overflow-y-auto bg-surface-2 p-4 lg:max-h-[calc(100vh-22rem)]">
        {carregando ? (
          <p className="py-10 text-center text-[13px] text-muted">Carregando mensagens…</p>
        ) : erro ? (
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <p className="text-[13px] text-muted">Não foi possível carregar as mensagens.</p>
            <Button size="sm" variant="secondary" onClick={() => { setCarregando(true); void recarregar(conversaId, true); }}>Tentar de novo</Button>
          </div>
        ) : (
          <>
            {temMais ? (
              <Button size="sm" variant="ghost" loading={carregandoAntigas} onClick={() => void carregarAnteriores()} className="self-center">
                Carregar mensagens anteriores
              </Button>
            ) : null}
            {grupos.map((g) => (
              <div key={g.chave} className="flex flex-col gap-3">
                <div className="flex justify-center">
                  <span className="rounded-full bg-surface px-3 py-0.5 text-[11px] font-bold text-muted">{g.rotulo}</span>
                </div>
                {g.itens.map((m) => (
                  m.origem === 'painel_evento' ? (
                    <p key={m.id} className="text-center text-[11px] text-muted">{m.texto}</p>
                  ) : (
                    <Balao key={m.id} m={m} negocio={negocio} />
                  )
                ))}
              </div>
            ))}
          </>
        )}
      </div>

      <footer className="flex flex-col gap-2 border-t border-line p-3">
        {!conectado ? (
          <p role="alert" className="flex items-center gap-2 rounded-control border border-warning/30 bg-warning/12 px-3 py-2 text-[13px] text-ink">
            <Icon name="link_off" size={16} className="text-warning-text" />
            <span>
              WhatsApp desconectado. Reconecte na aba{' '}
              <Link href="?aba=conexao" className="font-bold underline">Conexão</Link>.
            </span>
          </p>
        ) : null}
        <RespostasRapidas conversaId={conversaId} desabilitado={bloqueado} onInserir={(t) => setTexto((atual) => (atual ? `${atual}\n${t}` : t))} />
        <div className="flex items-end gap-2">
          <textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={aoTeclar}
            disabled={bloqueado}
            rows={2}
            maxLength={4000}
            aria-label="Mensagem"
            placeholder={!conectado ? 'Escreva uma mensagem…' : podeResponder ? 'Escreva uma mensagem…' : motivoBloqueio}
            className="min-h-11 flex-1 resize-none rounded-control border border-line bg-surface-2 px-3 py-2 text-[14px] text-ink placeholder:text-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-60"
          />
          <button
            type="button"
            onClick={() => void enviar()}
            disabled={bloqueado || enviando || texto.trim() === ''}
            aria-label="Enviar mensagem"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-whatsapp text-surface transition-colors hover:bg-whatsapp/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Icon name="send" />
          </button>
        </div>
      </footer>
    </section>
  );
}
