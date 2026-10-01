import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ForgotPasswordView } from '../ForgotPasswordView';

/**
 * Mesma regressão de segurança do AuthForm: sem method="post", um clique antes da
 * hidratação do React cai no submit nativo do HTML (GET para a própria URL), vazando o
 * e-mail em texto puro na barra de endereço.
 */
describe('ForgotPasswordView', () => {
  it('o formulário usa method="post"', () => {
    render(<ForgotPasswordView />);
    const form = screen.getByRole('button', { name: /Enviar link de redefinição/ }).closest('form');
    expect(form).toHaveAttribute('method', 'post');
  });
});
