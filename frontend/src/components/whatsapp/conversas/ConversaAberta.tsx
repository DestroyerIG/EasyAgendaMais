'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import Link from 'next/link';
import { Button, Icon } from '@/components/ui';
import { getInitials } from '@/components/ui/Avatar';
import { cn } from '@/lib/cn';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/Toast';
import { getApiErrorMessage } from '@/utils/handleApiError';
import {
  enviarMensagem,
  formatarTelefoneLocal,
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
  /** Painel recolhível do celular, logo abaixo do cabeçalho. */
  contextoMobile?: ReactNode;
}

const FUSO = 'America/Sao_Paulo';
const AUTOMATICAS: Origem[] = ['bot', 'lembrete', 'confirmacao', 'pix_recibo', 'lista_espera'];
const ROTULO_AUTOMATICO: Partial<Record<Origem, { rotulo: string; icone: string }>> = {
  bot: { rotulo: 'Bot EasyAgenda+', icone: 'smart_toy' },
  lembrete: { rotulo: 'Lembrete automático', icone: 'notifications_active' },
  confirmacao: { rotulo: 'Confirmação automática', icone: 'event_available' },
  pix_recibo: { rotulo: 'Sinal Pix e recibo', icone: 'payments' },
  lista_espera: { rotulo: 'Lista de espera', icone: 'hourglass_top' },
  manual_celular: { rotulo: 'Você pelo celular', icone: 'smartphone' },
  sistema: { rotulo: 'Sistema', icone: 'info' },
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

function rotuloDeOrigem(m: MensagemDto, negocio: string): { rotulo: string; icone: string; classe: string } | null {
  if (m.origem === 'manual_painel') {
    const autor = m.autor ?? 'Equipe';
    return { rotulo: negocio ? `${autor} (${negocio})` : autor, icone: 'person', classe: 'text-brand-text' };
  }
  const auto = ROTULO_AUTOMATICO[m.origem];
  if (!auto) return null;
  return { ...auto, classe: m.origem === 'manual_celular' ? 'text-brand-text' : 'text-tertiary' };
}

/** Negócio (robô, automáticas, painel, celular) à esquerda; cliente à direita — como no Stitch. */
function Balao({ m, negocio }: { m: MensagemDto; negocio: string }) {
  const doNegocio = m.direcao === 'out';
  const situacao = doNegocio ? SITUACAO[m.status] : undefined;
  const automatica = AUTOMATICAS.includes(m.origem);
  const rotulo = doNegocio ? rotuloDeOrigem(m, negocio) : null;
  return (
    <div
      data-lado={doNegocio ? 'negocio' : 'cliente'}
      className={cn('flex max-w-[70%] flex-col gap-1', doNegocio ? 'self-start' : 'self-end')}
    >
      <div
        className={cn(
          'whitespace-pre-wrap break-words rounded-2xl p-4 text-[15px] leading-relaxed text-ink shadow-sm',
          doNegocio ? 'rounded-tl-sm bg-surface-m3-low' : 'rounded-tr-sm bg-surface-2',
        )}
      >
        {rotulo ? (
          <span className={cn('mb-1 flex items-center gap-1 text-[11px] font-bold', rotulo.classe)}>
            <Icon name={rotulo.icone} size={14} />
            {rotulo.rotulo}
          </span>
        ) : null}
        {m.texto ? <p>{m.texto}</p> : null}
        {m.tipoMidia ? (
          <p className="mt-1 flex items-center gap-1 text-[12px] text-muted">
            <Icon name="attach_file" size={14} />
            Abra no celular para ver
          </p>
        ) : null}
      </div>
      <p className={cn('flex items-center gap-1 font-mono text-[11px] text-muted', doNegocio ? 'self-start pl-2' : 'self-end pr-2')}>
        <span>{horaDaMensagem(new Date(m.criadaEm))}</span>
        {doNegocio && automatica ? <span>• Automático</span> : null}
        {situacao ? (
          <span role="img" aria-label={situacao.rotulo} title={situacao.rotulo} className={cn('inline-flex', situacao.classe)}>
            <Icon name={situacao.icone} size={14} />
          </span>
        ) : null}
      </p>
    </div>
  );
}

/** Botão do cabeçalho: quadrado de fundo claro, ícone e texto curto em até duas linhas. */
const BOTAO_CABECALHO = 'inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-surface px-3 py-1.5 text-left text-[12px] font-semibold leading-tight shadow-sm transition-colors hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-60';

export function ConversaAberta({
  conversa, conectado, podeResponder, motivoBloqueio, onAssumir, onDevolver, onEnviado, onVoltar, onCadastrarCliente, contextoMobile,
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
  const campoRef = useRef<HTMLTextAreaElement>(null);
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

  // O campo cresce com o texto até o limite (max-h) e depois rola.
  useLayoutEffect(() => {
    const campo = campoRef.current;
    if (!campo) return;
    campo.style.height = 'auto';
    campo.style.height = `${campo.scrollHeight}px`;
  }, [texto]);

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

  const telefone = formatarTelefoneLocal(conversa.telefone);
  const humano = conversa.atendimento === 'humano';
  const situacaoLinha = humano && conversa.responsavel
    ? `Em atendimento humano (${conversa.responsavel.nome})`
    : conversa.status === 'aguardando'
      ? 'Aguardando você'
      : humano ? 'Em atendimento humano' : 'Com o robô';
  // "Assumir" só quando a conversa ainda não está com quem está usando o painel.
  const comigo = humano && !!conversa.responsavel && conversa.responsavel.id === user?.id;
  const podeAssumir = podeResponder && !comigo;
  const podeDevolver = podeResponder && humano;

  const primeiroNome = conversa.nome?.trim().split(/\s+/)[0];
  const placeholder = primeiroNome ? `Escreva uma mensagem para ${primeiroNome}…` : 'Escreva uma mensagem…';

  const grupos: Array<{ chave: string; rotulo: string; itens: MensagemDto[] }> = [];
  const agora = new Date();
  for (const m of mensagens) {
    const chave = chaveDia(new Date(m.criadaEm));
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && ultimo.chave === chave) ultimo.itens.push(m);
    else grupos.push({ chave, rotulo: rotuloDoDia(m.criadaEm, agora), itens: [m] });
  }

  return (
    <section aria-label="Conversa aberta" className="flex h-full min-h-0 min-w-0 flex-col bg-surface">
      <header className="z-10 flex shrink-0 flex-wrap items-center justify-between gap-3 bg-surface-m3-low p-4 shadow-sm">
        <div className="flex min-w-[12rem] flex-1 items-center gap-3">
          {onVoltar ? (
            <button
              type="button"
              onClick={onVoltar}
              aria-label="Voltar para conversas"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface text-muted hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand lg:hidden"
            >
              <Icon name="arrow_back" />
            </button>
          ) : null}
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-2 text-[14px] font-bold text-muted">
            {conversa.nome ? getInitials(conversa.nome) : <Icon name="person" size={20} className="text-muted" />}
          </span>
          <div className="flex min-w-0 flex-col">
            <h2 className="line-clamp-2 break-words text-[17px] font-bold leading-6 text-ink">{conversa.nome ?? telefone}</h2>
            <p className="flex flex-wrap items-center gap-x-1.5 text-[11px]">
              <span className="font-mono text-muted">{telefone}</span>
              <span className="text-muted" aria-hidden="true">•</span>
              <span className="font-bold text-brand-text">{situacaoLinha}</span>
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {podeAssumir ? (
            <Button size="sm" loading={ocupado} onClick={() => void executar(onAssumir)}>Assumir</Button>
          ) : null}
          {podeDevolver ? (
            <button type="button" disabled={ocupado} onClick={() => void executar(onDevolver)} className={cn(BOTAO_CABECALHO, 'text-muted hover:text-ink')}>
              <Icon name="smart_toy" size={16} />
              <span className="max-w-[4.5rem]">Devolver ao Bot</span>
            </button>
          ) : null}
          {conversa.clientId ? (
            <Link href={`/clientes/${conversa.clientId}`} className={cn(BOTAO_CABECALHO, 'font-bold text-brand-text')}>
              <Icon name="contact_page" size={16} />
              <span className="max-w-[4.5rem]">Ver ficha CRM</span>
            </Link>
          ) : (
            <button type="button" onClick={onCadastrarCliente} className={cn(BOTAO_CABECALHO, 'font-bold text-brand-text')}>
              <Icon name="person_add" size={16} />
              <span className="max-w-[4.5rem]">Cadastrar cliente</span>
            </button>
          )}
        </div>
      </header>

      {contextoMobile}

      <div ref={corpoRef} className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto bg-surface p-4">
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
              <div key={g.chave} className="flex flex-col gap-4">
                <div className="my-1 flex justify-center">
                  <span className="rounded-full bg-surface-2 px-3 py-1 text-[11px] font-semibold text-muted">{g.rotulo}</span>
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

      <footer className="flex shrink-0 flex-col gap-2 border-t border-line/60 bg-surface p-4">
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
          <div className="flex min-h-11 flex-1 items-center rounded-xl bg-surface-m3-low px-4 py-2.5 focus-within:outline focus-within:outline-2 focus-within:outline-brand">
            <textarea
              ref={campoRef}
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={aoTeclar}
              disabled={bloqueado}
              rows={1}
              maxLength={4000}
              aria-label="Mensagem"
              placeholder={!conectado || podeResponder ? placeholder : motivoBloqueio}
              className="max-h-24 w-full resize-none bg-transparent text-[14px] text-ink placeholder:text-muted focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
            />
          </div>
          <button
            type="button"
            onClick={() => void enviar()}
            disabled={bloqueado || enviando || texto.trim() === ''}
            aria-label="Enviar mensagem"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-whatsapp text-surface shadow-md transition-colors hover:bg-whatsapp/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Icon name="send" />
          </button>
        </div>
      </footer>
    </section>
  );
}
