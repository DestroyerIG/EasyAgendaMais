'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Icon, Skeleton } from '@/components/ui';
import { useToast } from '@/components/Toast';
import { cn } from '@/lib/cn';
import { formatCurrency, formatNumber } from '@/lib/formatters';
import { formatarTelefone } from '@/lib/whatsappInbox';
import { getApiErrorMessage } from '@/utils/handleApiError';
import {
  atualizarRegra, listarRegras, painel as buscarPainel,
  type ConfigRegras, type PainelAutomacoesDto, type Regra, type RegraDto,
} from '@/lib/whatsappAutomacoes';
import { CartaoRegra } from './CartaoRegra';
import { CartoesResultado } from './CartoesResultado';

interface AutomacoesProps {
  conectado: boolean;
  onAbrirConexao: () => void;
}

type PorRegra = PainelAutomacoesDto['porRegra'];

interface ConteudoRegra<R extends Regra> {
  titulo: string;
  descricao: string;
  icone: string;
  quando(config: ConfigRegras[R]): string;
  numero(r: PorRegra[R]): string;
}

const plural = (n: number, um: string, varios: string) => `${formatNumber(n)} ${n === 1 ? um : varios}`;
const reais = (v: number) => formatCurrency(v, { cents: false });

// Título, descrição e ícone copiados do Stitch; rodapé e número montados dos dados.
const CONTEUDO: { [R in Regra]: ConteudoRegra<R> } = {
  confirmacao: {
    titulo: 'Confirmação 24h antes',
    descricao: 'Pergunta se a cliente confirma o comparecimento. Se responder "Não", o horário é liberado imediatamente para a lista de espera.',
    icone: 'schedule',
    quando: (c) => `24h antes · ${c.hora}`,
    numero: (r) => `${plural(r.faltasEvitadas, 'falta evitada', 'faltas evitadas')} este mês`,
  },
  sinal_pix: {
    titulo: 'Cobrança de sinal Pix',
    descricao: 'Envia a chave Copia e Cola Pix e QR code assim que a cliente solicita vaga. Reserva temporária com contagem regressiva rigorosa.',
    icone: 'timer',
    quando: (c) => `Tolerância de ${c.toleranciaMin} min`,
    numero: (r) => `${reais(r.recebido)} recebidos em sinais`,
  },
  retorno: {
    titulo: 'Radar de Retorno',
    descricao: 'Detecta quando o ciclo médio do serviço está vencendo e convida a cliente para agendar antes que procure outro lugar.',
    icone: 'cached',
    quando: (c) => (c.modo === 'dias' ? `Aos ${c.dias} dias (personalizado)` : 'No ciclo da cliente'),
    numero: (r) => `${reais(r.recuperado)} recuperados`,
  },
  lista_espera: {
    titulo: 'Lista de espera automática',
    descricao: 'Ao surgir cancelamento, dispara para as 3 primeiras clientes compatíveis na fila de espera por estrita ordem de solicitação.',
    icone: 'group_add',
    quando: (c) => (c.quantas === 1 ? 'Disparo para a primeira' : `Disparo para as ${c.quantas} primeiras`),
    numero: (r) => plural(r.vagasPreenchidas, 'vaga preenchida', 'vagas preenchidas'),
  },
  lembrete: {
    titulo: 'Lembrete na véspera',
    descricao: 'Dispara às 18:00 do dia anterior com endereço completo, link do GPS e recomendações prévias para o procedimento.',
    icone: 'pin_drop',
    quando: (c) => (c.modo === 'vespera' ? `Véspera às ${c.hora}` : '2 horas antes'),
    numero: (r) => {
      const total = plural(r.enviados, 'lembrete', 'lembretes');
      return r.lidosPct === null ? total : `${total} (${r.lidosPct}% lidos)`;
    },
  },
  aniversario: {
    titulo: 'Aniversário da cliente',
    descricao: 'Envia felicitações às 08:00 com cupom de R$ 20 ou mimo de hidratação para agendamentos realizados na semana festiva.',
    icone: 'cake',
    quando: () => 'Dia do aniversário às 08:00',
    numero: (r) => `${plural(r.aniversariantes, 'aniversariante', 'aniversariantes')} · ${plural(r.agendamentos, 'agendamento', 'agendamentos')}`,
  },
  avaliacao: {
    titulo: 'Pedido de avaliação',
    descricao: 'Disparado 2 horas após a comanda ser finalizada no balcão, solicitando nota de 1 a 5 e direcionando 5 estrelas ao Google Meu Negócio.',
    icone: 'star',
    quando: (c) => `${c.horas}h após o checkout`,
    numero: (r) => {
      const novas = plural(r.novas, 'nova avaliação', 'novas avaliações');
      if (r.notaMedia === null) return novas;
      const nota = r.notaMedia.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
      return `Nota média ${nota} · ${novas}`;
    },
  },
};

