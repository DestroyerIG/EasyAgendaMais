import type { MetadataRoute } from 'next';

// PWA do app da profissional (fase 5). Abre direto na bancada; o painel segue no navegador.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'EasyAgenda+ Bancada',
    short_name: 'Bancada',
    description: 'Sua agenda, suas clientes e seus números no EasyAgenda+.',
    id: '/bancada',
    start_url: '/bancada',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#1A1817',
    theme_color: '#FF7A00',
    lang: 'pt-BR',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
