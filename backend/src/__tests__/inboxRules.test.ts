import { describe, it, expect } from 'vitest';
import { detectarPalavraChave, marcadorMidia, previa, ehAutomatica, grupoEnvio, saudeEnvios,
  mascararTelefone, statusDeEntrega, avancaStatus, rotuloOrigem } from '../modules/whatsappInbox/inbox.rules.js';

describe('detectarPalavraChave', () => {
  it.each(['SAIR', 'sair', ' Sair! ', 'SAÍR', 'parar', 'stop', 'descadastrar'])('"%s" é sair', (t) =>
    expect(detectarPalavraChave(t)).toBe('sair'));
  it.each(['voltar', 'VOLTAR!', ' Voltar '])('"%s" é voltar', (t) => expect(detectarPalavraChave(t)).toBe('voltar'));
  it.each(['não quero sair hoje', 'sair amanhã', 'oi', '', 'cancelar', 'Cancelar.'])('"%s" não é palavra-chave', (t) =>
    expect(detectarPalavraChave(t)).toBeNull());
  it('nulo e indefinido', () => {
    expect(detectarPalavraChave(null)).toBeNull();
    expect(detectarPalavraChave(undefined)).toBeNull();
  });
});

describe('marcadorMidia', () => {
  it('mapeia os tipos da Evolution', () => {
    expect(marcadorMidia('imageMessage')).toEqual({ mediaType: 'imagem', marcador: '[Foto]' });
    expect(marcadorMidia('audioMessage')).toEqual({ mediaType: 'audio', marcador: '[Áudio]' });
    expect(marcadorMidia('videoMessage')).toEqual({ mediaType: 'video', marcador: '[Vídeo]' });
    expect(marcadorMidia('documentMessage')).toEqual({ mediaType: 'documento', marcador: '[Documento]' });
    expect(marcadorMidia('documentWithCaptionMessage')).toEqual({ mediaType: 'documento', marcador: '[Documento]' });
    expect(marcadorMidia('stickerMessage')).toEqual({ mediaType: 'figurinha', marcador: '[Figurinha]' });
  });
  it('texto e desconhecido não têm marcador', () => {
    expect(marcadorMidia('conversation')).toBeNull();
    expect(marcadorMidia('extendedTextMessage')).toBeNull();
    expect(marcadorMidia(null)).toBeNull();
  });
});

it('previa junta linhas e corta em 160', () => {
  expect(previa('oi\n\ntudo bem?')).toBe('oi tudo bem?');
  expect(previa('a'.repeat(200))).toHaveLength(160);
});

it('automáticas e grupos', () => {
  expect(ehAutomatica('lembrete')).toBe(true);
  expect(ehAutomatica('confirmacao')).toBe(true);
  expect(ehAutomatica('lista_espera')).toBe(true);
  for (const o of ['bot', 'pix_recibo', 'manual_painel', 'manual_celular', 'sistema'] as const) expect(ehAutomatica(o)).toBe(false);
  expect(grupoEnvio('lembrete')).toBe('automaticas');
  expect(grupoEnvio('lista_espera')).toBe('automaticas');
  expect(grupoEnvio('pix_recibo')).toBe('pix');
  expect(grupoEnvio('bot')).toBe('manuais');
  expect(grupoEnvio('manual_celular')).toBe('manuais');
  expect(grupoEnvio('sistema')).toBeNull();
  expect(grupoEnvio('painel_evento')).toBeNull();
});

it('saúde pela taxa de falha', () => {
  expect(saudeEnvios(0, 0)).toBe('Excelente');
  expect(saudeEnvios(100, 1)).toBe('Excelente');
  expect(saudeEnvios(100, 2)).toBe('Boa');
  expect(saudeEnvios(100, 7)).toBe('Boa');
  expect(saudeEnvios(100, 8)).toBe('Atenção');
});

it('mascara telefone', () => {
  expect(mascararTelefone('5583996112233')).toBe('+55 83 99611-****');
  expect(mascararTelefone('8396112233')).toBe('+55 83 9611-****');
  expect(mascararTelefone('')).toBe('');
});

it('status de entrega da Evolution e sem regredir', () => {
  expect(statusDeEntrega('DELIVERY_ACK')).toBe('entregue');
  expect(statusDeEntrega('READ')).toBe('lida');
  expect(statusDeEntrega('PLAYED')).toBe('lida');
  expect(statusDeEntrega(3)).toBe('entregue');
  expect(statusDeEntrega(4)).toBe('lida');
  expect(statusDeEntrega('SERVER_ACK')).toBeNull();
  expect(avancaStatus('enviada', 'entregue')).toBe(true);
  expect(avancaStatus('entregue', 'lida')).toBe(true);
  expect(avancaStatus('lida', 'entregue')).toBe(false);
  expect(avancaStatus('falhou', 'lida')).toBe(false);
});

it('rotuloOrigem sistema é Aviso do sistema', () => expect(rotuloOrigem('sistema')).toBe('Aviso do sistema'));
