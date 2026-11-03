import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AcaoComMotivoModal } from '../AcaoComMotivoModal';

const abrir = (props: Partial<Parameters<typeof AcaoComMotivoModal>[0]> = {}) => {
  const onConfirmar = vi.fn();
  const onFechar = vi.fn();
  render(
    <AcaoComMotivoModal
      titulo="Estender teste"
      descricao="O teste grátis ganha mais dias."
      rotuloConfirmar="Confirmar"
      onConfirmar={onConfirmar}
      onFechar={onFechar}
      {...props}
    />,
  );
  return { onConfirmar, onFechar };
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

  it('com campoEscolha, mostra a escolha inicial e entrega o valor escolhido', () => {
    const { onConfirmar } = abrir({
      campoEscolha: {
        rotulo: 'Plano',
        opcoes: [
          { valor: 'basico', rotulo: 'Solo' },
          { valor: 'premium', rotulo: 'Salão' },
        ],
        inicial: 'basico',
      },
    });
    const plano = screen.getByLabelText(/Plano/);
    expect(plano).toHaveValue('basico');
    fireEvent.change(plano, { target: { value: 'premium' } });
    fireEvent.change(motivo(), { target: { value: 'motivo ok' } });
    fireEvent.click(confirmar());
    expect(onConfirmar).toHaveBeenCalledWith('motivo ok', undefined, 'premium');
  });

  it('com campoEscolha sem inicial válida, o botão fica desabilitado até escolher', () => {
    const { onConfirmar } = abrir({
      campoEscolha: {
        rotulo: 'Plano',
        opcoes: [
          { valor: 'basico', rotulo: 'Solo' },
          { valor: 'premium', rotulo: 'Salão' },
        ],
        inicial: '',
      },
    });
    const plano = screen.getByLabelText(/Plano/);
    expect(plano).toHaveValue('');
    expect(screen.getByRole('option', { name: 'Escolha uma opção' })).toBeDisabled();
    fireEvent.change(motivo(), { target: { value: 'motivo ok' } });
    expect(confirmar()).toBeDisabled();
    fireEvent.click(confirmar());
    expect(onConfirmar).not.toHaveBeenCalled();
    fireEvent.change(plano, { target: { value: 'premium' } });
    expect(confirmar()).toBeEnabled();
  });

  it('enquanto envia, Esc e o botão de fechar não fecham o modal', () => {
    const { onFechar } = abrir({ enviando: true });
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
    fireEvent.click(screen.getByRole('button', { name: 'Fechar' }));
    expect(onFechar).not.toHaveBeenCalled();
  });

  it('fora do envio, Esc fecha o modal', () => {
    const { onFechar } = abrir();
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
    expect(onFechar).toHaveBeenCalled();
  });
});
