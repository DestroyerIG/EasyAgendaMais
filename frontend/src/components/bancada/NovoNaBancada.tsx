'use client';

import { useEffect, useState } from 'react';
import { CalendarPlus, Plus, UserPlus } from 'lucide-react';
import { Modal, ModalFooter } from '@/components/ui';
import { useToast } from '@/components/Toast';
import { useVocabulario } from '@/hooks/useVocabulario';
import { bancadaApi, EVENTO_ATUALIZAR_BANCADA, primeiroNome, type ClienteDela, type ServicoBancada } from '@/lib/bancada';
import { formatPhone } from '@/lib/formatters';
import { hojeLocal, somarDias } from '@/lib/relatorios';
import { getApiErrorMessage } from '@/utils/handleApiError';
import { cn } from '@/lib/cn';

// Atalho "+" do app da profissional: novo agendamento e novo cliente, sempre na agenda dela.

const diaCurto = (d: string) =>
  new Date(`${d}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' }).replace('.', '');

const avisarTelas = () => window.dispatchEvent(new Event(EVENTO_ATUALIZAR_BANCADA));

const campo = 'h-11 w-full rounded-control border border-line bg-surface px-3 text-[15px] text-ink';

export function NovoClienteModal({ onClose, onCriado }: { onClose: () => void; onCriado: (c: ClienteDela) => void }) {
  const { showToast } = useToast();
  const { cli } = useVocabulario();
  const [nome, setNome] = useState('');
  const [telefone, setTelefone] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const salvar = async () => {
    setSalvando(true);
    setErro(null);
    try {
      const r = await bancadaApi.criarCliente({ name: nome.trim(), phone: telefone.trim() });
      showToast(r.jaExistia ? `Esse telefone já estava cadastrado: ${r.cliente.name}.` : 'Cadastro feito.', 'success');
      avisarTelas();
      onCriado(r.cliente);
    } catch (e) {
      setErro(getApiErrorMessage(e, 'Não foi possível cadastrar.'));
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={`${cli.g('Nova', 'Novo')} ${cli.s}`}
      icon={UserPlus}
      footer={<ModalFooter onCancel={onClose} onSubmit={salvar} submitLabel="Cadastrar e agendar" submitting={salvando} disabled={nome.trim().length < 2 || telefone.trim().length < 8} />}
    >
      <div className="flex flex-col gap-4">
        <label className="block text-[13px] font-semibold text-ink">
          Nome
          <input value={nome} maxLength={255} onChange={(e) => setNome(e.target.value)} autoComplete="off" className={cn(campo, 'mt-1 font-normal')} />
        </label>
        <label className="block text-[13px] font-semibold text-ink">
          Telefone / WhatsApp
          <input type="tel" inputMode="tel" value={telefone} maxLength={20} onChange={(e) => setTelefone(e.target.value)} autoComplete="off" className={cn(campo, 'mt-1 font-normal')} />
        </label>
        {erro && <p role="alert" className="text-sm text-danger">{erro}</p>}
      </div>
    </Modal>
  );
}

interface AgendamentoProps {
  clienteInicial?: ClienteDela | null;
  onClose: () => void;
  onNovoCliente: () => void;
}

export function NovoAgendamentoModal({ clienteInicial = null, onClose, onNovoCliente }: AgendamentoProps) {
  const { showToast } = useToast();
  const { cli } = useVocabulario();
  const hoje = hojeLocal();
  const dias = Array.from({ length: 14 }, (_, i) => somarDias(hoje, i));
  const [cliente, setCliente] = useState<ClienteDela | null>(clienteInicial);
  const [busca, setBusca] = useState('');
  const [achados, setAchados] = useState<ClienteDela[] | null>(null);
  const [servicos, setServicos] = useState<ServicoBancada[] | null>(null);
  const [servicoId, setServicoId] = useState('');
  const [dia, setDia] = useState(hoje);
  const [horarios, setHorarios] = useState<string[] | null>(null);
  const [hora, setHora] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    bancadaApi.servicos().then((s) => { if (vivo) setServicos(s); }).catch(() => { if (vivo) setServicos([]); });
    return () => { vivo = false; };
  }, []);

  useEffect(() => {
    const termo = busca.trim();
    if (termo.length < 2) { setAchados(null); return; }
    let vivo = true;
    const t = setTimeout(() => {
      bancadaApi.buscarClientes(termo).then((r) => { if (vivo) setAchados(r); }).catch(() => { if (vivo) setAchados([]); });
    }, 300);
    return () => { vivo = false; clearTimeout(t); };
  }, [busca]);

  useEffect(() => {
    if (!servicoId) { setHorarios(null); return; }
    let vivo = true;
    setHorarios(null);
    setHora(null);
    bancadaApi.horariosNovo(servicoId, dia)
      .then((h) => { if (vivo) setHorarios(h); })
      .catch(() => { if (vivo) setHorarios([]); });
    return () => { vivo = false; };
  }, [servicoId, dia]);

  const salvar = async () => {
    if (!cliente || !servicoId || !hora) return;
    setSalvando(true);
    setErro(null);
    try {
      await bancadaApi.criarAgendamento({ clienteId: cliente.id, servicoId, data: dia, hora });
      showToast(`Agendado: ${primeiroNome(cliente.name)} · ${diaCurto(dia)} às ${hora}.`, 'success');
      avisarTelas();
      onClose();
    } catch (e) {
      setErro(getApiErrorMessage(e, 'Não foi possível agendar.'));
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title="Novo agendamento"
      icon={CalendarPlus}
      description="Na sua agenda"
      footer={<ModalFooter onCancel={onClose} onSubmit={salvar} submitLabel="Agendar" submitting={salvando} disabled={!cliente || !servicoId || !hora} />}
    >
      <div className="flex flex-col gap-4">
        <div>
          <p className="mb-2 text-[13px] font-semibold text-ink">Cliente</p>
          {cliente ? (
            <div className="flex items-center justify-between gap-3 rounded-control border border-line bg-surface-2 px-3 py-2.5">
              <span className="min-w-0">
                <span className="block truncate text-[15px] font-semibold text-ink">{cliente.name}</span>
                <span className="block text-[13px] text-muted">{formatPhone(cliente.phone)}</span>
              </span>
              <button type="button" onClick={() => setCliente(null)} className="shrink-0 text-[13px] font-semibold text-brand-text">Trocar</button>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <input
                type="search"
                aria-label="Buscar por nome ou telefone"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar por nome ou telefone"
                className={campo}
              />
              {achados?.length === 0 && <p className="text-[13px] text-muted">Ninguém encontrado com esse nome ou telefone.</p>}
              {achados && achados.length > 0 && (
                <ul className="max-h-48 divide-y divide-line overflow-y-auto rounded-control border border-line bg-surface">
                  {achados.map((c) => (
                    <li key={c.id}>
                      <button type="button" onClick={() => setCliente(c)} className="flex w-full flex-col px-3 py-2.5 text-left hover:bg-surface-2">
                        <span className="text-[15px] font-semibold text-ink">{c.name}</span>
                        <span className="text-[13px] text-muted">{formatPhone(c.phone)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <button type="button" onClick={onNovoCliente} className="self-start text-[13px] font-semibold text-brand-text">
                + Cadastrar {cli.g('nova cliente', 'novo cliente')}
              </button>
            </div>
          )}
        </div>

        <label className="block text-[13px] font-semibold text-ink">
          Serviço
          <select value={servicoId} onChange={(e) => setServicoId(e.target.value)} disabled={servicos === null} className={cn(campo, 'mt-1 font-normal')}>
            <option value="">{servicos === null ? 'Carregando...' : 'Escolha o serviço'}</option>
            {servicos?.map((s) => <option key={s.id} value={s.id}>{s.nome} · {s.duracao} min</option>)}
          </select>
        </label>

        <div>
          <p className="mb-2 text-[13px] font-semibold text-ink">Dia</p>
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
            {dias.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDia(d)}
                aria-pressed={d === dia}
                className={cn(
                  'shrink-0 rounded-control border px-3 py-2 text-[13px] font-semibold capitalize',
                  d === dia ? 'border-brand bg-brand/12 text-brand-text' : 'border-line bg-surface text-ink',
                )}
              >
                {diaCurto(d)}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="mb-2 text-[13px] font-semibold text-ink">Horário livre na sua agenda</p>
          {!servicoId && <p className="text-[13px] text-muted">Escolha o serviço para ver os horários.</p>}
          {servicoId && horarios === null && <p className="text-[13px] text-muted">Carregando horários...</p>}
          {horarios?.length === 0 && <p className="text-[13px] text-muted">Nenhum horário livre neste dia.</p>}
          {horarios && horarios.length > 0 && (
            <div className="grid grid-cols-4 gap-2">
              {horarios.map((h) => (
                <button
                  key={h}
                  type="button"
                  onClick={() => setHora(h)}
                  aria-pressed={h === hora}
                  className={cn(
                    'h-11 rounded-control border text-[14px] font-semibold tabular-nums',
                    h === hora ? 'border-brand bg-brand text-on-brand' : 'border-line bg-surface text-ink',
                  )}
                >
                  {h}
                </button>
              ))}
            </div>
          )}
        </div>
        {erro && <p role="alert" className="text-sm text-danger">{erro}</p>}
      </div>
    </Modal>
  );
}

const baloon =
  'flex h-11 w-full items-center justify-center whitespace-nowrap rounded-full border border-line bg-surface px-2 text-[14px] font-semibold text-ink shadow-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand';

type Aberto = 'agendamento' | 'cliente' | null;

/** O botão + do meio da barra, com os dois balões, e os modais que ele abre. */
export function NovoNaBancada() {
  const [baloes, setBaloes] = useState(false);
  const [aberto, setAberto] = useState<Aberto>(null);
  const [clienteNovo, setClienteNovo] = useState<ClienteDela | null>(null);

  useEffect(() => {
    if (!baloes) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setBaloes(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [baloes]);

  const abrir = (qual: Aberto) => { setBaloes(false); setClienteNovo(null); setAberto(qual); };
  const oculto = baloes ? {} : { 'aria-hidden': true as const, tabIndex: -1 };
  const cel = (delay: string) => cn(
    'origin-bottom transition-[opacity,transform] duration-[400ms] ease-[cubic-bezier(.2,.9,.3,1.25)] motion-reduce:transition-none',
    baloes ? cn('translate-y-0 scale-100 opacity-100', delay) : 'pointer-events-none translate-y-20 scale-50 opacity-0',
  );

  return (
    <>
      <div
        aria-hidden="true"
        data-testid="fundo-baloes"
        onClick={() => setBaloes(false)}
        className={cn('fixed inset-0 z-20 bg-scrim/50 transition-opacity duration-200 motion-reduce:transition-none', baloes ? 'opacity-100' : 'pointer-events-none opacity-0')}
      />
      <div className={cn('fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-30 flex justify-center', !baloes && 'pointer-events-none')}>
        <div className="grid w-full max-w-xl grid-cols-2 gap-3 px-4">
          <div className={cel('')}>
            <button type="button" onClick={() => abrir('agendamento')} className={baloon} {...oculto}>Novo agendamento</button>
          </div>
          <div className={cel('delay-75')}>
            <button type="button" onClick={() => abrir('cliente')} className={baloon} {...oculto}>Novo cliente</button>
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={() => setBaloes((v) => !v)}
        aria-label="Criar novo"
        aria-expanded={baloes}
        className="flex h-12 w-12 items-center justify-center rounded-full bg-brand text-on-brand shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
      >
        <span className={cn('flex transition-transform duration-200 motion-reduce:transition-none', baloes && 'rotate-45')}>
          <Plus className="h-6 w-6" aria-hidden="true" />
        </span>
      </button>

      {aberto === 'cliente' && (
        <NovoClienteModal onClose={() => setAberto(null)} onCriado={(c) => { setClienteNovo(c); setAberto('agendamento'); }} />
      )}
      {aberto === 'agendamento' && (
        <NovoAgendamentoModal
          clienteInicial={clienteNovo}
          onClose={() => { setAberto(null); setClienteNovo(null); }}
          onNovoCliente={() => setAberto('cliente')}
        />
      )}
    </>
  );
}
