import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const showToast = vi.fn();
const toastApi = { showToast };
vi.mock('@/components/Toast', () => ({ useToast: () => toastApi }));

const api = vi.hoisted(() => ({ atualizarRegra: vi.fn() }));
vi.mock('@/lib/whatsappAutomacoes', async (original) => ({ ...(await original<object>()), ...api }));

import { ConfigurarRegraModal } from '../automacoes/ConfigurarRegraModal';
import type { RegraDto } from '@/lib/whatsappAutomacoes';

const confirmacao = (partes: Partial<RegraDto<'confirmacao'>> = {}): RegraDto<'confirmacao'> => ({
  regra: 'confirmacao',
  ativa: true,
  texto: 'Oi! Confirma?',
  textoPadrao: 'Olá {primeiro_nome}! Confirma seu horário às {horario}?',
  personalizado: true,
  config: { hora: '09:00', textoConfirmado: null, textoCancelado: null },
  variaveis: ['nome', 'primeiro_nome', 'horario'],
  ...partes,
});

const renderizar = (regra: RegraDto = confirmacao(), onSalvo = vi.fn(), onFechar = vi.fn()) =>
  render(<ConfigurarRegraModal regra={regra} aberto onFechar={onFechar} onSalvo={onSalvo} />);

const caixaDeTexto = () => screen.getByLabelText('Texto da mensagem') as HTMLTextAreaElement;