function conteudoDe(regra: RegraDto, porRegra: PorRegra | null) {
  // O par (regra, config) chega casado do servidor; a união não deixa o TS provar isso aqui.
  const c = CONTEUDO[regra.regra] as unknown as ConteudoRegra<Regra> & {
    quando(config: unknown): string; numero(r: unknown): string;
  };
  return {
    titulo: c.titulo,
    descricao: c.descricao,
    icone: c.icone,
    quando: c.quando(regra.config),
    numero: porRegra ? c.numero(porRegra[regra.regra]) : '—',
  };
}

// Os modais (Configurar, Histórico, Nova automação, Testar) chegam na Tarefa 10.
const semModal = () => {};

const botaoSecundario =
  'inline-flex items-center justify-center gap-1 rounded-lg border border-line bg-surface px-4 py-2 text-[13px] font-bold leading-[18px] text-ink shadow-sm transition-colors hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand';

export function Automacoes({ conectado, onAbrirConexao }: AutomacoesProps) {
  const { showToast } = useToast();
  const showToastRef = useRef(showToast);
  showToastRef.current = showToast;
  const [regras, setRegras] = useState<RegraDto[] | null>(null);
  const [erroRegras, setErroRegras] = useState(false);
  const [painel, setPainel] = useState<PainelAutomacoesDto | null>(null);
  const pendentes = useRef(new Set<Regra>());

  const carregarRegras = useCallback(async () => {
    setErroRegras(false);
    try {
      setRegras(await listarRegras());
    } catch {
      setErroRegras(true);
    }
  }, []);

  useEffect(() => { void carregarRegras(); }, [carregarRegras]);

  useEffect(() => {
    let ativo = true;
    buscarPainel()
      .then((p) => { if (ativo) setPainel(p); })
      .catch(() => { if (ativo) showToastRef.current('Não foi possível carregar os resultados do mês.', 'error'); });
    return () => { ativo = false; };
  }, []);

  const definirAtiva = (regra: Regra, ativa: boolean) =>
    setRegras((atuais) => atuais?.map((r) => (r.regra === regra ? { ...r, ativa } : r)) ?? atuais);

  // Otimista: muda na hora e volta atrás se o servidor recusar.
  const alternar = async (regra: Regra, ativa: boolean) => {
    if (pendentes.current.has(regra)) return;
    pendentes.current.add(regra);
    definirAtiva(regra, ativa);
    try {
      const nova = await atualizarRegra(regra, { ativa });
      setRegras((atuais) => atuais?.map((r) => (r.regra === regra ? nova : r)) ?? atuais);
    } catch (e) {
      definirAtiva(regra, !ativa);
      showToast(getApiErrorMessage(e, ativa ? 'Não foi possível ativar a automação.' : 'Não foi possível pausar a automação.'), 'error');
    } finally {
      pendentes.current.delete(regra);
    }
  };

  const ativas = regras?.filter((r) => r.ativa).length ?? 0;
  const numero = painel?.conexao.numero ?? null;

  return (
    <div className="flex w-full flex-col">
      <div className="mb-8 flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div className="flex max-w-2xl flex-col gap-1">
          <div className="flex items-center gap-1 text-[11px] font-semibold uppercase leading-4 tracking-wider text-muted">
            <span>EasyAgenda+</span>
            <span>/</span>
            <span className="font-bold text-whatsapp">Automações Ativas</span>
          </div>
          <h1 className="text-[28px] font-bold leading-9 tracking-tight text-ink md:text-[32px] md:leading-10">Automações do WhatsApp</h1>
          <p className="text-[15px] leading-[22.5px] text-muted">
            Mensagens inteligentes enviadas no momento exato de cada etapa da cliente. Fluxos programados de resposta instantânea sem sobrecarregar sua recepção.
          </p>
        </div>
        <div className="flex items-center gap-2 self-start md:self-auto">
          <button type="button" onClick={semModal} className={botaoSecundario}>
            <Icon name="history" size={18} />
            <span>Histórico de disparos</span>
          </button>
          <button
            type="button"
            onClick={semModal}
            className="inline-flex items-center gap-1 rounded-lg bg-brand px-4 py-2 text-[13px] font-bold leading-[18px] text-on-brand shadow-sm transition-opacity hover:opacity-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand"
          >
            <Icon name="add" size={18} />
            <span>Nova automação</span>
          </button>
        </div>
      </div>

      <div className="mb-8">
        <CartoesResultado painel={painel} />
      </div>

      <div className="mb-4 flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
        <div className="flex items-center gap-2">
          <h2 className="text-[20px] font-bold leading-7 text-ink">Regras em Execução</h2>
          <span className="rounded-full bg-surface-2 px-2 py-[2px] text-[11px] font-bold leading-4 text-muted">
            {regras ? `${ativas} ${ativas === 1 ? 'ativa' : 'ativas'}` : '—'}
          </span>
        </div>
        <div className="flex items-center gap-1 text-[14px] leading-5 text-muted">
          <Icon name="bolt" size={16} className="text-whatsapp" />
          <span>Os envios respeitam o limite recomendado por hora</span>
        </div>
      </div>

      {erroRegras && !regras ? (
        <div role="alert" className="flex flex-col items-center gap-3 rounded-xl border border-line bg-surface p-8 text-center shadow-sm">
          <p className="text-[14px] text-muted">Não foi possível carregar as automações.</p>
          <button type="button" onClick={() => void carregarRegras()} className={botaoSecundario}>
            Tentar novamente
          </button>
        </div>
      ) : !regras ? (
        <Skeleton className="h-96 w-full" label="Carregando automações..." />
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {regras.map((r, i) => (
            <CartaoRegra
              key={r.regra}
              regra={r}
              {...conteudoDe(r, painel?.porRegra ?? null)}
              onAlternar={(ativa) => void alternar(r.regra, ativa)}
              onConfigurar={semModal}
              className={i === regras.length - 1 && regras.length % 2 === 1 ? 'lg:col-span-2 xl:col-span-1' : undefined}
            />
          ))}
        </div>
      )}

      <div className="mt-8 flex flex-col items-center justify-between gap-4 rounded-xl border border-line bg-surface-2 p-6 md:flex-row">
        <div className="flex items-center gap-4 self-start md:self-auto">
          <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-surface', conectado ? 'bg-whatsapp' : 'bg-muted')}>
            <Icon name="chat" size={24} />
          </div>
          <div className="flex flex-col">
            <span className="text-[17px] font-bold leading-6 text-ink">{conectado ? 'WhatsApp conectado' : 'WhatsApp desconectado'}</span>
            <span className="text-[14px] leading-5 text-muted">
              {conectado
                ? (numero ? formatarTelefone(numero) : '—')
                : 'Conecte o número para as automações voltarem a enviar'}
            </span>
          </div>
        </div>
        <div className="flex w-full items-center gap-2 md:w-auto">
          {conectado ? (
            <button type="button" onClick={semModal} className={cn(botaoSecundario, 'w-full shadow-none hover:bg-surface-m3-low md:w-auto')}>
              Testar envio
            </button>
          ) : (
            <button
              type="button"
              onClick={onAbrirConexao}
              className="w-full rounded-lg bg-whatsapp px-4 py-2 text-[13px] font-bold leading-[18px] text-surface transition-colors hover:bg-whatsapp/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand md:w-auto"
            >
              Conectar
            </button>
          )}
          <button
            type="button"
            onClick={onAbrirConexao}
            className="w-full rounded-lg bg-ink px-4 py-2 text-[13px] font-bold leading-[18px] text-surface transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand md:w-auto"
          >
            Configurações de envio
          </button>
        </div>
      </div>
    </div>
  );
}
