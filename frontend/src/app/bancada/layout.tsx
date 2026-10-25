import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { BancadaShell } from '@/components/bancada/BancadaShell';

export const metadata: Metadata = {
  title: 'Bancada · EasyAgenda+',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'Bancada', statusBarStyle: 'default' },
  icons: { apple: '/icons/apple-touch-icon.png' },
};

export const viewport: Viewport = { themeColor: '#FF7A00', viewportFit: 'cover' };

export default function BancadaLayout({ children }: { children: ReactNode }) {
  return <BancadaShell>{children}</BancadaShell>;
}
