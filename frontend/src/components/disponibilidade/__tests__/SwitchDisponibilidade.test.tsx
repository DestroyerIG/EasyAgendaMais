import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { SwitchDisponibilidade } from '../SwitchDisponibilidade';
import { avisoAgendamentosMantidos } from '@/lib/disponibilidade';

describe('SwitchDisponibilidade', () => {
  it('mostra o estado e alterna ao clicar', () => {
    const aoMudar = vi.fn();
    render(<SwitchDisponibilidade checked label="Ana disponível" onCheckedChange={aoMudar} />);
    const botao = screen.getByRole('switch', { name: 'Ana disponível' });
    expect(botao).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(botao);
    expect(aoMudar).toHaveBeenCalledWith(false);
  });

  it('desligado, ligar devolve true', () => {
    const aoMudar = vi.fn();
    render(<SwitchDisponibilidade checked={false} label="Bia disponível" onCheckedChange={aoMudar} />);
    fireEvent.click(screen.getByRole('switch'));
    expect(aoMudar).toHaveBeenCalledWith(true);
  });

  it('desabilitado não dispara', () => {
    const aoMudar = vi.fn();
    render(<SwitchDisponibilidade checked label="x" disabled onCheckedChange={aoMudar} />);
    fireEvent.click(screen.getByRole('switch'));
    expect(aoMudar).not.toHaveBeenCalled();
  });
});

describe('avisoAgendamentosMantidos', () => {
  it('fala no singular, no plural e some quando não há', () => {
    expect(avisoAgendamentosMantidos(0)).toBe('');
    expect(avisoAgendamentosMantidos(1)).toBe('1 agendamento futuro continua marcado');
    expect(avisoAgendamentosMantidos(3)).toBe('3 agendamentos futuros continuam marcados');
  });
});
