import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AcaoComMotivoModal } from '../AcaoComMotivoModal';

const abrir = (props: Partial<Parameters<typeof AcaoComMotivoModal>[0]> = {}) => {
  const onConfirmar = vi.fn();
  render(
    <AcaoComMotivoModal
      titulo="Estender teste"
      descricao="O teste grátis ganha mais dias."
      rotuloConfirmar="Confirmar"
      onConfirmar={onConfirmar}
      onFechar={vi.fn()}
      {...props}
    />,
  );
  return { onConfirmar };
};

const motivo = () => screen.getByLabelText(/Motivo/);
const confirmar = () => screen.getByRole('button', { name: 'Confirmar' });

describe('AcaoComMotivoModal', () => {
  it('só habilita com motivo de 3 caracteres ou mais', () => {
    abrir();
    fireEvent.change(motivo(), { target: { value: 'ab' } });
    expect(confirmar()).toBeDisabled();
    fireEvent.change(motivo(), { target: { value: 'abc' } });
    expect(confirmar()).toBeEnabled();
  });

  it('com campoDias, dias fora de 1 a 30 desabilita o botão', () => {
    abrir({ campoDias: true });
    fireEvent.change(motivo(), { target: { value: 'motivo ok' } });
    const dias = screen.getByLabelText(/Dias/);
    fireEvent.change(dias, { target: { value: '0' } });
    expect(confirmar()).toBeDisabled();
    fireEvent.change(dias, { target: { value: '31' } });
    expect(confirmar()).toBeDisabled();
    fireEvent.change(dias, { target: { value: '30' } });
    expect(confirmar()).toBeEnabled();
  });

  it('entrega o motivo e os dias ao confirmar', () => {
    const { onConfirmar } = abrir({ campoDias: true });
    fireEvent.change(motivo(), { target: { value: 'motivo ok' } });
    fireEvent.change(screen.getByLabelText(/Dias/), { target: { value: '5' } });
    fireEvent.click(confirmar());
    expect(onConfirmar).toHaveBeenCalledWith('motivo ok', 5);
  });

  it('sem campoDias, entrega só o motivo', () => {
    const { onConfirmar } = abrir();
    fireEvent.change(motivo(), { target: { value: '  motivo ok ' } });
    fireEvent.click(confirmar());
    expect(onConfirmar).toHaveBeenCalledWith('motivo ok', undefined);
  });
});
