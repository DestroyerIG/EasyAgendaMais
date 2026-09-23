import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CalendarX } from 'lucide-react';
import { Button } from '../Button';
import { IconButton } from '../IconButton';
import { MetricCard } from '../MetricCard';
import { StatusChip, STATUS_LABEL, type AppointmentStatus } from '../StatusChip';
import { Avatar, getInitials } from '../Avatar';
import { EmptyState } from '../EmptyState';
import { PageHeader } from '../PageHeader';
import { Banner } from '../Banner';

describe('Button', () => {
  it('é do tipo button por padrão e usa o botão principal da marca', () => {
    render(<Button>Salvar</Button>);
    const button = screen.getByRole('button', { name: 'Salvar' });
    expect(button).toHaveAttribute('type', 'button');
    expect(button).toHaveClass('bg-brand', 'text-on-brand');
  });

  it('fica desabilitado e ocupado enquanto carrega', () => {
    render(<Button loading>Salvar</Button>);
    const button = screen.getByRole('button', { name: 'Salvar' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
  });

  it('usa o verde só na variante WhatsApp', () => {
    render(<Button variant="whatsapp">Conectar</Button>);
    expect(screen.getByRole('button', { name: 'Conectar' })).toHaveClass('bg-whatsapp');
  });
});

describe('IconButton', () => {
  it('expõe o rótulo para leitores de tela', async () => {
    const onClick = vi.fn();
    render(<IconButton icon={CalendarX} label="Cancelar agendamento" onClick={onClick} />);
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar agendamento' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

describe('MetricCard', () => {
  it('mostra rótulo e valor', () => {
    render(<MetricCard label="Atendimentos hoje" value={12} />);
    expect(screen.getByText('Atendimentos hoje')).toBeInTheDocument();
    expect(screen.getByText('12')).toHaveClass('tabular-nums');
  });

  it('subida é positiva por padrão', () => {
    render(<MetricCard label="Faturamento" value="R$ 800" delta={{ value: '+12%', trend: 'up' }} />);
    expect(screen.getByText('+12%').closest('[data-tone]')).toHaveAttribute('data-tone', 'positive');
  });

  it('aceita queda com tom positivo (por exemplo, despesas caindo)', () => {
    render(<MetricCard label="Despesas" value="R$ 90" delta={{ value: '-8%', trend: 'down', tone: 'positive' }} />);
    expect(screen.getByText('-8%').closest('[data-tone]')).toHaveClass('text-success');
  });
});

describe('StatusChip', () => {
  const expected: Record<AppointmentStatus, string> = {
    confirmado: 'text-status-confirmed',
    aguardando: 'text-warning-text',
    em_atendimento: 'text-brand-text',
    concluido: 'text-success-text',
    faltou: 'text-danger',
    cancelado: 'text-muted',
  };

  it.each(Object.keys(expected) as AppointmentStatus[])('status %s tem rótulo e cor', (status) => {
    render(<StatusChip status={status} />);
    const chip = screen.getByText(STATUS_LABEL[status]);
    expect(chip).toHaveClass(expected[status]);
  });

  it('cancelado aparece riscado', () => {
    render(<StatusChip status="cancelado" />);
    expect(screen.getByText('Cancelado')).toHaveClass('line-through');
  });
});

describe('Avatar', () => {
  it.each([
    ['Mariana Souza', 'MS'],
    ['Paula', 'P'],
    ['  ana   beatriz  lima ', 'AL'],
    ['   ', '?'],
  ])('iniciais de "%s" são %s', (name, initials) => {
    expect(getInitials(name)).toBe(initials);
  });

  it('sem foto mostra as iniciais com o nome acessível', () => {
    render(<Avatar name="Mariana Souza" />);
    expect(screen.getByRole('img', { name: 'Mariana Souza' })).toHaveTextContent('MS');
  });
});

describe('EmptyState e PageHeader', () => {
  it('estado vazio mostra a frase e o botão do próximo passo', async () => {
    const onClick = vi.fn();
    render(
      <EmptyState icon={CalendarX} title="Nenhum agendamento hoje" description="Crie o primeiro." action={{ label: 'Novo agendamento', onClick }} />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Novo agendamento' }));
    expect(onClick).toHaveBeenCalled();
  });

  it('cabeçalho de página usa um título de nível 1', () => {
    render(<PageHeader title="Agenda" description="Seus horários" action={<Button>Novo</Button>} />);
    expect(screen.getByRole('heading', { level: 1, name: 'Agenda' })).toBeInTheDocument();
  });
});

describe('Banner', () => {
  it('erro interrompe o leitor de tela', () => {
    render(<Banner tone="danger">Não foi possível salvar</Banner>);
    expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível salvar');
  });

  it('aviso comum espera a vez', () => {
    render(<Banner tone="warning">Assinatura vence amanhã</Banner>);
    expect(screen.getByRole('status')).toHaveTextContent('Assinatura vence amanhã');
  });
});
