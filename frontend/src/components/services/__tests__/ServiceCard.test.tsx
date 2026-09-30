import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ServiceCard } from '../ServiceCard';
import type { Service } from '@/types';

const service: Service = {
  id: 's1',
  business_id: 'b1',
  name: 'Coloração',
  price: 220,
  duration_minutes: 120,
  active: true,
  created_at: '2026-01-01T00:00:00.000Z',
};

describe('ServiceCard', () => {
  it('mostra a duração por extenso, não em minutos crus (pedido do usuário)', () => {
    render(<ServiceCard service={service} onEdit={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.getByText('2 horas')).toBeInTheDocument();
    expect(screen.queryByText('120 min')).not.toBeInTheDocument();
  });

  it('duração com minutos combina hora e minuto', () => {
    render(
      <ServiceCard
        service={{ ...service, duration_minutes: 80 }}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    expect(screen.getByText('1 hora e 20 min')).toBeInTheDocument();
  });
});
