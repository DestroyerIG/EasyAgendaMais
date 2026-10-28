import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { saudacaoPorHora, formatarDataPorExtenso, SaudacaoDia } from '../SaudacaoDia';

const carencia = vi.hoisted(() => ({ ativa: false }));
vi.mock('@/hooks/useBloqueadoNaCarencia', () => ({
  useBloqueadoNaCarencia: () => ({
    bloqueado: carencia.ativa,
    dica: carencia.ativa ? 'Disponível depois de regularizar' : undefined,
  }),
}));

afterEach(() => { carencia.ativa = false; });

describe('saudacaoPorHora', () => {
  it('madrugada e manhã (0h a 11h59) dizem Bom dia', () => {
    expect(saudacaoPorHora(0)).toBe('Bom dia');
    expect(saudacaoPorHora(5)).toBe('Bom dia');
    expect(saudacaoPorHora(11)).toBe('Bom dia');
  });

  it('tarde (12h a 17h59) diz Boa tarde', () => {
    expect(saudacaoPorHora(12)).toBe('Boa tarde');
    expect(saudacaoPorHora(17)).toBe('Boa tarde');
  });

  it('noite (18h em diante) diz Boa noite', () => {
    expect(saudacaoPorHora(18)).toBe('Boa noite');
    expect(saudacaoPorHora(23)).toBe('Boa noite');
  });
});

describe('formatarDataPorExtenso', () => {
  it('escreve no formato "dia da semana, dia de mês de ano", sem sufixo -feira', () => {
    // 17 de setembro de 2026 é uma quinta-feira.
    const data = new Date(2026, 8, 17);
    expect(formatarDataPorExtenso(data)).toBe('quinta, 17 de setembro de 2026');
  });

  it('não usa zero à esquerda no dia', () => {
    const data = new Date(2026, 8, 3);
    expect(formatarDataPorExtenso(data)).toBe('quinta, 3 de setembro de 2026');
  });
});

describe('SaudacaoDia (ações do computador, hoje-desktop.html)', () => {
  it('mostra "Disparos WhatsApp" e "Novo agendamento", cada um levando para uma tela real', () => {
    render(<SaudacaoDia ownerName="Carla" businessName="Studio Aurora" />);

    const whatsapp = screen.getByRole('link', { name: /Disparos WhatsApp/ });
    expect(whatsapp).toHaveAttribute('href', '/whatsapp');

    const novoAgendamento = screen.getByRole('link', { name: /Novo agendamento/ });
    expect(novoAgendamento).toHaveAttribute('href', '/agendamentos?novo=1');
  });
});

describe('SaudacaoDia em carência', () => {
  it('desabilita "Novo agendamento" com a dica', () => {
    carencia.ativa = true;
    render(<SaudacaoDia ownerName="Carla" businessName="Studio Aurora" />);
    const botao = screen.getByRole('button', { name: /Novo agendamento/ });
    expect(botao).toBeDisabled();
    expect(botao).toHaveAttribute('title', 'Disponível depois de regularizar');
    expect(screen.queryByRole('link', { name: /Novo agendamento/ })).not.toBeInTheDocument();
  });
});
