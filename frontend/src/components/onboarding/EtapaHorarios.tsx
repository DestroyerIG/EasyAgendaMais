'use client';

import { useState } from 'react';
import { Button, Field, Icon, Input, Select, Switch } from '@/components/ui';
import { GoogleAgendaCard } from '@/components/googleAgenda/GoogleAgendaCard';
import { CascaOnboarding } from './CascaOnboarding';
import { DIAS, INTERVALOS, type DiaSemana, type Horarios, type ModoEquipe } from '@/lib/onboarding';
import { cn } from '@/lib/cn';
import { useVocabulario } from '@/hooks/useVocabulario';

const minutos = (hhmm: string) => {
  const [h = 0, m = 0] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

/** Mesmas regras do backend (onboarding.rules.ts → errosDosHorarios). */
export function erroDosHorarios(h: Horarios): string | null {
  if (h.diasAbertos.length === 0) return 'Escolha pelo menos um dia de atendimento.';
  if (minutos(h.fechamento) <= minutos(h.abertura)) return 'O fechamento precisa ser depois da abertura.';
  if (h.pausa) {
    if (minutos(h.pausa.fim) <= minutos(h.pausa.inicio)) return 'O fim da pausa precisa ser depois do início.';
    if (minutos(h.pausa.inicio) < minutos(h.abertura) || minutos(h.pausa.fim) > minutos(h.fechamento)) {
      return 'A pausa precisa ficar dentro do horário de atendimento.';
    }
  }
  return null;
}

export function EtapaHorarios({ inicial, modoEquipe, salvando, onVoltar, onSalvar }: {
  inicial: Horarios; modoEquipe: ModoEquipe | null; salvando: boolean; onVoltar: () => void; onSalvar: (h: Horarios) => void;
}) {
  const { prof } = useVocabulario();
  const [h, setH] = useState<Horarios>(inicial);
  const [comPausa, setComPausa] = useState(inicial.pausa !== null);
  const [pausa, setPausa] = useState(inicial.pausa ?? { inicio: '12:00', fim: '13:00' });
  const final: Horarios = { ...h, pausa: comPausa && modoEquipe === 'sozinha' ? pausa : null };
  const erro = erroDosHorarios(final);

  const alternarDia = (d: DiaSemana) =>
    setH((x) => ({ ...x, diasAbertos: x.diasAbertos.includes(d) ? x.diasAbertos.filter((y) => y !== d) : [...x.diasAbertos, d] }));

  return (
    <CascaOnboarding
      etapa={2}
      titulo="Quais são os dias e horários de atendimento?"
      descricao="Sua agenda online só libera vagas nos horários configurados aqui. Você pode mudar isso a qualquer momento em Ajustes."
      rodape={(
        <>
          <Button variant="ghost" onClick={onVoltar}><Icon name="arrow_back" size={18} /> Voltar</Button>
          <Button disabled={!!erro} loading={salvando} onClick={() => onSalvar(final)}>
            Continuar <Icon name="arrow_forward" size={18} />
          </Button>
        </>
      )}
    >
      <section>
        <h2 className="mb-3 text-lg font-bold text-ink">Dias abertos</h2>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Dias abertos">
          {DIAS.map((d) => {
            const aberto = h.diasAbertos.includes(d.id);
            return (
              <button
                key={d.id}
                type="button"
                aria-pressed={aberto}
                aria-label={d.longo}
                onClick={() => alternarDia(d.id)}
                className={cn(
                  'min-w-14 rounded-control border px-3 py-2 text-[13px] font-bold',
                  aberto ? 'border-brand bg-brand text-on-brand' : 'border-line bg-surface text-muted',
                )}
              >
                {d.curto}
              </button>
            );
          })}
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        <Field id="onb-abertura" label="Abertura">
          <Input id="onb-abertura" type="time" value={h.abertura} onChange={(e) => setH({ ...h, abertura: e.target.value })} />
        </Field>
        <Field id="onb-fechamento" label="Fechamento">
          <Input id="onb-fechamento" type="time" value={h.fechamento} onChange={(e) => setH({ ...h, fechamento: e.target.value })} />
        </Field>
        <Field id="onb-intervalo" label="Intervalo da agenda" hint="De quanto em quanto tempo abrem os horários.">
          <Select id="onb-intervalo" value={String(h.intervaloMinutos)} onChange={(e) => setH({ ...h, intervaloMinutos: Number(e.target.value) })}>
            {INTERVALOS.map((i) => (
              <option key={i} value={i}>{i === 0 ? 'Pela duração do serviço' : `A cada ${i} min`}</option>
            ))}
          </Select>
        </Field>
      </section>

      {modoEquipe === 'sozinha' ? (
        <section className="space-y-3 rounded-card border border-line bg-surface p-4">
          <Switch
            checked={comPausa}
            onCheckedChange={setComPausa}
            label="Pausa para almoço"
            description="Bloqueia a agenda nesse intervalo em todos os dias abertos."
          />
          {comPausa && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="onb-pausa-inicio" label="Início da pausa">
                <Input id="onb-pausa-inicio" type="time" value={pausa.inicio} onChange={(e) => setPausa({ ...pausa, inicio: e.target.value })} />
              </Field>
              <Field id="onb-pausa-fim" label="Fim da pausa">
                <Input id="onb-pausa-fim" type="time" value={pausa.fim} onChange={(e) => setPausa({ ...pausa, fim: e.target.value })} />
              </Field>
            </div>
          )}
        </section>
      ) : (
        <p className="text-[14px] text-muted">{`A pausa de cada ${prof.s} fica no cadastro ${prof.dele}, em Serviços › Equipe.`}</p>
      )}

      <GoogleAgendaCard para="negocio" origem="onboarding" />

      {erro && <p role="alert" className="text-[14px] font-semibold text-danger">{erro}</p>}
    </CascaOnboarding>
  );
}
