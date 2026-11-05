import { describe, expect, it } from 'vitest';

import {
  evaluateGreetingMessage,
  isGreetingMessage,
  normalizeGreetingText,
} from '../utils/whatsappGreeting.js';

describe('whatsappGreeting', () => {
  it('normaliza texto removendo acentos, espacos extras e caixa', () => {
    expect(normalizeGreetingText('  OlÁ   ')).toBe('ola');
    expect(normalizeGreetingText('  BOM   DIA ')).toBe('bom dia');
  });

  it.each([
    ['Oi'],
    ['Olá'],
    ['ola'],
    ['bom dia'],
    ['boa tarde'],
    ['boa noite'],
    ['iae'],
    ['eai'],
    ['opa'],
    ['fala'],
    ['tudo bem'],
    ['hey'],
    ['hello'],
    ['  OI  '],
    ['   BOA   TARDE  '],
    ['oiii'],
    ['heyyy'],
    ['hellooo'],
    ['agendar'],
    ['marcar'],
    ['quero agendar'],
    ['horário'],
  ])('detecta saudacao valida: %s', (input) => {
    const result = evaluateGreetingMessage(input);

    expect(result.isGreeting).toBe(true);
    expect(result.rule).toBeTruthy();
    expect(result.normalizedText).toBeTruthy();
    expect(isGreetingMessage(input)).toBe(true);
  });

  it.each([
    ['quero marcar horario'],
    ['tudo bem? preciso de ajuda'],
    ['xpto'],
    ['12345'],
    [''],
    [null],
    [undefined],
  ])('nao detecta quando nao e saudacao: %s', (input) => {
    const result = evaluateGreetingMessage(input as string | null | undefined);

    expect(result.isGreeting).toBe(false);
    expect(result.rule).toBeNull();
    expect(isGreetingMessage(input as string | null | undefined)).toBe(false);
  });
});

describe('saudação única e tom neutro', () => {
  it('o contexto entra entre o cabeçalho e o menu, com uma só saudação', async () => {
    const { buildWelcomeMessage } = await import('../services/whatsapp/whatsappMessageService.js');
    const msg = buildWelcomeMessage('Olá 👋 Que bom ter você aqui!', [{ label: 'Agendar', emoji: '' }], 'Loja', 'Hoje atendemos até as 19:00.');
    expect(msg.match(/Olá/g)).toHaveLength(1);
    expect(msg.indexOf('Hoje atendemos')).toBeLessThan(msg.indexOf('1️⃣'));
  });

  it('os textos padrão não têm gênero nem repetem a saudação', async () => {
    const { DEFAULT_BOT_CONFIG } = await import('../services/whatsapp/whatsappConstants.js');
    for (const texto of Object.values(DEFAULT_BOT_CONFIG)) {
      for (const proibido of ['Bem-vindo', 'Um atendente', '👨‍💼', 'dicas de estilo', 'dicas de beleza']) {
        expect(String(texto)).not.toContain(proibido);
      }
    }
  });
});
