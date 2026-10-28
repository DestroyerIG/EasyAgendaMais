import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  ChipsProfissional,
  DateNavigationBar,
  formatarDataAgenda,
  formatarDataAgendaCurta,
} from '../DateNavigationBar';

const carencia = vi.hoisted(() => ({ ativa: false }));
vi.mock('@/hooks/useBloqueadoNaCarencia', () => ({
  useBloqueadoNaCarencia: () => ({
    bloqueado: carencia.ativa,
    dica: carencia.ativa ? 'Disponível depois de regularizar' : undefined,
  }),
}));

const profissionais = [
  { id: 'p1', nome: 'Camila Rocha', total: 6, tom: { fundo: 'bg-brand-text/15', texto: 'text-brand-text' } },
  { id: 'p2', nome: 'Bruna Lima', total: 5, tom: { fundo: 'bg-tertiary/15', texto: 'text-tertiary' } },
];

const props = {
  selectedDate: '2026-09-17',
  viewMode: 'day' as const,
  statusFilter: 'todos' as const,
  profissionais,
  totalAgendamentos: 11,
  profissionalFiltro: null,
  onDateChange: vi.fn(),
  onViewModeChange: vi.fn(),
  onStatusFilterChange: vi.fn(),
  onProfissionalFiltroChange: vi.fn(),
  onNovoAgendamento: vi.fn(),
};

describe('formatação da data da Agenda', () => {
  it('no computador escreve dia da semana, dia, mês e ano', () => {
    expect(formatarDataAgenda('2026-09-17')).toBe('Quinta, 17 de setembro de 2026');
  });

  it('no celular abrevia o mês, como o arquivo de referência', () => {
    expect(formatarDataAgendaCurta('2026-09-17')).toBe('Quinta, 17 de set.');
  });
});

