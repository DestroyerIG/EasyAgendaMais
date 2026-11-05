'use client';

import { Icon } from '@/components/ui';
import type { StorefrontDto } from '@/lib/publicBooking';
import { iniciais } from './CascaPublica';

export function PerfilNegocio({
  storefront,
  especialidade,
  semServicos,
}: {
  storefront: StorefrontDto;
  especialidade: string | null;
  semServicos: string | null;
}) {
  const { name, logoUrl, galleryPhotos, address } = storefront;
  const capa = galleryPhotos[0];

  return (
    <div className="flex flex-col pb-6">
      <div className="relative">
        <div className="relative h-44 overflow-hidden rounded-b-card bg-gradient-to-br from-brand to-brand-text">
          {capa && (
            // eslint-disable-next-line @next/next/no-img-element -- galeria vem de URL externa (Supabase Storage), sem domínio pro next/image otimizar
            <img src={capa} alt="" className="h-full w-full object-cover" />
          )}
          <div className="absolute inset-0 bg-gradient-to-b from-ink/20 via-transparent to-ink/40" />
        </div>
        <div className="absolute -bottom-10 left-4 flex h-20 w-20 items-center justify-center rounded-full bg-surface p-1 shadow-md">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- URL externa (Supabase Storage), sem domínio pro next/image otimizar
            <img src={logoUrl} alt="" className="h-full w-full rounded-full object-cover" />
          ) : (
            <span aria-hidden="true" className="flex h-full w-full items-center justify-center rounded-full bg-surface-2 text-[22px] font-bold text-brand-text">
              {iniciais(name)}
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-2 px-4 pt-12">
        <div>
          <h1 className="text-[24px] font-bold leading-tight tracking-tight text-ink">{name}</h1>
          {especialidade && <p className="text-sm text-muted">{especialidade}</p>}
        </div>
        <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-success/10 px-2.5 py-1 text-[13px] font-semibold text-success-text">
          <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-success" />
          Agendamento online
        </span>
      </div>

      {semServicos && <p className="mx-4 mt-4 rounded-card border border-line bg-surface p-4 text-sm text-muted">{semServicos}</p>}

      {galleryPhotos.length > 0 && (
        <section className="mt-6 flex flex-col gap-2 px-4">
          <div className="flex items-center justify-between">
            <h2 className="text-[17px] font-bold text-ink">Trabalhos recentes</h2>
            <span className="text-[13px] font-semibold text-brand-text">
              {galleryPhotos.length} {galleryPhotos.length === 1 ? 'foto' : 'fotos'}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {galleryPhotos.map((url, index) => (
              // eslint-disable-next-line @next/next/no-img-element -- galeria vem de URL externa (Supabase Storage), sem domínio pro next/image otimizar
              <img
                key={url}
                src={url}
                alt={`Trabalho realizado ${index + 1}`}
                className="aspect-square w-full rounded-card bg-surface-2 object-cover shadow-sm"
              />
            ))}
          </div>
        </section>
      )}

      {address && (
        <section className="mx-4 mt-6 flex flex-col gap-2 rounded-card bg-surface p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-[13px] font-bold uppercase tracking-wide text-ink">Localização</h2>
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 items-center gap-0.5 text-[13px] font-semibold text-brand-text"
            >
              Como chegar
              <Icon name="open_in_new" size={14} />
            </a>
          </div>
          <p className="text-sm leading-tight text-muted">{address}</p>
          <iframe
            title="Localização do negócio"
            src={`https://maps.google.com/maps?q=${encodeURIComponent(address)}&output=embed`}
            className="h-28 w-full rounded-control border-0"
            loading="lazy"
          />
        </section>
      )}

      <p className="mt-6 px-4 text-center text-[13px] text-muted">Agendamento rápido · Sem necessidade de criar conta</p>
    </div>
  );
}
