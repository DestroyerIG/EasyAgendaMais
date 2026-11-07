import { describe, it, expect, vi } from 'vitest';
import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CampoMensagem } from '../robo/CampoMensagem';
import { previaTexto, textosDaOpcao, type TextoDto } from '@/lib/roboTextos';

const texto = (parcial: Partial<TextoDto> = {}): TextoDto => ({
  chave: 'confirmation_message', caminho: 'schedule', rotulo: 'Agendamento confirmado',
  variaveis: ['servico', 'data', 'horario'], importantes: ['horario', 'data'],
  valor: 'Marcado: {servico} em {data} às {horario}.', padrao: 'Marcado: {servico} em {data} às {horario}.',
  personalizado: false, ...parcial,
});

/** Campo controlado, como a tela o usa. */
function Controlado({ t, inicial, onRestaurar = vi.fn() }: { t: TextoDto; inicial?: string; onRestaurar?: () => void }) {
  const [valor, setValor] = useState(inicial ?? t.valor);
  return <CampoMensagem texto={t} valor={valor} onMudar={setValor} onRestaurar={onRestaurar} />;
}

describe('CampoMensagem', () => {
  it('insere a variável no cursor', async () => {
    render(<Controlado t={texto({ valor: 'Oi ,tudo bem', padrao: 'Oi ,tudo bem', importantes: [] })} />);
    const caixa = screen.getByRole('textbox') as HTMLTextAreaElement;
    caixa.focus();
    caixa.setSelectionRange(3, 3);
    await userEvent.click(screen.getByRole('button', { name: /Inserir Serviço/ }));
    expect(caixa.value).toBe('Oi {servico},tudo bem');
  });

  it('mostra o selo só quando personalizada', () => {
    const { rerender } = render(<CampoMensagem texto={texto()} valor={texto().padrao} onMudar={vi.fn()} onRestaurar={vi.fn()} />);
    expect(screen.queryByText('Personalizada')).not.toBeInTheDocument();
    rerender(<CampoMensagem texto={texto({ personalizado: true, valor: 'Meu texto {data} {horario}' })} valor="Meu texto {data} {horario}" onMudar={vi.fn()} onRestaurar={vi.fn()} />);
    expect(screen.getByText('Personalizada')).toBeInTheDocument();
  });

  it('Restaurar padrão só fica ativo fora do padrão e chama onRestaurar', async () => {
    const onRestaurar = vi.fn();
    const { rerender } = render(<CampoMensagem texto={texto()} valor={texto().padrao} onMudar={vi.fn()} onRestaurar={onRestaurar} />);
    expect(screen.getByRole('button', { name: /Restaurar padrão/ })).toBeDisabled();
    rerender(<CampoMensagem texto={texto()} valor="Outro {data} {horario}" onMudar={vi.fn()} onRestaurar={onRestaurar} />);
    await userEvent.click(screen.getByRole('button', { name: /Restaurar padrão/ }));
    expect(onRestaurar).toHaveBeenCalledTimes(1);
  });

  it('avisa ao apagar variável importante sem bloquear', () => {
    render(<CampoMensagem texto={texto()} valor="Marcado: {servico} em {data}." onMudar={vi.fn()} onRestaurar={vi.fn()} />);
    expect(screen.getByText(/\{horario\}/)).toBeInTheDocument();
    expect(screen.getByRole('textbox')).toBeEnabled();
  });

  it('não avisa quando as variáveis importantes estão no texto', () => {
    render(<CampoMensagem texto={texto()} valor={texto().valor} onMudar={vi.fn()} onRestaurar={vi.fn()} />);
    expect(screen.queryByText(/Você apagou/)).not.toBeInTheDocument();
  });

  it('avisa sobre variável desconhecida', () => {
    render(<CampoMensagem texto={texto()} valor="Oi {apelido} {data} {horario}" onMudar={vi.fn()} onRestaurar={vi.fn()} />);
    expect(screen.getByText(/não funciona neste texto/)).toHaveTextContent('{apelido}');
  });

  it('bloqueia vazio, menos com permiteVazio', () => {
    const { rerender } = render(<CampoMensagem texto={texto()} valor="" onMudar={vi.fn()} onRestaurar={vi.fn()} />);
    expect(screen.getByRole('alert')).toHaveTextContent(/não pode ficar em branco/i);
    rerender(<CampoMensagem texto={texto({ permiteVazio: true })} valor="" onMudar={vi.fn()} onRestaurar={vi.fn()} />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('mostra a prévia com dados de exemplo', () => {
    render(<CampoMensagem texto={texto()} valor="Olá {nome_negocio}" onMudar={vi.fn()} onRestaurar={vi.fn()} />);
    expect(screen.getByLabelText(/Prévia/)).toHaveTextContent('Olá Studio Aurora');
  });
});

describe('roboTextos', () => {
  it('previaTexto troca as variáveis conhecidas e deixa as desconhecidas', () => {
    expect(previaTexto('{horario} {zzz}')).toBe('14:00 {zzz}');
  });

  it('textosDaOpcao: cancelar e remarcar incluem o texto de sucesso, que fica em manage', () => {
    const lista = [
      texto({ chave: 'manage_list_message', caminho: 'manage' }),
      texto({ chave: 'cancel_list_message', caminho: 'cancel' }),
      texto({ chave: 'cancel_success_message', caminho: 'manage' }),
      texto({ chave: 'reschedule_success_message', caminho: 'manage' }),
    ];
    expect(textosDaOpcao('cancel', lista).map((t) => t.chave)).toEqual(['cancel_list_message', 'cancel_success_message']);
    expect(textosDaOpcao('reschedule', lista).map((t) => t.chave)).toEqual(['reschedule_success_message']);
    expect(textosDaOpcao('manage', lista)).toHaveLength(3);
    expect(textosDaOpcao(null, lista)).toEqual([]);
  });
});
