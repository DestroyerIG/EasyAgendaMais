import { describe, expect, it } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  TopBarSearchProvider,
  useRegisterTopBarSearch,
  useTopBarSearchConfig,
} from '../TopBarSearchContext';

function Consumidor() {
  const [termo, setTermo] = useState('');
  useRegisterTopBarSearch({ value: termo, onChange: setTermo });
  return (
    <input aria-label="busca-tela" value={termo} onChange={(e) => setTermo(e.target.value)} />
  );
}

function LeitorDaTopBar() {
  const config = useTopBarSearchConfig();
  return <span data-testid="valor-na-topbar">{config?.value ?? ''}</span>;
}

describe('useRegisterTopBarSearch', () => {
  it('não entra em loop de atualização ao registrar e re-renderizar (regressão: "Maximum update depth exceeded")', () => {
    render(
      <TopBarSearchProvider>
        <Consumidor />
        <LeitorDaTopBar />
      </TopBarSearchProvider>,
    );

    // Digitar várias vezes força vários re-renders do Provider (novo `config` a
    // cada tecla); antes da correção, cada um deles derrubava o teste com
    // "Maximum update depth exceeded" antes de chegar aqui.
    fireEvent.change(screen.getByLabelText('busca-tela'), { target: { value: 'a' } });
    fireEvent.change(screen.getByLabelText('busca-tela'), { target: { value: 'an' } });
    fireEvent.change(screen.getByLabelText('busca-tela'), { target: { value: 'ana' } });

    expect(screen.getByTestId('valor-na-topbar').textContent).toBe('ana');
  });

  it('o placeholder da tela chega a useTopBarSearchConfig', () => {
    const semEfeito = () => {};
    function ComPlaceholder() {
      useRegisterTopBarSearch({ value: '', onChange: semEfeito, placeholder: 'Filtrar...' });
      return null;
    }
    function Leitor() {
      return <span data-testid="ph">{useTopBarSearchConfig()?.placeholder ?? ''}</span>;
    }
    render(
      <TopBarSearchProvider>
        <ComPlaceholder />
        <Leitor />
      </TopBarSearchProvider>,
    );
    expect(screen.getByTestId('ph').textContent).toBe('Filtrar...');
  });

  it('limpa o registro ao desmontar o componente que registrou a busca', () => {
    function Wrapper({ montado }: { montado: boolean }) {
      return (
        <TopBarSearchProvider>
          {montado && <Consumidor />}
          <LeitorDaTopBar />
        </TopBarSearchProvider>
      );
    }

    const { rerender } = render(<Wrapper montado />);
    fireEvent.change(screen.getByLabelText('busca-tela'), { target: { value: 'x' } });
    expect(screen.getByTestId('valor-na-topbar').textContent).toBe('x');

    rerender(<Wrapper montado={false} />);
    expect(screen.getByTestId('valor-na-topbar').textContent).toBe('');
  });
});
