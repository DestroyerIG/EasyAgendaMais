'use client';

import { useEffect, useRef, useState } from 'react';
import { Button, Field, Icon, Input } from '@/components/ui';
import { CascaOnboarding } from './CascaOnboarding';
import { businessPublicPageApi } from '@/lib/businessPublicPage';
import { getApiErrorMessage } from '@/utils/handleApiError';
import { useToast } from '@/components/Toast';
import { useVocabulario } from '@/hooks/useVocabulario';
import { cn } from '@/lib/cn';

const CORES = [
  { hex: '#FF7A00', nome: 'Laranja' }, { hex: '#E11D74', nome: 'Rosa' }, { hex: '#C2562F', nome: 'Terracota' },
  { hex: '#6B7F3A', nome: 'Oliva' }, { hex: '#8B6CC9', nome: 'Lavanda' }, { hex: '#B8892B', nome: 'Dourado' }, { hex: '#374151', nome: 'Grafite' },
];
const MAX_FOTOS = 6;
const SLUG_VALIDO = /^[a-z0-9-]{3,100}$/;

type Disponibilidade = 'idle' | 'checando' | 'livre' | 'ocupado' | 'invalido';

export function EtapaPagina({ slugInicial, onVoltar, onContinuar }: {
  slugInicial: string; onVoltar: () => void; onContinuar: (publicada: boolean) => void;
}) {
  const { showToast } = useToast();
  const { cli } = useVocabulario();
  const [slug, setSlug] = useState(slugInicial);
  const [slugSalvo, setSlugSalvo] = useState<string | null>(null);
  const [disp, setDisp] = useState<Disponibilidade>('idle');
  const [logo, setLogo] = useState<string | null>(null);
  const [cor, setCor] = useState(CORES[0]!.hex);
  const [fotos, setFotos] = useState<string[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const inputLogo = useRef<HTMLInputElement>(null);
  const inputFotos = useRef<HTMLInputElement>(null);

  // Retoma o que já foi salvo (quem voltou para esta etapa).
  useEffect(() => {
    businessPublicPageApi.getSettings().then((s) => {
      if (s.slug) { setSlug(s.slug); setSlugSalvo(s.slug); }
      if (s.logoUrl) setLogo(s.logoUrl);
      if (s.brandColor) setCor(s.brandColor);
      setFotos(s.galleryPhotos ?? []);
    }).catch(() => { /* começa do sugerido */ });
  }, []);

  useEffect(() => {
    if (!SLUG_VALIDO.test(slug)) { setDisp('invalido'); return; }
    if (slug === slugSalvo) { setDisp('livre'); return; }
    setDisp('checando');
    const t = setTimeout(() => {
      businessPublicPageApi.checkSlugAvailability(slug)
        .then((livre) => setDisp(livre ? 'livre' : 'ocupado'))
        .catch(() => setDisp('idle'));
    }, 400);
    return () => clearTimeout(t);
  }, [slug, slugSalvo]);

  const enviar = async (arquivos: FileList | null, tipo: 'logo' | 'fotos') => {
    if (!arquivos?.length) return;
    setEnviando(true);
    try {
      if (tipo === 'logo') setLogo(await businessPublicPageApi.uploadImage(arquivos[0]!));
      else {
        const livres = MAX_FOTOS - fotos.length;
        const urls = await Promise.all(Array.from(arquivos).slice(0, livres).map((f) => businessPublicPageApi.uploadImage(f)));
        setFotos((x) => [...x, ...urls].slice(0, MAX_FOTOS));
      }
    } catch (e) {
      showToast(getApiErrorMessage(e, 'Não foi possível enviar a imagem.'), 'error');
    } finally {
      setEnviando(false);
    }
  };

  const salvar = async () => {
    setSalvando(true);
    try {
      await businessPublicPageApi.updateSettings({ slug, brandColor: cor, galleryPhotos: fotos, ...(logo ? { logoUrl: logo } : {}) });
      onContinuar(true);
    } catch (e) {
      showToast(getApiErrorMessage(e, 'Não foi possível salvar a página.'), 'error');
    } finally {
      setSalvando(false);
    }
  };

  const origem = typeof window !== 'undefined' ? window.location.origin : '';

  return (
    <CascaOnboarding
      etapa={4}
      titulo={`Personalize a página que ${cli.g('suas', 'seus')} ${cli.p} vão ver`}
      descricao={`É por esse link que ${cli.osP} escolhem o horário, pagam o sinal e recebem a confirmação no WhatsApp.`}
      rodape={(
        <>
          <Button variant="ghost" onClick={onVoltar}><Icon name="arrow_back" size={18} /> Voltar</Button>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => onContinuar(false)}>Pular por enquanto</Button>
            <Button disabled={disp !== 'livre' || enviando} loading={salvando} onClick={() => void salvar()}>
              Salvar e continuar <Icon name="arrow_forward" size={18} />
            </Button>
          </div>
        </>
      )}
    >
      <Field
        id="onb-slug"
        label="Endereço da sua página"
        hint={`${origem}/agendar/${slug || 'seu-negocio'}`}
        error={disp === 'ocupado' ? 'Este endereço já está em uso.' : disp === 'invalido' ? 'Use de 3 a 100 letras minúsculas, números ou hífen.' : undefined}
      >
        <Input id="onb-slug" value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))} />
      </Field>

      <section className="flex flex-wrap items-center gap-4 rounded-card border border-line bg-surface p-4">
        <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-card bg-surface-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {logo ? <img src={logo} alt="Logo" className="h-full w-full object-cover" /> : <Icon name="storefront" size={32} className="text-muted" />}
        </div>
        <div className="flex-1">
          <h2 className="font-bold text-ink">Logo ou foto do seu espaço</h2>
          <p className="text-[13px] text-muted">Aparece no topo da página. PNG, JPG ou WebP.</p>
        </div>
        <input ref={inputLogo} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => void enviar(e.target.files, 'logo')} />
        <Button variant="secondary" disabled={enviando} onClick={() => inputLogo.current?.click()}>{logo ? 'Trocar imagem' : 'Enviar logo'}</Button>
      </section>

      <section>
        <h2 className="font-bold text-ink">Cor de destaque</h2>
        <p className="text-[13px] text-muted">Usada nos botões e no cabeçalho da sua página.</p>
        <div className="mt-3 flex flex-wrap gap-3" role="radiogroup" aria-label="Cor de destaque">
          {CORES.map((c) => (
            <button
              key={c.hex}
              type="button"
              role="radio"
              aria-checked={cor.toLowerCase() === c.hex.toLowerCase()}
              aria-label={c.nome}
              onClick={() => setCor(c.hex)}
              className={cn('h-10 w-10 rounded-full border-2', cor.toLowerCase() === c.hex.toLowerCase() ? 'border-ink' : 'border-transparent')}
              style={{ backgroundColor: c.hex }}
            />
          ))}
        </div>
      </section>

      <section>
        <h2 className="font-bold text-ink">Fotos dos seus trabalhos</h2>
        <p className="text-[13px] text-muted">Até {MAX_FOTOS} fotos. Quem vê fotos agenda com mais confiança.</p>
        <div className="mt-3 grid grid-cols-3 gap-3 sm:grid-cols-6">
          {fotos.map((f) => (
            <div key={f} className="relative aspect-square overflow-hidden rounded-control bg-surface-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={f} alt="" className="h-full w-full object-cover" />
              <button
                type="button" aria-label="Remover foto" onClick={() => setFotos((x) => x.filter((y) => y !== f))}
                className="absolute right-1 top-1 rounded-full bg-ink/70 p-0.5 text-on-brand"
              >
                <Icon name="close" size={16} />
              </button>
            </div>
          ))}
          {fotos.length < MAX_FOTOS && (
            <button
              type="button" disabled={enviando} onClick={() => inputFotos.current?.click()}
              className="flex aspect-square items-center justify-center rounded-control border border-dashed border-line text-muted hover:border-brand"
              aria-label="Adicionar fotos"
            >
              <Icon name="add_photo_alternate" size={26} />
            </button>
          )}
        </div>
        <input ref={inputFotos} type="file" multiple accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => void enviar(e.target.files, 'fotos')} />
      </section>
    </CascaOnboarding>
  );
}
