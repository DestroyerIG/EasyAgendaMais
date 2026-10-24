'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Icon } from '@/components/ui';
import { useToast } from '@/components/Toast';
import { cn } from '@/lib/cn';
import { getApiErrorMessage } from '@/utils/handleApiError';
import {
  agoraNoFuso, campanhaIdDoErro, criarCampanha, DIAS_AGENDAMENTO, HORARIOS_CAMPANHA, LIMITE_TEXTO_CAMPANHA,
  nomeAutomatico, opcoesCampanha, previaPublico, salvarCampanha, somarDias,
  type Cadencia, type CampanhaDto, type OpcoesCampanhaDto, type PublicoDto, type SalvarCampanha, type Segmento,
} from '@/lib/whatsappCampanhas';
import { PassoMensagem } from './PassoMensagem';
import { PassoProgramacao } from './PassoProgramacao';
import { PassoPublico } from './PassoPublico';
import { PreviaCampanha } from './PreviaCampanha';
import { plural } from './comum';

interface NovaCampanhaProps {
  campanha?: CampanhaDto;
  nomeNegocio: string;
  /** Desconectado não impede agendar: só mostra o aviso no passo 3. */
  conectado?: boolean;
  onFechar: (recarregar: boolean) => void;
}

const ESPERA_TEXTO_MS = 400;
const SEM_OPCOES: OpcoesCampanhaDto = { profissionais: [], servicos: [] };
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

/** "Amanhã, 24 de outubro" na lista de datas e "Amanhã" no balão do chat. */
function rotulosDaData(ymd: string, hoje: string) {
  const [, m, d] = ymd.split('-').map(Number);
  const curto = ymd === hoje ? 'Hoje' : ymd === somarDias(hoje, 1) ? 'Amanhã' : `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`;
  const extenso = `${d} de ${MESES[m - 1]}`;
  return { curto, longo: curto.includes('/') ? extenso : `${curto}, ${extenso}` };
}

type Passo = { numero: number; titulo: string; ok: boolean };