describe('ConfigurarRegraModal', () => {
  beforeEach(() => {
    showToast.mockReset();
    api.atualizarRegra.mockReset();
  });

  it('clicar no chip {primeiro_nome} insere a variável na posição do cursor', async () => {
    renderizar();
    const caixa = caixaDeTexto();
    caixa.focus();
    caixa.setSelectionRange(3, 3); // depois de "Oi!"
    await userEvent.click(screen.getByRole('button', { name: '{primeiro_nome}' }));
    expect(caixa.value).toBe('Oi!{primeiro_nome} Confirma?');
    expect(screen.getByText(`${'Oi!{primeiro_nome} Confirma?'.length} caracteres`)).toBeInTheDocument();
  });

  it('mostra a prévia com os dados de exemplo', () => {
    renderizar(confirmacao({ texto: 'Olá {primeiro_nome}, às {horario}' }));
    expect(screen.getByText('Olá Mariana, às 14:00')).toBeInTheDocument();
  });

  it('salvar manda um PATCH com texto e config', async () => {
    const salvo = confirmacao({ config: { hora: '10:00', textoConfirmado: null, textoCancelado: null } });
    api.atualizarRegra.mockResolvedValue(salvo);
    const onSalvo = vi.fn();
    renderizar(confirmacao(), onSalvo);
    fireEvent.change(screen.getByLabelText('Horário do envio'), { target: { value: '10:00' } });
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(onSalvo).toHaveBeenCalledWith(salvo));
    expect(api.atualizarRegra).toHaveBeenCalledTimes(1);
    expect(api.atualizarRegra).toHaveBeenCalledWith('confirmacao', { texto: 'Oi! Confirma?', config: { hora: '10:00', textoConfirmado: null, textoCancelado: null } });
  });

  it('"Restaurar texto padrão" manda texto: null', async () => {
    api.atualizarRegra.mockResolvedValue(confirmacao({ personalizado: false }));
    renderizar();
    await userEvent.click(screen.getByRole('button', { name: 'Restaurar texto padrão' }));
    expect(caixaDeTexto().value).toBe('Olá {primeiro_nome}! Confirma seu horário às {horario}?');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(api.atualizarRegra).toHaveBeenCalledWith('confirmacao', { texto: null, config: { hora: '09:00', textoConfirmado: null, textoCancelado: null } }));
  });

  it('duplo clique em Salvar faz um só PATCH', async () => {
    let resolver: (r: RegraDto) => void = () => {};
    api.atualizarRegra.mockReturnValue(new Promise((r) => { resolver = r; }));
    renderizar();
    const salvar = screen.getByRole('button', { name: 'Salvar' });
    fireEvent.click(salvar);
    fireEvent.click(salvar);
    resolver(confirmacao());
    await waitFor(() => expect(api.atualizarRegra).toHaveBeenCalledTimes(1));
  });

  it('horário de confirmação fora de 08:00 a 12:00 bloqueia o salvar', () => {
    renderizar();
    fireEvent.change(screen.getByLabelText('Horário do envio'), { target: { value: '13:00' } });
    expect(screen.getByText('Escolha um horário entre 08:00 e 12:00')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Salvar' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Horário do envio'), { target: { value: '07:30' } });
    expect(screen.getByText('Escolha um horário entre 08:00 e 12:00')).toBeInTheDocument();
    expect(screen.getByLabelText('Horário do envio')).toHaveAttribute('min', '08:00');
  });

  it('retorno personalizado manda modo e dias', async () => {
    const retorno: RegraDto<'retorno'> = {
      regra: 'retorno', ativa: true, texto: 'Volta?', textoPadrao: 'Padrão', personalizado: true,
      config: { modo: 'ciclo', dias: 21 }, variaveis: ['primeiro_nome'],
    };
    api.atualizarRegra.mockResolvedValue(retorno);
    renderizar(retorno);
    await userEvent.click(screen.getByRole('radio', { name: 'Personalizado' }));
    const dias = screen.getByLabelText('Dias desde a última visita');
    await userEvent.clear(dias);
    await userEvent.type(dias, '30');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(api.atualizarRegra).toHaveBeenCalledWith('retorno', { texto: 'Volta?', config: { modo: 'dias', dias: 30 } }));
  });

  it('lembrete na véspera: horário fora de 08:00 a 18:00 bloqueia; voltar para 2h salva com horário válido', async () => {
    const lembrete: RegraDto<'lembrete'> = {
      regra: 'lembrete', ativa: true, texto: 'Lembrete', textoPadrao: 'Padrão', personalizado: true,
      config: { modo: 'vespera', hora: '18:00' }, variaveis: ['horario'],
    };
    api.atualizarRegra.mockResolvedValue(lembrete);
    renderizar(lembrete);
    const hora = screen.getByLabelText('Horário do lembrete');
    expect(hora).toHaveAttribute('min', '08:00');
    expect(hora).toHaveAttribute('max', '18:00');
    fireEvent.change(hora, { target: { value: '19:00' } });
    expect(screen.getByText('Escolha um horário entre 08:00 e 18:00')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Salvar' })).toBeDisabled();
    await userEvent.click(screen.getByRole('radio', { name: '2 horas antes' }));
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(api.atualizarRegra).toHaveBeenCalledWith('lembrete', { texto: 'Lembrete', config: { modo: '2h', hora: '18:00' } }));
  });

  it('avaliação com link vazio manda linkGoogle null', async () => {
    const avaliacao: RegraDto<'avaliacao'> = {
      regra: 'avaliacao', ativa: true, texto: 'Nota?', textoPadrao: 'Padrão', personalizado: true,
      config: { horas: 2, linkGoogle: null, textoNota: null, textoGoogle: null }, variaveis: ['negocio'],
    };
    api.atualizarRegra.mockResolvedValue(avaliacao);
    renderizar(avaliacao);
    await userEvent.click(screen.getByRole('radio', { name: '4 h' }));
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(api.atualizarRegra).toHaveBeenCalledWith('avaliacao', { texto: 'Nota?', config: { horas: 4, linkGoogle: null, textoNota: null, textoGoogle: null } }));
  });

  it('confirmação mostra as respostas padrão como placeholder e salva o texto digitado', async () => {
    api.atualizarRegra.mockResolvedValue(confirmacao());
    renderizar();
    const confirmado = screen.getByLabelText('Resposta ao confirmar') as HTMLTextAreaElement;
    expect(confirmado).toHaveAttribute('placeholder', 'Agradecemos! Seu horário está confirmado ✨');
    expect(confirmado).toHaveAttribute('maxlength', '500');
    expect(screen.getByLabelText('Resposta ao reagendar')).toHaveAttribute('placeholder', expect.stringContaining('Liberamos seu horário'));
    await userEvent.type(confirmado, 'Fechado, até amanhã!');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(api.atualizarRegra).toHaveBeenCalledWith('confirmacao', {
      texto: 'Oi! Confirma?', config: { hora: '09:00', textoConfirmado: 'Fechado, até amanhã!', textoCancelado: null },
    }));
  });

  it('confirmação com resposta em branco volta a null', async () => {
    const regra = confirmacao({ config: { hora: '09:00', textoConfirmado: 'Antigo', textoCancelado: 'Outro' } });
    api.atualizarRegra.mockResolvedValue(regra);
    renderizar(regra);
    expect(screen.getByLabelText('Resposta ao confirmar')).toHaveValue('Antigo');
    await userEvent.clear(screen.getByLabelText('Resposta ao confirmar'));
    await userEvent.type(screen.getByLabelText('Resposta ao reagendar'), '   ');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(api.atualizarRegra).toHaveBeenCalledWith('confirmacao', {
      texto: 'Oi! Confirma?', config: { hora: '09:00', textoConfirmado: null, textoCancelado: 'Outro' },
    }));
  });

  it('avaliação mostra e salva agradecimento e convite ao Google', async () => {
    const avaliacao: RegraDto<'avaliacao'> = {
      regra: 'avaliacao', ativa: true, texto: 'Nota?', textoPadrao: 'Padrão', personalizado: true,
      config: { horas: 2, linkGoogle: 'https://g.page/x', textoNota: null, textoGoogle: null }, variaveis: ['negocio'],
    };
    api.atualizarRegra.mockResolvedValue(avaliacao);
    renderizar(avaliacao);
    expect(screen.getByLabelText('Agradecimento pela nota')).toHaveAttribute('placeholder', 'Agradecemos pela nota!');
    const convite = screen.getByLabelText('Convite para avaliar no Google');
    expect(convite).toHaveAttribute('placeholder', expect.stringContaining('{link}'));
    await userEvent.type(screen.getByLabelText('Agradecimento pela nota'), 'Valeu!');
    fireEvent.change(convite, { target: { value: 'Avalie: {link}' } });
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(api.atualizarRegra).toHaveBeenCalledWith('avaliacao', {
      texto: 'Nota?', config: { horas: 2, linkGoogle: 'https://g.page/x', textoNota: 'Valeu!', textoGoogle: 'Avalie: {link}' },
    }));
  });

  it('erro ao salvar mostra toast e não fecha', async () => {
    api.atualizarRegra.mockRejectedValue(new Error('Configuração inválida'));
    const onSalvo = vi.fn();
    renderizar(confirmacao(), onSalvo);
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(showToast).toHaveBeenCalledWith('Configuração inválida', 'error'));
    expect(onSalvo).not.toHaveBeenCalled();
  });
});
