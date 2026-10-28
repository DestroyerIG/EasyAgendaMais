import Link from 'next/link';
import { Banner } from '@/components/ui';

export function FaixaContingencia({ diasRestantes }: { diasRestantes: number }) {
  const dias = `${diasRestantes} ${diasRestantes === 1 ? 'dia' : 'dias'}`;
  return (
    <Banner tone="warning">
      <span>
        <span className="font-semibold">Modo contingência · {dias} para regularizar</span>{' '}
        ·{' '}
        <Link href="/dashboard/assinatura" className="font-bold text-brand-text underline underline-offset-2">
          Regularizar
        </Link>
      </span>
    </Banner>
  );
}
