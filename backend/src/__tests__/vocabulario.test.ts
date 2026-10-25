import { describe, it, expect } from 'vitest';
import { VOCABULARIO, artigo, pelo, vocabularioDe } from '../config/vocabulario.js';
import { DEFAULT_BOT_CONFIG } from '../services/whatsapp/whatsappConstants.js';
import { aplicarVocabulario, textoComCliente, textoComProfissional } from '../services/whatsapp/whatsappVocabulario.js';
import { TEXTO_PADRAO, TEXTO_PADRAO_LEMBRETE_2H } from '../modules/whatsappAutomacoes/automacoes.rules.js';
import { SEGMENTOS } from '../modules/crm/technicalSheetTemplates.js';

describe('vocabulário por segmento', () => {
  it('cobre todos os segmentos da ficha técnica', () => {
    expect(Object.keys(VOCABULARIO).sort()).toEqual(Object.keys(SEGMENTOS).sort());
    for (const v of Object.values(VOCABULARIO)) {
      expect(v.profissional.singular && v.profissional.plural && v.cliente.singular && v.negocio.singular).toBeTruthy();
    }
  });

  it('desconhecido ou vazio cai no padrão', () => {
    expect(vocabularioDe(null).segmento).toBe('outro');
    expect(vocabularioDe('tattoo').profissional.singular).toBe('profissional');
  });

  it('artigos pelo gênero', () => {
    expect(artigo(VOCABULARIO.barbearia.profissional)).toBe('o');
    expect(artigo(VOCABULARIO.unhas.profissional, true)).toBe('as');
    expect(pelo(VOCABULARIO.estetica.negocio, 'nesta', 'neste')).toBe('nesta');
  });
});

describe('vocabulário nas mensagens do bot', () => {
  it('barbearia: troca só os textos padrão', () => {
    const v = vocabularioDe('barbearia');
    const c = aplicarVocabulario({ ...DEFAULT_BOT_CONFIG }, v);
    expect(c.confirmation_message).toContain('👤 Barbeiro:');
    expect(c.no_slots_message).toContain('com este barbeiro');
    expect(c.no_slots_message).toContain('outro barbeiro');
    expect(c.choose_professional_title).toBe('Escolha o barbeiro');
    expect(c.no_professionals_message).toBe('Desculpe, não há barbeiros disponíveis no momento.');
  });

  it('unhas: concordância no feminino', () => {
    const c = aplicarVocabulario({ ...DEFAULT_BOT_CONFIG }, vocabularioDe('unhas'));
    expect(c.no_slots_message).toContain('com esta nail designer');
    expect(c.no_slots_message).toContain('outra nail designer');
    expect(c.choose_professional_title).toBe('Escolha a nail designer');
  });

  it('texto editado pela dona fica como ela escreveu', () => {
    const editado = 'Agendado com {profissional}!';
    const c = aplicarVocabulario({ ...DEFAULT_BOT_CONFIG, confirmation_message: editado }, vocabularioDe('barbearia'));
    expect(c.confirmation_message).toBe(editado);
  });

  it('padrão mantém os textos de sempre', () => {
    const c = aplicarVocabulario({ ...DEFAULT_BOT_CONFIG }, vocabularioDe(null));
    expect(c.confirmation_message).toBe(DEFAULT_BOT_CONFIG.confirmation_message);
    expect(c.no_slots_message).toBe(DEFAULT_BOT_CONFIG.no_slots_message);
  });

  it('automações: cliente no masculino na barbearia e rótulo do lembrete de 2 h', () => {
    expect(textoComCliente(TEXTO_PADRAO.lista_espera, vocabularioDe('barbearia'))).toContain('O primeiro a agendar');
    expect(textoComCliente(TEXTO_PADRAO.lista_espera, vocabularioDe('unhas'))).toBe(TEXTO_PADRAO.lista_espera);
    expect(textoComProfissional(TEXTO_PADRAO_LEMBRETE_2H, vocabularioDe('cabelo'))).toContain('👤 Cabeleireira:');
  });
});
