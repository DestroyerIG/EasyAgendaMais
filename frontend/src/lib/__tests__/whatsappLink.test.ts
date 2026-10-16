import { describe, it, expect } from 'vitest';
import { linkWhatsapp, preencherMensagem, MENSAGENS } from '@/lib/whatsappLink';

describe('linkWhatsapp', () => {
  it('normaliza telefone com máscara e acrescenta 55', () => {
    expect(linkWhatsapp('(83) 99999-0000', 'oi')).toBe('https://wa.me/5583999990000?text=oi');
  });
  it('não repete o 55', () => {
    expect(linkWhatsapp('+55 83 99999-0000', 'oi')).toBe('https://wa.me/5583999990000?text=oi');
  });
  it('codifica a mensagem', () => {
    expect(linkWhatsapp('83999990000', 'Oi, Ana! às 10:00')).toBe('https://wa.me/5583999990000?text=Oi%2C%20Ana!%20%C3%A0s%2010%3A00');
  });
  it('sem telefone utilizável devolve null', () => {
    expect(linkWhatsapp('', 'oi')).toBeNull();
    expect(linkWhatsapp(null, 'oi')).toBeNull();
    expect(linkWhatsapp('9999', 'oi')).toBeNull();
  });
});

describe('preencherMensagem', () => {
  it('troca os marcadores', () => {
    expect(preencherMensagem(MENSAGENS.resgate, { nome: 'Ana', negocio: 'Studio Aurora', servico: 'corte' }))
      .toBe('Oi, Ana! Sentimos sua falta no Studio Aurora. Que tal marcar o seu corte esta semana?');
  });
  it('marcador sem dado some sem deixar espaço duplo', () => {
    expect(preencherMensagem('Oi, {nome}! Seu {servico} ficou pronto.', { nome: 'Ana' })).toBe('Oi, Ana! Seu ficou pronto.');
  });
});
