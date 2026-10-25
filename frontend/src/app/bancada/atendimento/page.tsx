import { Suspense } from 'react';
import { AtendimentoBancada } from '@/components/bancada/AtendimentoBancada';

export default function AtendimentoPage() {
  return (
    <Suspense fallback={null}>
      <AtendimentoBancada />
    </Suspense>
  );
}
