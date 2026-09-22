'use client';

import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { Banner } from '@/components/ui';

export function TrialBanner() {
  const { user } = useAuth();

  if (user?.subscriptionStatus !== 'trialing' || !user.subscriptionCurrentPeriodEnd) {
    return null;
  }

  const endsAt = new Date(user.subscriptionCurrentPeriodEnd);
  const daysLeft = Math.max(0, Math.ceil((endsAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
  const linkClass = 'font-bold text-brand-text underline underline-offset-2';

  return (
    <Banner tone="warning">
      {daysLeft > 0 ? (
        <span>
          <span className="font-semibold">
            {daysLeft} {daysLeft === 1 ? 'dia restante' : 'dias restantes'}
          </span>{' '}
          no período gratuito · <Link href="/planos" className={linkClass}>Assine agora</Link> para não perder o acesso
        </span>
      ) : (
        <span>
          Seu período gratuito encerrou · <Link href="/planos" className={linkClass}>Escolha um plano</Link>
        </span>
      )}
    </Banner>
  );
}
