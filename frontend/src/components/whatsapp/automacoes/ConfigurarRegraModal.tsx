'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Button, Field, Icon, Input, Modal } from '@/components/ui';
import { useToast } from '@/components/Toast';
import { cn } from '@/lib/cn';
import { getApiErrorMessage } from '@/utils/handleApiError';
import {
  atualizarRegra, EXEMPLO_VARIAVEIS, LIMITE_TEXTO_REGRA, ROTULO_REGRA,
  type ConfigRegras, type Regra, type RegraDto,
} from '@/lib/whatsappAutomacoes';
import { TextoWhatsApp } from '../retorno/PreviaConvite';

interface ConfigurarRegraModalProps {
  regra: RegraDto;
  aberto: boolean;
  /** Título do cartão (acompanha a config); sem ele, o nome curto da regra. */
  titulo?: string;
  nomeNegocio?: string;
  onFechar(): void;
  onSalvo(r: RegraDto): void;
}

type Config = ConfigRegras[Regra];

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Hora do lembrete na véspera: dentro da janela da fila (08:00–20:00). */
const horaDoLembreteValida = (hora: string) => HHMM.test(hora) && hora >= '08:00' && hora <= '20:00';

/** Mesmas regras de CONFIG_SCHEMA (automacoes.rules.ts); devolve a mensagem do campo inválido. */
function erroDaConfig(regra: Regra, config: Config): string | null {
  switch (regra) {
    case 'confirmacao': {
      const { hora } = config as ConfigRegras['confirmacao'];
      return HHMM.test(hora) && hora >= '08:00' && hora <= '12:00' ? null : 'Escolha um horário entre 08:00 e 12:00';
    }
    case 'retorno': {
      const { modo, dias } = config as ConfigRegras['retorno'];
      if (modo === 'ciclo') return null;
      return Number.isInteger(dias) && dias >= 7 && dias <= 180 ? null : 'Use de 7 a 180 dias';
    }
    case 'lembrete': {
      const { modo, hora } = config as ConfigRegras['lembrete'];
      return modo === '2h' || horaDoLembreteValida(hora) ? null : 'Escolha um horário entre 08:00 e 20:00';
    }
    case 'aniversario': {
      const presente = (config as ConfigRegras['aniversario']).presente.trim();
      return presente.length >= 1 && presente.length <= 80 ? null : 'Descreva o presente (até 80 caracteres)';
    }
    case 'avaliacao': {
      const link = ((config as ConfigRegras['avaliacao']).linkGoogle ?? '').trim();
      if (!link) return null;
      try {
        const url = new URL(link);
        return /^https?:$/.test(url.protocol) && link.length <= 500 ? null : 'Cole o link completo, começando com https://';
      } catch {
        return 'Cole o link completo, começando com https://';
      }
    }
    default:
      return null;
  }
}

/** A config como o backend espera: textos aparados e link vazio vira null. */
function configParaEnviar(regra: Regra, config: Config): Config {
  if (regra === 'aniversario') return { presente: (config as ConfigRegras['aniversario']).presente.trim() };
  if (regra === 'lembrete') {
    // No modo 2h a hora não aparece; se ficou inválida na véspera, volta ao padrão para o backend aceitar.
    const c = config as ConfigRegras['lembrete'];
    return c.modo === '2h' && !horaDoLembreteValida(c.hora) ? { ...c, hora: '18:00' } : c;
  }
  if (regra === 'avaliacao') {
    const c = config as ConfigRegras['avaliacao'];
    return { horas: c.horas, linkGoogle: c.linkGoogle?.trim() || null };
  }
  return config;
}

/** Variáveis da prévia: os dados de exemplo, com o que a config muda. */
function variaveisDaPrevia(regra: Regra, config: Config, negocio: string): Record<string, string> {
  const vars: Record<string, string> = { ...EXEMPLO_VARIAVEIS, negocio };
  if (regra === 'sinal_pix') vars.prazo = String((config as ConfigRegras['sinal_pix']).toleranciaMin);
  if (regra === 'retorno') {
    const c = config as ConfigRegras['retorno'];
    if (c.modo === 'dias' && Number.isInteger(c.dias)) vars.dias = String(c.dias);
  }
  if (regra === 'aniversario') vars.presente = (config as ConfigRegras['aniversario']).presente.trim() || vars.presente || '';
  return vars;
}

const preencher = (texto: string, vars: Record<string, string>) =>
  texto.replace(/\{(\w+)\}/g, (original, chave: string) => vars[chave] ?? original);