function Indicador({ passos }: { passos: Passo[] }) {
  const atual = passos.find((p) => !p.ok)?.numero ?? passos.length;
  return (
    <ol className="grid grid-cols-1 gap-2 rounded-xl bg-surface p-4 shadow-sm md:grid-cols-3 md:gap-4">
      {passos.map((p) => {
        const editando = p.numero === atual;
        const feito = p.ok && !editando;
        return (
          <li key={p.numero} aria-current={editando ? 'step' : undefined}
            className={cn('flex items-center gap-3 rounded-lg p-2', editando && 'bg-surface-m3-low')}>
            <span className={cn(
              'flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[13px] font-bold',
              feito ? 'bg-whatsapp text-surface' : editando ? 'bg-brand text-on-brand shadow-sm' : 'bg-surface-2 text-muted',
            )}>
              {feito ? <Icon name="check" size={18} /> : p.numero}
            </span>
            <span className="flex min-w-0 flex-col">
              <span className={cn('text-[11px] font-bold uppercase tracking-wider',
                feito ? 'text-whatsapp' : editando ? 'text-brand-text' : 'text-muted')}>
                {editando ? `Passo ${p.numero} (Editando)` : `Passo ${p.numero}`}
              </span>
              <span className={cn('truncate text-[15px] font-semibold', feito || editando ? 'text-ink' : 'text-muted')}>{p.titulo}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export function NovaCampanha({ campanha, nomeNegocio, conectado = true, onFechar }: NovaCampanhaProps) {
  const { showToast } = useToast();
  const [agora] = useState(() => agoraNoFuso());
  const hoje = agora.ymd;
  // Hoje só vale com horário ainda por vir; depois das 19:30 a lista começa amanhã.
  const horariosDe = (ymd: string) => (ymd === hoje ? HORARIOS_CAMPANHA.filter((h) => h > agora.hhmm) : HORARIOS_CAMPANHA);
  // Rascunho com data fora da janela (passada ou sem horário livre) volta ao padrão: amanhã às 10:00.
  const dataValida = (ymd: string) => ymd >= hoje && ymd <= somarDias(hoje, DIAS_AGENDAMENTO) && horariosDe(ymd).length > 0;
  const dataInicial = campanha && dataValida(campanha.data) ? campanha.data : somarDias(hoje, 1);
  const horaInicial = campanha && dataInicial === campanha.data && horariosDe(dataInicial).includes(campanha.hora)
    ? campanha.hora
    : horariosDe(dataInicial).includes('10:00') ? '10:00' : horariosDe(dataInicial)[0];

  const [segmento, setSegmento] = useState<Segmento>(campanha?.segmento ?? 'em_risco');
  const [professionalId, setProfessionalId] = useState<string | null>(campanha?.professionalId ?? null);
  const [serviceId, setServiceId] = useState<string | null>(campanha?.serviceId ?? null);
  const [texto, setTexto] = useState(campanha?.texto ?? '');
  const [textoDaPrevia, setTextoDaPrevia] = useState(texto);
  const [data, setData] = useState(dataInicial);
  const [hora, setHora] = useState(horaInicial);
  const [cadencia, setCadencia] = useState<Cadencia>(campanha?.cadencia ?? 25);
  const [nome, setNome] = useState(campanha?.nome ?? nomeAutomatico('em_risco', hoje));
  const nomeEditado = useRef(!!campanha);
  const [opcoes, setOpcoes] = useState<OpcoesCampanhaDto>(SEM_OPCOES);
  const [publico, setPublico] = useState<PublicoDto | null>(null);
  const [erroPublico, setErroPublico] = useState(false);
  const [salvando, setSalvando] = useState<SalvarCampanha['acao'] | null>(null);
  const salvandoRef = useRef(false);
  const requisicao = useRef(0);
  // Id da campanha gravada nesta sessão: a existente ou o rascunho criado num agendamento que falhou.
  const idRef = useRef<string | null>(campanha?.id ?? null);

  useEffect(() => {
    opcoesCampanha().then(setOpcoes).catch(() => setOpcoes(SEM_OPCOES));
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setTextoDaPrevia(texto), ESPERA_TEXTO_MS);
    return () => clearTimeout(t);
  }, [texto]);

  useEffect(() => {
    const minha = ++requisicao.current;
    previaPublico({ segmento, professionalId, serviceId, texto: textoDaPrevia.slice(0, LIMITE_TEXTO_CAMPANHA) })
      .then((p) => { if (minha === requisicao.current) { setPublico(p); setErroPublico(false); } })
      .catch(() => { if (minha === requisicao.current) { setPublico(null); setErroPublico(true); } });
  }, [segmento, professionalId, serviceId, textoDaPrevia]);

  const datas = useMemo(() => Array.from({ length: DIAS_AGENDAMENTO + 1 }, (_, i) => somarDias(hoje, i))
    .filter((d) => d !== hoje || HORARIOS_CAMPANHA.some((h) => h > agora.hhmm))
    .map((d) => ({ valor: d, texto: rotulosDaData(d, hoje).longo })), [hoje, agora.hhmm]);

  const mudarPublico = (p: { segmento?: Segmento; professionalId?: string | null; serviceId?: string | null }) => {
    if (p.segmento !== undefined) {
      setSegmento(p.segmento);
      if (!nomeEditado.current) setNome(nomeAutomatico(p.segmento, hoje));
    }
    if (p.professionalId !== undefined) setProfessionalId(p.professionalId);
    if (p.serviceId !== undefined) setServiceId(p.serviceId);
  };

  const mudarProgramacao = (p: { data?: string; hora?: string; cadencia?: Cadencia }) => {
    if (p.data !== undefined) {
      setData(p.data);
      const livres = horariosDe(p.data);
      if (!livres.includes(hora)) setHora(livres[0] ?? '10:00');
    }
    if (p.hora !== undefined) setHora(p.hora);
    if (p.cadencia !== undefined) setCadencia(p.cadencia);
  };

  const textoValido = texto.trim().length > 0 && texto.length <= LIMITE_TEXTO_CAMPANHA;
  const receberao = publico?.receberao ?? 0;
  const podeAgendar = textoValido && receberao > 0 && salvando === null;
  const podeSalvar = textoValido && salvando === null;

  const enviar = async (acao: SalvarCampanha['acao']) => {
    if (salvandoRef.current || !textoValido || (acao === 'agendar' && receberao === 0)) return;
    salvandoRef.current = true;
    setSalvando(acao);
    const corpo: SalvarCampanha = {
      nome: nome.trim() || nomeAutomatico(segmento, hoje),
      segmento, professionalId, serviceId, texto, data, hora, cadencia, acao,
    };
    try {
      const id = idRef.current;
      const r = id ? await salvarCampanha(id, corpo) : await criarCampanha(corpo);
      idRef.current = r.campanha.id;
      if (acao === 'rascunho') {
        showToast('Rascunho salvo.', 'success');
      } else {
        const total = r.campanha.total;
        const extra = r.jaNaFila > 0 ? ` ${r.jaNaFila} já ${plural(r.jaNaFila, 'estava', 'estavam')} em outra campanha na fila.` : '';
        showToast(`Campanha agendada para ${total} ${plural(total, 'cliente', 'clientes')}.${extra}`, 'success');
      }
      onFechar(true);
    } catch (e) {
      // O backend grava o rascunho antes de agendar; as próximas tentativas atualizam esse rascunho.
      const rascunho = campanhaIdDoErro(e);
      if (rascunho) idRef.current = rascunho;
      showToast(getApiErrorMessage(e, 'Não foi possível salvar a campanha.'), 'error');
    } finally {
      salvandoRef.current = false;
      setSalvando(null);
    }
  };

  const titulo = campanha ? 'Editar Campanha' : 'Nova Campanha';
  const passos: Passo[] = [
    { numero: 1, titulo: 'Público-alvo', ok: receberao > 0 },
    { numero: 2, titulo: 'Mensagem e Tags', ok: textoValido },
    { numero: 3, titulo: 'Envio & Anti-bloqueio', ok: true },
  ];

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex min-w-0 flex-col gap-1">
          <nav aria-label="Navegação" className="flex items-center gap-1 text-[11px] uppercase tracking-wider text-muted">
            <span>WhatsApp</span>
            <Icon name="chevron_right" size={14} />
            <button type="button" onClick={() => onFechar(false)}
              className="uppercase tracking-wider hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand">
              Campanhas
            </button>
            <Icon name="chevron_right" size={14} />
            <span className="font-bold text-brand-text" aria-current="page">{titulo}</span>
          </nav>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-[22px] font-bold tracking-tight text-ink">{`${titulo} de WhatsApp`}</h1>
            <label htmlFor="camp-nome" className="sr-only">Nome da campanha</label>
            <input
              id="camp-nome"
              value={nome}
              maxLength={80}
              onChange={(e) => { nomeEditado.current = true; setNome(e.target.value); }}
              className="min-h-9 w-48 rounded-full bg-surface-2 px-3 text-[13px] font-medium text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand"
            />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3 rounded-xl bg-surface px-4 py-2 shadow-sm">
          <div className="flex items-center gap-2">
            <span className={cn('h-2.5 w-2.5 rounded-full', conectado ? 'animate-pulse bg-whatsapp' : 'bg-warning')} aria-hidden="true" />
            <span className="text-[13px] font-bold text-ink">{conectado ? 'Instância Conectada' : 'Instância Desconectada'}</span>
          </div>
          <span className="h-4 w-px bg-line" aria-hidden="true" />
          <div className="flex items-center gap-1.5 text-[13px] text-muted">
            <Icon name="bolt" size={16} className="text-tertiary" />
            <span>Limite recomendado: <strong className="font-semibold text-ink">25 mensagens por hora</strong></span>
          </div>
        </div>
      </div>

      <Indicador passos={passos} />

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
        <div className="flex flex-col gap-6 lg:col-span-7">
          <PassoPublico segmento={segmento} professionalId={professionalId} serviceId={serviceId}
            opcoes={opcoes} publico={publico} erroPublico={erroPublico} onMudar={mudarPublico} />
          <PassoMensagem texto={texto} onMudar={setTexto} />
          <PassoProgramacao data={data} hora={hora} cadencia={cadencia} datas={datas} horarios={horariosDe(data)}
            conectado={conectado} onMudar={mudarProgramacao} />

          <div className="sticky bottom-4 z-20 flex flex-col items-center justify-between gap-3 rounded-xl bg-surface p-4 shadow-md sm:flex-row">
            <Button variant="secondary" fullWidth className="sm:w-auto" disabled={!podeSalvar}
              loading={salvando === 'rascunho'} onClick={() => void enviar('rascunho')}>
              <Icon name="bookmark_border" size={18} />
              Salvar como Rascunho
            </Button>
            <Button variant="whatsapp" fullWidth className="sm:w-auto" disabled={!podeAgendar}
              loading={salvando === 'agendar'} onClick={() => void enviar('agendar')}>
              <Icon name="send" size={20} />
              {`Agendar Disparo para ${receberao} ${plural(receberao, 'Cliente', 'Clientes')}`}
            </Button>
          </div>
        </div>

        <div className="lg:col-span-5">
          <PreviaCampanha publico={publico} erro={erroPublico} nomeNegocio={nomeNegocio} dia={rotulosDaData(data, hoje).curto} hora={hora} cadencia={cadencia} />
        </div>
      </div>
    </div>
  );
}
