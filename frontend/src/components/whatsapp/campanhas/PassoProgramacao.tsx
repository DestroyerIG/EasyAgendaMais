'use client';

import { Field, Icon, Select } from '@/components/ui';
import { cn } from '@/lib/cn';
import { faixaIntervalo, RODAPE_SAIR, type Cadencia } from '@/lib/whatsappCampanhas';
import { CabecalhoPasso } from './comum';

const CADENCIAS: Array<{ valor: Cadencia; texto: string }> = [
  { valor: 10, texto: '10 msgs/h (Ultra Seguro)' },
  { valor: 25, texto: '25 msgs/h (Recomendado)' },
  { valor: 60, texto: '60 msgs/h (Agressivo)' },
];

interface PassoProgramacaoProps {
  data: string;
  hora: string;
  cadencia: Cadencia;
  datas: Array<{ valor: string; texto: string }>;
  horarios: string[];
  conectado: boolean;
  onMudar(parcial: { data?: string; hora?: string; cadencia?: Cadencia }): void;
}

export function PassoProgramacao({ data, hora, cadencia, datas, horarios, conectado, onMudar }: PassoProgramacaoProps) {
  return (
    <section aria-labelledby="passo-programacao" className="flex flex-col gap-4 rounded-xl bg-surface p-4 shadow-sm sm:p-6">
      <CabecalhoPasso numero={3} id="passo-programacao" titulo="Programação & Proteção Anti-bloqueio" />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field id="camp-data" label="Data do início">
          <Select id="camp-data" value={data} onChange={(e) => onMudar({ data: e.target.value })}>
            {datas.map((d) => <option key={d.valor} value={d.valor}>{d.texto}</option>)}
          </Select>
        </Field>
        <Field id="camp-hora" label="Horário sugerido">
          <Select id="camp-hora" value={hora} onChange={(e) => onMudar({ hora: e.target.value })}>
            {horarios.map((h) => <option key={h} value={h}>{h}</option>)}
          </Select>
        </Field>
      </div>

      <div className="flex flex-col gap-3 rounded-xl bg-surface-m3-low p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-col">
            <span id="camp-cadencia" className="text-[13px] font-bold text-ink">Cadência de Envio (Velocidade)</span>
            <span className="text-[11px] text-muted">Regula a vazão para proteger seu número corporativo contra suspensão.</span>
          </div>
          <span className="rounded-lg bg-surface px-3 py-1 text-[15px] font-extrabold text-whatsapp shadow-sm">{`${cadencia} msgs / hora`}</span>
        </div>
        <div role="radiogroup" aria-labelledby="camp-cadencia" className="grid grid-cols-1 gap-1 rounded-control bg-surface-2 p-1 sm:grid-cols-3">
          {CADENCIAS.map((c) => {
            const marcada = c.valor === cadencia;
            return (
              <button
                key={c.valor}
                type="button"
                role="radio"
                aria-checked={marcada}
                onClick={() => onMudar({ cadencia: c.valor })}
                className={cn(
                  'min-h-11 rounded-lg px-2 text-[13px] font-bold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand lg:min-h-9',
                  marcada ? 'bg-surface text-whatsapp shadow-sm' : 'text-muted hover:text-ink',
                )}
              >
                {c.texto}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2">
        <div className="flex items-center gap-3 rounded-lg bg-surface-2 p-3 text-[13px] text-ink">
          <Icon name="shuffle" size={20} className="shrink-0 text-whatsapp" />
          <span>
            <strong>Intervalo Dinâmico:</strong> Disparos espaçados com atrasos aleatórios entre{' '}
            <strong>{faixaIntervalo(cadencia)}</strong> para simular comportamento humano.
          </span>
        </div>
        <div className="flex items-center gap-3 rounded-lg bg-surface-2 p-3 text-[13px] text-ink">
          <Icon name="unsubscribe" size={20} className="shrink-0 text-tertiary" />
          <span>
            <strong>Opt-out Transparente:</strong> Toda mensagem acompanha nota de rodapé automática: <em>{`"${RODAPE_SAIR}"`}</em>
          </span>
        </div>
        {!conectado ? (
          <div className="flex items-center gap-3 rounded-lg bg-warning/10 p-3 text-[13px] text-warning-text">
            <Icon name="wifi_off" size={20} className="shrink-0" />
            <span>O WhatsApp está desconectado. As mensagens saem quando a conexão voltar.</span>
          </div>
        ) : null}
      </div>
    </section>
  );
}
