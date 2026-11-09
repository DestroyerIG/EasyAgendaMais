import type { MetadataRoute } from 'next';
import { siteUrl } from '@/lib/siteUrl';

// Libera as páginas públicas e bloqueia o painel, a API e os links com token.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/dashboard',
          '/admin',
          '/bancada',
          '/api/',
          '/auth/',
          '/onboarding',
          '/convite/',
          '/avaliar/',
          '/pagamento',
          '/verificar-email',
          '/esqueci-senha',
          '/dev',
        ],
      },
    ],
    sitemap: `${siteUrl()}/sitemap.xml`,
    host: siteUrl(),
  };
}
