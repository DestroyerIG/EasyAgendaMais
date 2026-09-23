'use client';

import { Card, ThemeSelect } from '@/components/ui';

export function AppearanceSection() {
  return (
    <Card className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-ink">Aparência</h2>
        <p className="mt-1 text-[15px] text-muted">O tema segue o seu aparelho quando está em Sistema.</p>
      </div>

      <ThemeSelect />
    </Card>
  );
}
