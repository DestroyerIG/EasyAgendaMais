import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider } from '@/components/Toast';
import { AVISO_RECURSO_A_CAMINHO } from '@/components/ui';
import { conteudoDemo } from '@/lib/conteudoDemo';
import {
  ClientDetailPanel,
  clienteDesdeTexto,
  indiceEstavelParaCliente,
  linkWhatsapp,
  proximoAniversario,
  textoAniversario,
  tipoDoAgendamento,
  type ClientDetailPanelProps,
} from '../ClientDetailPanel';
import type { Appointment, Client } from '@/types';

const client = (partes: Partial<Client> = {}): Client => ({
  id: 'cliente-1',
  business_id: 'b1',
  name: 'Fernanda Rocha',
  phone: '83991234567',
  last_visit: '2026-09-12T00:00:00',
  total_spent: 300,
  created_at: '2026-01-15T00:00:00',
  ...partes,
});

const agendamento = (partes: Partial<Appointment> = {}): Appointment => ({
  id: 'ag-1',
  business_id: 'b1',
  client_id: 'cliente-1',
  professional_id: 'p1',
  service_id: 's1',
  date: '2026-09-12T00:00:00',
  time: '11:45:00',
  status: 'concluido',
  reminder_sent: true,
  created_at: '2026-09-10T10:00:00',
  professional_name: 'Camila',
  service_name: 'Corte e finalização',
  service_price: 90,
  ...partes,
});

const exemploParaId = (id: string) => {
  const exemplos = conteudoDemo.clientes.exemplos;
  return exemplos[indiceEstavelParaCliente(id, exemplos.length)];
};

const abrir = (props: Partial<ClientDetailPanelProps> = {}) => {
  const onEdit = vi.fn();
  render(
    <ToastProvider>
      <ClientDetailPanel
        client={client()}
        history={[]}
        loadingHistory={false}
        onEdit={onEdit}
        {...props}
      />
    </ToastProvider>,
  );
  return { onEdit };
};

describe('linkWhatsapp', () => {
  it('gera o link só com um número brasileiro completo', () => {
    expect(linkWhatsapp('83991234567')).toBe('https://wa.me/5583991234567');
    expect(linkWhatsapp('8332211')).toBeNull();
    expect(linkWhatsapp(undefined)).toBeNull();
  });
});

describe('indiceEstavelParaCliente', () => {
  it('é determinístico para o mesmo id', () => {
    const a = indiceEstavelParaCliente('abc-123', 6);
    const b = indiceEstavelParaCliente('abc-123', 6);
    expect(a).toBe(b);
    expect(a).toBeGreaterThanOrEqual(0);
    expect(a).toBeLessThan(6);
  });

  it('tamanho zero não quebra (cai em 0)', () => {
    expect(indiceEstavelParaCliente('qualquer', 0)).toBe(0);
  });
});

describe('proximoAniversario e textoAniversario', () => {
  const agora = new Date('2026-09-17T12:00:00');

  it('sem birth_date, não há o que calcular', () => {
    expect(proximoAniversario(undefined, agora)).toBeNull();
    expect(textoAniversario(null)).toBeNull();
  });

  it('aniversário daqui a 3 dias', () => {
    const proximo = proximoAniversario('1990-09-20', agora);
    expect(proximo).toEqual({ dias: 3, dataTexto: '20/09' });
    expect(textoAniversario(proximo)).toBe('Aniversário em 3 dias (20/09)');
  });

  it('aniversário hoje', () => {
    const proximo = proximoAniversario('1990-09-17', agora);
    expect(textoAniversario(proximo)).toBe('Aniversário hoje!');
  });

  it('aniversário amanhã', () => {
    const proximo = proximoAniversario('1990-09-18', agora);
    expect(textoAniversario(proximo)).toBe('Aniversário amanhã (18/09)');
  });

  it('aniversário já passou este ano: calcula para o ano seguinte', () => {
    const proximo = proximoAniversario('1990-01-10', agora);
    expect(proximo?.dataTexto).toBe('10/01');
    expect(proximo!.dias).toBeGreaterThan(30);
  });

  it('longe demais (mais de 30 dias) não vira selo', () => {
    const proximo = proximoAniversario('1990-01-10', agora);
    expect(textoAniversario(proximo)).toBeNull();
  });
});

