import { describe, it, expect } from 'vitest';
import { mensagemAlerta, rotuloPlano, rotuloSegmento, ROTULO_STATUS } from '../adminRotulos';

describe('adminRotulos', () => {
  it('a mensagem de alerta usa só o primeiro nome do dono e cita o negócio', () => {
    const texto = mensagemAlerta('whatsapp', 'Carla Renata Silva', 'Studio Aurora');
    expect(texto.startsWith('Oi, Carla!')).toBe(true);
    expect(texto).toContain('Studio Aurora');
  });

  it('cada tipo de alerta tem o texto combinado', () => {
    expect(mensagemAlerta('cobranca', 'Ana', 'Ateliê X')).toBe(
      'Oi, Ana! Aqui é do EasyAgenda+. A mensalidade do Ateliê X ainda não foi confirmada. Quer ajuda para regularizar? Dá para pagar pelo Pix direto no painel.',
    );
    expect(mensagemAlerta('teste_sem_onboarding', 'Ana', 'Ateliê X')).toBe(
      'Oi, Ana! Aqui é do EasyAgenda+. O teste grátis do Ateliê X termina em breve e a configuração ainda não foi concluída. Quer ajuda para terminar?',
    );
    expect(mensagemAlerta('sem_agendamento', '  Ana  Lima', 'Ateliê X')).toBe(
      'Oi, Ana! Aqui é do EasyAgenda+. O Ateliê X não registra agendamentos há alguns dias. Está tudo certo por aí? Podemos ajudar?',
    );
  });

  it('rótulos de status, plano e segmento', () => {
    expect(ROTULO_STATUS.carencia).toBe('Em carência');
    expect(ROTULO_STATUS.teste_encerrado).toBe('Teste encerrado');
    expect(rotuloPlano('profissional')).toBe('Equipe');
    expect(rotuloPlano('desconhecido')).toBe('desconhecido');
    expect(rotuloSegmento('cilios_sobrancelhas')).toBe('Cílios e sobrancelhas');
  });
});