describe('DateNavigationBar', () => {
  it('mostra as duas escritas da data, uma por largura', () => {
    render(<DateNavigationBar {...props} />);
    expect(screen.getByText('Quinta, 17 de setembro de 2026')).toHaveClass('hidden', 'lg:inline');
    expect(screen.getByText('Quinta, 17 de set.')).toHaveClass('lg:hidden');
  });

  it('anda um dia por vez no modo Dia', async () => {
    const onDateChange = vi.fn();
    render(<DateNavigationBar {...props} onDateChange={onDateChange} />);

    await userEvent.click(screen.getByRole('button', { name: 'Próximo período' }));
    expect(onDateChange).toHaveBeenCalledWith('2026-09-18');

    await userEvent.click(screen.getByRole('button', { name: 'Período anterior' }));
    expect(onDateChange).toHaveBeenCalledWith('2026-09-16');
  });

  it('anda uma semana por vez no modo Semana e mostra a faixa de datas', async () => {
    const onDateChange = vi.fn();
    render(<DateNavigationBar {...props} viewMode="week" onDateChange={onDateChange} />);

    expect(screen.getByText('17/09 — 23/09')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Próximo período' }));
    expect(onDateChange).toHaveBeenCalledWith('2026-09-24');
  });

  it('marca o filtro ativo com aria-pressed', () => {
    render(<DateNavigationBar {...props} statusFilter="concluido" />);

    expect(screen.getByRole('button', { name: 'Dia' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Semana' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'Concluído' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Todos' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('troca o modo e o filtro pelos handlers de sempre', async () => {
    const onViewModeChange = vi.fn();
    const onStatusFilterChange = vi.fn();
    render(
      <DateNavigationBar {...props} onViewModeChange={onViewModeChange} onStatusFilterChange={onStatusFilterChange} />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Semana' }));
    expect(onViewModeChange).toHaveBeenCalledWith('week');

    await userEvent.click(screen.getByRole('button', { name: 'Cancelado' }));
    expect(onStatusFilterChange).toHaveBeenCalledWith('cancelado');
  });

  it('o botão Hoje volta para a data de hoje e o CTA abre o cadastro', async () => {
    const onDateChange = vi.fn();
    const onNovoAgendamento = vi.fn();
    render(<DateNavigationBar {...props} onDateChange={onDateChange} onNovoAgendamento={onNovoAgendamento} />);

    await userEvent.click(screen.getByRole('button', { name: 'Hoje' }));
    expect(onDateChange).toHaveBeenCalledTimes(1);

    await userEvent.click(screen.getByRole('button', { name: 'Novo agendamento' }));
    expect(onNovoAgendamento).toHaveBeenCalled();
  });
});

describe('ChipsProfissional', () => {
  const chipProps = {
    profissionais,
    totalGeral: 11,
    ativo: null,
    onChange: vi.fn(),
  };

  it('no celular mostra "Todas" e cada profissional com a contagem do dia', () => {
    render(<ChipsProfissional {...chipProps} />);
    expect(screen.getByRole('button', { name: 'Todas (11)' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /Camila \(6\)/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Bruna \(5\)/ })).toBeInTheDocument();
  });

  it('no computador os chips são compactos e sem contagem', () => {
    render(<ChipsProfissional {...chipProps} compacto />);
    expect(screen.getByRole('button', { name: 'Todas' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Camila' })).toBeInTheDocument();
  });

  it('esconde a contagem quando ela não é do dia (modo Semana)', () => {
    render(<ChipsProfissional {...chipProps} mostrarContagem={false} />);
    expect(screen.getByRole('button', { name: 'Todas' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /\(6\)/ })).not.toBeInTheDocument();
  });

  it('escolher uma profissional avisa quem escolheu; clicar de novo limpa', async () => {
    const onChange = vi.fn();
    const { unmount } = render(<ChipsProfissional {...chipProps} onChange={onChange} />);
    await userEvent.click(screen.getByRole('button', { name: /Camila/ }));
    expect(onChange).toHaveBeenCalledWith('p1');
    unmount();

    render(<ChipsProfissional {...chipProps} ativo="p1" onChange={onChange} />);
    expect(screen.getByRole('button', { name: /Camila/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /Todas/ })).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(screen.getByRole('button', { name: /Camila/ }));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('sem profissional no período, não desenha nada', () => {
    const { container } = render(<ChipsProfissional {...chipProps} profissionais={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('DateNavigationBar com os chips do computador', () => {
  it('os chips dentro da barra peneiram pelo mesmo handler da fileira do celular', async () => {
    const onProfissionalFiltroChange = vi.fn();
    render(<DateNavigationBar {...props} onProfissionalFiltroChange={onProfissionalFiltroChange} />);

    const grupo = screen.getByRole('group', { name: 'Filtrar por profissional' });
    expect(grupo).toHaveTextContent('Camila');

    await userEvent.click(screen.getByRole('button', { name: 'Camila' }));
    expect(onProfissionalFiltroChange).toHaveBeenCalledWith('p1');
  });

  it('a linha de data se rearruma por largura sem duplicar os botões', () => {
    render(<DateNavigationBar {...props} />);
    // Uma seta só de cada lado, um "Hoje" só e uma data só de cada escrita: a arrumação
    // muda por classe, nunca por um segundo botão que responderia a mesma coisa duas vezes.
    expect(screen.getAllByRole('button', { name: 'Período anterior' })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'Próximo período' })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'Hoje' })).toHaveLength(1);
    expect(screen.getAllByText('Quinta, 17 de set.')).toHaveLength(1);
    expect(screen.getAllByText('Quinta, 17 de setembro de 2026')).toHaveLength(1);
  });
});

describe('DateNavigationBar em carência', () => {
  it('desabilita "Novo agendamento" com a dica', () => {
    carencia.ativa = true;
    render(<DateNavigationBar {...props} />);
    const botao = screen.getByRole('button', { name: /Novo agendamento/ });
    expect(botao).toBeDisabled();
    expect(botao).toHaveAttribute('title', 'Disponível depois de regularizar');
    carencia.ativa = false;
  });
});
