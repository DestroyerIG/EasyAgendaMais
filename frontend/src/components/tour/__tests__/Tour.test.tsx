import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const push = vi.hoisted(() => vi.fn());
const concluirTour = vi.hoisted(() => vi.fn(() => Promise.resolve()));
const mockUser = vi.hoisted(() => ({ value: null as Record<string, unknown> | null }));

vi.mock('next/navigation', () => ({ usePathname: () => '/dashboard', useRouter: () => ({ push }) }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: mockUser.value }) }));
vi.mock('@/lib/onboarding', () => ({ onboardingApi: { concluirTour } }));

const { TourProvider, useTour } = await import('../TourProvider');

function Reabrir() {
  const { disponivel, iniciar } = useTour();
  return disponivel ? <button onClick={iniciar}>Rever o tour</button> : null;
}
const montar = () => render(<TourProvider><Reabrir /></TourProvider>);
const dona = (tourPendente: boolean) => ({ role: 'tenant_admin', onboarding: { pendente: false, bloqueante: false, etapa: 7, tourPendente } });

beforeEach(() => {
  vi.clearAllMocks();
});

describe('tour guiado', () => {
  it('não abre se o tour já foi visto', () => {
    mockUser.value = dona(false);
    montar();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('abre no primeiro acesso e percorre os passos navegando entre as telas', async () => {
    mockUser.value = dona(true);
    montar();
    expect(await screen.findByRole('dialog', { name: /bem-vinda/i })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Começar o tour' }));
    expect(screen.getByRole('dialog', { name: 'Hoje' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Próximo' }));
    expect(screen.getByRole('dialog', { name: 'Agenda' })).toBeInTheDocument();
    expect(push).toHaveBeenCalledWith('/agendamentos');
    expect(screen.getByText('Passo 3 de 11')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Voltar' }));
    expect(screen.getByRole('dialog', { name: 'Hoje' })).toBeInTheDocument();
  });

  it('pular registra a conclusão e fecha; não reabre ao montar de novo', async () => {
    mockUser.value = dona(true);
    const { unmount } = montar();
    await userEvent.click(await screen.findByRole('button', { name: 'Agora não' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(concluirTour).toHaveBeenCalledTimes(1);
    unmount();
    montar();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('Esc também pula, e dá para rever o tour pelo menu', async () => {
    mockUser.value = dona(false);
    montar();
    await userEvent.click(screen.getByRole('button', { name: 'Rever o tour' }));
    expect(screen.getByRole('dialog', { name: /bem-vinda/i })).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('o último passo conclui', async () => {
    mockUser.value = dona(false);
    montar();
    await userEvent.click(screen.getByRole('button', { name: 'Rever o tour' }));
    for (let i = 0; i < 10; i++) {
      await userEvent.click(screen.getByRole('button', { name: /Próximo|Começar o tour/ }));
    }
    expect(screen.getByRole('dialog', { name: /pronto/i })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Concluir' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(concluirTour).toHaveBeenCalled();
  });

  it('quem não é a dona não vê o tour nem o item de menu', () => {
    mockUser.value = { role: 'employee', onboarding: null };
    montar();
    expect(screen.queryByRole('button', { name: 'Rever o tour' })).toBeNull();
  });
});
