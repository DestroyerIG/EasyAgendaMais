import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EstadoConta } from '@/lib/conta';
import { BancadaShell } from '../BancadaShell';

const estado = vi.hoisted(() => ({ atual: null as EstadoConta | null }));
vi.mock('@/hooks/useEstadoConta', () => ({ useEstadoConta: () => ({ estado: estado.atual, recarregar: vi.fn() }) }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ logout: vi.fn() }) }));
vi.mock('@/hooks/useRequireRole', () => ({
  useRequireRole: () => ({ isChecking: false, isAuthorized: true, user: { businessName: 'Studio Aurora' } }),
}));
vi.mock('@/lib/push', () => ({ registrarServiceWorker: vi.fn() }));
vi.mock('next/navigation', () => ({ usePathname: () => '/bancada' }));

const AVISO = 'A agenda está pausada. Fale com a responsável pelo estabelecimento.';

describe('BancadaShell na contingência', () => {
  beforeEach(() => {
    estado.atual = null;
  });

  it('bloqueada mostra só o aviso neutro, sem valores nem palavras de pagamento', () => {
    estado.atual = { tipo: 'bloqueada', motivo: 'cobranca' };
    render(<BancadaShell><p>agenda de hoje</p></BancadaShell>);
    expect(screen.getByText(AVISO)).toBeInTheDocument();
    expect(screen.queryByText('agenda de hoje')).not.toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/pagamento|pagar|cobran|assinatura|fatura|pix|R\$/i);
  });

  it('em carência mostra a faixa e o conteúdo', () => {
    estado.atual = { tipo: 'carencia', desde: '2026-10-20', ate: '2026-10-27', diasRestantes: 3 };
    render(<BancadaShell><p>agenda de hoje</p></BancadaShell>);
    expect(screen.getByText('agenda de hoje')).toBeInTheDocument();
    expect(screen.queryByText(AVISO)).not.toBeInTheDocument();
  });

  it('ativa mostra o conteúdo sem aviso', () => {
    estado.atual = { tipo: 'ativa' };
    render(<BancadaShell><p>agenda de hoje</p></BancadaShell>);
    expect(screen.getByText('agenda de hoje')).toBeInTheDocument();
    expect(screen.queryByText(AVISO)).not.toBeInTheDocument();
  });
});
