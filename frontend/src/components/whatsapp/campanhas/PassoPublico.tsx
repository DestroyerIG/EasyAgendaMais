'use client';

import { Field, Icon, Select } from '@/components/ui';
import {
  ROTULO_SEGMENTO, type OpcoesCampanhaDto, type PublicoDto, type Segmento,
} from '@/lib/whatsappCampanhas';
import { CabecalhoPasso, plural } from './comum';
import { useVocabulario } from '@/hooks/useVocabulario';

interface PassoPublicoProps {
  segmento: Segmento;
  professionalId: string | null;
  serviceId: string | null;
  opcoes: OpcoesCampanhaDto;
  publico: PublicoDto | null;
  erroPublico: boolean;
  onMudar(parcial: { segmento?: Segmento; professionalId?: string | null; serviceId?: string | null }): void;
}

const SEGMENTOS = Object.keys(ROTULO_SEGMENTO) as Segmento[];

export function PassoPublico({ segmento, professionalId, serviceId, opcoes, publico, erroPublico, onMudar }: PassoPublicoProps) {
  const { prof, cli } = useVocabulario();
  return (
    <section aria-labelledby="passo-publico" className="flex flex-col gap-4 rounded-xl bg-surface p-4 shadow-sm sm:p-6">
      <CabecalhoPasso numero={1} id="passo-publico" titulo="Definição do Público-alvo">
        <span className="flex items-center gap-1 rounded-full bg-whatsapp/10 px-2 py-1 text-[11px] font-bold text-whatsapp">
          <span className="h-1.5 w-1.5 rounded-full bg-whatsapp" aria-hidden="true" />
          Segmentado
        </span>
      </CabecalhoPasso>

      <Field id="camp-segmento" label={`Segmento inteligente de ${cli.p}`}>
        <Select id="camp-segmento" value={segmento} onChange={(e) => onMudar({ segmento: e.target.value as Segmento })}>
          {SEGMENTOS.map((s) => <option key={s} value={s}>{ROTULO_SEGMENTO[s]}</option>)}
        </Select>
      </Field>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field id="camp-profissional" label={`${prof.S} de preferência`}>
          <Select id="camp-profissional" value={professionalId ?? ''} onChange={(e) => onMudar({ professionalId: e.target.value || null })}>
            <option value="">Qualquer {prof.s}</option>
            {opcoes.profissionais.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
          </Select>
        </Field>
        <Field id="camp-servico" label="Último serviço realizado">
          <Select id="camp-servico" value={serviceId ?? ''} onChange={(e) => onMudar({ serviceId: e.target.value || null })}>
            <option value="">Todos os serviços</option>
            {opcoes.servicos.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
          </Select>
        </Field>
      </div>

      <div className="flex flex-col gap-2 rounded-xl bg-surface-m3-low p-4" aria-live="polite">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-[15px] text-ink">{cli.P} {cli.g('qualificadas', 'qualificados')} no filtro:</span>
          <span className="text-[17px] font-bold text-ink">
            {publico ? `${publico.selecionadas} selecionadas` : erroPublico ? '—' : 'Calculando...'}
          </span>
        </div>
        <div className="my-1 h-px bg-line" />
        {erroPublico ? (
          <p className="text-[13px] font-semibold text-danger">Não foi possível calcular o público. Tente mudar o filtro de novo.</p>
        ) : publico ? (
          <div className="flex items-start gap-2 text-whatsapp">
            <Icon name="verified_user" size={18} className="mt-0.5 shrink-0" />
            <p className="text-[13px] font-medium leading-relaxed text-ink">
              <strong className="font-bold text-whatsapp">
                {`✓ ${publico.receberao} ${plural(publico.receberao, cli.s, cli.p)} com consentimento ativo`}
              </strong>
              {` ${plural(publico.receberao, 'receberá', 'receberão')} este disparo (${publico.resguardadas} ${plural(publico.resguardadas, 'contato foi resguardado', 'contatos foram resguardados')} por restrição de opt-out).`}
            </p>
          </div>
        ) : null}
      </div>
    </section>
  );
}
