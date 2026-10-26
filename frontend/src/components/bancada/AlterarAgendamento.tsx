'use client';

import { useEffect, useState } from 'react';
import { CalendarClock, XCircle } from 'lucide-react';
import { Banner, Modal, ModalFooter } from '@/components/ui';
import { useToast } from '@/components/Toast';
import { useVocabulario } from '@/hooks/useVocabulario';
import { bancadaApi, MOTIVOS_CANCELAMENTO, primeiroNome, type ItemAgenda } from '@/lib/bancada';
import { somarDias } from '@/lib/relatorios';
import { getApiErrorMessage } from '@/utils/handleApiError';
import { cn } from '@/lib/cn';

// Reagendar e cancelar pelo app (fase 5): só os agendamentos dela, com aviso opcional à cliente.

const diaCurto = (d: string) => {
  const dt = new Date(`${d}T12:00:00`);
  return dt.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' }).replace('.', '');
};

interface Props {
  agendamento: ItemAgenda;
  data: string;
  hoje: string;
  onClose: () => void;
  onDone: () => void;
}

function AvisarCliente({ checked, onChange, nome }: { checked: boolean; onChange: (v: boolean) => void; nome: string }) {
  return (
    <label className="flex items-start gap-3 rounded-control border border-line bg-surface-2 p-3">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-brand" />
      <span className="text-[14px] text-ink">Avisar {nome} pelo WhatsApp</span>
    </label>
  );
}

export function ReagendarModal({ agendamento, data, hoje, onClose, onDone }: Props) {
  const { showToast } = useToast();
  const { prof } = useVocabulario();
  const [dia, setDia] = useState(data < hoje ? hoje : data);
  const [horarios, setHorarios] = useState<string[] | null>(null);
  const [hora, setHora] = useState<string | null>(null);
  const [avisar, setAvisar] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const dias = Array.from({ length: 14 }, (_, i) => somarDias(hoje, i));
  const nome = primeiroNome(agendamento.cliente.name);

  useEffect(() => {
    let vivo = true;
    setHorarios(null);
    setHora(null);
    bancadaApi.horarios(agendamento.id, dia)
      .then((h) => { if (vivo) setHorarios(h.filter((x) => !(dia === data && x === agendamento.time))); })
      .catch(() => { if (vivo) setHorarios([]); });
    return () => { vivo = false; };
  }, [agendamento.id, agendamento.time, data, dia]);

  const salvar = async () => {
    if (!hora) return;
    setSalvando(true);
    setErro(null);
    try {
      const r = await bancadaApi.reagendar(agendamento.id, { data: dia, hora, avisarCliente: avisar });
      showToast(r.avisoEnviado ? `Reagendado. ${nome} vai receber o aviso.` : 'Reagendado.', 'success');
      onDone();
    } catch (e) {
      setErro(getApiErrorMessage(e, 'Não foi possível reagendar.'));
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={`Reagendar ${nome}`}
      icon={CalendarClock}
      description={`${agendamento.servico.nome} · hoje marcado para ${diaCurto(data)} às ${agendamento.time}`}
      footer={<ModalFooter onCancel={onClose} onSubmit={salvar} submitLabel="Reagendar" submitting={salvando} disabled={!hora} />}
    >
      <div className="flex flex-col gap-4">
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
          {horarios === null && <p className="text-[13px] text-muted">Carregando horários...</p>}
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
        <AvisarCliente checked={avisar} onChange={setAvisar} nome={nome} />
        <p className="text-[12px] text-muted">A recepção recebe o aviso no sino. Trocar de {prof.s} fica com a recepção.</p>
        {erro && <p role="alert" className="text-sm text-danger">{erro}</p>}
      </div>
    </Modal>
  );
}

export function CancelarModal({ agendamento, data, onClose, onDone }: Props) {
  const { showToast } = useToast();
  const { adaptar } = useVocabulario();
  const [motivo, setMotivo] = useState<string>(MOTIVOS_CANCELAMENTO[0]);
  const [outro, setOutro] = useState('');
  const [avisar, setAvisar] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const nome = primeiroNome(agendamento.cliente.name);
  const motivoFinal = motivo === 'Outro' ? outro.trim() : adaptar(motivo);
  const temSinal = agendamento.deposito > 0 && agendamento.status === 'confirmado';

  const cancelar = async () => {
    if (motivoFinal.length < 2) return;
    setSalvando(true);
    setErro(null);
    try {
      const r = await bancadaApi.cancelar(agendamento.id, { motivo: motivoFinal, avisarCliente: avisar });
      showToast(r.avisoEnviado ? `Cancelado. ${nome} vai receber o aviso.` : 'Cancelado.', 'success');
      onDone();
    } catch (e) {
      setErro(getApiErrorMessage(e, 'Não foi possível cancelar.'));
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={`Cancelar ${nome}`}
      icon={XCircle}
      description={`${agendamento.servico.nome} · ${diaCurto(data)} às ${agendamento.time}`}
      footer={(
        <ModalFooter
          onCancel={onClose}
          cancelLabel="Voltar"
          onSubmit={cancelar}
          submitLabel="Cancelar agendamento"
          submitting={salvando}
          disabled={motivoFinal.length < 2}
        />
      )}
    >
      <div className="flex flex-col gap-4">
        <fieldset>
          <legend className="mb-2 text-[13px] font-semibold text-ink">Motivo</legend>
          <div className="flex flex-col gap-2">
            {MOTIVOS_CANCELAMENTO.map((m) => (
              <label key={m} className="flex items-center gap-3 rounded-control border border-line bg-surface px-3 py-2.5 text-[14px] text-ink">
                <input type="radio" name="motivo" value={m} checked={motivo === m} onChange={() => setMotivo(m)} className="h-4 w-4 accent-brand" />
                {adaptar(m)}
              </label>
            ))}
          </div>
          {motivo === 'Outro' && (
            <input
              aria-label="Descreva o motivo"
              value={outro}
              maxLength={120}
              onChange={(e) => setOutro(e.target.value)}
              placeholder="Descreva o motivo"
              className="mt-2 h-11 w-full rounded-control border border-line bg-surface px-3 text-[15px] text-ink"
            />
          )}
        </fieldset>
        {temSinal && (
          <Banner tone="warning" variant="inline">O sinal pago fica com o salão. Combine a devolução com a recepção.</Banner>
        )}
        <AvisarCliente checked={avisar} onChange={setAvisar} nome={nome} />
        {erro && <p role="alert" className="text-sm text-danger">{erro}</p>}
      </div>
    </Modal>
  );
}
