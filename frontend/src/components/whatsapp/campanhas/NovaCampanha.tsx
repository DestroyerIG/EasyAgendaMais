'use client';

import { Button } from '@/components/ui';
import type { CampanhaDto } from '@/lib/whatsappCampanhas';

interface NovaCampanhaProps {
  campanha?: CampanhaDto;
  onFechar: (recarregar: boolean) => void;
}

// Placeholder: a criação/edição chega na Task 7.
export function NovaCampanha({ onFechar }: NovaCampanhaProps) {
  return <Button variant="secondary" onClick={() => onFechar(false)}>Voltar</Button>;
}
