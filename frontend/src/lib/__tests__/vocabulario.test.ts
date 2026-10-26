import { describe, it, expect } from 'vitest';
import { termosDe, VOCABULARIO_PADRAO, type Vocabulario } from '@/lib/vocabulario';
import { rotuloSegmento } from '@/lib/whatsappCampanhas';

const BARBEARIA: Vocabulario = {
  segmento: 'barbearia',
  profissional: { singular: 'barbeiro', plural: 'barbeiros', genero: 'm' },
  cliente: { singular: 'cliente', plural: 'clientes', genero: 'm' },
  negocio: { singular: 'barbearia', plural: 'barbearias', genero: 'f' },
};
const UNHAS: Vocabulario = {
  segmento: 'unhas',
  profissional: { singular: 'nail designer', plural: 'nail designers', genero: 'f' },
  cliente: { singular: 'cliente', plural: 'clientes', genero: 'f' },
  negocio: { singular: 'estúdio', plural: 'estúdios', genero: 'm' },
};

describe('termosDe', () => {
  it('sem vocabulário usa o padrão e não mexe no texto', () => {
    const t = termosDe(null);
    expect(t.segmento).toBe('outro');
    expect(t.prof.oS).toBe('a profissional');
    expect(t.adaptar('A cliente confirma com a profissional')).toBe('A cliente confirma com a profissional');
    expect(termosDe(VOCABULARIO_PADRAO).cli.P).toBe('Clientes');
  });

  it('flexiona os termos pelo gênero', () => {
    const t = termosDe(BARBEARIA);
    expect(t.prof.OS).toBe('O barbeiro');
    expect(t.prof.doS).toBe('do barbeiro');
    expect(t.cli.aoS).toBe('ao cliente');
    expect(t.cli.osP).toBe('os clientes');
    expect(t.prof.umS).toBe('um barbeiro');
    expect(t.prof.g('nova', 'novo')).toBe('novo');
  });

  it('adaptar troca o termo e acerta o que vem antes, inclusive com acento', () => {
    const t = termosDe(BARBEARIA);
    expect(t.adaptar('Envie à cliente e às clientes da fila')).toBe('Envie ao cliente e aos clientes da fila');
    expect(t.adaptar('A profissional atende a cliente')).toBe('O barbeiro atende o cliente');
    expect(t.adaptar('Nenhuma cliente nesta fase')).toBe('Nenhum cliente nesta fase');
    expect(t.adaptar('Ainda não há atendimentos desta cliente')).toBe('Ainda não há atendimentos deste cliente');
    expect(t.adaptar('Cadastre profissionais')).toBe('Cadastre barbeiros');
    expect(t.adaptar('Profissionais da casa')).toBe('Barbeiros da casa');
  });

  it('adaptar não troca pedaço de outra palavra', () => {
    expect(termosDe(BARBEARIA).adaptar('Atendimento profissionalizado para a clientela')).toBe('Atendimento profissionalizado para a clientela');
  });

  it('segmento feminino só troca a palavra', () => {
    const t = termosDe(UNHAS);
    expect(t.adaptar('A profissional atende a cliente')).toBe('A nail designer atende a cliente');
    expect(t.neg.noS).toBe('no estúdio');
  });
});

describe('textos fora das telas principais', () => {
  it('"quantas" e "algumas" concordam com o termo', () => {
    const t = termosDe(BARBEARIA);
    expect(t.adaptar('Avisar quantas clientes da fila')).toBe('Avisar quantos clientes da fila');
    expect(t.adaptar('Algumas profissionais')).toBe('Alguns barbeiros');
    expect(t.adaptar('Remover de todas as clientes? Todas as profissionais')).toBe('Remover de todos os clientes? Todos os barbeiros');
  });

  it('motivo de cancelamento e aviso do salão-parceiro', () => {
    const t = termosDe(BARBEARIA);
    expect(t.adaptar('Imprevisto da profissional')).toBe('Imprevisto do barbeiro');
    expect(t.adaptar('Pedido da cliente')).toBe('Pedido do cliente');
    expect(t.adaptar('a cota-parte da profissional não entra')).toBe('a cota-parte do barbeiro não entra');
  });

  it('rótulo do público da campanha', () => {
    expect(rotuloSegmento('todas', termosDe(BARBEARIA))).toBe('Todos os clientes');
    expect(rotuloSegmento('reativacao', termosDe(BARBEARIA))).toBe('Inativos há mais de 60 dias (Reativação)');
    expect(rotuloSegmento('reativacao', termosDe(UNHAS))).toBe('Inativas há mais de 60 dias (Reativação)');
    expect(rotuloSegmento('todas', termosDe(null))).toBe('Todas as clientes');
  });
});
