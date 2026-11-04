import { BACKEND_URL } from './proxy';

export type Testimonial = {
  quote: string;
  name: string;
  business: string;
  city: string;
  rating: number;
  logoUrl: string | null;
};

type DepoimentoPublico = {
  texto: string;
  nota: number;
  nomeExibido: string;
  negocio: string;
  cidade: string;
  logoUrl: string | null;
};

/** Depoimentos publicados (rota pública do backend). Qualquer falha devolve [] e a landing segue sem a seção. */
export async function buscarDepoimentosPublicos(): Promise<Testimonial[]> {
  try {
    const res = await fetch(`${BACKEND_URL}/depoimentos/publicos`, { next: { revalidate: 300 } });
    if (!res.ok) return [];
    const json = (await res.json()) as { data?: unknown };
    if (!Array.isArray(json?.data)) return [];
    return (json.data as DepoimentoPublico[]).map((d) => ({
      quote: d.texto,
      rating: d.nota,
      name: d.nomeExibido,
      business: d.negocio,
      city: d.cidade,
      logoUrl: d.logoUrl ?? null,
    }));
  } catch {
    return [];
  }
}