interface OpcoesProps<T extends string | number> {
  id: string;
  rotulo: string;
  valor: T;
  opcoes: Array<{ valor: T; texto: string }>;
  onMudar(v: T): void;
}

/** Botões segmentados com semântica de rádio. */
function Opcoes<T extends string | number>({ id, rotulo, valor, opcoes, onMudar }: OpcoesProps<T>) {
  return (
    <div className="flex flex-col gap-1.5">
      <span id={id} className="text-[13px] font-semibold text-ink">{rotulo}</span>
      <div role="radiogroup" aria-labelledby={id} className="flex flex-wrap gap-1 rounded-control bg-surface-m3-low p-1">
        {opcoes.map((o) => {
          const marcada = o.valor === valor;
          return (
            <button
              key={String(o.valor)}
              type="button"
              role="radio"
              aria-checked={marcada}
              onClick={() => onMudar(o.valor)}
              className={cn(
                'min-h-11 flex-1 rounded-lg px-3 text-[13px] font-bold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand lg:min-h-9',
                marcada ? 'bg-surface text-ink shadow-sm' : 'text-muted hover:text-ink',
              )}
            >
              {o.texto}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Secao({ titulo, icone, children }: { titulo: string; icone: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4">
      <h3 className="flex items-center gap-1.5 text-[13px] font-bold uppercase tracking-wider text-muted">
        <Icon name={icone} size={18} className="text-whatsapp" />
        {titulo}
      </h3>
      {children}
    </section>
  );
}

interface CamposProps {
  regra: Regra;
  config: Config;
  erro: string | null;
  onMudar(parcial: Partial<Config>): void;
}

function CamposDaRegra({ regra, config, erro, onMudar }: CamposProps) {
  const e = erro ?? undefined;
  switch (regra) {
    case 'confirmacao': {
      const c = config as ConfigRegras['confirmacao'];
      return (
        <Field id="cfg-hora" label="Horário do envio" hint="Na véspera do atendimento, entre 08:00 e 12:00." error={e}>
          <Input id="cfg-hora" type="time" min="08:00" max="12:00" step={300} value={c.hora} invalid={!!e}
            onChange={(ev) => onMudar({ hora: ev.target.value })} />
        </Field>
      );
    }
    case 'sinal_pix': {
      const c = config as ConfigRegras['sinal_pix'];
      return (
        <Opcoes id="cfg-tolerancia" rotulo="Tolerância para pagar o sinal" valor={c.toleranciaMin}
          opcoes={[15, 30, 60].map((m) => ({ valor: m as 15 | 30 | 60, texto: `${m} min` }))}
          onMudar={(toleranciaMin) => onMudar({ toleranciaMin })} />
      );
    }
    case 'retorno': {
      const c = config as ConfigRegras['retorno'];
      return (
        <>
          <Opcoes id="cfg-retorno" rotulo="Quando convidar a cliente" valor={c.modo}
            opcoes={[{ valor: 'ciclo', texto: 'No ciclo da cliente' }, { valor: 'dias', texto: 'Personalizado' }]}
            onMudar={(modo) => onMudar({ modo })} />
          {c.modo === 'dias' ? (
            <Field id="cfg-dias" label="Dias desde a última visita" hint="De 7 a 180 dias." error={e}>
              <Input id="cfg-dias" type="number" inputMode="numeric" min={7} max={180} invalid={!!e}
                value={Number.isNaN(c.dias) ? '' : c.dias}
                onChange={(ev) => onMudar({ dias: ev.target.value === '' ? Number.NaN : Number(ev.target.value) })} />
            </Field>
          ) : (
            <p className="text-[13px] text-muted">Usa o intervalo médio entre as visitas de cada cliente.</p>
          )}
        </>
      );
    }
    case 'lista_espera': {
      const c = config as ConfigRegras['lista_espera'];
      return (
        <Opcoes id="cfg-quantas" rotulo="Avisar quantas clientes da fila" valor={c.quantas}
          opcoes={[{ valor: 1 as const, texto: 'A primeira' }, { valor: 3 as const, texto: '3 primeiras' }, { valor: 5 as const, texto: '5 primeiras' }]}
          onMudar={(quantas) => onMudar({ quantas })} />
      );
    }
    case 'lembrete': {
      const c = config as ConfigRegras['lembrete'];
      return (
        <>
          <Opcoes id="cfg-lembrete" rotulo="Quando lembrar" valor={c.modo}
            opcoes={[{ valor: '2h', texto: '2 horas antes' }, { valor: 'vespera', texto: 'Véspera às' }]}
            onMudar={(modo) => onMudar({ modo })} />
          {c.modo === 'vespera' ? (
            <Field id="cfg-hora-lembrete" label="Horário do lembrete" hint="Entre 08:00 e 20:00." error={e}>
              <Input id="cfg-hora-lembrete" type="time" min="08:00" max="20:00" step={300} value={c.hora} invalid={!!e}
                onChange={(ev) => onMudar({ hora: ev.target.value })} />
            </Field>
          ) : null}
        </>
      );
    }
    case 'aniversario': {
      const c = config as ConfigRegras['aniversario'];
      return (
        <Field id="cfg-presente" label="Presente" hint="Entra no lugar de {presente} na mensagem." error={e}>
          <Input id="cfg-presente" maxLength={80} value={c.presente} invalid={!!e}
            onChange={(ev) => onMudar({ presente: ev.target.value })} />
        </Field>
      );
    }
    case 'avaliacao': {
      const c = config as ConfigRegras['avaliacao'];
      return (
        <>
          <Opcoes id="cfg-horas" rotulo="Enviar depois do checkout" valor={c.horas}
            opcoes={[1, 2, 4].map((h) => ({ valor: h as 1 | 2 | 4, texto: `${h} h` }))}
            onMudar={(horas) => onMudar({ horas })} />
          <Field id="cfg-google" label="Link de avaliação do Google" hint="Quem der nota 5 recebe este link. Opcional." error={e}>
            <Input id="cfg-google" type="url" inputMode="url" maxLength={500} placeholder="https://g.page/r/..." invalid={!!e}
              value={c.linkGoogle ?? ''} onChange={(ev) => onMudar({ linkGoogle: ev.target.value })} />
          </Field>
        </>
      );
    }
    default:
      return null;
  }
}

const horaAgora = () =>
  new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date());

function PreviaBalao({ texto, nomeNegocio }: { texto: string; nomeNegocio: string }) {
  return (
    <div className="flex flex-col overflow-hidden rounded-2xl bg-surface-2 shadow-md">
      <div className="flex items-center gap-2 bg-whatsapp px-4 py-3 text-surface shadow-sm">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface text-brand-text shadow-sm">
          <Icon name="spa" size={20} />
        </span>
        <div className="flex min-w-0 flex-col leading-tight">
          <span className="truncate text-[13px] font-bold">{nomeNegocio}</span>
          <span className="text-[11px] opacity-80">online</span>
        </div>
      </div>
      <div className="flex min-h-[220px] flex-col gap-2 bg-whatsapp-chat p-4">
        <span className="mb-2 self-center rounded-md bg-surface/80 px-2 py-0.5 text-[11px] font-medium text-muted shadow-sm">HOJE</span>
        {texto.trim() ? (
          <div className="flex max-w-[92%] flex-col gap-1 self-end rounded-xl rounded-tr-sm bg-whatsapp-bubble p-3 shadow-sm">
            <p className="whitespace-pre-wrap break-words text-[13.5px] leading-relaxed text-ink"><TextoWhatsApp texto={texto} /></p>
            <div className="flex items-center justify-end gap-1 text-[10px] text-muted">
              <span>{horaAgora()}</span>
              <Icon name="done_all" size={14} className="text-whatsapp" />
            </div>
          </div>
        ) : (
          <p className="self-center text-center text-[13px] text-muted">Escreva a mensagem para ver a prévia.</p>
        )}
      </div>
    </div>
  );
}

export function ConfigurarRegraModal({ regra, aberto, titulo, nomeNegocio = 'Seu negócio', onFechar, onSalvo }: ConfigurarRegraModalProps) {
  const { showToast } = useToast();
  const [texto, setTexto] = useState(regra.texto);
  const [config, setConfig] = useState<Config>(regra.config);
  const [salvando, setSalvando] = useState(false);
  const salvandoRef = useRef(false);
  const caixaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!aberto) return;
    setTexto(regra.texto);
    setConfig(regra.config);
  }, [aberto, regra]);

  const erro = erroDaConfig(regra.regra, config);
  const textoInvalido = texto.trim().length === 0 || texto.length > LIMITE_TEXTO_REGRA;
  const ehPadrao = texto.trim() === regra.textoPadrao.trim();
  // O texto padrão do lembrete muda com o modo; o novo só aparece depois de salvar.
  const lembreteMudaPadrao = regra.regra === 'lembrete' && ehPadrao
    && (config as ConfigRegras['lembrete']).modo !== (regra.config as ConfigRegras['lembrete']).modo;

  const inserirVariavel = (nome: string) => {
    const token = `{${nome}}`;
    const caixa = caixaRef.current;
    const inicio = caixa?.selectionStart ?? texto.length;
    const fim = caixa?.selectionEnd ?? inicio;
    const novo = texto.slice(0, inicio) + token + texto.slice(fim);
    if (novo.length > LIMITE_TEXTO_REGRA) return;
    setTexto(novo);
    const cursor = inicio + token.length;
    requestAnimationFrame(() => {
      caixa?.focus();
      caixa?.setSelectionRange(cursor, cursor);
    });
  };

  const salvar = async () => {
    if (salvandoRef.current || erro || textoInvalido) return;
    salvandoRef.current = true;
    setSalvando(true);
    try {
      // Igual ao padrão vira null: a regra volta a seguir o texto padrão (inclusive o do modo do lembrete).
      const nova = await atualizarRegra(regra.regra, { texto: ehPadrao ? null : texto, config: configParaEnviar(regra.regra, config) });
      showToast('Automação salva.', 'success');
      onSalvo(nova);
    } catch (e) {
      showToast(getApiErrorMessage(e, 'Não foi possível salvar a automação.'), 'error');
    } finally {
      salvandoRef.current = false;
      setSalvando(false);
    }
  };

  return (
    <Modal
      isOpen={aberto}
      onClose={onFechar}
      title={titulo ?? ROTULO_REGRA[regra.regra]}
      icon="tune"
      size="xl"
      footer={(
        <>
          <Button variant="secondary" onClick={onFechar} disabled={salvando}>Cancelar</Button>
          <Button variant="whatsapp" onClick={() => void salvar()} loading={salvando} disabled={!!erro || textoInvalido}>Salvar</Button>
        </>
      )}
    >
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex flex-col gap-4">
          <Secao titulo="Mensagem" icone="chat">
            <div className="flex flex-wrap gap-1.5" aria-label="Variáveis disponíveis" role="group">
              {regra.variaveis.map((v) => (
                <button
                  key={v}
                  type="button"
                  onMouseDown={(ev) => ev.preventDefault()}
                  onClick={() => inserirVariavel(v)}
                  className="min-h-9 rounded-full bg-whatsapp/12 px-2.5 font-mono text-[12px] font-semibold text-whatsapp transition-colors hover:bg-whatsapp/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand"
                >
                  {`{${v}}`}
                </button>
              ))}
            </div>
            <label htmlFor="cfg-texto" className="sr-only">Texto da mensagem</label>
            <textarea
              id="cfg-texto"
              ref={caixaRef}
              value={texto}
              maxLength={LIMITE_TEXTO_REGRA}
              onChange={(ev) => setTexto(ev.target.value)}
              rows={7}
              className="w-full resize-y rounded-xl bg-surface-m3-low p-3 text-[14px] leading-relaxed text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand"
            />
            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted">
              <span className="font-semibold">{`${texto.length} caracteres`}</span>
              <button
                type="button"
                onClick={() => setTexto(regra.textoPadrao)}
                disabled={texto === regra.textoPadrao}
                className="inline-flex min-h-9 items-center gap-1 rounded text-[12px] font-bold text-ink transition-colors hover:text-brand-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Icon name="restart_alt" size={16} />
                Restaurar texto padrão
              </button>
            </div>
            {texto.trim().length === 0 ? (
              <p role="alert" className="text-[13px] font-semibold text-danger">Escreva a mensagem.</p>
            ) : null}
            {lembreteMudaPadrao ? (
              <p className="text-[13px] text-muted">O texto padrão muda com o modo do lembrete: o novo aparece depois de salvar.</p>
            ) : null}
          </Secao>
          <Secao titulo="Quando enviar" icone="schedule">
            <CamposDaRegra regra={regra.regra} config={config} erro={erro}
              onMudar={(parcial) => setConfig((atual) => ({ ...atual, ...parcial }) as Config)} />
          </Secao>
        </div>
        <aside aria-label="Prévia da mensagem" className="flex flex-col gap-2">
          <div className="flex items-center gap-1.5">
            <Icon name="visibility" size={18} className="text-whatsapp" />
            <span className="text-[13px] font-bold text-ink">Prévia no WhatsApp</span>
          </div>
          <PreviaBalao texto={preencher(texto, variaveisDaPrevia(regra.regra, config, nomeNegocio))} nomeNegocio={nomeNegocio} />
          <p className="text-[11px] font-semibold text-muted">Simulação com dados de exemplo.</p>
        </aside>
      </div>
    </Modal>
  );
}
