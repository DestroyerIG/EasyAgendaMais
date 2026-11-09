import type { MetadataRoute } from 'next';
import { siteUrl } from '@/lib/siteUrl';

export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteUrl();
  const paginas: Array<{ caminho: string; prioridade: number }> = [
    { caminho: '', prioridade: 1 },
    { caminho: '/nail-designers', prioridade: 0.8 },
    { caminho: '/cadastro', prioridade: 0.7 },
    { caminho: '/login', prioridade: 0.5 },
    { caminho: '/privacidade', prioridade: 0.3 },
    { caminho: '/termos', prioridade: 0.3 },
  ];
  return paginas.map(({ caminho, prioridade }) => ({
    url: `${base}${caminho}`,
    changeFrequency: 'monthly',
    priority: prioridade,
  }));
}