describe('clienteDesdeTexto', () => {
  it('formata o created_at real', () => {
    expect(clienteDesdeTexto('2026-01-15T00:00:00')).toBe('Cliente desde janeiro de 2026');
  });

  it('data inválida não afirma um mês qualquer', () => {
    expect(clienteDesdeTexto('nada')).toBe('Data de cadastro não informada');
  });
});

describe('tipoDoAgendamento', () => {
  it('mapeia cada status para o tipo de evento certo', () => {
    expect(tipoDoAgendamento('confirmado')).toBe('agendamento');
    expect(tipoDoAgendamento('concluido')).toBe('financeiro');
    expect(tipoDoAgendamento('cancelado')).toBe('falta');
  });
});

describe('ClientDetailPanel', () => {
  it('mostra nome, telefone reais e o botão de editar cadastro chama onEdit', async () => {
    const { onEdit } = abrir();

    expect(screen.getByText('Fernanda Rocha')).toBeInTheDocument();
    expect(screen.getByText('(83) 99123-4567')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Editar cadastro' }));
    expect(onEdit).toHaveBeenCalledTimes(1);
  });

  it('o exemplo de fase/etiqueta/profissional vem do hash estável do id', () => {
    abrir({ client: client({ id: 'hash-teste' }) });
    const exemplo = exemploParaId('hash-teste');

    expect(screen.getAllByText(exemplo.fase).length).toBeGreaterThan(0);
    expect(screen.getByText(exemplo.etiqueta)).toBeInTheDocument();
    expect(screen.getByText(`Prefere ${exemplo.profissional}`)).toBeInTheDocument();
  });

  it('com exemploIndice, o exemplo vem da posição na lista, não do hash do id', () => {
    const idComHashDiferente = 'zzz-outro-hash';
    const indiceDaLista = 2;
    abrir({ client: client({ id: idComHashDiferente }), exemploIndice: indiceDaLista });

    const exemploDaLista = exemploParaId(idComHashDiferente); // hash do id, para comparar
    const exemploDaPosicao = conteudoDemo.clientes.exemplos[indiceDaLista % conteudoDemo.clientes.exemplos.length];

    expect(screen.getByText(`Prefere ${exemploDaPosicao.profissional}`)).toBeInTheDocument();
    if (exemploDaLista.profissional !== exemploDaPosicao.profissional) {
      expect(screen.queryByText(`Prefere ${exemploDaLista.profissional}`)).not.toBeInTheDocument();
    }
  });

  it('sem telefone válido, não mostra o botão do WhatsApp', () => {
    abrir({ client: client({ phone: '123' }) });
    expect(screen.queryByText('Conversar no WhatsApp')).not.toBeInTheDocument();
  });

  it('com telefone válido, o link do WhatsApp usa o número real', () => {
    abrir();
    const link = screen.getByText('Conversar no WhatsApp').closest('a');
    expect(link).toHaveAttribute('href', 'https://wa.me/5583991234567');
  });

  it('aniversário próximo aparece como selo; sem birth_date, não aparece', () => {
    const hoje = new Date();
    const daquiA5Dias = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() + 5);
    const birthDate = `1990-${String(daquiA5Dias.getMonth() + 1).padStart(2, '0')}-${String(daquiA5Dias.getDate()).padStart(2, '0')}`;

    abrir({ client: client({ birth_date: birthDate }) });
    expect(screen.getByText(/Aniversário/)).toBeInTheDocument();
  });

  it('sem birth_date, nenhum selo de aniversário é inventado', () => {
    abrir({ client: client({ birth_date: undefined }) });
    expect(screen.queryByText(/Aniversário/)).not.toBeInTheDocument();
  });

  it('ticket médio, frequência e cancelamentos vêm do histórico real, não do arquivo', () => {
    const historico = [
      agendamento({ id: 'a1', status: 'concluido', service_price: 100 }),
      agendamento({ id: 'a2', status: 'concluido', service_price: 200 }),
      agendamento({ id: 'a3', status: 'cancelado', service_price: 50 }),
    ];
    abrir({ client: client({ total_spent: 300 }), history: historico });

    // 2 visitas concluídas, ticket médio = 300 / 2 = 150
    expect(screen.getByText('R$ 150,00')).toBeInTheDocument();
    expect(screen.getByText(/Gasto acumulado:/)).toBeInTheDocument();
    expect(screen.getAllByText('R$ 300,00').length).toBeGreaterThan(0);
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('visitas')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('cancelamento')).toBeInTheDocument();
  });

  it('sem nenhum atendimento concluído, o ticket médio não inventa uma média (fica R$ 0,00)', () => {
    abrir({ client: client({ total_spent: 0 }), history: [] });
    expect(screen.getAllByText('R$ 0,00').length).toBeGreaterThan(0);
  });

  it('"Cliente desde" usa o created_at real do cliente', () => {
    abrir({ client: client({ created_at: '2026-03-01T00:00:00' }) });
    expect(screen.getByText('Cliente desde março de 2026')).toBeInTheDocument();
  });

  it('a ficha técnica é genérica, vinda de conteudoDemo, sem nada de nicho', () => {
    abrir();
    const fichaTecnica = conteudoDemo.clientes.perfilDestaque.fichaTecnica;

    expect(screen.getByText(fichaTecnica.titulo)).toBeInTheDocument();
    expect(screen.getByText(fichaTecnica.alerta.titulo)).toBeInTheDocument();
    expect(screen.getByText(fichaTecnica.alerta.descricao)).toBeInTheDocument();
    expect(screen.getByText(fichaTecnica.observacoes)).toBeInTheDocument();
    expect(screen.queryByText(/unha|curvatura|ápice/i)).not.toBeInTheDocument();
  });

  it('a galeria mostra os 4 itens de exemplo, sem nenhuma imagem carregada de fora', () => {
    abrir();
    const galeria = conteudoDemo.clientes.perfilDestaque.galeria;

    expect(document.querySelectorAll('img').length).toBe(0);
    galeria.forEach(item => {
      expect(screen.getByText(`${item.data} - ${item.legenda}`)).toBeInTheDocument();
    });
  });

  it('um atendimento concluído vira evento financeiro com o valor real pago', () => {
    abrir({ history: [agendamento({ status: 'concluido', service_price: 90, service_name: 'Corte e finalização', professional_name: 'Camila' })] });

    expect(screen.getByText('Atendimento concluído com Camila')).toBeInTheDocument();
    expect(screen.getByText('Corte e finalização')).toBeInTheDocument();
    expect(screen.getAllByText('R$ 90,00').length).toBeGreaterThan(0);
  });

  it('um atendimento concluído hoje não mostra "Em andamento" (já concluído, não em andamento)', () => {
    const hoje = new Date();
    const dataHoje = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}T00:00:00`;
    abrir({
      history: [agendamento({ status: 'concluido', date: dataHoje, service_name: 'Corte', professional_name: 'Camila' })],
    });

    expect(screen.getByText('Atendimento concluído com Camila')).toBeInTheDocument();
    expect(screen.queryByText(/Em andamento/)).not.toBeInTheDocument();
  });

  it('um agendamento cancelado hoje não mostra "Em andamento" (cancelado, não em andamento)', () => {
    const hoje = new Date();
    const dataHoje = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}T00:00:00`;
    abrir({
      history: [agendamento({ status: 'cancelado', date: dataHoje, service_name: 'Manicure', professional_name: 'Paula' })],
    });

    expect(screen.getByText('Agendamento cancelado: Manicure')).toBeInTheDocument();
    expect(screen.queryByText(/Em andamento/)).not.toBeInTheDocument();
  });

  it('um agendamento confirmado hoje mostra "Em andamento" (esse é o caminho real que ainda deve mostrar)', () => {
    const hoje = new Date();
    const dataHoje = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}T00:00:00`;
    abrir({
      history: [agendamento({ status: 'confirmado', date: dataHoje, service_name: 'Coloração', professional_name: 'Bruna' })],
    });

    expect(screen.getByText('Coloração com Bruna')).toBeInTheDocument();
    expect(screen.getByText(/Em andamento/)).toBeInTheDocument();
  });

  it('um agendamento confirmado no futuro vira evento de agendamento com o chip de status', () => {
    abrir({
      history: [
        agendamento({
          status: 'confirmado',
          date: '2026-12-25T00:00:00',
          service_name: 'Coloração',
          professional_name: 'Bruna',
          service_price: 150,
        }),
      ],
    });

    expect(screen.getByText('Coloração com Bruna')).toBeInTheDocument();
    expect(screen.getByText('Confirmado')).toBeInTheDocument();
  });

  it('um agendamento cancelado vira evento de falta, sem inventar o motivo', () => {
    abrir({
      history: [agendamento({ status: 'cancelado', service_name: 'Manicure', professional_name: 'Paula' })],
    });

    expect(screen.getByText('Agendamento cancelado: Manicure')).toBeInTheDocument();
    expect(screen.getByText('Cancelado')).toBeInTheDocument();
  });

  it('os eventos de exemplo (whatsapp, avaliação, falta, cadastro) sempre aparecem', () => {
    abrir();
    expect(screen.getByText('Mensagem de WhatsApp')).toBeInTheDocument();
    expect(screen.getByText('Avaliação recebida')).toBeInTheDocument();
    expect(screen.getByText('Falta registrada')).toBeInTheDocument();
    expect(screen.getByText('Cadastro inicial')).toBeInTheDocument();
  });

  it('o filtro "Financeiro" esconde os outros tipos de evento (filtro real, em memória)', async () => {
    abrir({ history: [agendamento({ status: 'concluido' })] });

    await userEvent.click(screen.getByRole('button', { name: 'Financeiro' }));

    expect(screen.getByText('Atendimento concluído com Camila')).toBeInTheDocument();
    expect(screen.queryByText('Mensagem de WhatsApp')).not.toBeInTheDocument();
    expect(screen.queryByText('Avaliação recebida')).not.toBeInTheDocument();
  });

  it('o filtro "Tudo" volta a mostrar todos os eventos', async () => {
    abrir();
    await userEvent.click(screen.getByRole('button', { name: 'WhatsApp' }));
    expect(screen.queryByText('Avaliação recebida')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Tudo' }));
    expect(screen.getByText('Avaliação recebida')).toBeInTheDocument();
  });

  it('carregando o histórico, mostra o aviso de carregamento em vez da lista', () => {
    abrir({ loadingHistory: true });
    expect(screen.getByText('Carregando histórico...')).toBeInTheDocument();
  });

  it('botões sem suporte real avisam com o toast padrão em vez de fingir que funcionam', async () => {
    abrir();

    const botoesSemSuporte = [
      'Novo agendamento',
      'Mais opções',
      'Editar',
      'Atualizar ficha técnica',
      'Ver todas',
      '+ Anexar foto da sessão',
      'Carregar histórico anterior',
    ];

    for (const nome of botoesSemSuporte) {
      await userEvent.click(screen.getByRole('button', { name: nome }));
    }

    expect(screen.getAllByText(AVISO_RECURSO_A_CAMINHO).length).toBe(botoesSemSuporte.length);
  });
});
