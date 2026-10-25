'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowLeft, ImageIcon, MessageCircle } from 'lucide-react';
import { Avatar, Button, Skeleton } from '@/components/ui';
import { useToast } from '@/components/Toast';
import { bancadaApi, type FichaRapida as Ficha } from '@/lib/bancada';
import { FASE_ROTULO, type Fase } from '@/lib/crm';
import { formatCurrency } from '@/lib/formatters';
import { getApiErrorMessage } from '@/utils/handleApiError';
import { ErroBancada } from './ErroBancada';

// Ficha rápida: o que a profissional precisa na bancada. Sem e-mail nem data de nascimento.

const dataBr = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;

export function FichaRapida({ clientId }: { clientId: string }) {
  const { showToast } = useToast();
  const [ficha, setFicha] = useState<Ficha | null>(null);
  const [erro, setErro] = useState<unknown>(null);
  const [nota, setNota] = useState('');
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(() => {
    setErro(null);
    bancadaApi.ficha(clientId)
      .then((f) => { setFicha(f); setNota(f.cliente.notes ?? ''); })
      .catch(setErro);
  }, [clientId]);

  useEffect(() => { carregar(); }, [carregar]);

  if (erro) return <ErroBancada erro={erro} onRetry={carregar} />;
  if (!ficha) {
    return (
      <div className="flex flex-col gap-3" aria-busy="true">
        <Skeleton className="h-24 w-full" /><Skeleton className="h-40 w-full" />
      </div>
    );
  }

  const { cliente, fichaTecnica: ft } = ficha;
  const campos = ft.campos
    .map((c) => ({ rotulo: c.label, valor: ft.fields[c.key] ?? '' }))
    .filter((c) => c.valor.trim() !== '')
    .concat(ft.customFields.map((c) => ({ rotulo: c.label, valor: c.value })));
  const notaMudou = (cliente.notes ?? '') !== nota;

  const salvarNota = async () => {
    setSalvando(true);
    try {
      const r = await bancadaApi.salvarNota(clientId, nota.trim() ? nota : null);
      setFicha({ ...ficha, cliente: { ...cliente, notes: r.notas } });
      showToast('Anotação salva.', 'success');
    } catch (e) {
      showToast(getApiErrorMessage(e, 'Não foi possível salvar a anotação.'), 'error');
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <Link href="/bancada" className="flex items-center gap-1 text-[13px] font-semibold text-muted hover:text-ink">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Voltar para a agenda
      </Link>

      <section className="flex items-center gap-3 rounded-card border border-line bg-surface p-4">
        <Avatar name={cliente.name} src={(cliente.avatarUrl as string | null | undefined) ?? null} size={52} />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-bold text-ink">{cliente.name}</h1>
          <p className="text-[13px] text-muted">
            {FASE_ROTULO[ficha.fase as Fase] ?? ficha.fase} · {ficha.indicadores.visitas} {ficha.indicadores.visitas === 1 ? 'visita' : 'visitas'}
            {ficha.indicadores.cicloMedio ? ` · volta a cada ${ficha.indicadores.cicloMedio} dias` : ''}
          </p>
        </div>
        <a href={`https://wa.me/${cliente.phone.replace(/\D/g, '')}`} target="_blank" rel="noreferrer"
          aria-label={`Conversar com ${cliente.name} no WhatsApp`}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-whatsapp/12 text-whatsapp">
          <MessageCircle className="h-5 w-5" aria-hidden="true" />
        </a>
      </section>

      {ft.allergies && (
        <p role="alert" className="flex items-start gap-2 rounded-card border border-danger/30 bg-danger/12 p-3 text-[14px] font-semibold text-danger">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> Alergia: {ft.allergies}
        </p>
      )}

      <section className="rounded-card border border-line bg-surface p-4">
        <h2 className="text-[15px] font-bold text-ink">Ficha técnica</h2>
        {campos.length === 0 ? (
          <p className="mt-2 text-[13px] text-muted">Ainda sem ficha técnica. A recepção preenche no painel.</p>
        ) : (
          <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-3 text-[14px]">
            {campos.map((c) => (
              <div key={c.rotulo} className="min-w-0">
                <dt className="text-[11px] font-semibold uppercase text-muted">{c.rotulo}</dt>
                <dd className="break-words text-ink">{c.valor}</dd>
              </div>
            ))}
          </dl>
        )}
      </section>

      <section className="rounded-card border border-line bg-surface p-4">
        <h2 className="text-[15px] font-bold text-ink">Fotos recentes</h2>
        {ficha.fotos.length === 0 ? (
          <p className="mt-2 flex items-center gap-2 text-[13px] text-muted">
            <ImageIcon className="h-4 w-4" aria-hidden="true" /> Sem fotos. Tire a do trabalho ao fechar o atendimento.
          </p>
        ) : (
          <ul className="mt-3 grid grid-cols-3 gap-2">
            {ficha.fotos.map((f) => f.url && (
              <li key={f.id}>
                {/* eslint-disable-next-line @next/next/no-img-element -- URL assinada do Storage */}
                <img src={f.url} alt={f.caption ?? f.serviceName ?? 'Foto do trabalho'} className="aspect-square w-full rounded-control object-cover" />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-card border border-line bg-surface p-4">
        <h2 className="text-[15px] font-bold text-ink">Últimas visitas com você</h2>
        {ficha.visitas.length === 0 ? (
          <p className="mt-2 text-[13px] text-muted">Primeira vez com você.</p>
        ) : (
          <ul className="mt-2 divide-y divide-line">
            {ficha.visitas.map((v) => (
              <li key={v.id} className="flex items-center justify-between gap-3 py-2 text-[14px]">
                <span className="min-w-0">
                  <span className="block truncate text-ink">{v.servicos}</span>
                  <span className="text-[12px] text-muted">{dataBr(v.data)}</span>
                </span>
                {v.valor !== null && <span className="shrink-0 tabular-nums text-muted">{formatCurrency(v.valor)}</span>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-card border border-line bg-surface p-4">
        <label htmlFor="nota-bancada" className="text-[15px] font-bold text-ink">Anotações</label>
        <textarea
          id="nota-bancada"
          value={nota}
          onChange={(e) => setNota(e.target.value)}
          maxLength={2000}
          rows={4}
          placeholder="Preferências, formato, o que funcionou..."
          className="mt-2 w-full rounded-control border border-line bg-surface p-3 text-[15px] text-ink"
        />
        <Button className="mt-2" variant="secondary" onClick={salvarNota} loading={salvando} disabled={!notaMudou}>
          Salvar anotação
        </Button>
      </section>
    </div>
  );
}
